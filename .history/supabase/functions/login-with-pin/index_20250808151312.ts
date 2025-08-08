import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.3";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";

console.log("🚀 Login-with-PIN Function Loaded");

serve(async (req) => {
  const logs: string[] = [];

  try {
    // ✅ Handle CORS
    if (req.method === "OPTIONS") {
      return new Response("OK", { headers: corsHeaders });
    }

    logs.push("🚀 Request received");

    // ✅ Env Variables (JWT secret no longer needed)
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      logs.push("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return new Response(
        JSON.stringify({ error: "Server misconfigured", logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    logs.push(`🔑 Env SUPABASE_URL: ${SUPABASE_URL}`);
    logs.push(`🔑 Env SERVICE_ROLE_KEY: ✅ Loaded`);

    // ✅ Parse body
    const { pin } = await req.json();
    logs.push(`🔢 PIN received: ${pin}`);

    // ✅ Init Supabase client
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    logs.push("🗄️ Supabase client initialized.");

    // ✅ Fetch staff table (keep original behavior)
    const { data: staffData, error: staffError } = await supabase
      .from("staff")
      .select("*");

    if (staffError || !staffData) {
      logs.push(`❌ Failed to fetch staff: ${staffError?.message}`);
      return new Response(
        JSON.stringify({ error: "Failed to fetch staff", logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    logs.push(`📄 Staff fetched: ${staffData.length} members`);

    // ✅ Find staff with matching PIN (keep original bcrypt check)
    const matchedStaff = staffData.find(
      (staff) => staff.pin_hash && bcrypt.compareSync(String(pin), staff.pin_hash)
    );

    if (!matchedStaff) {
      logs.push("❌ Invalid PIN");
      return new Response(
        JSON.stringify({ error: "Invalid PIN", logs }),
        { status: 401, headers: corsHeaders }
      );
    }

    logs.push(`✅ PIN matched for ${matchedStaff.name} (${matchedStaff.email})`);

    // ✅ Get Auth user (keep your original admin list check)
    const { data: userList, error: authError } =
      await supabase.auth.admin.listUsers();

    if (authError || !userList) {
      logs.push(`❌ Error fetching auth users: ${authError?.message}`);
      return new Response(
        JSON.stringify({ error: "Error fetching auth users", logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    const authUser = userList.users.find(
      (u) => u.email?.toLowerCase() === matchedStaff.email?.toLowerCase()
    );

    if (!authUser) {
      logs.push(`❌ No auth user found for ${matchedStaff.email}`);
      return new Response(
        JSON.stringify({ error: "Auth user not found", logs }),
        { status: 404, headers: corsHeaders }
      );
    }

    logs.push(`👤 Found auth user: ${authUser.email} (ID: ${authUser.id})`);

    const permission = matchedStaff.permission ?? "Staff";
    const name = matchedStaff.name ?? matchedStaff.email;
    logs.push(`🔑 Permission: ${permission}`);

    // ✅ Instead of minting your own JWT, generate a Supabase OTP (magic link)
    //    and return its token_hash so the client can verify and get a REAL session.
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: matchedStaff.email,
      options: {
        // Not used in programmatic verification, but must be a valid URL
        redirectTo: "https://your-app.example.com/auth/callback",
      },
    });

    if (linkErr) {
      logs.push(`❌ generateLink error: ${linkErr.message}`);
      return new Response(
        JSON.stringify({ error: "Failed to generate login link", logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Supabase returns hashed_token in properties; client will pass it as token_hash to verifyOtp
    const token_hash = linkData?.properties?.hashed_token;
    if (!token_hash) {
      logs.push("❌ No token_hash returned from generateLink");
      return new Response(
        JSON.stringify({ error: "Login token not generated", logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    logs.push("✅ OTP (magic link) token_hash generated");

    // ✅ Return what the client needs to create a real Supabase session
    return new Response(
      JSON.stringify({
        email: matchedStaff.email,
        name,
        permission,
        token_hash, // client must call supabase.auth.verifyOtp({ type: 'magiclink', token_hash, email })
        logs,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logs.push(`❌ Unexpected error: ${errorMessage}`);
    return new Response(
      JSON.stringify({ error: errorMessage, logs }),
      { status: 500, headers: corsHeaders }
    );
  }
});
