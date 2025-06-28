import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create, getNumericDate, Header, Payload } from "https://deno.land/x/djwt@v2.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const projectUrl = Deno.env.get("PROJECT_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
  const functionSecret = Deno.env.get("FUNCTION_SECRET");
  const jwtSecret = Deno.env.get("JWT_SECRET");

  if (!projectUrl || !serviceRoleKey || !functionSecret || !jwtSecret) {
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

  const supabase = createClient(projectUrl, serviceRoleKey);

  const { data: staffList, error } = await supabase
    .from("staff")
    .select("id, email, name, role, pin_hash");

  if (error || !staffList) {
    return new Response(JSON.stringify({ error: "Failed to fetch staff" }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  const matchedStaff = staffList.find(
    (staff) => staff.pin_hash && bcrypt.compareSync(pin, staff.pin_hash)
  );

  if (!matchedStaff) {
    return new Response(JSON.stringify({ error: "Invalid PIN" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const header: Header = { alg: "HS256", typ: "JWT" };
  const payload: Payload = {
    sub: matchedStaff.id,
    email: matchedStaff.email,
    role: matchedStaff.role,
    exp: getNumericDate(60 * 60), // 1 hour
  };

  const token = await create(header, payload, jwtSecret);

  return new Response(
    JSON.stringify({
      token,
      user: {
        id: matchedStaff.id,
        email: matchedStaff.email,
        name: matchedStaff.name,
        role: matchedStaff.role,
      },
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
