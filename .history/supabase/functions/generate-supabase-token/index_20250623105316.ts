import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Import and init Supabase Admin client (server-side)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

serve(async (req) => {
  try {
    // Only allow POST
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Parse body: expects { staff_id: "..." }
    const { staff_id } = await req.json();
    if (!staff_id) {
      return new Response(JSON.stringify({ error: "Missing staff_id" }), {
        status: 400,
      });
    }

    // 1. Verify staff exists
    const { data: staff, error } = await supabaseAdmin
      .from("staff")
      .select("email")
      .eq("id", staff_id)
      .single();
    if (error || !staff) {
      return new Response(JSON.stringify({ error: "Staff not found" }), { status: 404 });
    }

    // 2. Fetch user by email in Supabase Auth
    const { data: user } = await supabaseAdmin.auth.admin.getUserByEmail(staff.email);
    if (!user || !user.user?.id) {
      return new Response(JSON.stringify({ error: "Auth user not found" }), { status: 404 });
    }

    // 3. Create a custom JWT (access token) for this user
    const { data: tokenResult, error: tokenError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink", // Type doesn't matter, we just want a one-time link/token
      email: staff.email,
      options: {
        redirectTo: "http://localhost:3000", // Not actually used for the token
      },
    });

    if (tokenError || !tokenResult) {
      return new Response(JSON.stringify({ error: "Token generation failed" }), { status: 500 });
    }

    // The 'access_token' field is a JWT for the user (good for signInWithIdToken)
    return new Response(JSON.stringify({ token: tokenResult.access_token }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Server error" }),
      { status: 500 }
    );
  }
});
