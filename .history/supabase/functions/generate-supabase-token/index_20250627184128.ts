import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "*",
  "Content-Type": "application/json",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get("Authorization") ?? "";
  const secret = Deno.env.get("FUNCTION_SECRET");
  if (authHeader !== `Bearer ${secret}`) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: corsHeaders }
    );
  }

  // Load Supabase secrets
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");

  console.log("SUPABASE_URL:", supabaseUrl ?? "NOT FOUND");
  console.log("SERVICE_ROLE_KEY:", serviceRoleKey ? "FOUND" : "NOT FOUND");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "SUPABASE_URL or SERVICE_ROLE_KEY missing!" }),
      { status: 500, headers: corsHeaders }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { staff_id } = await req.json();

    if (!staff_id) {
      return new Response(
        JSON.stringify({ error: "Missing staff_id" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Fetch staff email
    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .select("email")
      .eq("id", staff_id)
      .single();

    if (staffError || !staff) {
      return new Response(
        JSON.stringify({ error: "Staff not found" }),
        { status: 404, headers: corsHeaders }
      );
    }

    // Get user from auth
    const { data: user, error: userError } = await supabase.auth.admin.getUserByEmail(staff.email);

    if (userError || !user?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Auth user not found" }),
        { status: 404, headers: corsHeaders }
      );
    }

    // Create a magic link (or token link)
    const { data: tokenResult, error: tokenError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: staff.email,
      options: {
        redirectTo: "https://theedge.essateric.com/set-pin", // 👈 Magic link redirect
      },
    });

    if (tokenError || !tokenResult) {
      return new Response(
        JSON.stringify({ error: "Token generation failed" }),
        { status: 500, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ token: tokenResult.access_token }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("Error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message || "Server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
