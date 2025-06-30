import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.3";
import {
  create,
  getNumericDate,
  Header,
  Payload,
} from "https://deno.land/x/djwt@v2.8/mod.ts";

import { corsHeaders } from "../_shared/cors.ts";

console.log("🚀 AddNewStaff function loaded");

// 🔐 Helper to generate JWT key
async function getCryptoKey(secret) {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// 🔑 Hash PIN using crypto
async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  const logs = [];

  try {
    if (req.method === "OPTIONS") {
      return new Response("OK", { headers: corsHeaders });
    }

    logs.push("🚀 Request received");

    // ✅ Load environment variables
    const PROJECT_URL = (Deno.env.get("PROJECT_URL") || "").trim();
    const SERVICE_ROLE_KEY = (Deno.env.get("SERVICE_ROLE_KEY") || "").trim();
    const FUNCTION_SECRET = (Deno.env.get("FUNCTION_SECRET") || "").trim();
    const JWT_SECRET = (Deno.env.get("JWT_SECRET") || "").trim();

    logs.push(`🔑 Env PROJECT_URL: ${PROJECT_URL}`);
    logs.push(`🔑 Env SERVICE_ROLE_KEY: ✅ Loaded`);
    logs.push(`🔑 Env FUNCTION_SECRET: ✅ Loaded`);
    logs.push(`🔑 Env JWT_SECRET: ✅ Loaded`);

    // ✅ Check Authorization Header
    const authHeader = req.headers.get("authorization") ?? "";
    logs.push(`🔐 Incoming Auth Header: "${authHeader}"`);
    logs.push(`🔑 Expected Auth Header: "Bearer ${FUNCTION_SECRET}"`);

    if (authHeader !== `Bearer ${FUNCTION_SECRET}`) {
      logs.push(`⛔ Invalid FUNCTION_SECRET. Expected: Bearer ${FUNCTION_SECRET}`);
      return new Response(
        JSON.stringify({ error: "Unauthorized", logs }),
        { status: 401, headers: corsHeaders }
      );
    }

    // ✅ Parse Request Body
    const { name, email, pin, permission } = await req.json();
    logs.push(
      `📦 Incoming body → name: ${name}, email: ${email}, permission: ${permission}`
    );

    if (!name || !email || !pin) {
      logs.push(`❌ Missing required fields (name, email, pin)`);
      return new Response(
        JSON.stringify({ error: "Missing name, email, or pin", logs }),
        { status: 400, headers: corsHeaders }
      );
    }

    // ✅ Initialize Supabase Client with Service Role
    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);
    logs.push("🗄️ Supabase client initialized.");

    // ✅ Hash the PIN
    const hashedPin = await hashPin(pin);
    logs.push(`🔑 PIN hashed: ${hashedPin}`);

    // ✅ Create Auth User
    logs.push(`👤 Attempting to create Auth user for ${email}`);
    const { data: userData, error: userError } =
      await supabase.auth.admin.createUser({
        email: email,
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
      permission: permission ?? "Junior",
    });

    if (staffError) {
      logs.push(`❌ Failed to insert into 'staff' table: ${staffError.message}`);
      return new Response(
        JSON.stringify({ error: "Failed to insert into staff table", logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    logs.push("✅ Staff record inserted successfully.");

    // ✅ Generate JWT
    logs.push("🔐 Generating JWT...");
    const header = { alg: "HS256", typ: "JWT" };
    const payload = {
      sub: userId,
      email: email,
      name: name,
      permission: permission ?? "Junior",
      exp: getNumericDate(60 * 60 * 24 * 7), // 7 days
    };

    const key = await getCryptoKey(JWT_SECRET);
    const jwt = await create(header, payload, key);

    logs.push("✅ JWT created successfully.");

    return new Response(
      JSON.stringify({
        token: jwt,
        user: {
          id: userId,
          email,
          name,
          permission: permission ?? "Junior",
        },
        logs,
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
