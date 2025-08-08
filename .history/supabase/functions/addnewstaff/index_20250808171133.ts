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
    ["sign", "verify"]
  );
}

serve(async (req) => {
  const logs: string[] = [];

  try {
    if (req.method === "OPTIONS") {
      return new Response("OK", { headers: corsHeaders });
    }

    logs.push("🚀 Request received");

    // ✅ Load env vars
    const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
    const JWT_SECRET = Deno.env.get("JWT_SECRET")!;

    logs.push(`🔑 Env PROJECT_URL: ${PROJECT_URL}`);
    logs.push(`🔑 Env SERVICE_ROLE_KEY: ✅ Loaded`);
    logs.push(`🔑 Env JWT_SECRET: ✅ Loaded`);

    // ✅ Get and verify JWT from Authorization header
    const authHeader = req.headers.get("authorization")?.replace("Bearer ", "").trim();
    if (!authHeader) {
      logs.push(`⛔ Missing Authorization header.`);
      return new Response(
        JSON.stringify({ error: "Unauthorized - Missing Authorization Header", logs }),
        { status: 401, headers: corsHeaders }
      );
    }

    let payload;
    try {
      const key = await getCryptoKey(JWT_SECRET);
      payload = await verify(authHeader, key, "HS256");
      logs.push(`✅ JWT verified for ${payload.name} (${payload.email})`);
    } catch (err) {
      logs.push(`⛔ Invalid JWT - ${err.message}`);
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid JWT", logs }),
        { status: 401, headers: corsHeaders }
      );
    }

    // ✅ Ensure only admins can add staff
    if (payload.permission !== "admin") {
      logs.push(`⛔ Forbidden - Only admins can add staff`);
      return new Response(
        JSON.stringify({ error: "Forbidden - Only admins can add staff", logs }),
        { status: 403, headers: corsHeaders }
      );
    }

    // ✅ Initialize Supabase
    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);
    logs.push("🗄️ Supabase client initialized.");

    // ✅ Parse Request Body
    const { name, email, pin, permission, weekly_hours } = await req.json();
    logs.push(`📦 Incoming body → name: ${name}, email: ${email}, permission: ${permission}`);

    if (!name || !email || !pin) {
      logs.push(`❌ Missing required fields (name, email, pin)`);
      return new Response(
        JSON.stringify({ error: "Missing name, email, or pin", logs }),
        { status: 400, headers: corsHeaders }
      );
    }

    // ✅ Hash the PIN
    const hashedPin = await bcrypt.hash(pin);
    logs.push(`🔑 PIN hashed: ${hashedPin}`);

    // ✅ Create Auth User
    logs.push(`👤 Attempting to create Auth user for ${email}`);
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email: email,
      email_confirm: true
    });

    if (userError) {
      logs.push(`❌ Failed to create Auth user: ${userError.message}`);
      return new Response(
        JSON.stringify({
          error: "Auth user creation failed",
          details: userError.message,
          logs
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    const userId = userData.user.id;
    logs.push(`✅ Auth user created → ID: ${userId}`);

    // ✅ Insert into 'staff' table
    logs.push("📥 Inserting user into 'staff' table...");
    const { error: staffError } = await supabase.from("staff").insert({
      id: userId,
      name,
      email,
      pin_hash: hashedPin,
      permission: permission ?? "junior",
      weekly_hours: weekly_hours || {}
    });

    if (staffError) {
      logs.push(`❌ Failed to insert into 'staff' table: ${staffError.message}`);
      return new Response(
        JSON.stringify({ error: "Failed to insert into staff table", logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    logs.push("✅ Staff record inserted successfully.");

    // 🟢 Generate magic link so the new user can log in immediately
    logs.push("🔗 Generating magic link for new user...");
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email
    });

    if (linkError) {
      logs.push(`❌ Failed to generate magic link: ${linkError.message}`);
      return new Response(
        JSON.stringify({ error: "Failed to generate login link", details: linkError.message, logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    const token_hash = linkData?.properties?.hashed_token ?? null;
    const email_otp = linkData?.properties?.email_otp ?? null;
    logs.push("✅ Magic link generated successfully.");

    // ✅ Return everything to front end
    return new Response(
      JSON.stringify({
        message: "Staff added successfully",
        user: {
          id: userId,
          email,
          name,
          permission: permission ?? "junior"
        },
        token_hash,
        email_otp,
        logs
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logs.push(`❌ Unexpected error: ${errorMessage}`);
    return new Response(
      JSON.stringify({ error: errorMessage, logs }),
      { status: 500, headers: corsHeaders }
    );
  }
});
