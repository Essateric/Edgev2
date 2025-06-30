import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";

console.log("🚀 Edge Function 'addnewstaff' loaded.");

serve(async (req) => {
  const logs: string[] = [];
  logs.push("🔧 Function invoked.");

  if (req.method === "OPTIONS") {
    logs.push("➡️ OPTIONS preflight request handled.");
    return new Response("OK", { headers: corsHeaders });
  }

  try {
    // ✅ Load env variables
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    const FUNCTION_SECRET = Deno.env.get("FUNCTION_SECRET")?.trim();

    logs.push(`🛠️ SUPABASE_URL: ${SUPABASE_URL}`);
    logs.push(`🛠️ SERVICE_ROLE_KEY loaded: ${!!SERVICE_ROLE_KEY}`);
    logs.push(`🛠️ FUNCTION_SECRET loaded: ${!!FUNCTION_SECRET}`);

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !FUNCTION_SECRET) {
      logs.push("❌ Missing one or more environment variables.");
      return new Response(
        JSON.stringify({ error: "Missing environment variables", logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    // ✅ Check function secret
    const authHeader = req.headers.get("Authorization")?.trim();
    logs.push(`🔐 Authorization header: ${authHeader}`);

    if (authHeader !== `Bearer ${FUNCTION_SECRET}`) {
      logs.push("❌ Invalid FUNCTION_SECRET.");
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid function secret", logs }),
        { status: 401, headers: corsHeaders }
      );
    }

    // ✅ Parse request body
    const { name, email, pin, permission } = await req.json();
    logs.push(`📦 Incoming body → name: ${name}, email: ${email}, permission: ${permission}`);

    if (!name || !pin) {
      logs.push("⚠️ Missing required fields: name and pin.");
      return new Response(
        JSON.stringify({ error: "Missing required fields (name, pin)", logs }),
        { status: 400, headers: corsHeaders }
      );
    }

    // ✅ Initialize Supabase
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    logs.push("🗄️ Supabase client initialized.");

    // ✅ Hash the PIN
    const hashedPin = await bcrypt.hash(pin);
    logs.push(`🔑 PIN hashed: ${hashedPin}`);

    // ✅ Create Auth user
    const { data: userData, error: userError } =
      await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
      });

    logs.push(`👤 Auth user creation attempted for email: ${email}`);

    if (userError) {
      logs.push(`❌ Error creating auth user: ${userError.message}`);
      return new Response(
        JSON.stringify({ error: "Failed to create auth user", details: userError.message, logs }),
        { status: 400, headers: corsHeaders }
      );
    }

    logs.push(`✅ Auth user created → ID: ${userData.user.id}`);

    // ✅ Insert into 'staff' table
    const { error: staffError } = await supabase.from("staff").insert({
      id: userData.user.id,
      name,
      email,
      pin_hash: hashedPin,
      permission: permission ?? "Junior",
    });

    if (staffError) {
      logs.push(`❌ Error inserting into staff table: ${staffError.message}`);
      return new Response(
        JSON.stringify({ error: "Failed to insert staff", details: staffError.message, logs }),
        { status: 500, headers: corsHeaders }
      );
    }

    logs.push("✅ Staff inserted successfully.");

    return new Response(
      JSON.stringify({ success: true, userId: userData.user.id, logs }),
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
