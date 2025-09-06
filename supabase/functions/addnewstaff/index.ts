// supabase/functions/addnewstaff/index.ts
import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.3";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

async function getCryptoKey(secret: string) {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function looksLikeEmailExists(err: any) {
  const msg = (err?.message || "").toString().toLowerCase();
  const code = (err?.code || "").toString().toLowerCase();
  const status = Number(err?.status || 0);
  return (
    status === 422 ||
    code === "email_exists" ||
    msg.includes("email_exists") ||
    msg.includes("already") ||
    msg.includes("exists") ||
    msg.includes("registered")
  );
}

serve(async (req) => {
  const logs: string[] = [];
  try {
    if (req.method === "OPTIONS") return new Response("OK", { headers: corsHeaders });
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: corsHeaders,
      });
    }

    // ENV
    const PROJECT_URL = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const JWT_SECRET = Deno.env.get("JWT_SECRET") || Deno.env.get("SUPABASE_JWT_SECRET");
    logs.push(`🔧 PROJECT_URL=${PROJECT_URL ? "ok" : "MISSING"} SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY ? "ok" : "MISSING"} JWT_SECRET=${JWT_SECRET ? "ok" : "MISSING"}`);
    if (!PROJECT_URL || !SERVICE_ROLE_KEY || !JWT_SECRET) {
      return new Response(JSON.stringify({ error: "Server not configured", logs }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // Verify caller
    const token = req.headers.get("authorization")?.replace(/Bearer\s+/i, "").trim();
    if (!token) {
      logs.push("⛔ Missing Authorization header");
      return new Response(JSON.stringify({ error: "Unauthorized - Missing Authorization Header", logs }), {
        status: 401, headers: corsHeaders,
      });
    }
    let payload: any;
    try {
      const key = await getCryptoKey(JWT_SECRET);
      payload = await verify(token, key, "HS256");
      logs.push(`🔐 JWT ok sub=${payload?.sub ?? "?"}`);
    } catch (e) {
      logs.push(`⛔ Invalid JWT: ${e && (e as any).message ? (e as any).message : String(e)}`);
      return new Response(JSON.stringify({ error: "Unauthorized - Invalid JWT", logs }), {
        status: 401, headers: corsHeaders,
      });
    }

    // Clients
    const admin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Body
    const body = await req.json().catch(() => null);
    const { name, email, pin, permission, weekly_hours } = body || {};
    logs.push(`📦 payload name=${name} email=${email} permission=${permission}`);
    if (!name || !email || !pin) {
      logs.push("⛔ Missing name/email/pin");
      return new Response(JSON.stringify({ error: "Missing name, email, or pin", logs }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Role check (admin/regional)
    const uid = String(payload.sub);
    const me = await admin.from("staff").select("id, permission").eq("id", uid).maybeSingle();
    logs.push(`🧑‍💼 caller staff row: id=${me.data?.id ?? "null"} perm=${me.data?.permission ?? "null"} err=${me.error?.message ?? "none"}`);
    if (!me.data) {
      return new Response(JSON.stringify({ error: "No staff record found", logs }), {
        status: 403, headers: corsHeaders,
      });
    }
    const role = String(me.data.permission || "").toLowerCase();
    if (!["admin", "regional"].includes(role)) {
      logs.push(`⛔ Forbidden for role=${role}`);
      return new Response(JSON.stringify({ error: "Forbidden - Only admins can add staff", logs }), {
        status: 403, headers: corsHeaders,
      });
    }

    // Hash PIN
    const pin_hash = bcrypt.hashSync(String(pin));
    logs.push("🔑 PIN hashed");

    // -------------------------
    // Ensure an Auth user exists
    // -------------------------
    let authUserId: string | null = null;
    let createdBy: "generateLink" | "existing_list" | "created" | null = null;
    let token_hash: string | undefined;
    let email_otp: string | undefined;

    // 1) Try generateLink FIRST (best path; returns user + token; no email sent)
    try {
      const gl = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { data: { name, permission } },
      });
      if (gl.error) throw gl.error;
      authUserId = gl.data?.user?.id ?? null;
      // Supabase returns token info under .properties in v2
      token_hash = (gl.data as any)?.properties?.hashed_token;
      email_otp  = (gl.data as any)?.properties?.email_otp;
      createdBy  = "generateLink";
      logs.push(`✅ generateLink OK user=${authUserId} token_hash=${token_hash ? "yes" : "no"} email_otp=${email_otp ? "yes" : "no"}`);
    } catch (e: any) {
      logs.push(`⚠️ generateLink failed: ${(e?.message || e)?.toString()}`);

      // 2) Fallback: find existing via listUsers
      let page = 1; const perPage = 1000;
      while (!authUserId) {
        const list = await admin.auth.admin.listUsers({ page, perPage });
        if (list.error) {
          logs.push(`ℹ️ listUsers error page=${page}: ${list.error.message}`);
          break;
        }
        const found = list.data.users.find(
          (u: any) => (u.email || "").toLowerCase() === String(email).toLowerCase(),
        );
        if (found) {
          authUserId = found.id;
          createdBy = "existing_list";
          logs.push(`✅ existing user via listUsers: ${authUserId}`);
          break;
        }
        if (list.data.users.length < perPage) break;
        page++;
      }

      // 3) Last resort: create confirmed user
      if (!authUserId) {
        const created = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { name, permission },
        });
        if (created.error) {
          const hint = looksLikeEmailExists(created.error)
            ? "Auth user already exists but could not be retrieved."
            : "Auth user creation failed.";
          logs.push(`❌ createUser: ${created.error.message}`);
          return new Response(
            JSON.stringify({ error: hint, details: created.error.message, logs }),
            { status: 400, headers: corsHeaders },
          );
        }
        authUserId = created.data.user?.id ?? null;
        createdBy = "created";
        logs.push(`✅ created user: ${authUserId}`);
      }
    }

    if (!authUserId) {
      logs.push("⛔ No authUserId after all attempts");
      return new Response(JSON.stringify({ error: "Could not create/find auth user", logs }),
        { status: 500, headers: corsHeaders });
    }

    // -------------------------
    // UPSERT staff row (idempotent)
    // -------------------------
    const up = await admin
      .from("staff")
      .upsert(
        {
          id: authUserId,
          name,
          email,
          permission: permission ?? "junior",
          pin_hash,
          weekly_hours: weekly_hours || {},
        },
        { onConflict: "id" },
      )
      .select()
      .single();

    logs.push(`🗄️ staff upsert status err=${up.error?.message ?? "none"} id=${up.data?.id ?? "null"}`);

    if (up.error) {
      return new Response(
        JSON.stringify({ error: "Failed to insert into staff table", details: up.error.message, logs }),
        { status: 500, headers: corsHeaders },
      );
    }

    // Done
    return new Response(JSON.stringify({
      ok: true,
      createdBy,
      user: { id: authUserId, email, name, permission: permission ?? "junior" },
      staff: up.data,
      token_hash,
      email_otp,
      logs,
    }), { status: 200, headers: corsHeaders });

  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("❌ Unexpected error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: corsHeaders,
    });
  }
});
