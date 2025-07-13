import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.3";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";

// JWT secret from env (set this in your Edge Function env)
const JWT_SECRET = Deno.env.get("JWT_SECRET");

async function getCryptoKey(secret) {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const logs = [];

  // JWT check: require Authorization header
  const authHeader = req.headers.get("authorization")?.replace("Bearer ", "").trim();
  if (!authHeader) {
    logs.push("Missing Authorization header.");
    return new Response(
      JSON.stringify({ error: "Unauthorized", logs }),
      { status: 401, headers: corsHeaders }
    );
  }

  // Verify JWT
  try {
    const key = await getCryptoKey(JWT_SECRET);
    await verify(authHeader, key, "HS256");
    logs.push("JWT verified (user is authenticated).");
  } catch (err) {
    logs.push(`Invalid JWT: ${err.message}`);
    return new Response(
      JSON.stringify({ error: "Unauthorized", logs }),
      { status: 401, headers: corsHeaders }
    );
  }

  const { id } = await req.json();
  const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
  const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

  try {
    if (!id) {
      return new Response(
        JSON.stringify({ error: "Missing staff ID", logs }),
        { status: 400, headers: corsHeaders }
      );
    }

    // ✅ Delete from auth
    const { error: authError } = await supabase.auth.admin.deleteUser(id);
    if (authError) {
      logs.push(`Auth delete failed: ${authError.message}`);
      return new Response(
        JSON.stringify({ error: authError.message, logs }),
        { status: 400, headers: corsHeaders }
      );
    }
    logs.push("Deleted from auth");

    // ✅ Delete from staff table
    const { error: dbError } = await supabase.from("staff").delete().eq("id", id);
    if (dbError) {
      logs.push(`DB delete failed: ${dbError.message}`);
      return new Response(
        JSON.stringify({ error: dbError.message, logs }),
        { status: 400, headers: corsHeaders }
      );
    }
    logs.push("Deleted from staff table");

    return new Response(
      JSON.stringify({ success: true, logs }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    logs.push(`Unexpected error: ${error}`);
    return new Response(
      JSON.stringify({ error: String(error), logs }),
      { status: 500, headers: corsHeaders }
    );
  }
});
