// supabase/functions/login-with-pin/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, Authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
  const functionSecret = Deno.env.get("FUNCTION_SECRET");

  if (!supabaseUrl || !serviceRoleKey || !functionSecret) {
    return new Response(JSON.stringify({ error: "Missing environment variables" }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader !== `Bearer ${functionSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const { pin } = await req.json();
  if (!pin) {
    return new Response(JSON.stringify({ error: "Missing PIN" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fetch staff list
  const { data: staffList, error } = await supabase
    .from("staff")
    .select("id, email, name, role, pin_hash");

  if (error || !staffList) {
    return new Response(JSON.stringify({ error: "Could not fetch staff" }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  const matched = staffList.find(
    (staff) => staff.pin_hash && bcrypt.compareSync(pin, staff.pin_hash)
  );

  if (!matched) {
    return new Response(JSON.stringify({ error: "Invalid PIN" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const { data: user } = await supabase.auth.admin.getUserByEmail(matched.email);

  if (!user) {
    return new Response(JSON.stringify({ error: "Auth user not found" }), {
      status: 404,
      headers: corsHeaders,
    });
  }

  const { data: tokenResult, error: tokenError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: matched.email,
    options: { redirectTo: "https://theedge.essateric.com" },
  });

  if (tokenError || !tokenResult) {
    return new Response(JSON.stringify({ error: "Token generation failed" }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  return new Response(JSON.stringify({
    token: tokenResult.access_token,
    user: {
      id: matched.id,
      name: matched.name,
      email: matched.email,
      role: matched.role,
    }
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
});
