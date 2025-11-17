import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.3";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";

console.log("🚀 Login-with-PIN Function Loaded");



// Helper: derive a strong password from PIN using a server-only secret (pepper)
async function derivePassword(pepper: string, email: string, staffId: string, pin: string) {
  
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = enc.encode(`${email}|${staffId}|${pin}`);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  const logs: string[] = [];

  try {
    // ✅ CORS
    if (req.method === "OPTIONS") {
      return new Response("OK", { headers: corsHeaders });
    }

    logs.push("🚀 Request received");

    // ✅ Env
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;     // ✅ added
    const PIN_PEPPER = Deno.env.get("PIN_PEPPER")!;          // ✅ added
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY || !PIN_PEPPER) {
      logs.push("❌ Missing one or more env vars: SUPABASE_URL / SERVICE_ROLE_KEY / ANON_KEY / PIN_PEPPER");
      return new Response(JSON.stringify({ error: "Server misconfigured", logs }), {
        status: 500,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      });
    }
    logs.push(`🔑 Env SUPABASE_URL: ${SUPABASE_URL}`);
    logs.push("🔑 Env SERVICE_ROLE_KEY: ✅");
    logs.push("🔑 Env ANON_KEY: ✅");
    logs.push("🔑 Env PIN_PEPPER: ✅");

    // ✅ Body & basic validation
    const body = await req.json().catch(() => ({}));
    const rawPin = body?.pin;
    if (rawPin === undefined || rawPin === null || String(rawPin).trim() === "") {
      logs.push("❌ PIN missing in request body");
      return new Response(JSON.stringify({ error: "PIN required", logs }), {
        status: 400,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      });
    }
    const pin = String(rawPin);
    logs.push(`🔢 PIN received: ${pin}`);

    // ✅ Admin client
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    logs.push("🗄️ Supabase admin client initialized");

    // ✅ Load staff (select only what we need)
    const { data: staffData, error: staffError } = await admin
      .from("staff")
      .select("id,name,email,permission,pin_hash");
    if (staffError || !staffData) {
      logs.push(`❌ Failed to fetch staff: ${staffError?.message}`);
      return new Response(JSON.stringify({ error: "Failed to fetch staff", logs }), {
        status: 500,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      });
    }
    logs.push(`📄 Staff fetched: ${staffData.length} members`);

    // ✅ Match by PIN
    const matchedStaff = staffData.find(
      (s) => s.pin_hash && bcrypt.compareSync(pin, s.pin_hash)
    );
    if (!matchedStaff) {
      logs.push("❌ Invalid PIN");
      return new Response(JSON.stringify({ error: "Invalid PIN", logs }), {
        status: 401,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      });
    }
    logs.push(`✅ PIN matched for ${matchedStaff.name} (${matchedStaff.email})`);

    // ✅ Must have an email to map to Supabase Auth
    if (!matchedStaff.email) {
      logs.push("❌ Matched staff has no email");
      return new Response(JSON.stringify({ error: "Staff email missing", logs }), {
        status: 500,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      });
    }

    // ✅ Ensure Auth user exists (auto-create if missing)
    const { data: userList, error: authError } = await admin.auth.admin.listUsers();
    if (authError || !userList) {
      logs.push(`❌ Error fetching auth users: ${authError?.message}`);
      return new Response(JSON.stringify({ error: "Error fetching auth users", logs }), {
        status: 500,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      });
    }

    let authUser = userList.users.find(
      (u) => u.email?.toLowerCase() === matchedStaff.email!.toLowerCase()
    );

    if (!authUser) {
      logs.push(`ℹ️ Auth user not found for ${matchedStaff.email} — creating…`);
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: matchedStaff.email!,
        email_confirm: true, // ✅ no email confirmation needed
      });
      if (createErr) {
        logs.push(`❌ createUser error: ${createErr.message}`);
        return new Response(JSON.stringify({ error: "Failed to create auth user", logs }), {
          status: 500,
          headers: { ...corsHeaders, "Cache-Control": "no-store" },
        });
      }
      authUser = created.user;
      logs.push(`✅ Created auth user: ${authUser.email} (ID: ${authUser.id})`);
    } else {
      logs.push(`👤 Found auth user: ${authUser.email} (ID: ${authUser.id})`);
    }

    const permission = matchedStaff.permission ?? "Staff";
    const name = matchedStaff.name ?? matchedStaff.email!;
    logs.push(`🔑 Permission: ${permission}`);

    // 🔁 PREVIOUSLY: generate magic link and return token_hash/email_otp
    // ❌ REMOVE THAT. INSTEAD:

    // ✅ 1) Derive a strong password from PIN (deterministic, server-side secret)
    const derivedPassword = await derivePassword(
      PIN_PEPPER,
      matchedStaff.email!,
      String(matchedStaff.id),
      pin,
    );

    // ✅ 2) Set/update password via admin (service role)
    const { error: updErr } = await admin.auth.admin.updateUserById(authUser.id, {
      password: derivedPassword,
    });
    if (updErr) {
      logs.push(`❌ updateUserById error: ${updErr.message}`);
      return new Response(JSON.stringify({ error: "Failed to set password", logs }), {
        status: 500,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      });
    }
    logs.push("🔐 Auth user password updated from PIN-derived secret");

    // ✅ 3) Sign in with anon client to mint a real session (JWTs)
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data: signInData, error: signInErr } = await anon.auth.signInWithPassword({
      email: matchedStaff.email!,
      password: derivedPassword,
    });
    if (signInErr || !signInData?.session) {
      logs.push(`❌ signInWithPassword error: ${signInErr?.message}`);
      return new Response(JSON.stringify({ error: "Auth failed", logs }), {
        status: 401,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      });
    }
    logs.push("✅ Session minted via signInWithPassword");

    const { session } = signInData;

    // ✅ 4) Return flat tokens for the client
    return new Response(
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
        // UI passthrough fields:
        email: matchedStaff.email,
        staff_id: matchedStaff.id,
        name,
        permission,
        logs,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logs.push(`❌ Unexpected error: ${errorMessage}`);
    return new Response(JSON.stringify({ error: errorMessage, logs }), {
      status: 500,
      headers: { ...corsHeaders, "Cache-Control": "no-store" },
    });
  }
});
