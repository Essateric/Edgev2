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

  // ✅ Load and clean secrets (trim to remove any accidental spaces)
  const projectUrl = Deno.env.get("PROJECT_URL")?.trim();
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY")?.trim();
  const functionSecret = Deno.env.get("FUNCTION_SECRET")?.trim();
  const jwtSecret = Deno.env.get("JWT_SECRET")?.trim();

  if (!projectUrl || !serviceRoleKey || !functionSecret || !jwtSecret) {
    console.error("❌ Missing one or more environment variables.");
    return new Response(
      JSON.stringify({ error: "LogInWithPin: Missing environment variables", projectUrl,serviceRoleKey,functionSecret,jwtSecret }),
      { status: 500, headers: corsHeaders }
    );
  }

  // ✅ Check function authorization
  const authHeader = req.headers.get("Authorization")?.trim() || "";
  if (authHeader !== `Bearer ${functionSecret}`) {
    console.error("❌ Unauthorized request. Invalid function secret.");
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

  console.log("🔑 Processing login for PIN...");

  // ✅ Connect to Supabase
  const supabase = createClient(projectUrl, serviceRoleKey);

  // ✅ Fetch staff list
  const { data: staffList, error } = await supabase
    .from("staff")
    .select("id, email, name, role, pin_hash");

  if (error) {
    console.error("❌ Supabase fetch error:", error.message);
    return new Response(JSON.stringify({ error: "Failed to fetch staff" }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  if (!staffList) {
    console.error("❌ No staff records found.");
    return new Response(JSON.stringify({ error: "No staff found" }), {
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

  console.log(`✅ PIN matched for user: ${matchedStaff.name} (${matchedStaff.email})`);

  // ✅ Create JWT token
  const jwt = await create(
    { alg: "HS256", typ: "JWT" },
    {
      sub: matchedStaff.id,
      email: matchedStaff.email,
      role: matchedStaff.role,
      exp: getNumericDate(60 * 60), // 1 hour expiry
    },
    jwtSecret
  );

  console.log("✅ JWT generated successfully.");

  // ✅ Success response
  return new Response(
    JSON.stringify({
      token: jwt,
      user: {
        id: matchedStaff.id,
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
