// supabase/functions/login-with-pin/index.ts

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
  // ✅ Handle preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ✅ Load environment variables
  const projectUrl = Deno.env.get("PROJECT_URL")?.trim();
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY")?.trim();
  const functionSecret = Deno.env.get("FUNCTION_SECRET")?.trim();
  const jwtSecret = Deno.env.get("JWT_SECRET")?.trim();

  if (!projectUrl || !serviceRoleKey || !functionSecret || !jwtSecret) {
    console.error("❌ Missing environment variables");
    return new Response(
      JSON.stringify({ error: "Missing environment variables" }),
      { status: 500, headers: corsHeaders }
    );
  }

  // ✅ Check Authorization Header
  const authHeader = req.headers.get("Authorization")?.trim() || "";
  if (authHeader !== `Bearer ${functionSecret}`) {
    return new Response(
      JSON.stringify({ error: "Unauthorized - Invalid function secret" }),
      { status: 401, headers: corsHeaders }
    );
  }

  // ✅ Parse request body safely
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON in request body" }),
      { status: 400, headers: corsHeaders }
    );
  }

  const { pin } = body;
  if (!pin) {
    return new Response(JSON.stringify({ error: "Missing PIN" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  console.log("🔑 Login attempt with PIN");

  // ✅ Connect to Supabase
  const supabase = createClient(projectUrl, serviceRoleKey);

  // ✅ Fetch staff list
  const { data: staffList, error: staffError } = await supabase
    .from("staff")
    .select("id, email, name, role, pin_hash");

  if (staffError || !staffList) {
    console.error("❌ Failed to fetch staff:", staffError?.message);
    return new Response(JSON.stringify({ error: "Failed to fetch staff" }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  // ✅ Find staff by matching PIN
  const matchedStaff = staffList.find(
    (staff) => staff.pin_hash && bcrypt.compareSync(pin, staff.pin_hash)
  );

  if (!matchedStaff) {
    console.warn("❌ Invalid PIN attempt.");
    return new Response(JSON.stringify({ error: "Invalid PIN" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  console.log(`✅ PIN matched for staff: ${matchedStaff.name}`);

  // ✅ Find the matching auth user from auth.users by email
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();

  if (usersError || !users) {
    console.error("❌ Failed to fetch auth users:", usersError?.message);
    return new Response(
      JSON.stringify({ error: "Failed to fetch auth users" }),
      { status: 500, headers: corsHeaders }
    );
  }

  const authUser = users.find((u) => u.email === matchedStaff.email);

  if (!authUser) {
    console.error(`❌ Auth user not found for ${matchedStaff.email}`);
    return new Response(
      JSON.stringify({ error: "Auth user not found for this staff" }),
      { status: 404, headers: corsHeaders }
    );
  }

  console.log(`✅ Auth user found: ${authUser.email} (${authUser.id})`);

  // ✅ Create JWT token
  const jwt = await create(
    { alg: "HS256", typ: "JWT" },
    {
      sub: authUser.id, // 🔥 Must be auth.users.id
      email: matchedStaff.email,
      role: matchedStaff.role,
      exp: getNumericDate(60 * 60), // 1 hour expiry
    },
    jwtSecret
  );

  console.log("✅ JWT generated");

  // ✅ Return token and user info
  return new Response(
    JSON.stringify({
      token: jwt,
      user: {
        id: authUser.id,
        email: matchedStaff.email,
        name: matchedStaff.name,
        role: matchedStaff.role,
      },
    }),
    {
      status: 200,
      headers: corsHeaders,
    }
  );
});
