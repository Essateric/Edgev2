import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, Authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "*",
  "Content-Type": "application/json",
};

serve(async (req) => {
  // --- ✅ CORS Preflight ---
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  // --- ✅ Load environment variables ---
  const supabaseUrl = Deno.env.get("PROJECT_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
  const functionSecret = Deno.env.get("FUNCTION_SECRET");

  if (!supabaseUrl || !serviceRoleKey || !functionSecret) {
    return new Response(
      JSON.stringify({
        error: "Missing environment variables (SUPABASE_URL, SERVICE_ROLE_KEY, FUNCTION_SECRET)",
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }

  // --- ✅ Authorization Check ---
  const authHeader = req.headers.get("Authorization") || "";

  if (authHeader !== `Bearer ${functionSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  // --- ✅ Create Supabase Admin Client ---
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { email } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Missing email" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // --- ✅ Send magic link ---
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: "https://theedge.essateric.com/",
      },
    });

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message || "Magic link error" }),
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    return new Response(
      JSON.stringify({
        message: "Magic link sent!",
        action_link: data.properties?.action_link ?? null,
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
 } catch (err) {
  const errorMessage = err instanceof Error ? err.message : "Unexpected error";
  return new Response(
    JSON.stringify({ error: errorMessage }),
    { status: 500, headers: corsHeaders }
  );
}

});
