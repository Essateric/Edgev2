// File: supabase/functions/login-with-pin/index.ts

import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt/mod.ts";
import { create, getNumericDate, Header, Payload } from "https://deno.land/x/djwt@v2.8/mod.ts";

console.log("🚀 Login with PIN function loaded");

serve(async (req) => {
  const logs: string[] = [];
  try {
    logs.push("🚀 Request received");

    // Env variables
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const FUNCTION_SECRET = Deno.env.get("FUNCTION_SECRET")!;
    const JWT_SECRET = Deno.env.get("JWT_SECRET")!;

    logs.push(`🔑 Env PROJECT_URL: ${SUPABASE_URL}`);
    logs.push(`🔑 Env SERVICE_ROLE_KEY: ${SERVICE_ROLE_KEY ? "✅ Loaded" : "❌ Missing"}`);
    logs.push(`🔑 Env FUNCTION_SECRET: ${FUNCTION_SECRET ? "✅ Loaded" : "❌ Missing"}`);
    logs.push(`🔑 Env JWT_SECRET: ${JWT_SECRET ? "✅ Loaded" : "❌ Missing"}`);

    // Auth header check
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    logs.push(`🔐 Auth Header: ${authHeader}`);

    if (token !== FUNCTION_SECRET) {
      logs.push("❌ Invalid function secret");
      return new Response(
        JSON.stringify({ error: "Unauthorized", logs }, null, 2),
        { status: 401 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { pin } = await req.json();
    logs.push(`🔢 Received PIN: ${pin}`);

    // Fetch staff table
    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .select("*");

    if (staffError) {
      logs.push(`❌ Error fetching staff: ${staffError.message}`);
      return new Response(JSON.stringify({ error: staffError.message, logs }, null, 2), { status: 500 });
    }

    logs.push(`📄 Staff fetched: ${staff.length} staff members`);

    // Check pin
    const matchedStaff = staff.find((s) => {
      const match = s.pin_hash && bcrypt.compareSync(pin, s.pin_hash);
      logs.push(`👤 Checking staff: ${s.name} (${s.email})`);
      logs.push(`→ pin_hash: ${s.pin_hash}`);
      logs.push(`→ Match result: ${match ? "✅ MATCH" : "❌ NO MATCH"}`);
      return match;
    });

    if (!matchedStaff) {
      logs.push("❌ No matching PIN");
      return new Response(JSON.stringify({ error: "Invalid PIN", logs }, null, 2), { status: 401 });
    }

    logs.push(`✅ PIN matched for: ${matchedStaff.name} (${matchedStaff.email})`);

    // Fetch auth.users via Admin API
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });

    if (!authRes.ok) {
      logs.push(`❌ Error fetching auth.users: ${authRes.statusText}`);
      return new Response(JSON.stringify({ error: authRes.statusText, logs }, null, 2), { status: 500 });
    }

    const { users } = await authRes.json();
    logs.push(`📥 Found ${users.length} auth.users`);
    logs.push(`🧠 Emails in auth.users: ${users.map((u: any) => u.email).join(", ")}`);

    const authUser = users.find((u: any) => u.email === matchedStaff.email);

    if (!authUser) {
      logs.push(`❌ No matching auth user for ${matchedStaff.email}`);
      return new Response(
        JSON.stringify({ error: "Auth user not found", logs }, null, 2),
        { status: 404 }
      );
    }

    logs.push(`👤 Found auth user: ${authUser.email} (ID: ${authUser.id})`);

    // Fetch permission
    const { data: permission, error: permissionError } = await supabase
      .from("permission")
      .select("role")
      .eq("email", matchedStaff.email)
      .single();

    if (permissionError) {
      logs.push(`❌ Error fetching permission: ${permissionError.message}`);
      return new Response(JSON.stringify({ error: permissionError.message, logs }, null, 2), { status: 500 });
    }

    const role = permission.role || "staff";
    logs.push(`🎭 Role for ${matchedStaff.email}: ${role}`);

    // Create JWT
    const payload: Payload = {
      sub: authUser.id,
      email: authUser.email,
      role: role,
      exp: getNumericDate(60 * 60 * 24 * 7), // 7 days
    };

    const header: Header = { alg: "HS256", typ: "JWT" };
    const jwt = await create(header, payload, JWT_SECRET);

    logs.push(`🔐 JWT created successfully for ${authUser.email}`);

    return new Response(
      JSON.stringify({ token: jwt, user: { id: authUser.id, email: authUser.email, role }, logs }, null, 2),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    logs.push(`❌ Unexpected error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message, logs }, null, 2), { status: 500 });
  }
});
