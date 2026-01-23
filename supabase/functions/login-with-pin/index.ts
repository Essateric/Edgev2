// supabase/functions/login-with-pin/index.ts
import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.3";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";

console.log("🚀 Login-with-PIN Function Loaded");

const MAX_PIN_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 30;
const ALERT_EMAIL = "edge.hd@gmail.com";

type StaffRecord = {
  id: string;
  name?: string | null;
  email?: string | null;
  permission?: string | null;
  pin_hash?: string | null;
  is_active?: boolean | null;
};

// Helper: derive a strong password from PIN using a server-only secret (pepper)
async function derivePassword(
  pepper: string,
  email: string,
  staffId: string,
  pin: string,
) {
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

  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function logPinAudit(
  admin: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  logs: string[],
) {
  const { error } = await admin.from("audit_events").insert([payload]);
  if (error) logs.push(`⚠️ audit insert failed: ${error.message}`);
}

async function sendPinAlertEmail(payload: {
  email: string;
  subject: string;
  html: string;
  fromName?: string;
}) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) return { error: "Missing RESEND_API_KEY" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: `${payload.fromName ?? "Edge HD"} <no-reply@edgehd.app>`,
      to: payload.email,
      subject: payload.subject,
      html: payload.html,
    }),
  });

  if (!res.ok) {
    const msg = await res.text();
    return { error: msg || "Email send failed" };
  }

  return { ok: true };
}

serve(async (req) => {
  const logs: string[] = [];

  try {
    if (req.method === "OPTIONS") return new Response("OK", { headers: corsHeaders });
    logs.push("🚀 Request received");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    // Prefer the standard name if you can: SUPABASE_SERVICE_ROLE_KEY
    const SERVICE_ROLE_KEY =
      Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const PIN_PEPPER = Deno.env.get("PIN_PEPPER")!;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY || !PIN_PEPPER) {
      logs.push("❌ Missing env vars");
      return new Response(JSON.stringify({ error: "Server misconfigured", logs }), {
        status: 500,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const pin = String((body as any)?.pin ?? "").trim();

    const clientId = String((body as any)?.client_id ?? "").trim() || "unknown";
    const requestIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

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

    // Lockout lookup
    const { data: lockoutRow, error: lockoutErr } = await admin
      .from("pin_login_lockouts")
      .select("locked_until, attempts")
      .eq("client_id", clientId)
      .maybeSingle();

    if (lockoutErr) logs.push(`⚠️ lockout lookup failed: ${lockoutErr.message}`);

    if (lockoutRow?.locked_until) {
      const lockedUntil = new Date(lockoutRow.locked_until);
      if (Number.isNaN(lockedUntil.getTime())) {
        logs.push("⚠️ invalid locked_until value");
      } else if (lockedUntil.getTime() > Date.now()) {
        const remainingSeconds = Math.max(
          1,
          Math.ceil((lockedUntil.getTime() - Date.now()) / 1000),
        );

        logs.push(`⛔ Lockout active for ${remainingSeconds}s`);

        return new Response(
          JSON.stringify({
            error: "Too many wrong PIN attempts. Please wait before trying again.",
            code: "PIN_LOCKED",
            lockout_seconds: remainingSeconds,
            locked_until: lockedUntil.toISOString(),
            attempts_remaining: 0,
            logs,
          }),
          { status: 429, headers: { ...corsHeaders, "Cache-Control": "no-store" } },
        );
      }
    }

    // Load staff
    const { data: staffData, error: staffError } = await admin
      .from("staff")
      .select("id,name,email,permission,pin_hash,is_active");

    if (staffError || !staffData) {
      logs.push(`❌ Failed to fetch staff: ${staffError?.message}`);
      return new Response(JSON.stringify({ error: "Failed to fetch staff", logs }), {
        status: 500,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      });
    }

    logs.push(`📄 Staff fetched: ${staffData.length} members`);

    // Match PIN
    const matchedStaff = staffData.find((s: StaffRecord) =>
      s.pin_hash && bcrypt.compareSync(pin, s.pin_hash)
    ) as StaffRecord | undefined;

    // If no match -> increment attempts and maybe lock
    if (!matchedStaff) {
      const nextAttempts = (lockoutRow?.attempts ?? 0) + 1;
      const attemptsRemaining = Math.max(0, MAX_PIN_ATTEMPTS - nextAttempts);
      const shouldLock = nextAttempts >= MAX_PIN_ATTEMPTS;
      const lockedUntil = shouldLock
        ? new Date(Date.now() + LOCKOUT_SECONDS * 1000).toISOString()
        : null;

      const { error: upsertErr } = await admin.from("pin_login_lockouts").upsert(
        {
          client_id: clientId,
          attempts: nextAttempts,
          locked_until: lockedUntil,
          last_attempted_at: new Date().toISOString(),
          last_ip: requestIp,
        },
        { onConflict: "client_id" },
      );
      if (upsertErr) logs.push(`⚠️ lockout upsert failed: ${upsertErr.message}`);

      await logPinAudit(
        admin,
        {
          entity_type: "auth",
          action: "pin_login_failed",
          occurred_at: new Date().toISOString(),
          source: "edge_function",
          actor_email: null,
          staff_id: null,
          staff_email: null,
          details: {
            reason: "invalid_pin",
            client_id: clientId,
            ip: requestIp,
            attempts: nextAttempts,
            attempts_remaining: attemptsRemaining,
            locked_until: lockedUntil,
          },
        },
        logs,
      );

      if (shouldLock) {
        const alert = await sendPinAlertEmail({
          email: ALERT_EMAIL,
          subject: "Edge HD: PIN lockout triggered",
          html: `
            <p>Three wrong PIN attempts were detected.</p>
            <ul>
              <li><strong>Client ID:</strong> ${clientId}</li>
              <li><strong>IP:</strong> ${requestIp}</li>
              <li><strong>Locked until:</strong> ${lockedUntil}</li>
            </ul>
          `,
        });
        if ((alert as any)?.error) logs.push(`⚠️ alert email failed: ${(alert as any).error}`);
      }

      return new Response(
        JSON.stringify({
          error: shouldLock
            ? "Too many wrong PIN attempts. Please wait before trying again."
            : "Invalid PIN",
          code: shouldLock ? "PIN_LOCKED" : "PIN_INVALID",
          attempts_remaining: attemptsRemaining,
          lockout_seconds: shouldLock ? LOCKOUT_SECONDS : 0,
          locked_until: lockedUntil,
          logs,
        }),
        {
          status: shouldLock ? 429 : 401,
          headers: { ...corsHeaders, "Cache-Control": "no-store" },
        },
      );
    }

    // Matched but inactive
    if (matchedStaff.is_active === false) {
      logs.push("⛔ Matched staff inactive");
      return new Response(
        JSON.stringify({
          error: "Account inactive. Please contact your admin to log in.",
          code: "STAFF_INACTIVE",
          logs,
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Cache-Control": "no-store" },
        },
      );
    }

    if (!matchedStaff.email) {
      logs.push("❌ Matched staff has no email");
      return new Response(JSON.stringify({ error: "Staff email missing", logs }), {
        status: 500,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      });
    }

    // Normalise email (avoid weird edge cases)
    const email = String(matchedStaff.email).trim().toLowerCase();
    logs.push(`✅ PIN matched for staff_id=${matchedStaff.id} email=${email}`);

    const derivedPassword = await derivePassword(
      PIN_PEPPER,
      email,
      String(matchedStaff.id),
      pin,
    );

    // Clear lockout if any attempts exist
    if (lockoutRow?.attempts) {
      const { error: clearErr } = await admin.from("pin_login_lockouts").upsert(
        {
          client_id: clientId,
          attempts: 0,
          locked_until: null,
          last_attempted_at: new Date().toISOString(),
          last_ip: requestIp,
        },
        { onConflict: "client_id" },
      );
      if (clearErr) logs.push(`⚠️ lockout reset failed: ${clearErr.message}`);
    }

    await logPinAudit(
      admin,
      {
        entity_type: "auth",
        action: "pin_login_success",
        occurred_at: new Date().toISOString(),
        source: "edge_function",
        actor_email: email,
        staff_id: matchedStaff.id,
        staff_email: email,
        details: {
          client_id: clientId,
          ip: requestIp,
        },
      },
      logs,
    );

    // Find or create auth user
    const { data: userList, error: authError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });

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
        password: derivedPassword, // ✅ set password at creation time
        email_confirm: true, // ✅ confirm immediately
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

      const { error: updErr } = await admin.auth.admin.updateUserById(authUser.id, {
        password: derivedPassword,
        // If your setup rejects this property, remove it (keeping as-is to match your logic)
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

    // Mint session (anon client)
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
