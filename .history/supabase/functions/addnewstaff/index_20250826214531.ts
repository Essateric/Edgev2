// supabase/functions/addnewstaff/index.ts
import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.3";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

// Minimal CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

console.log("🚀 AddNewStaff (id-only) function loaded");

// Build HS256 CryptoKey from secret
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
    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response("OK", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    logs.push("🚀 Request received");

    // Env
    const PROJECT_URL = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const JWT_SECRET = Deno.env.get("JWT_SECRET") || Deno.env.get("SUPABASE_JWT_SECRET");

    logs.push(`🔑 PROJECT_URL: ${PROJECT_URL || "❌ missing"}`);
    logs.push(`🔑 SERVICE_ROLE_KEY: ${SERVICE_ROLE_KEY ? "✅ loaded" : "❌ missing"}`);
    logs.push(`🔑 JWT_SECRET: ${JWT_SECRET ? "✅ loaded" : "❌ missing"}`);

    if (!PROJECT_URL || !SERVICE_ROLE_KEY || !JWT_SECRET) {
      return new Response(JSON.stringify({ error: "Server not configured", logs }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Auth header
    const token = req.headers.get("authorization")?.replace(/Bearer\s+/i, "").trim();
    if (!token) {
      logs.push("⛔ Missing Authorization header");
      return new Response(JSON.stringify({ error: "Unauthorized - Missing Authorization Header", logs }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Verify JWT (HS256)
    let payload: any;
    try {
      const key = await getCryptoKey(JWT_SECRET);
      payload = await verify(token, key, "HS256");
      logs.push(`✅ JWT verified for sub: ${payload.sub}`);
    } catch (err: any) {
      logs.push(`⛔ Invalid JWT - ${err?.message || err}`);
      return new Response(JSON.stringify({ error: "Unauthorized - Invalid JWT", logs }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Service-role client (bypasses RLS for admin ops)
    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);
    logs.push("🗄️ Supabase client initialized");

    // Parse body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body", logs }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const { name, email, pin, permission, weekly_hours } = body || {};
    logs.push(`📦 Body → name: ${name}, email: ${email}, permission: ${permission}`);

    if (!name || !email || !pin) {
      logs.push("❌ Missing name, email, or pin");
      return new Response(JSON.stringify({ error: "Missing name, email, or pin", logs }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Find caller (must be an admin). With id-only model, staff.id === auth.uid().
    const uid = String(payload.sub);
    const { data: me, error: meErr } = await supabase
      .from("staff")
      .select("id, permission, email")
      .eq("id", uid)
      .maybeSingle();

    if (meErr) logs.push(`🧪 Staff self-lookup error: ${meErr.message}`);
    if (!me) {
      logs.push(`⛔ No staff row found for caller uid=${uid}`);
      return new Response(JSON.stringify({ error: "No staff record found", logs }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const role = String(me.permission || "").toLowerCase();
    if (!["admin", "regional"].includes(role)) {
      logs.push(`⛔ Forbidden: role=${me.permission}`);
      return new Response(JSON.stringify({ error: "Forbidden - Only admins/regional can add staff", logs }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Hash PIN
    const pin_hash = bcrypt.hashSync(String(pin));
    logs.push("🔑 PIN hashed");

    // Create Auth user
    logs.push(`👤 Creating Auth user for ${email}`);
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (createErr) {
      logs.push(`❌ Auth user creation failed: ${createErr.message}`);
      return new Response(
        JSON.stringify({ error: "Auth user creation failed", details: createErr.message, logs }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }
    const newUserId = created.user.id;
    logs.push(`✅ Auth user created → ${newUserId}`);

    // Insert staff row — ONLY columns that exist in your new schema
    logs.push("📥 Inserting staff row…");
    const { error: staffErr } = await supabase.from("staff").insert({
      id: newUserId,               // PK also links to auth.users(id)
      name,
      permission: permission ?? "junior",
      weekly_hours: weekly_hours || {},
      pin_hash,
      email,
    });
    if (staffErr) {
      logs.push(`❌ Staff insert failed: ${staffErr.message}`);
      return new Response(JSON.stringify({ error: "Failed to insert into staff table", logs }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    logs.push("✅ Staff record inserted");

    return new Response(
      JSON.stringify({
        message: "Staff added successfully",
        user: { id: newUserId, email, name, permission: permission ?? "junior" },
        logs,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("❌ Unexpected error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
