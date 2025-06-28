import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

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

  // ✅ Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  logs.push("🔑 Env Vars Loaded");

  // ✅ Load environment variables
  const projectUrl = Deno.env.get("PROJECT_URL")?.trim();
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY")?.trim();
  const functionSecret = Deno.env.get("FUNCTION_SECRET")?.trim();
  const jwtSecret = Deno.env.get("JWT_SECRET")?.trim();

  if (!projectUrl || !serviceRoleKey || !functionSecret || !jwtSecret) {
    logs.push("❌ Missing environment variables.");
    return new Response(
      JSON.stringify({ error: "Missing environment variables", logs }),
      { status: 500, headers: corsHeaders }
    );
  }

  // ✅ Auth header check
  const authHeader = req.headers.get("Authorization")?.trim() || "";
  logs.push(`🔐 Auth Header: ${authHeader}`);
  if (authHeader !== `Bearer ${functionSecret}`) {
    logs.push("❌ Unauthorized - Invalid function secret");
    return new Response(
      JSON.stringify({ error: "Unauthorized - Invalid function secret", logs }),
      { status: 401, headers: corsHeaders }
    );
  }

  // ✅ Parse body
  let body;
  try {
    body = await req.json();
  } catch {
    logs.push("❌ Invalid JSON in request body");
    return new Response(
      JSON.stringify({ error: "Invalid JSON body", logs }),
      { status: 400, headers: corsHeaders }
    );
  }

  const { pin } = body;
  if (!pin) {
    logs.push("❌ Missing PIN");
    return new Response(JSON.stringify({ error: "Missing PIN", logs }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  logs.push(`🔢 Incoming PIN: ${pin}`);

  // ✅ Connect to Supabase
  const supabase = createClient(projectUrl, serviceRoleKey);

  // ✅ Fetch staff table
  const { data: staffList, error: staffError } = await supabase
    .from("staff")
    .select("id, email, name, permission, pin_hash");

  if (staffError || !staffList) {
    logs.push(`❌ Error fetching staff: ${staffError?.message}`);
    return new Response(
      JSON.stringify({ error: "Failed to fetch staff", logs }),
      { status: 500, headers: corsHeaders }
    );
  }

  logs.push(`📄 Staff List Length: ${staffList.length}`);

  // ✅ Check PIN against staff
  let matchedStaff = null;

  for (const staff of staffList) {
    logs.push(`👤 Checking Staff: ${staff.name} (${staff.email})`);
    logs.push(`→ Stored pin_hash: ${staff.pin_hash}`);

    const isMatch = staff.pin_hash
      ? bcrypt.compareSync(pin, staff.pin_hash)
      : false;

    logs.push(`→ Comparing: ${isMatch ? "✅ MATCH" : "❌ NO MATCH"}`);

    if (isMatch) {
      matchedStaff = staff;
      break;
    }
  }

  if (!matchedStaff) {
    logs.push("❌ Invalid PIN - No staff matched");
    return new Response(JSON.stringify({ error: "Invalid PIN", logs }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  logs.push(`✅ PIN matched for: ${matchedStaff.name} (${matchedStaff.email})`);

  // ✅ Fetch auth.users to get the user ID
  const { data: { users }, error: userFetchError } = await supabase.auth.admin.listUsers();

  if (userFetchError) {
    logs.push(`❌ Failed to fetch auth.users: ${userFetchError.message}`);
    return new Response(
      JSON.stringify({ error: "Failed to fetch auth.users", logs }),
      { status: 500, headers: corsHeaders }
    );
  }

  logs.push(`📥 Fetched ${users.length} auth.users`);
  logs.push(`🧠 Emails in auth.users: ${users.map(u => u.email).join(", ")}`);

  const authUser = users.find(u => u.email === matchedStaff.email);

  if (!authUser) {
    logs.push(`❌ No auth user found for ${matchedStaff.email}`);
    return new Response(
      JSON.stringify({ error: "Auth user not found", logs }),
      { status: 404, headers: corsHeaders }
    );
  }

  logs.push(`👤 Found Auth User: ${authUser.email} (ID: ${authUser.id})`);

  // ✅ Build JWT
  logs.push(
    `📦 Building JWT for: ${matchedStaff.name} / ${matchedStaff.email} / ${matchedStaff.permission}`
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
    jwtSecret
  );

  logs.push("✅ JWT created successfully");

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
});
