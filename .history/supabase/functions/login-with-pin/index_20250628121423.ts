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
  // ✅ Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("🟢 Function start: login-with-pin");

    // ✅ Load environment variables
    const projectUrl = Deno.env.get("PROJECT_URL")?.trim();
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY")?.trim();
    const functionSecret = Deno.env.get("FUNCTION_SECRET")?.trim();
    const jwtSecret = Deno.env.get("JWT_SECRET")?.trim();

    console.log("🔑 Env Vars Loaded:", {
      projectUrl,
      serviceRoleKeyPresent: !!serviceRoleKey,
      functionSecret,
      jwtSecretPresent: !!jwtSecret,
    });

    if (!projectUrl || !serviceRoleKey || !functionSecret || !jwtSecret) {
      throw new Error("Missing environment variables.");
    }

    // ✅ Check Authorization
    const authHeader = req.headers.get("Authorization")?.trim();
    console.log("🔐 Auth Header Received:", authHeader);

    if (authHeader !== `Bearer ${functionSecret}`) {
      console.warn("❌ Invalid function secret provided.");
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid function secret" }),
        { status: 401, headers: corsHeaders }
      );
    }

    // ✅ Parse request body
    const { pin } = await req.json();
    console.log("🔢 Received PIN:", pin);

    if (!pin) {
      throw new Error("Missing PIN in request.");
    }

    // ✅ Initialize Supabase client
    const supabase = createClient(projectUrl, serviceRoleKey);

    // ✅ Fetch staff list
    console.log("📥 Fetching staff list...");
    const { data: staffList, error: staffError } = await supabase
      .from("staff")
      .select("id, email, name, role, pin_hash");

    if (staffError) {
      console.error("❌ Staff fetch error:", staffError.message);
      throw new Error("Failed to fetch staff.");
    }

    console.log("📄 Staff List:", staffList);

    // ✅ Check PIN against hashes
    console.log("🔍 Comparing PIN against staff hashes...");
    const matchedStaff = staffList.find((staff) => {
      if (!staff.pin_hash) {
        console.log(`🚫 No pin_hash for ${staff.name}`);
        return false;
      }
      const match = bcrypt.compareSync(pin, staff.pin_hash);
      console.log(
        `🔗 Comparing PIN with ${staff.name}:`,
        match ? "✅ MATCH" : "❌ NO MATCH"
      );
      return match;
    });

    console.log("🧠 Matched Staff Object:", matchedStaff);

    // ✅ Handle no match
    if (!matchedStaff) {
      console.warn("❌ Invalid PIN attempt.");
      return new Response(
        JSON.stringify({ error: "Invalid PIN." }),
        { status: 401, headers: corsHeaders }
      );
    }

    console.log(`✅ PIN matched for: ${matchedStaff.name} (${matchedStaff.email})`);

    // ✅ Fetch auth users
    console.log("📥 Fetching Supabase Auth users...");
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();

    if (userError) {
      console.error("❌ Auth user fetch error:", userError.message);
      throw new Error("Failed to fetch auth users.");
    }

    const authUser = users.find((u) => u.email === matchedStaff.email);
    console.log("👤 Found Auth User:", authUser);

    if (!authUser) {
      throw new Error(`Auth user not found for ${matchedStaff.email}`);
    }

    // ✅ Generate JWT token
    console.log("🔏 Generating JWT token...");
    const jwt = await create(
      { alg: "HS256", typ: "JWT" },
      {
        sub: authUser.id, // MUST be auth.users.id
        email: matchedStaff.email,
        role: matchedStaff.role,
        exp: getNumericDate(60 * 60), // 1 hour expiry
      },
      jwtSecret
    );

    console.log("🎟️ JWT Token generated successfully.");

    // ✅ Return response
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
    console.error("❌ Error caught in function:", err.message);
    return new Response(
      JSON.stringify({ error: err.message ?? "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
