// supabase/functions/addnewstaff/index.ts
import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.3";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (req.method !== "POST") return json(405, { success: false, error: "Method Not Allowed" });

    // ENV
    const PROJECT_URL =
      Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY =
      Deno.env.get("SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const JWT_SECRET =
      Deno.env.get("JWT_SECRET") || Deno.env.get("SUPABASE_JWT_SECRET");

    logs.push(
      `🔧 PROJECT_URL=${PROJECT_URL ? "ok" : "MISSING"} SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY ? "ok" : "MISSING"} JWT_SECRET=${JWT_SECRET ? "ok" : "MISSING"}`,
    );

    if (!PROJECT_URL || !SERVICE_ROLE_KEY || !JWT_SECRET) {
      return json(500, { success: false, error: "Server not configured", logs });
    }

    // Verify caller token
    const token = req.headers
      .get("authorization")
      ?.replace(/Bearer\s+/i, "")
      .trim();

    if (!token) {
      logs.push("⛔ Missing Authorization header");
      return json(401, {
        success: false,
        error: "Unauthorized - Missing Authorization Header",
        logs,
      });
    }

    let payload: any;
    try {
      const key = await getCryptoKey(JWT_SECRET);
      payload = await verify(token, key, "HS256");
      logs.push(`🔐 JWT ok sub=${payload?.sub ?? "?"}`);
    } catch (e: any) {
      logs.push(`⛔ Invalid JWT: ${e?.message ?? String(e)}`);
      return json(401, { success: false, error: "Unauthorized - Invalid JWT", logs });
    }

    const admin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Body
    const body = await req.json().catch(() => null);
    const { name, email, pin, permission, weekly_hours } = body || {};
    logs.push(`📦 payload name=${name} email=${email} permission=${permission}`);

    const cleanName = String(name || "").trim();
    const cleanEmail = String(email || "").trim();
    const cleanPin = String(pin || "").trim();
    const cleanPermission = String(permission ?? "junior").trim();

    if (!cleanName || !cleanEmail || !cleanPin) {
      logs.push("⛔ Missing name/email/pin");
      return json(400, { success: false, error: "Missing name, email, or pin", logs });
    }
    if (!/^\d{4}$/.test(cleanPin)) {
      logs.push("⛔ PIN must be 4 digits");
      return json(400, { success: false, error: "PIN must be exactly 4 digits", logs });
    }

    // Role check (admin/senior stylist)
    const uid = String(payload.sub);
    const me = await admin
      .from("staff")
      .select("id, permission")
      .eq("id", uid)
      .maybeSingle();

    logs.push(
      `🧑‍💼 caller staff row: id=${me.data?.id ?? "null"} perm=${me.data?.permission ?? "null"} err=${me.error?.message ?? "none"}`,
    );

    if (!me.data) {
      return json(403, { success: false, error: "No staff record found", logs });
    }

    const role = String(me.data.permission || "").trim().toLowerCase();
    if (!["admin", "senior stylist"].includes(role)) {
      logs.push(`⛔ Forbidden for role=${role}`);
      return json(403, {
        success: false,
        error: "Forbidden - Only admins or senior stylists can add staff",
        logs,
      });
    }

    // Hash PIN
    const pin_hash = bcrypt.hashSync(cleanPin);
    logs.push("🔑 PIN hashed");

    // Ensure auth user exists
    let authUserId: string | null = null;
    let createdBy: "generateLink" | "existing_list" | "created" | null = null;
    let token_hash: string | undefined;
    let email_otp: string | undefined;

    try {
      const gl = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: cleanEmail,
        options: { data: { name: cleanName, permission: cleanPermission } },
      });
      if (gl.error) throw gl.error;

      authUserId = gl.data?.user?.id ?? null;
      token_hash = (gl.data as any)?.properties?.hashed_token;
      email_otp = (gl.data as any)?.properties?.email_otp;
      createdBy = "generateLink";
      logs.push(
        `✅ generateLink OK user=${authUserId} token_hash=${token_hash ? "yes" : "no"} email_otp=${email_otp ? "yes" : "no"}`,
      );
    } catch (e: any) {
      logs.push(`⚠️ generateLink failed: ${String(e?.message ?? e)}`);

      // fallback: listUsers
      let page = 1;
      const perPage = 1000;
      while (!authUserId) {
        const list = await admin.auth.admin.listUsers({ page, perPage });
        if (list.error) {
          logs.push(`ℹ️ listUsers error page=${page}: ${list.error.message}`);
          break;
        }
        const found = list.data.users.find(
          (u: any) =>
            (u.email || "").toLowerCase() === cleanEmail.toLowerCase(),
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

      // last resort: createUser
      if (!authUserId) {
        const created = await admin.auth.admin.createUser({
          email: cleanEmail,
          email_confirm: true,
          user_metadata: { name: cleanName, permission: cleanPermission },
        });

        if (created.error) {
          const hint = looksLikeEmailExists(created.error)
            ? "Auth user already exists but could not be retrieved."
            : "Auth user creation failed.";
          logs.push(`❌ createUser: ${created.error.message}`);
          return json(400, {
            success: false,
            error: hint,
            details: created.error.message,
            logs,
          });
        }

        authUserId = created.data.user?.id ?? null;
        createdBy = "created";
        logs.push(`✅ created user: ${authUserId}`);
      }
    }

    if (!authUserId) {
      logs.push("⛔ No authUserId after all attempts");
      return json(500, { success: false, error: "Could not create/find auth user", logs });
    }

    // Upsert staff row
    const up = await admin
      .from("staff")
      .upsert(
        {
          id: authUserId,
          name: cleanName,
          email: cleanEmail,
          permission: cleanPermission,
          pin_hash,
          weekly_hours: weekly_hours ?? {},
        },
        { onConflict: "id" },
      )
      .select()
      .single();

    logs.push(`🗄️ staff upsert err=${up.error?.message ?? "none"} id=${up.data?.id ?? "null"}`);

    if (up.error) {
      return json(500, {
        success: false,
        error: "Failed to insert into staff table",
        details: up.error.message,
        logs,
      });
    }

    return json(200, {
      success: true,
      createdBy,
      user: { id: authUserId, email: cleanEmail, name: cleanName, permission: cleanPermission },
      staff: up.data,
      token_hash,
      email_otp,
      logs,
    });
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    logs.push(`❌ Unexpected error: ${msg}`);
    console.error("❌ Unexpected error:", msg);
    return json(500, { success: false, error: msg, logs });
  }
});
