// supabase/functions/addnewstaff/index.ts
import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.3";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

console.log("🚀 AddNewStaff function loaded");

// 🔐 CryptoKey for HS256
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
        headers: corsHeaders,
      });
    }

    logs.push("🚀 Request received");

    // ✅ Envs (with fallbacks for new/old names)
    const PROJECT_URL =
      Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY =
      Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY");
    const JWT_SECRET =
      Deno.env.get("JWT_SECRET") || Deno.env.get("SUPABASE_JWT_SECRET");

    logs.push(`🔑 PROJECT_URL: ${PROJECT_URL || "❌ missing"}`);
    logs.push(`🔑 SERVICE_ROLE_KEY: ${SERVICE_ROLE_KEY ? "✅ loaded" : "❌ missing"}`);
    logs.push(`🔑 JWT_SECRET: ${JWT_SECRET ? "✅ loaded" : "❌ missing"}`);
    logs.push(`🔧 Key type: ${SERVICE_ROLE_KEY?.startsWith("sb_secret_") ? "sb_secret_… ✅" : "not sb_secret_ ❌"}`);

    if (!PROJECT_URL || !SERVICE_ROLE_KEY || !JWT_SECRET) {
      return new Response(
        JSON.stringify({ error: "Server not configured", logs }),
        { status: 500, headers: corsHeaders },
      );
    }

    // ✅ Auth header
    const token = req.headers.get("authorization")?.replace(/Bearer\s+/i, "").trim();
    if (!token) {
      logs.push("⛔ Missing Authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized - Missing Authorization Header", logs }),
        { status: 401, headers: corsHeaders },
      );
    }

    // ✅ Verify JWT
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

    // ✅ Supabase (service role) – admin ops bypass RLS
    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);
    logs.push("🗄️ Supabase client initialized");

    // ✅ Parse body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body", logs }), {
        status: 400, headers: corsHeaders,
      });
    }
    const { name, email, pin, permission, weekly_hours } = body || {};
    logs.push(`📦 Body → name: ${name}, email: ${email}, permission: ${permission}`);

    if (!name || !email || !pin) {
      logs.push("❌ Missing name, email, or pin");
      return new Response(
        JSON.stringify({ error: "Missing name, email, or pin", logs }),
        { status: 400, headers: corsHeaders },
      );
    }

    // ✅ Staff lookup: by id then user_id (avoid .or() edge cases)
    const uid = String(payload.sub);
    let me: any = null;
    let lookupNotes = [];

    {
      const { data, error } = await supabase
        .from("staff")
        .select("id,user_id,permission,email")
        .eq("id", uid)
        .maybeSingle();
      if (error) lookupNotes.push(`id lookup error: ${error.message}`);
      if (data) me = data;
    }
    if (!me) {
      const { data, error } = await supabase
        .from("staff")
        .select("id,user_id,permission,email")
        .eq("user_id", uid)
        .maybeSingle();
      if (error) lookupNotes.push(`user_id lookup error: ${error.message}`);
      if (data) me = data;
    }

    if (lookupNotes.length) logs.push(`🧪 Staff lookup notes → ${lookupNotes.join("; ")}`);

    if (!me) {
      logs.push(`⛔ No staff record found for auth user ${uid}`);
      return new Response(
        JSON.stringify({ error: "No staff record found", logs }),
        { status: 403, headers: corsHeaders },
      );
    }

    const role = String(me.permission || "").toLowerCase();
    if (!["admin", "regional"].includes(role)) {
      logs.push(`⛔ Forbidden - Only admins/regional can add staff (your role: ${role})`);
      return new Response(
        JSON.stringify({ error: "Forbidden - Only admins/regional can add staff", logs }),
        { status: 403, headers: corsHeaders },
      );
    }

    // ✅ Hash PIN
    const hashedPin = bcrypt.hashSync(String(pin));
    logs.push("🔑 PIN hashed");

    // ✅ Create Auth user
    logs.push(`👤 Creating Auth user for ${email}`);
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (userError) {
      logs.push(`❌ Auth user creation failed: ${userError.message}`);
      return new Response(
        JSON.stringify({ error: "Auth user creation failed", details: userError.message, logs }),
        { status: 400, headers: corsHeaders },
      );
    }

    const userId = userData.user.id;
    logs.push(`✅ Auth user created → ${userId}`);

    // ✅ Insert into staff (supports schemas with id PK and/or user_id FK)
    logs.push("📥 Inserting staff row…");
    const { error: staffInsertError } = await supabase.from("staff").insert({
      id: userId,               // keep if your PK is auth uid
      user_id: userId,          // keep if you also store FK
      name,
      email,
      pin_hash: hashedPin,
      permission: permission ?? "junior",
      weekly_hours: weekly_hours || {},
    });
    if (staffInsertError) {
      logs.push(`❌ Staff insert failed: ${staffInsertError.message}`);
      return new Response(
        JSON.stringify({ error: "Failed to insert into staff table", logs }),
        { status: 500, headers: corsHeaders },
      );
    }

    logs.push("✅ Staff record inserted");

    return new Response(
      JSON.stringify({
        message: "Staff added successfully",
        user: { id: userId, email, name, permission: permission ?? "junior" },
        logs,
      }),
      { status: 200, headers: corsHeaders },
    );
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("❌ Unexpected error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
