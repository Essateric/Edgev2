import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

// ✅ CORS Headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", 
  "Access-Control-Allow-Headers":
    "authorization, Authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "*",
  "Content-Type": "application/json",
};

serve(async (req) => {
  // ✅ Preflight Check
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ✅ Load environment variables
    const projectUrl = Deno.env.get("PROJECT_URL")?.trim();
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY")?.trim();
    const functionSecret = Deno.env.get("FUNCTION_SECRET")?.trim();
    const jwtSecret = Deno.env.get("JWT_SECRET")?.trim();

    if (!projectUrl || !serviceRoleKey || !functionSecret || !jwtSecret) {
      throw new Error("Missing environment variables.");
    }

    // ✅ Check Authorization Header
    const authHeader = req.headers.get("Authorization")?.trim();
    if (authHeader !== `Bearer ${functionSecret}`) {
      throw new Error("Unauthorized - Invalid function secret.");
    }

    // ✅ Parse request body
    const { pin } = await req.json();
    if (!pin) {
      throw new Error("Missing PIN.");
    }

    // ✅ Connect to Supabase
    const supabase = createClient(projectUrl, serviceRoleKey);

    // ✅ Fetch staff
    const { data: staffList, error: staffError } = await supabase
      .from("staff")
      .select("id, email, name, role, pin_hash");

    if (staffError || !staffList) {
      throw new Error("Failed to fetch staff list.");
    }

    // ✅ Find matching staff by PIN
    const matchedStaff = staffList.find(
      (staff) => staff.pin_hash && bcrypt.compareSync(pin, staff.pin_hash)
    );

    if (!matchedStaff) {
      return new Response(
        JSON.stringify({ error: "Invalid PIN." }),
        { status: 401, headers: corsHeaders }
      );
    }

    console.log(`✅ PIN matched for staff: ${matchedStaff.name}`);

    // ✅ Fetch auth users
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError || !users) {
      throw new Error("Failed to fetch auth users.");
    }

    const authUser = users.find((u) => u.email === matchedStaff.email);
    if (!authUser) {
      throw new Error(`Auth user not found for ${matchedStaff.email}`);
    }

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

    console.log("✅ JWT generated.");

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
      { status: 200, headers: corsHeaders }
    );

  } catch (err) {
    console.error("❌ Error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message ?? "Internal server error." }),
      { status: 500, headers: corsHeaders }
    );
  }
});
