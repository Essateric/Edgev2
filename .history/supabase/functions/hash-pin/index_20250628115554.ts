import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

// ✅ CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, Authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

serve(async (req) => {
  // ✅ Handle preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ✅ Load environment variables
    const projectUrl = Deno.env.get("PROJECT_URL")?.trim();
    const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY")?.trim();
    const functionSecret = Deno.env.get("FUNCTION_SECRET")?.trim();

    if (!projectUrl || !serviceRoleKey || !functionSecret) {
      throw new Error("Missing environment variables");
    }

    // ✅ Authorization check
    const authHeader = req.headers.get("Authorization")?.trim();
    if (authHeader !== `Bearer ${functionSecret}`) {
      throw new Error("Unauthorized - Invalid function secret");
    }

    const { staff_id, pin } = await req.json();
    if (!staff_id || !pin) {
      throw new Error("Missing staff_id or pin");
    }

    const supabase = createClient(projectUrl, serviceRoleKey);

    const hash = await bcrypt.hash(pin);

    const { error } = await supabase
      .from("staff")
      .update({ pin_hash: hash })
      .eq("id", staff_id);

    if (error) {
      throw new Error(`Failed to update pin_hash: ${error.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: "PIN set successfully" }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("❌ Error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message ?? "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
