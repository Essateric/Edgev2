import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.3";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import {
  create,
  getNumericDate,
  Header,
  Payload,
} from "https://deno.land/x/djwt@v2.8/mod.ts";

console.log("🚀 Edge Function Loaded");

// ✅ Helper: Convert string secret into CryptoKey
async function getCryptoKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// ✅ CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // ✅ or set to your frontend URL
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  const logs: string[] = [];
  try {
    // ✅ Handle OPTIONS preflight requests
    if (req.method === "OPTIONS") {
      return new Response("OK", { headers: corsHeaders });
    }

    logs.push("🚀 Request received");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const FUNCTION_SECRET = Deno.env.get("FUNCTION_SECRET")!;
    const JWT_SECRET = Deno.env.get("JWT_SECRET")!;

    logs.push(`🔑 Env PROJECT_URL: ${SUPABASE_URL}`);
    logs.push(`🔑 Env SERVICE_ROLE_KEY: ✅ Loaded`);
    logs.push(`🔑 Env FUNCTION_SECRET: ✅ Loaded`);
    logs.push(`🔑 Env JWT_SECRET: ✅ Loaded`);

    const authHeader = req.headers.get("Authorization") ?? "";
    logs.push(`🔐 Auth Header: ${authHeader}`);

    if (authHeader !== `Bearer ${FUNCTION_SECRET}`) {
      logs.push(`⛔ Invalid function secret`);
      return new Response(
        JSON.stringify({ error: "Unauthorized", logs }),
        { status: 401, headers: corsHeaders }
      );
    }

    const { pin } = await req.json();
    logs.push(`🔢 Received PIN: ${pin}`);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ✅ Fetch staff table
    const { data: staffData, error: staffError } = await supabase
      .from("staff")
      .select("*");

    if (staffError || !staffData) {
      logs.push(`❌ Error fetching staff: ${staffError?.message}`);
      return new Response(
        JSON.stringify({ error: "Error fetching staff", logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    logs.push(`📄 Staff fetched: ${staffData.length} staff members`);

    let matchedStaff = null;

    for (const staff of staffData) {
      logs.push(`👤 Checking staff: ${staff.name} (${staff.email})`);
      logs.push(`→ pin_hash: ${staff.pin_hash}`);

      const match =
        staff.pin_hash && bcrypt.compareSync(pin.toString(), staff.pin_hash);

      logs.push(`→ Match result: ${match ? "✅ MATCH" : "❌ NO MATCH"}`);

      if (match) {
        matchedStaff = staff;
        break;
      }
    }

    if (!matchedStaff) {
      logs.push("❌ Invalid PIN - no matching staff");
      return new Response(
        JSON.stringify({ error: "Invalid PIN", logs }),
        { status: 401, headers: corsHeaders }
      );
    }

    logs.push(
      `✅ PIN matched for: ${matchedStaff.name} (${matchedStaff.email})`
    );

    // ✅ Fetch auth.users correctly (without 'public.')
    const { data: authUsers, error: authError } = await supabase
      .from("auth.users")
      .select("*");

    if (authError || !authUsers) {
      logs.push(`❌ Error fetching auth.users: ${authError?.message}`);
      return new Response(
        JSON.stringify({ error: "Error fetching auth.users", logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    logs.push(`📥 Found ${authUsers.length} auth.users`);
    logs.push(
      `🧠 Emails in auth.users: ${authUsers
        .map((u: any) => u.email)
        .join(", ")}`
    );

    const authUser = authUsers.find(
      (u: any) =>
        u.email?.toLowerCase() === matchedStaff.email?.toLowerCase()
    );

    if (!authUser) {
      logs.push(`❌ No auth user found for ${matchedStaff.email}`);
      return new Response(
        JSON.stringify({ error: "Auth user not found", logs }),
        { status: 404, headers: corsHeaders }
      );
    }

    logs.push(
      `👤 Found auth user: ${authUser.email} (ID: ${authUser.id})`
    );

    const permission = matchedStaff.permission ?? "Staff";
    const name = matchedStaff.name ?? matchedStaff.email;

    logs.push(`🔑 Permission for ${name}: ${permission}`);

    // ✅ Build JWT
    const header: Header = { alg: "HS256", typ: "JWT" };
    const payload: Payload = {
      sub: authUser.id,
      email: matchedStaff.email,
      role: permission,
      name: name,
      exp: getNumericDate(60 * 60 * 24 * 7), // 7 days
    };

    logs.push(
      `🔐 Creating JWT for: ${name} (${matchedStaff.email}), Role: ${permission}`
    );

    const key = await getCryptoKey(JWT_SECRET);
    const jwt = await create(header, payload, key);

    logs.push(`✅ JWT created successfully`);

    return new Response(
      JSON.stringify({
        token: jwt,
        user: {
          id: authUser.id,
          email: matchedStaff.email,
          name: name,
          permission: permission,
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
