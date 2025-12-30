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
    if (req.method === "OPTIONS") return new Response("OK", { headers: corsHeaders });
    logs.push("🚀 Request received");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    // Prefer the standard name if you can: SUPABASE_SERVICE_ROLE_KEY
    const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const PIN_PEPPER = Deno.env.get("PIN_PEPPER")!;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY || !PIN_PEPPER) {
      logs.push("❌ Missing env vars");
      return new Response(JSON.stringify({ error: "Server misconfigured", logs }), {
        status: 500,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const pin = String(body?.pin ?? "").trim();

    // IMPORTANT: enforce 4 digits only
    if (!/^\d{4}$/.test(pin)) {
      logs.push("❌ PIN invalid format (must be 4 digits)");
      return new Response(JSON.stringify({ error: "PIN must be 4 digits", logs }), {
        status: 400,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      });
    }

    // Admin client (service role)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // Load staff
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

    const matchedStaff = staffData.find((s) => s.pin_hash && bcrypt.compareSync(pin, s.pin_hash));
    if (!matchedStaff) {
      logs.push("❌ Invalid PIN");
      return new Response(JSON.stringify({ error: "Invalid PIN", logs }), {
        status: 401,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      });
    }

    if (!matchedStaff.email) {
      logs.push("❌ Matched staff has no email");
      return new Response(JSON.stringify({ error: "Staff email missing", logs }), {
        status: 500,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      });
    }

    // Normalise email (this avoids weird edge cases)
    const email = String(matchedStaff.email).trim().toLowerCase();
    logs.push(`✅ PIN matched for staff_id=${matchedStaff.id} email=${email}`);

    const derivedPassword = await derivePassword(PIN_PEPPER, email, String(matchedStaff.id), pin);

    // Find or create auth user (avoid listUsers if possible, but keep it simple here)
    const { data: userList, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (authError || !userList) {
      logs.push(`❌ Error fetching auth users: ${authError?.message}`);
      return new Response(JSON.stringify({ error: "Error fetching auth users", logs }), {
        status: 500,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      });
    }

    let authUser = userList.users.find((u) => (u.email || "").toLowerCase() === email);

    if (!authUser) {
      logs.push("ℹ️ Auth user not found — creating with password…");

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: derivedPassword,      // ✅ set password at creation time
        email_confirm: true,            // ✅ confirm immediately
        user_metadata: {
          staff_id: matchedStaff.id,
          name: matchedStaff.name ?? email,
          permission: matchedStaff.permission ?? "Staff",
        },
      });

      if (createErr || !created?.user) {
        logs.push(`❌ createUser error: ${createErr?.message}`);
        return new Response(JSON.stringify({ error: "Failed to create auth user", logs }), {
          status: 500,
          headers: { ...corsHeaders, "Cache-Control": "no-store" },
        });
      }

      authUser = created.user;
      logs.push(`✅ Created auth user: ${authUser.email}`);
    } else {
      logs.push(`👤 Found auth user: ${authUser.email}`);

      // ✅ update password and also confirm email again (helps if they were unconfirmed)
      const { error: updErr } = await admin.auth.admin.updateUserById(authUser.id, {
        password: derivedPassword,
        // Supabase supports this in many setups; if your version rejects it, remove this line.
        email_confirm: true as unknown as boolean,
        user_metadata: {
          staff_id: matchedStaff.id,
          name: matchedStaff.name ?? email,
          permission: matchedStaff.permission ?? "Staff",
        },
      });

      if (updErr) {
        logs.push(`❌ updateUserById error: ${updErr.message}`);
        return new Response(JSON.stringify({ error: "Failed to set password", logs }), {
          status: 500,
          headers: { ...corsHeaders, "Cache-Control": "no-store" },
        });
      }
      logs.push("🔐 Password updated");
    }

    // Mint session
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: signInData, error: signInErr } = await anon.auth.signInWithPassword({
      email,
      password: derivedPassword,
    });

    if (signInErr || !signInData?.session) {
      logs.push(`❌ signInWithPassword error: ${signInErr?.message}`);
      return new Response(
        JSON.stringify({
          error: "Auth failed",
          details: signInErr?.message, // ✅ expose real reason while debugging
          logs,
        }),
        { status: 401, headers: { ...corsHeaders, "Cache-Control": "no-store" } },
      );
    }

    logs.push("✅ Session minted");

    const { session } = signInData;

    return new Response(
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
        email,
        staff_id: matchedStaff.id,
        name: matchedStaff.name ?? email,
        permission: matchedStaff.permission ?? "Staff",
        logs,
      }),
      { status: 200, headers: { ...corsHeaders, "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logs.push(`❌ Unexpected error: ${msg}`);
    return new Response(JSON.stringify({ error: msg, logs }), {
      status: 500,
      headers: { ...corsHeaders, "Cache-Control": "no-store" },
    });
  }
});
