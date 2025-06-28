import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { create, getNumericDate, Header } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

console.log("🚀 Function started: login-with-pin");

serve(async (req: Request) => {
  const logs: string[] = ["🚀 Request received"];

  try {
    // ✅ Parse ENV
    const projectUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const functionSecret = Deno.env.get("FUNCTION_SECRET")!;
    const jwtSecret = Deno.env.get("JWT_SECRET")!;

    logs.push(`🔑 Env PROJECT_URL: ${projectUrl}`);
    logs.push(`🔑 Env SERVICE_ROLE_KEY: ${!!serviceRoleKey}`);
    logs.push(`🔑 Env FUNCTION_SECRET: ${!!functionSecret}`);
    logs.push(`🔑 Env JWT_SECRET: ${!!jwtSecret}`);

    // ✅ Check Auth Header
    const authHeader = req.headers.get("Authorization") || "";
    logs.push(`🔐 Auth Header: ${authHeader}`);
    if (!authHeader.startsWith(`Bearer ${functionSecret}`)) {
      logs.push("❌ Invalid function secret");
      return new Response(
        JSON.stringify({ error: "Unauthorized", logs }),
        { status: 401, headers: corsHeaders }
      );
    }

    // ✅ Get PIN from body
    const { pin } = await req.json();
    logs.push(`🔢 Received PIN: ${pin}`);

    if (!pin) {
      logs.push("❌ No PIN provided");
      return new Response(
        JSON.stringify({ error: "No PIN provided", logs }),
        { status: 400, headers: corsHeaders }
      );
    }

    // ✅ Fetch staff from Supabase
    const { data: staff, error: staffError } = await supabaseAdmin
      .from("staff")
      .select("*");

    if (staffError) {
      logs.push(`❌ Failed to fetch staff: ${staffError.message}`);
      return new Response(
        JSON.stringify({ error: staffError.message, logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    logs.push(`📄 Staff fetched: ${staff.length} staff members`);

    // ✅ Match PIN
    const matchedStaff = staff.find((member: any) => {
      const isMatch = member.pin_hash && bcrypt.compareSync(pin, member.pin_hash);
      logs.push(
        `👤 Checking staff: ${member.name} (${member.email})\n→ pin_hash: ${member.pin_hash}\n→ Match result: ${
          isMatch ? "✅ MATCH" : "❌ NO MATCH"
        }`
      );
      return isMatch;
    });

    if (!matchedStaff) {
      logs.push("❌ Invalid PIN: No staff matched");
      return new Response(
        JSON.stringify({ error: "Invalid PIN", logs }),
        { status: 401, headers: corsHeaders }
      );
    }

    logs.push(`✅ PIN matched for: ${matchedStaff.name} (${matchedStaff.email})`);

    // ✅ Find user in auth.users by email
    const { data: authUsers, error: authError } = await supabaseAdmin
      .from("auth.users")
      .select("*");

    if (authError) {
      logs.push(`❌ Error fetching auth.users: ${authError.message}`);
      return new Response(
        JSON.stringify({ error: authError.message, logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    logs.push(`📥 Found ${authUsers.length} auth.users`);

    const emails = authUsers.map((u: any) => u.email).join(", ");
    logs.push(`🧠 Emails in auth.users: ${emails}`);

    const authUser = authUsers.find(
      (user: any) => user.email === matchedStaff.email
    );

    if (!authUser) {
      logs.push("❌ No matching auth user for email");
      return new Response(
        JSON.stringify({ error: "No auth user found for email", logs }),
        { status: 404, headers: corsHeaders }
      );
    }

    logs.push(`👤 Found auth user: ${authUser.email} (ID: ${authUser.id})`);

    // ✅ Build JWT
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );

    logs.push(
      `🔐 Creating JWT for: ${matchedStaff.name} (${matchedStaff.email}), Role: ${matchedStaff.permissions}`
    );

    const payload = {
      sub: authUser.id,
      email: matchedStaff.email,
      name: matchedStaff.name,
      role: matchedStaff.permissions,
      exp: getNumericDate(60 * 60), // 1 hour
    };

    const jwt = await create(
      { alg: "HS256", typ: "JWT" } as Header,
      payload,
      key
    );

    logs.push("✅ JWT created successfully");

    return new Response(
      JSON.stringify({ token: jwt, user: payload, logs }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    logs.push(`❌ Unexpected error: ${err.message}`);
    return new Response(
      JSON.stringify({ error: err.message, logs }),
      { status: 500, headers: corsHeaders }
    );
  }
});
