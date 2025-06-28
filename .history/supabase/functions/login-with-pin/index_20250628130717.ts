import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "*",
  "Content-Type": "application/json",
};

serve(async (req) => {
  const logs = [];

  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    logs.push("🚀 Request received");

    // Env vars
    const projectUrl = Deno.env.get("PROJECT_URL");
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
    const functionSecret = Deno.env.get("FUNCTION_SECRET");
    const jwtSecret = Deno.env.get("JWT_SECRET");

    logs.push(`🔑 Env PROJECT_URL: ${projectUrl}`);
    logs.push(`🔑 Env SERVICE_ROLE_KEY: ${!!serviceRoleKey}`);
    logs.push(`🔑 Env FUNCTION_SECRET: ${!!functionSecret}`);
    logs.push(`🔑 Env JWT_SECRET: ${!!jwtSecret}`);

    if (!projectUrl || !serviceRoleKey || !functionSecret || !jwtSecret) {
      logs.push("❌ Missing environment variables");
      return new Response(
        JSON.stringify({ error: "Missing environment variables", logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    const authHeader = req.headers.get("Authorization")?.trim() || "";
    logs.push(`🔐 Auth Header: ${authHeader}`);

    if (authHeader !== `Bearer ${functionSecret}`) {
      logs.push("❌ Invalid Function Secret");
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid function secret", logs }),
        { status: 401, headers: corsHeaders }
      );
    }

    let body;
    try {
      body = await req.json();
    } catch {
      logs.push("❌ Invalid JSON body");
      return new Response(
        JSON.stringify({ error: "Invalid JSON body", logs }),
        { status: 400, headers: corsHeaders }
      );
    }

    const { pin } = body;
    logs.push(`🔢 Received PIN: ${pin}`);

    if (!pin) {
      logs.push("❌ Missing PIN");
      return new Response(
        JSON.stringify({ error: "Missing PIN", logs }),
        { status: 400, headers: corsHeaders }
      );
    }

    const supabase = createClient(projectUrl, serviceRoleKey);

    const { data: staffList, error: staffError } = await supabase
      .from("staff")
      .select("id, email, name, permission, pin_hash");

    if (staffError) {
      logs.push(`❌ Error fetching staff: ${staffError.message}`);
      return new Response(
        JSON.stringify({ error: "Failed to fetch staff", logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    logs.push(`📄 Staff fetched: ${staffList.length} staff members`);

    let matchedStaff = null;

    for (const staff of staffList) {
      logs.push(`👤 Checking staff: ${staff.name} (${staff.email})`);
      logs.push(`→ pin_hash: ${staff.pin_hash}`);

      const isMatch = staff.pin_hash
        ? bcrypt.compareSync(pin, staff.pin_hash)
        : false;

      logs.push(`→ Match result: ${isMatch ? "✅ MATCH" : "❌ NO MATCH"}`);

      if (isMatch) {
        matchedStaff = staff;
        break;
      }
    }

    if (!matchedStaff) {
      logs.push("❌ Invalid PIN - No staff matched");
      return new Response(
        JSON.stringify({ error: "Invalid PIN", logs }),
        { status: 401, headers: corsHeaders }
      );
    }

    logs.push(`✅ PIN matched for: ${matchedStaff.name} (${matchedStaff.email})`);

    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();

    if (userError) {
      logs.push(`❌ Error fetching auth.users: ${userError.message}`);
      return new Response(
        JSON.stringify({ error: "Failed to fetch auth.users", logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    logs.push(`📥 Found ${users.length} auth.users`);
    logs.push(`🧠 Emails in auth.users: ${users.map(u => u.email).join(", ")}`);

    const authUser = users.find((u) => u.email === matchedStaff.email);

    if (!authUser) {
      logs.push(`❌ No matching auth user for email: ${matchedStaff.email}`);
      return new Response(
        JSON.stringify({ error: "Auth user not found", logs }),
        { status: 404, headers: corsHeaders }
      );
    }

    logs.push(`👤 Found auth user: ${authUser.email} (ID: ${authUser.id})`);

    // ✅ FIX IS HERE → Decode JWT_SECRET correctly
    const encoder = new TextEncoder();
    const key = encoder.encode(atob(jwtSecret)); // ✅ Decode Base64 to Uint8

    logs.push(
      `🔐 Creating JWT for: ${matchedStaff.name} (${matchedStaff.email}), Role: ${matchedStaff.permission}`
    );

    const jwt = await create(
      { alg: "HS256", typ: "JWT" },
      {
        sub: authUser.id,
        email: matchedStaff.email,
        name: matchedStaff.name,
        role: matchedStaff.permission,
        exp: getNumericDate(60 * 60), // 1 hour
      },
      key
    );

    logs.push(`✅ JWT created`);

    return new Response(
      JSON.stringify({
        token: jwt,
        user: {
          id: authUser.id,
          email: matchedStaff.email,
          name: matchedStaff.name,
          role: matchedStaff.permission,
        },
        logs,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    logs.push(`❌ Unexpected error: ${err.message}`);
    return new Response(
      JSON.stringify({ error: err.message, logs }),
      { status: 500, headers: corsHeaders }
    );
  }
});
