import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.3";
import {
  verify,
  getNumericDate,
  create,
} from "https://deno.land/x/djwt@v2.8/mod.ts";
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

// 🔑 Hash PIN securely
async function hashPin(pin: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  const logs: string[] = [];

  try {
    if (req.method === "OPTIONS") {
      return new Response("OK", { headers: corsHeaders });
    }

    logs.push("🚀 Request received");

    // ✅ Load environment variables
    const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
    const JWT_SECRET = Deno.env.get("JWT_SECRET")!;

    logs.push(`🔑 Env PROJECT_URL: ${PROJECT_URL}`);
    logs.push(`🔑 Env SERVICE_ROLE_KEY: ✅ Loaded`);
    logs.push(`🔑 Env JWT_SECRET: ✅ Loaded`);

    // ✅ Get Authorization header
    const authHeader = req.headers.get("authorization")?.replace("Bearer ", "").trim();

    if (!authHeader) {
      logs.push(`⛔ Missing Authorization header.`);
      return new Response(
        JSON.stringify({ error: "Unauthorized - Missing Authorization Header", logs }),
        { status: 401, headers: corsHeaders },
      );
    }

    // ✅ Verify JWT manually
    let payload;
    try {
      const key = await getCryptoKey(JWT_SECRET);
      payload = await verify(authHeader, key, "HS256");
      logs.push(`✅ JWT verified for ${payload.name} (${payload.email})`);
    } catch (err) {
      logs.push(`⛔ Invalid JWT - ${err.message}`);
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid JWT", logs }),
        { status: 401, headers: corsHeaders },
      );
    }

    // ✅ Check permissions (Only admins can add staff)
    if (payload.permission !== "admin") {
      logs.push(`⛔ Forbidden - Only admins can add staff`);
      return new Response(
        JSON.stringify({ error: "Forbidden - Only admins can add staff", logs }),
        { status: 403, headers: corsHeaders },
      );
    }

    // ✅ Initialize Supabase
    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);
    logs.push("🗄️ Supabase client initialized.");

    // ✅ Parse Request Body
    const { name, email, pin, permission, weekly_hours } = await req.json();
    logs.push(
      `📦 Incoming body → name: ${name}, email: ${email}, permission: ${permission}`,
    );

    if (!name || !email || !pin) {
      logs.push(`❌ Missing required fields (name, email, pin)`);
      return new Response(
        JSON.stringify({ error: "Missing name, email, or pin", logs }),
        { status: 400, headers: corsHeaders },
      );
    }

    // ✅ Hash the PIN
const hashedPin = await bcrypt.hash(pin);
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
        { status: 400, headers: corsHeaders },
      );
    }

    const userId = userData.user.id;
    logs.push(`✅ Auth user created → ID: ${userId}`);

    // ✅ Insert into 'staff' table INCLUDING weekly_hours
    logs.push("📥 Inserting user into 'staff' table...");
    const { error: staffError } = await supabase.from("staff").insert({
      id: userId,
      name,
      email,
      pin_hash: hashedPin,
      permission: permission ?? "junior",
      weekly_hours: weekly_hours || {}, // <---- THIS LINE ADDED
    });

    if (staffError) {
      logs.push(`❌ Failed to insert into 'staff' table: ${staffError.message}`);
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
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logs.push(`❌ Unexpected error: ${errorMessage}`);
    return new Response(
      JSON.stringify({ error: errorMessage, logs }),
      { status: 500, headers: corsHeaders },
    );
  }
});
