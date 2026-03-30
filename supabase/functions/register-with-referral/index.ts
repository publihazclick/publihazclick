import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json();
    const { email, password, username, full_name, phone, country, country_code, department, city, referral_code } = body;

    if (!email || !password || !username) {
      return new Response(
        JSON.stringify({ error: "email, password y username son requeridos" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!referral_code) {
      return new Response(
        JSON.stringify({ error: "Se requiere un código de referido válido" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Validar código de referido ────────────────────────────────────────────
    const { data: referrer, error: refError } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .ilike("referral_code", referral_code.trim())
      .single();

    if (refError || !referrer) {
      return new Response(
        JSON.stringify({ error: "Código de referido inválido o no encontrado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase();

    // ── Verificar username disponible ANTES de crear en auth ──────────────────
    const { data: usernameConflict } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", cleanUsername)
      .maybeSingle();

    if (usernameConflict) {
      return new Response(
        JSON.stringify({ error: `El usuario '${cleanUsername}' ya está en uso. Elige otro nombre de usuario.` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Verificar email disponible ANTES de crear en auth ──────────────────────
    const { data: emailRows } = await supabaseAdmin.rpc("get_auth_user_by_email", { p_email: cleanEmail });
    if (emailRows && emailRows.length > 0) {
      return new Response(
        JSON.stringify({ error: "Ya existe una cuenta con este correo electrónico" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Crear usuario con Admin API (sin rate limit, email confirmado) ─────────
    const { data: newUserData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: {
        username: cleanUsername,
        full_name: full_name?.trim() || "",
        referral_code: referral_code.trim(),
        phone: phone || "",
        country: country || "",
        country_code: country_code || "",
        department: department || "",
        city: city || "",
      },
    });

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = newUserData.user.id;

    // ── Esperar al trigger; si falla, crear perfil como fallback ───────────────
    await new Promise(resolve => setTimeout(resolve, 600));

    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .single();

    if (!existingProfile) {
      const { error: profileErr } = await supabaseAdmin.from("profiles").upsert({
        id: userId,
        email: cleanEmail,
        username: cleanUsername,
        full_name: full_name?.trim() || null,
        role: "guest",
        is_active: true,
        referral_code: cleanUsername,
        referral_link: "/ref/" + cleanUsername,
        referred_by: referrer.id,
        phone: phone || null,
        country: country || null,
        country_code: country_code || null,
        department: department || null,
        city: city || null,
      }, { onConflict: "id" });

      if (profileErr) {
        console.error("Fallback profile creation failed:", profileErr.message);
      }

      await supabaseAdmin.from("referrals").upsert({
        referrer_id: referrer.id,
        referred_id: userId,
        referred_username: cleanUsername,
        referred_level: 1,
      }, { onConflict: "referred_id", ignoreDuplicates: true });
    } else {
      await supabaseAdmin.from("profiles")
        .update({ referred_by: referrer.id, is_active: true })
        .eq("id", userId)
        .is("referred_by", null);

      await supabaseAdmin.from("referrals").upsert({
        referrer_id: referrer.id,
        referred_id: userId,
        referred_username: cleanUsername,
        referred_level: 1,
      }, { onConflict: "referred_id", ignoreDuplicates: true });
    }

    // ── Enviar email de bienvenida (fire and forget) ───────────────────────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    fetch(`${supabaseUrl}/functions/v1/send-welcome-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
      },
      body: JSON.stringify({
        email: cleanEmail,
        name: full_name?.trim() || cleanUsername,
      }),
    }).catch((err) => console.error("Welcome email failed:", err));

    return new Response(
      JSON.stringify({ success: true, userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno del servidor";
    console.error("register-with-referral error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
