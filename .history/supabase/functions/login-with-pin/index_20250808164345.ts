import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.3";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";

console.log("🚀 Login-with-PIN Function Loaded");

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
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      logs.push("❌ Missing SUPABASE_URL or SERVICE_ROLE_KEY");
      return new Response(JSON.stringify({ error: "Server misconfigured", logs }), {
        status: 500,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      });
    }
    logs.push(`🔑 Env SUPABASE_URL: ${SUPABASE_URL}`);
    logs.push("🔑 Env SERVICE_ROLE_KEY: ✅ Loaded");

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
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    logs.push("🗄️ Supabase client initialized");

    // ✅ Load staff
    const { data: staffData, error: staffError } = await supabase
      .from("staff")
      .select("*");
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
    const { data: userList, error: authError } =
      await supabase.auth.admin.listUsers();
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
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
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

    // ✅ Generate login token (no email is sent)
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: matchedStaff.email!,
      options: {
        // Must be in Auth → URL Configuration → Redirect URLs (ok if unused in programmatic flow)
        redirectTo: "https://theedge.essateric.com/auth/callback",
      },
    });

    if (linkErr) {
      logs.push(`❌ generateLink error: ${linkErr.message}`);
      return new Response(
        JSON.stringify({ error: "Failed to generate login token", logs }),
        {
          status: 500,
          headers: { ...corsHeaders, "Cache-Control": "no-store" },
        }
      );
    }

    // We return both forms. Client will use whichever is present.
    const token_hash = linkData?.properties?.hashed_token ?? null; // for verifyOtp type:"magiclink" (no email param)
    const email_otp = linkData?.properties?.email_otp ?? null; // for verifyOtp type:"email" (needs email+token)

    if (!token_hash && !email_otp) {
      logs.push("❌ generateLink returned neither token_hash nor email_otp");
      return new Response(JSON.stringify({ error: "Login token not generated", logs }), {
        status: 500,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      });
    }

    logs.push(
      `✅ Token generated (${token_hash ? "token_hash" : ""}${
        token_hash && email_otp ? " + " : ""
      }${email_otp ? "email_otp" : ""})`
    );

    // ✅ Return details for frontend verifyOtp
    return new Response(
      JSON.stringify({
        email: matchedStaff.email,
        staff_id: matchedStaff.id,     // small extra: handy on client
        name,
        permission,
        token_hash,
        email_otp,
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
