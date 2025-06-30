import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("PROJECT_URL")?.trim();
  const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")?.trim();
  const FUNCTION_SECRET = Deno.env.get("FUNCTION_SECRET")?.trim();

  console.log("🔐 ENV - SUPABASE_URL:", SUPABASE_URL);
  console.log("🔐 ENV - SERVICE_ROLE_KEY Present:", !!SERVICE_ROLE_KEY);
  console.log("🔐 ENV - FUNCTION_SECRET:", FUNCTION_SECRET);

  const authHeader = req.headers.get("Authorization")?.trim();
  console.log("🪪 Incoming Authorization Header:", authHeader);
  console.log("🆚 Expected Authorization:", `Bearer ${FUNCTION_SECRET}`);

  if (authHeader !== `Bearer ${FUNCTION_SECRET}`) {
    console.error("❌ Unauthorized - Invalid Function Secret");
    return new Response(
      JSON.stringify({ error: "Unauthorized - Invalid Function Secret" }),
      { status: 401, headers: corsHeaders }
    );
  }

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

console.log("👉 URL:", SUPABASE_URL);
console.log("👉 Service Role:", SERVICE_ROLE_KEY);
console.log("👉 Function Secret:", FUNCTION_SECRET);


  try {
    const body = await req.json();
    console.log("📦 Incoming Body:", body);

    const { name, email, pin, permission } = body;

    if (!name || !email || !pin || !permission) {
      console.warn("⚠️ Missing required fields");
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: corsHeaders }
      );
    }

    console.log("🔐 Hashing PIN...");
    const pinHash = await bcrypt.hash(pin);

    console.log("👤 Creating Auth User...");
    const { data: userData, error: userError } =
      await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      console.log("👉 Created User Data:", userData);
console.log("👉 User Error:", userError);


    if (userError) {
      console.error("❌ Failed to create auth user:", userError.message);
      return new Response(
        JSON.stringify({ error: "Failed to create auth user", details: userError.message }),
        { status: 400, headers: corsHeaders }
      );
    }

    const userId = userData.user.id;
    console.log(`✅ Auth User Created: ${userId}`);

    console.log("📥 Inserting into 'staff' table...");
    const { error: staffError } = await supabase.from("staff").insert({
      id: userId,
      name,
      email,
      pin_hash: pinHash,
      permission,
    });

    if (staffError) {
      console.error("❌ Failed to insert staff:", staffError.message);
      return new Response(
        JSON.stringify({ error: "Failed to insert staff", details: staffError.message }),
        { status: 500, headers: corsHeaders }
      );
    }

    console.log("✅ Staff Inserted Successfully.");

    return new Response(
      JSON.stringify({ success: true, userId }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("❌ Server Error:", err);
    return new Response(
      JSON.stringify({ error: err.message ?? "Unknown error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
