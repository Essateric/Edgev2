import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, Authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 🔐 Authorization check
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const functionSecret = Deno.env.get("FUNCTION_SECRET");

  console.log("Auth header received:", authHeader);
  console.log("Expected secret:", functionSecret);

  if (authHeader !== `Bearer ${functionSecret}`) {
    console.log("❌ Unauthorized request.");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: corsHeaders
      }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.log("❌ Missing Supabase URL or Service Role Key");
    return new Response(
      JSON.stringify({ error: "Missing environment variables" }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { staff_id } = await req.json();

    if (!staff_id) {
      return new Response(JSON.stringify({ error: "Missing staff_id" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .select("email")
      .eq("id", staff_id)
      .single();

    if (staffError || !staff) {
      return new Response(JSON.stringify({ error: "Staff not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    const { data: user } = await supabase.auth.admin.getUserByEmail(staff.email);

    if (!user) {
      return new Response(JSON.stringify({ error: "Auth user not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    const { data: tokenResult, error: tokenError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: staff.email,
      options: {
        redirectTo: "https://theedge.essateric.com/",
      },
    });

    if (tokenError || !tokenResult) {
      return new Response(JSON.stringify({ error: "Token generation failed" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ token: tokenResult.access_token }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });

  } catch (err) {
    console.error("❌ Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
