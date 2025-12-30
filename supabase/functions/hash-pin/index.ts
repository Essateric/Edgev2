import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.3?target=deno";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, Authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Support both your custom names + standard supabase names
    const projectUrl =
      Deno.env.get("PROJECT_URL")?.trim() || Deno.env.get("SUPABASE_URL")?.trim();
    const serviceRoleKey =
      Deno.env.get("SERVICE_ROLE_KEY")?.trim() ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY")?.trim() || Deno.env.get("ANON_KEY")?.trim();

    if (!projectUrl || !serviceRoleKey || !anonKey) {
      return new Response(
        JSON.stringify({ error: "Missing env vars (PROJECT_URL/SUPABASE_URL, SERVICE_ROLE_KEY, SUPABASE_ANON_KEY)" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Normal user JWT from browser
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    const jwt = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!jwt) {
      return new Response(JSON.stringify({ error: "Missing Authorization token" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const body = await req.json().catch(() => ({}));
    const staff_id = String(body?.staff_id || "").trim();
    const pin = String(body?.pin || "").trim();

    if (!staff_id) {
      return new Response(JSON.stringify({ error: "Missing staff_id" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (!/^\d{4}$/.test(pin)) {
      return new Response(JSON.stringify({ error: "PIN must be exactly 4 digits" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // User client to identify caller
    const userClient = createClient(projectUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
    const callerEmail = userData?.user?.email?.toLowerCase().trim();

    if (userErr || !callerEmail) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // Admin client does the update
    const admin = createClient(projectUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // Find caller staff record
    const { data: callerStaff, error: callerErr } = await admin
      .from("staff")
      .select("id, permission")
      .eq("email", callerEmail)
      .maybeSingle();

    if (callerErr || !callerStaff) {
      return new Response(JSON.stringify({ error: "Caller staff record not found" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const callerRole = String(callerStaff.permission || "").trim().toLowerCase();
    const isAdmin = callerRole === "admin";

    // Only admin can change other people's PIN
    if (!isAdmin && String(callerStaff.id) !== staff_id) {
      return new Response(JSON.stringify({ error: "Not allowed" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const hash = bcrypt.hashSync(pin);

    const { error: updErr } = await admin
      .from("staff")
      .update({ pin_hash: hash })
      .eq("id", staff_id);

    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
