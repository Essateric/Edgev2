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

    // ✅ Env Variables
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    logs.push(`🔑 Env SUPABASE_URL: ${SUPABASE_URL}`);
    logs.push(`🔑 Env SERVICE_ROLE_KEY: ✅ Loaded`);

    // ✅ Parse body
    const { pin } = await req.json();
    logs.push(`🔢 PIN received: ${pin}`);

    // ✅ Init Supabase client
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    logs.push("🗄️ Supabase client initialized.");

    // ✅ Fetch staff table
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

    // ✅ Find staff with matching PIN
    const matchedStaff = staffData.find(
      (staff) =>
        staff.pin_hash &&
        bcrypt.compareSync(pin.toString(), staff.pin_hash)
    );

    if (!matchedStaff) {
      logs.push("❌ Invalid PIN");
      return new Response(
        JSON.stringify({ error: "Invalid PIN", logs }),
        { status: 401, headers: corsHeaders }
      );
    }

    logs.push(`✅ PIN matched for ${matchedStaff.name} (${matchedStaff.email})`);

    // ✅ Get Auth user
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

    // ✅ Create a real Supabase Auth session for this user
    const { data: sessionData, error: sessionError } =
      await supabase.auth.admin.createSession({
        user_id: authUser.id,
      });

    if (sessionError || !sessionData) {
      logs.push(`❌ Error creating session: ${sessionError?.message}`);
      return new Response(
        JSON.stringify({ error: "Error creating session", logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    logs.push(`✅ Supabase Auth session created.`);

    return new Response(
      JSON.stringify({
        token: sessionData.access_token,
        refresh_token: sessionData.refresh_token,
        user: {
          id: authUser.id,
          email: matchedStaff.email,
          name: name,
          permission: permission,
        },
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
