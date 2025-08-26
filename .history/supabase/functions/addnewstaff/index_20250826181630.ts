import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.3";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

console.log("🚀 AddNewStaff function loaded");

// 🔐 Helper to generate CryptoKey
async function getCryptoKey(secret: string) {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

serve(async (req) => {
  const logs: string[] = [];

  try {
    if (req.method === "OPTIONS") {
      return new Response("OK", { headers: corsHeaders });
    }

    logs.push("🚀 Request received");

    // ✅ Load environment variables (+ sensible fallbacks)
    const PROJECT_URL =
      Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY =
      Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY");
    const JWT_SECRET =
      Deno.env.get("JWT_SECRET") || Deno.env.get("SUPABASE_JWT_SECRET");

    if (!PROJECT_URL || !SERVICE_ROLE_KEY || !JWT_SECRET) {
      logs.push("⛔ Missing env(s). Need PROJECT_URL + SERVICE_ROLE_KEY + JWT_SECRET");
      return new Response(JSON.stringify({ error: "Server not configured", logs }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    logs.push(`🔑 Env PROJECT_URL: ${PROJECT_URL}`);
    logs.push(`🔑 Env SERVICE_ROLE_KEY: ✅ Loaded`);
    logs.push(`🔑 Env JWT_SECRET: ✅ Loaded`);

    // ✅ Get Authorization header
    const token = req.headers.get("authorization")?.replace(/Bearer\s+/i, "").trim();
    if (!token) {
      logs.push(`⛔ Missing Authorization header.`);
      return new Response(
        JSON.stringify({ error: "Unauthorized - Missing Authorization Header", logs }),
        { status: 401, headers: corsHeaders },
      );
    }

    // ✅ Verify JWT manually
    let payload: any;
    try {
      const key = await getCryptoKey(JWT_SECRET);
      payload = await verify(token, key, "HS256");
      logs.push(`✅ JWT verified for sub: ${payload.sub}`);
    } catch (err: any) {
      logs.push(`⛔ Invalid JWT - ${err.message}`);
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid JWT", logs }),
        { status: 401, headers: corsHeaders },
      );
    }

    // ✅ Initialize Supabase client (service role bypasses RLS for admin actions)
    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);
    logs.push("🗄️ Supabase client initialized.");

    // ✅ Look up permission from `staff` table (check id OR user_id)
    const { data: me, error: meErr } = await supabase
      .from("staff")
      .select("id, user_id, permission, email")
      .or(`id.eq.${payload.sub},user_id.eq.${payload.sub}`)
      .maybeSingle();

    if (meErr) {
      logs.push(`⛔ Staff lookup error: ${meErr.message}`);
      return new Response(JSON.stringify({ error: "Staff lookup failed", logs }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    if (!me) {
      logs.push(`⛔ No staff record found for auth user ${payload.sub}`);
      return new Response(JSON.stringify({ error: "No staff record found", logs }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const role = String(me.permission || "").toLowerCase();
    const allowed = new Set(["admin", "regional"]);
    if (!allowed.has(role)) {
      logs.push(`⛔ Forbidden - Only admins/regional can add staff (your role: ${role})`);
      return new Response(
        JSON.stringify({ error: "Forbidden - Only admins/regional can add staff", logs }),
        { status: 403, headers: corsHeaders },
      );
    }

    // ✅ Parse Request Body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body", logs }), {
        status: 400, headers: corsHeaders,
      });
    }

    const { name, email, pin, permission, weekly_hours } = body;
    logs.push(`📦 Incoming body → name: ${name}, email: ${email}, permission: ${permission}`);

    if (!name || !email || !pin) {
      logs.push(`❌ Missing required fields (name, email, pin)`);
      return new Response(
        JSON.stringify({ error: "Missing name, email, or pin", logs }),
        { status: 400, headers: corsHeaders },
      );
    }

    // ✅ Hash the PIN
    const hashedPin = bcrypt.hashSync(String(pin));
    logs.push(`🔑 PIN hashed`);

    // ✅ Create Auth User
    logs.push(`👤 Creating Auth user for ${email}`);
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    });

    if (userError) {
      logs.push(`❌ Failed to create Auth user: ${userError.message}`);
      return new Response(
        JSON.stringify({
          error: "Auth user creation failed",
          details: userError.message,
          logs,
        }),
        { status: 400, headers: corsHeaders },
      );
    }

    const userId = userData.user.id;
    logs.push(`✅ Auth user created → ID: ${userId}`);

    // ✅ Insert into 'staff' table
    logs.push("📥 Inserting new staff into table...");
    const { error: staffInsertError } = await supabase.from("staff").insert({
      // If your schema uses `id` as auth uid PK (as your code implies), keep this:
      id: userId,
      // If your schema instead uses a separate `user_id` column, you can add it too:
      user_id: userId,
      name,
      email,
      pin_hash: hashedPin,
      permission: permission ?? "junior",
      weekly_hours: weekly_hours || {},
    });

    if (staffInsertError) {
      logs.push(`❌ Failed to insert staff: ${staffInsertError.message}`);
      return new Response(
        JSON.stringify({ error: "Failed to insert into staff table", logs }),
        { status: 500, headers: corsHeaders },
      );
    }

    logs.push("✅ Staff record inserted successfully.");

    return new Response(
      JSON.stringify({
        message: "Staff added successfully",
        user: {
          id: userId,
          email,
          name,
          permission: permission ?? "junior",
        },
        logs,
      }),
      { status: 200, headers: corsHeaders },
    );

  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logs.push(`❌ Unexpected error: ${errorMessage}`);
    return new Response(JSON.stringify({ error: errorMessage, logs }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
