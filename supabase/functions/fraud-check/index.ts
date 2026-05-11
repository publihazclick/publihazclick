import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FraudRule {
  id: string;
  name: string;
  weight: number;
  is_active: boolean;
  parameters: Record<string, number>;
}

interface FraudFactor {
  rule: string;
  score: number;
  detail: string;
}

interface ClickRow {
  id: string;
  user_id: string;
  task_id: string;
  reward_earned: number;
  ip_address: string | null;
  user_agent: string | null;
  session_fingerprint: string | null;
  click_duration_ms: number | null;
  completed_at: string;
  ad_type?: string;
  duration?: number;
}

function getRiskLevel(score: number): string {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verificar que el caller sea admin/dev
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "dev"].includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: admin/dev role required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parsear body: opcional { user_id?: string }
    let targetUserId: string | null = null;
    try {
      const body = await req.json();
      targetUserId = body.user_id || null;
    } catch {
      // No body, analizar todos
    }

    // Obtener reglas activas
    const { data: rules } = await supabaseAdmin
      .from("fraud_rules")
      .select("*")
      .eq("is_active", true);

    if (!rules || rules.length === 0) {
      return new Response(
        JSON.stringify({ analyzed: 0, flagged: 0, scores: [], message: "No active fraud rules" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rulesMap = new Map<string, FraudRule>();
    for (const r of rules) rulesMap.set(r.name, r);

    // Obtener clicks de las últimas 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let clicksQuery = supabaseAdmin
      .from("ptc_clicks")
      .select("id, user_id, task_id, reward_earned, ip_address, user_agent, session_fingerprint, click_duration_ms, completed_at")
      .gte("completed_at", since)
      .order("completed_at", { ascending: true })
      .limit(20000);

    if (targetUserId) {
      clicksQuery = clicksQuery.eq("user_id", targetUserId);
    }

    const { data: clicks } = await clicksQuery;
    if (!clicks || clicks.length === 0) {
      return new Response(
        JSON.stringify({ analyzed: 0, flagged: 0, scores: [], message: "No clicks in last 24h" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Agrupar clicks por usuario
    const clicksByUser = new Map<string, ClickRow[]>();
    for (const c of clicks) {
      const arr = clicksByUser.get(c.user_id) || [];
      arr.push(c);
      clicksByUser.set(c.user_id, arr);
    }

    // Datos globales para reglas inter-usuario
    const ipToUsers = new Map<string, Set<string>>();
    const fpToUsers = new Map<string, Set<string>>();
    for (const c of clicks) {
      if (c.ip_address) {
        const s = ipToUsers.get(c.ip_address) || new Set();
        s.add(c.user_id);
        ipToUsers.set(c.ip_address, s);
      }
      if (c.session_fingerprint) {
        const s = fpToUsers.get(c.session_fingerprint) || new Set();
        s.add(c.user_id);
        fpToUsers.set(c.session_fingerprint, s);
      }
    }

    const results: { user_id: string; score: number; risk_level: string }[] = [];
    let flaggedCount = 0;

    for (const [userId, userClicks] of clicksByUser.entries()) {
      const factors: FraudFactor[] = [];
      let totalWeightedScore = 0;
      let totalWeight = 0;

      // --- Regla: rapid_clicks ---
      const rapidRule = rulesMap.get("rapid_clicks");
      if (rapidRule) {
        const maxClicks = rapidRule.parameters.max_clicks || 3;
        const windowSec = rapidRule.parameters.window_seconds || 60;
        let rapidViolations = 0;

        for (let i = 0; i < userClicks.length; i++) {
          const tStart = new Date(userClicks[i].completed_at).getTime();
          let count = 1;
          for (let j = i + 1; j < userClicks.length; j++) {
            const tEnd = new Date(userClicks[j].completed_at).getTime();
            if ((tEnd - tStart) / 1000 <= windowSec) count++;
            else break;
          }
          if (count > maxClicks) rapidViolations++;
        }

        if (rapidViolations > 0) {
          const score = Math.min(rapidRule.weight, rapidRule.weight * (rapidViolations / 3));
          factors.push({
            rule: "rapid_clicks",
            score: Math.round(score),
            detail: `${rapidViolations} ventana(s) con >${maxClicks} clicks en <${windowSec}s`,
          });
          totalWeightedScore += score;
        }
        totalWeight += rapidRule.weight;
      }

      // --- Regla: same_ip_multi_user ---
      const ipRule = rulesMap.get("same_ip_multi_user");
      if (ipRule) {
        const maxUsers = ipRule.parameters.max_users || 2;
        const userIps = new Set(userClicks.filter(c => c.ip_address).map(c => c.ip_address!));
        let sharedIps = 0;

        for (const ip of userIps) {
          const usersOnIp = ipToUsers.get(ip)?.size || 0;
          if (usersOnIp > maxUsers) sharedIps++;
        }

        if (sharedIps > 0) {
          factors.push({
            rule: "same_ip_multi_user",
            score: ipRule.weight,
            detail: `${sharedIps} IP(s) compartidas con más de ${maxUsers} usuarios`,
          });
          totalWeightedScore += ipRule.weight;
        }
        totalWeight += ipRule.weight;
      }

      // --- Regla: same_fingerprint_multi_user ---
      const fpRule = rulesMap.get("same_fingerprint_multi_user");
      if (fpRule) {
        const maxUsers = fpRule.parameters.max_users || 2;
        const userFps = new Set(userClicks.filter(c => c.session_fingerprint).map(c => c.session_fingerprint!));
        let sharedFps = 0;

        for (const fp of userFps) {
          const usersOnFp = fpToUsers.get(fp)?.size || 0;
          if (usersOnFp > maxUsers) sharedFps++;
        }

        if (sharedFps > 0) {
          factors.push({
            rule: "same_fingerprint_multi_user",
            score: fpRule.weight,
            detail: `${sharedFps} fingerprint(s) compartidos con más de ${maxUsers} usuarios`,
          });
          totalWeightedScore += fpRule.weight;
        }
        totalWeight += fpRule.weight;
      }

      // --- Regla: impossible_speed ---
      const speedRule = rulesMap.get("impossible_speed");
      if (speedRule) {
        const minRatio = speedRule.parameters.min_ratio || 0.8;
        let tooFast = 0;

        for (const c of userClicks) {
          if (c.click_duration_ms == null) continue;
          // mini=30s, others=60s → minimum expected ms
          const expectedMs = 30000; // mínimo posible (mini)
          const minExpected = expectedMs * minRatio;
          if (c.click_duration_ms < minExpected) tooFast++;
        }

        if (tooFast > 0) {
          const ratio = tooFast / userClicks.length;
          const score = speedRule.weight * Math.min(1, ratio * 2);
          factors.push({
            rule: "impossible_speed",
            score: Math.round(score),
            detail: `${tooFast} click(s) con duración sospechosamente corta`,
          });
          totalWeightedScore += score;
        }
        totalWeight += speedRule.weight;
      }

      // --- Regla: uniform_timing ---
      const uniformRule = rulesMap.get("uniform_timing");
      if (uniformRule) {
        const maxStddev = uniformRule.parameters.max_stddev_ms || 2000;
        const minClicks = uniformRule.parameters.min_clicks || 5;
        const durations = userClicks.filter(c => c.click_duration_ms != null).map(c => c.click_duration_ms!);

        if (durations.length >= minClicks) {
          const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
          const variance = durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
          const stddev = Math.sqrt(variance);

          if (stddev < maxStddev) {
            factors.push({
              rule: "uniform_timing",
              score: uniformRule.weight,
              detail: `Desviación estándar de tiempos: ${Math.round(stddev)}ms (sospechoso de bot)`,
            });
            totalWeightedScore += uniformRule.weight;
          }
        }
        totalWeight += uniformRule.weight;
      }

      // --- Regla: burst_pattern ---
      const burstRule = rulesMap.get("burst_pattern");
      if (burstRule && userClicks.length >= 3) {
        const burstRatio = burstRule.parameters.burst_ratio || 0.8;
        const windowMin = burstRule.parameters.window_minutes || 30;
        const windowMs = windowMin * 60 * 1000;

        // Ventana deslizante: encontrar la ventana con más clicks
        let maxInWindow = 0;
        for (let i = 0; i < userClicks.length; i++) {
          const tStart = new Date(userClicks[i].completed_at).getTime();
          let count = 0;
          for (let j = i; j < userClicks.length; j++) {
            const tEnd = new Date(userClicks[j].completed_at).getTime();
            if (tEnd - tStart <= windowMs) count++;
            else break;
          }
          maxInWindow = Math.max(maxInWindow, count);
        }

        const ratio = maxInWindow / userClicks.length;
        if (ratio >= burstRatio && userClicks.length >= 3) {
          factors.push({
            rule: "burst_pattern",
            score: burstRule.weight,
            detail: `${Math.round(ratio * 100)}% de clicks en ventana de ${windowMin} min`,
          });
          totalWeightedScore += burstRule.weight;
        }
        totalWeight += burstRule.weight;
      }

      // Calcular score final (0-100)
      const finalScore = totalWeight > 0
        ? Math.round(Math.min(100, (totalWeightedScore / totalWeight) * 100))
        : 0;
      const riskLevel = getRiskLevel(finalScore);

      // Upsert en fraud_scores
      await supabaseAdmin
        .from("fraud_scores")
        .upsert({
          user_id: userId,
          score: finalScore,
          risk_level: riskLevel,
          factors: factors,
          clicks_analyzed: userClicks.length,
          analyzed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      // Si score alto, loguear alerta
      if (finalScore >= 60) {
        await supabaseAdmin.from("activity_logs").insert({
          user_id: userId,
          action: "fraud_alert",
          entity_type: "fraud",
          entity_id: userId,
          details: { score: finalScore, risk_level: riskLevel, factors, clicks_analyzed: userClicks.length },
        });
        flaggedCount++;
      }

      results.push({ user_id: userId, score: finalScore, risk_level: riskLevel });
    }

    return new Response(
      JSON.stringify({
        analyzed: clicksByUser.size,
        flagged: flaggedCount,
        scores: results.sort((a, b) => b.score - a.score),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
