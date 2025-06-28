import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, Authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("🟢 Function start: login-with-pin");

    const projectUrl = Deno.env.get("PROJECT_URL")?.trim();
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY")?.trim();
    const functionSecret = Deno.env.get("FUNCTION_SECRET")?.trim();
    const jwtSecret = Deno.env.get("JWT_SECRET")?.trim();

    console.log("🔑 Env Vars:", {
      projectUrl,
      serviceRoleKeyPresent: !!serviceRoleKey,
      functionSecret,
      jwtSecretPresent: !!jwtSecret,
    });

    if (!projectUrl || !serviceRoleKey || !functionSecret || !jwtSecret) {
      throw new Error("Missing environment variables.");
    }

    const authHeader = req.headers.get("Authorization")?.trim();
    console.log("🔐 Auth Header:", authHeader);

    if (authHeader !== `Bearer ${functionSecret}`) {
      throw new Error("Unauthorized - Invalid function secret.");
    }

    const { pin } = await req.json();
    console.log("🔢 Received PIN:", pin);

    if (!pin) {
      throw new Error("Missing PIN.");
    }

    const supabase = createClient(projectUrl, serviceRoleKey);

    console.log("📥 Fetching staff list from Supabase...");
    const { data: staffList, error: staffError } = await supabase
      .from("staff")
      .select("id, email, name, role, pin_hash");

    if (staffError) {
      console.error("❌ Staff fetch error:", staffError.message);
      throw new Error("Failed to fetch staff.");
    }

    console.log("📄 Staff List:", staffList);

    console.log("🔍 Checking PIN against staff hashes...");
    const matchedStaff = staffList.find((staff) => {
      if (!staff.pin_hash) {
        console.log(`🚫 No pin_hash for ${staff.name}`);
        return false;
      }
      const compare = bcrypt.compareSync(pin, staff.pin_hash);
      console.log(
        `🔗 Comparing PIN with ${staff.name}:`,
        compare ? "✅ MATCH" : "❌ NO MATCH"
      );
      return compare;
    });

    console.log("🧠 Matched Staff Object:", matchedStaff);
    console.log("🧠 Matched Staff Name:", matchedStaff?.name);

    if (!matchedStaff) {
      console.warn("❌ Invalid PIN attempt.");
      return new Response(
        JSON.stringify({ error: "Invalid PIN." }),
        { status: 401, headers: corsHeaders }
      );
    }

    console.log(`✅ PIN matched for: ${matchedStaff.name} (${matchedStaff.email})`);

    console.log("📥 Fetching auth users...");
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

    console.log("🔏 Generating JWT token...");
    const jwt = await create(
      { alg: "HS256", typ: "JWT" },
      {
        sub: authUser.id,
        email: matchedStaff.email,
        role: matchedStaff.role,
        exp: getNumericDate(60 * 60), // 1 hour expiry
      },
      jwtSecret
    );

    console.log("🎟️ JWT Token generated.");

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
    console.error("❌ Error caught:", err.message);
    return new Response(
      JSON.stringify({ error: err.message ?? "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
