import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

// ✅ CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, Authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "*",
  "Content-Type": "application/json",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const logs = [];
  try {
    // ✅ Load environment variables
    const projectUrl = Deno.env.get("PROJECT_URL")?.trim();
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY")?.trim();
    const functionSecret = Deno.env.get("FUNCTION_SECRET")?.trim();
    const jwtSecret = Deno.env.get("JWT_SECRET")?.trim();

    logs.push("🔑 Env Vars Loaded");

    if (!projectUrl || !serviceRoleKey || !functionSecret || !jwtSecret) {
      throw new Error("Missing environment variables.");
    }

    // ✅ Check authorization header
    const authHeader = req.headers.get("Authorization")?.trim();
    logs.push(`🔐 Auth Header: ${authHeader}`);
    if (authHeader !== `Bearer ${functionSecret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized", logs }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // ✅ Parse incoming request
    const { pin } = await req.json();
    logs.push(`🔢 Incoming PIN: ${pin}`);
    if (!pin) {
      return new Response(JSON.stringify({ error: "Missing PIN", logs }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(projectUrl, serviceRoleKey);

    // ✅ Fetch staff table
    const { data: staffList, error: staffError } = await supabase
      .from("staff")
      .select("id, email, name, permission, pin_hash");

    if (staffError || !staffList) {
      throw new Error(`Failed to fetch staff: ${staffError?.message}`);
    }

    logs.push(`📄 Staff List Length: ${staffList.length}`);

    // ✅ Find PIN match
    let matchedStaff = null;
    for (const staff of staffList) {
      logs.push(`👤 Staff: ${staff.name}`);
      logs.push(`→ Stored pin_hash: ${staff.pin_hash}`);

      const pinMatches = staff.pin_hash && bcrypt.compareSync(pin, staff.pin_hash);
      logs.push(`→ Comparing with ${staff.name}: ${pinMatches ? "✅ MATCH" : "❌ NO MATCH"}`);

      if (pinMatches) {
        matchedStaff = staff;
        break;
      }
    }

    if (!matchedStaff) {
      return new Response(JSON.stringify({ error: "Invalid PIN", logs }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    logs.push(`✅ PIN matched for: ${matchedStaff.name} (${matchedStaff.email})`);

    // ✅ Find user in auth.users
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
      throw new Error(`Auth fetch failed: ${authError.message}`);
    }

    const authUser = users.find((u) => u.email === matchedStaff.email);

    if (!authUser) {
      throw new Error("Auth user not found.");
    }

    logs.push(`👤 Found Auth User: ${authUser.email}`);

    // ✅ Create JWT
    const jwtPayload = {
      sub: authUser.id,               // 🔥 Auth ID for Supabase session
      email: matchedStaff.email,      // ✅ From staff table
      name: matchedStaff.name,        // ✅ From staff table
      role: matchedStaff.permission, // ✅ From staff table (Admin/Staff)
      exp: getNumericDate(60 * 60),   // 1 hour expiry
    };

    logs.push(`📦 Building JWT for: ${matchedStaff.name} / ${matchedStaff.email} / ${matchedStaff.permission}`);

    const jwt = await create({ alg: "HS256", typ: "JWT" }, jwtPayload, jwtSecret);

    logs.push("✅ JWT generated successfully.");

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
    logs.push(`❌ Error caught: ${err.message}`);
    return new Response(
      JSON.stringify({ error: err.message, logs }),
      { status: 500, headers: corsHeaders }
    );
  }
});
