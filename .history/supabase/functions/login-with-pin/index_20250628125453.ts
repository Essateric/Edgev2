import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

// ✅ CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, Authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "*",
  "Content-Type": "application/json",
};

serve(async (req) => {
  const logs = [];

  // ✅ Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ✅ Env Variables
    const projectUrl = Deno.env.get("PROJECT_URL")?.trim();
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY")?.trim();
    const functionSecret = Deno.env.get("FUNCTION_SECRET")?.trim();
    const jwtSecret = Deno.env.get("JWT_SECRET")?.trim();

    logs.push("🔑 Env Vars Loaded");

    if (!projectUrl || !serviceRoleKey || !functionSecret || !jwtSecret) {
      return new Response(
        JSON.stringify({ error: "Missing environment variables", logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    // ✅ Auth header check
    const authHeader = req.headers.get("Authorization")?.trim();
    logs.push(`🔐 Auth Header: ${authHeader}`);

    if (authHeader !== `Bearer ${functionSecret}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - invalid function secret", logs }),
        { status: 401, headers: corsHeaders }
      );
    }

    // ✅ Parse body
    const { pin } = await req.json();
    logs.push(`🔢 Incoming PIN: ${pin}`);

    if (!pin) {
      return new Response(
        JSON.stringify({ error: "Missing PIN", logs }),
        { status: 400, headers: corsHeaders }
      );
    }

    // ✅ Connect to Supabase
    const supabase = createClient(projectUrl, serviceRoleKey);

    // ✅ Fetch staff list
    const { data: staffList, error: staffError } = await supabase
      .from("staff")
      .select("id, email, name, permissions, pin_hash");

    if (staffError || !staffList) {
      logs.push(`❌ Staff fetch error: ${staffError?.message}`);
      return new Response(
        JSON.stringify({ error: "Failed to fetch staff", logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    logs.push(`📄 Staff List Length: ${staffList.length}`);

    // ✅ Check PIN against hash
    let matchedStaff = null;
    for (const staff of staffList) {
      logs.push(`👤 Staff: ${staff.name}`);
      logs.push(`→ Stored pin_hash: ${staff.pin_hash}`);

      const match = staff.pin_hash && bcrypt.compareSync(pin, staff.pin_hash);
      logs.push(`→ Comparing with ${staff.name}: ${match ? "✅ MATCH" : "❌ NO MATCH"}`);

      if (match) {
        matchedStaff = staff;
        break;
      }
    }

    if (!matchedStaff) {
      return new Response(
        JSON.stringify({ error: "Invalid PIN", logs }),
        { status: 401, headers: corsHeaders }
      );
    }

    logs.push(`✅ PIN matched for: ${matchedStaff.name} (${matchedStaff.email})`);

    // ✅ Fetch Auth User (by email)
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();

    if (authError || !users) {
      logs.push(`❌ Auth fetch error: ${authError?.message}`);
      return new Response(
        JSON.stringify({ error: "Failed to fetch auth users", logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    const authUser = users.find((u) => u.email === matchedStaff.email);

    if (!authUser) {
      logs.push(`❌ No auth user found for ${matchedStaff.email}`);
      return new Response(
        JSON.stringify({ error: "Auth user not found", logs }),
        { status: 404, headers: corsHeaders }
      );
    }

    logs.push(`👤 Found Auth User: ${authUser.email}`);

    // ✅ Build JWT
    logs.push(
      `📦 Building JWT for: ${matchedStaff.name} / ${matchedStaff.email} / ${matchedStaff.permissions}`
    );

    const jwt = await create(
      { alg: "HS256", typ: "JWT" },
      {
        sub: authUser.id,
        email: matchedStaff.email,
        name: matchedStaff.name,
        role: matchedStaff.permissions,
        exp: getNumericDate(60 * 60), // 1 hour
      },
      jwtSecret
    );

    logs.push("✅ JWT generated");

    // ✅ Success Response
    return new Response(
      JSON.stringify({
        token: jwt,
        user: {
          id: authUser.id,
          email: matchedStaff.email,
          name: matchedStaff.name,
          role: matchedStaff.permissions,
        },
        logs,
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (err) {
    logs.push(`❌ Error caught: ${err.message}`);
    return new Response(
      JSON.stringify({ error: err.message, logs }),
      { status: 500, headers: corsHeaders }
    );
  }
});
