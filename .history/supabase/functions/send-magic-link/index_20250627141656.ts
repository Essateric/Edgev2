import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL or SERVICE_ROLE_KEY missing!");
}
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders
    });
  }
  try {
    const { email } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({
        error: "Missing email"
      }), {
        status: 400,
        headers: corsHeaders
      });
    }
    // Send magic link
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: "https://YOUR_APP_URL/after-magic-link"
      }
    });
    if (error) {
      return new Response(JSON.stringify({
        error: error.message
      }), {
        status: 500,
        headers: corsHeaders
      });
    }
    return new Response(JSON.stringify({
      message: "Magic link sent!"
    }), {
      status: 200,
      headers: corsHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err.message || "Server error"
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
});
