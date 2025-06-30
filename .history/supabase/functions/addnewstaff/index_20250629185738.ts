import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
  const FUNCTION_SECRET = Deno.env.get("FUNCTION_SECRET")!;

  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${FUNCTION_SECRET}`) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: corsHeaders }
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const { name, email, pin, permission } = await req.json();

    if (!name || !email || !pin || !permission) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const pinHash = await bcrypt.hash(pin);

    const { data: userData, error: userError } =
      await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
      });

    if (userError) {
      return new Response(
        JSON.stringify({ error: "Failed to create auth user", details: userError.message }),
        { status: 400, headers: corsHeaders }
      );
    }

    const userId = userData.user.id;

    const { error: staffError } = await supabase.from("staff").insert({
      id: userId,
      name,
      email,
      pin_hash: pinHash,
      permission,
    });

    if (staffError) {
      return new Response(
        JSON.stringify({ error: "Failed to insert staff", details: staffError.message }),
        { status: 500, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ success: true, userId }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Unknown error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
