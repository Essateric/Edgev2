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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const logs: string[] = [];

  try {
    const projectUrl = Deno.env.get("PROJECT_URL")?.trim();
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY")?.trim();
    const functionSecret = Deno.env.get("FUNCTION_SECRET")?.trim();
    const jwtSecret = Deno.env.get("JWT_SECRET")?.trim();

    logs.push("🔑 Env Vars Loaded");

    if (!projectUrl || !serviceRoleKey || !functionSecret || !jwtSecret) {
      logs.push("❌ Missing environment variables.");
      throw new Error("Missing environment variables.");
    }

    const authHeader = req.headers.get("Authorization")?.trim();
    logs.push(`🔐 Auth Header: ${authHeader}`);

    if (authHeader !== `Bearer ${functionSecret}`) {
      logs.push("❌ Invalid function secret.");
      return new Response(
        JSON.stringify({ error: "Unauthorized", logs }),
        { status: 401, headers: corsHeaders }
      );
    }

    const { pin } = await req.json();
    logs.push(`🔢 Incoming PIN: ${pin}`);

    if (!pin) {
      logs.push("❌ Missing PIN.");
      return new Response(
        JSON.stringify({ error: "Missing PIN", logs }),
        { status: 400, headers: corsHeaders }
      );
    }

    const supabase = createClient(projectUrl, serviceRoleKey);

    const { data: staffList, error: staffError } = await supabase
      .from("staff")
      .select("id, email, name, role, pin_hash");

    if (staffError) {
      logs.push(`❌ Staff fetch error: ${staffError.message}`);
      throw new Error("Failed to fetch staff.");
    }

    logs.push(`📄 Staff List Length: ${staffList.length}`);

    // 🔥 Log and compare
    staffList.forEach((staff) => {
      logs.push(`👤 Staff: ${staff.name}`);
      logs.push(`→ Stored pin_hash: ${staff.pin_hash}`);
      try {
        const result = bcrypt.compareSync(pin, staff.pin_hash);
        logs.push(
          `→ Comparing with ${staff.name}: ${
            result ? "✅ MATCH" : "❌ NO MATCH"
          }`
        );
      } catch (err) {
        logs.push(`❌ Error comparing for ${staff.name}: ${err.message}`);
      }
    });

    const matchedStaff = staffList.find((staff) => {
      try {
        return staff.pin_hash && bcrypt.compareSync(pin, staff.pin_hash);
      } catch {
        return false;
      }
    });

    if (!matchedStaff) {
      logs.push("❌ Invalid PIN attempt.");
      return new Response(
        JSON.stringify({ error: "Invalid PIN", logs }),
        { status: 401, headers: corsHeaders }
      );
    }

    logs.push(
      `✅ PIN matched for: ${matchedStaff.name} (${matchedStaff.email})`
    );

    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();

    if (userError) {
      logs.push(`❌ Auth user fetch error: ${userError.message}`);
      throw new Error("Failed to fetch auth users.");
    }

    const authUser = users.find((u) => u.email === matchedStaff.email);
    logs.push(`👤 Found Auth User: ${authUser?.email}`);

    if (!authUser) {
      logs.push(`❌ Auth user not found for ${matchedStaff.email}`);
      throw new Error("Auth user not found.");
    }

    const jwt = await create(
      { alg: "HS256", typ: "JWT" },
      {
        sub: authUser.id,
        email: matchedStaff.email,
        role: matchedStaff.role,
        exp: getNumericDate(60 * 60),
      },
      jwtSecret
    );

    logs.push(`🎟️ JWT Token generated successfully.`);

    return new Response(
      JSON.stringify({
        token: jwt,
        user: {
          id: authUser.id,
          email: matchedStaff.email,
          name: matchedStaff.name,
          role: matchedStaff.role,
        },
        logs,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    logs.push(`❌ Error caught: ${err.message}`);
    return new Response(
      JSON.stringify({
        error: err.message ?? "Internal Server Error",
        logs,
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
