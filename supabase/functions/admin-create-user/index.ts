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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verificar que el caller sea admin/dev
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !callerUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", callerUser.id)
      .single();

    if (!callerProfile || !["admin", "dev"].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: "Forbidden: se requiere rol admin o dev" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      email, password, username, full_name, role,
      is_active, phone, country, country_code,
      city, department, referral_code: adminReferralCode
    } = body;

    if (!email || !password || !username) {
      return new Response(JSON.stringify({ error: "email, password y username son requeridos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verificar disponibilidad de username ANTES de crear en auth ──
    const { data: usernameConflict } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (usernameConflict) {
      return new Response(
        JSON.stringify({ error: `El username '${username}' ya está en uso. Elige otro.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Verificar disponibilidad de email ANTES de crear en auth ──
    const { data: emailRows } = await supabaseAdmin.rpc("get_auth_user_by_email", { p_email: email });
    const emailAlreadyExists = emailRows && emailRows.length > 0;

    const userMeta = {
      username: username || "",
      full_name: full_name || "",
      referral_code: adminReferralCode || "",
      phone: phone || "",
      country: country || "",
      country_code: country_code || "",
      city: city || "",
      department: department || "",
    };

    let userId: string;

    if (emailAlreadyExists) {
      // Actualizar usuario existente
      userId = emailRows[0].id;
      const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: userMeta,
      });
      if (updateAuthError) {
        return new Response(JSON.stringify({ error: updateAuthError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Crear usuario nuevo
      const { data: newUserData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: userMeta,
      });
      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = newUserData.user.id;
    }

    // ── Upsert del perfil (el trigger puede ya haberlo creado) ──
    const referralCode = username.toLowerCase();
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        email,
        username,
        full_name: full_name || null,
        role: role || "guest",
        is_active: is_active ?? false,
        phone: phone || null,
        country: country || null,
        country_code: country_code || null,
        city: city || null,
        department: department || null,
        referral_code: referralCode,
        referral_link: "/ref/" + referralCode,
      }, { onConflict: "id" });

    if (profileError) {
      console.error("Profile upsert error:", profileError.message);
      return new Response(JSON.stringify({ error: `Error al crear perfil: ${profileError.message}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ user: { id: userId, email } }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Unhandled error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
