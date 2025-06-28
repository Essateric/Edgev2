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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("PROJECT_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
  const functionSecret = Deno.env.get("FUNCTION_SECRET");

  if (!supabaseUrl || !serviceRoleKey || !functionSecret) {
    return new Response(
      JSON.stringify({ error: "Missing environment variables", "URL":supabaseUrl, "role": serviceRoleKey, "secret": functionSecret}),
      { status: 500, headers: corsHeaders }
    );
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader !== `Bearer ${functionSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

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

const { data: { users }, error } = await supabase.auth.admin.listUsers();

const user = users?.find((u) => u.email === staff.email);

  if (error || !user) {
    return new Response(JSON.stringify({ error: "Auth user not found" }), {
      status: 404,
      headers: corsHeaders,
    });
  }

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: staff.email,
    options: { redirectTo: "https://theedge.essateric.com" },
  });

  if (linkError || !linkData) {
    return new Response(JSON.stringify({ error: "Token generation failed" }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  return new Response(JSON.stringify({
    action_link: linkData.properties.action_link,
    user: {
      id: user.id,
      email: user.email,
    }
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
});
