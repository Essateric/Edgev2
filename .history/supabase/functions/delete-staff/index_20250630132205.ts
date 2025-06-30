import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.3";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { id } = await req.json();

  const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
  const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

  const logs = [];

  try {
    if (!id) {
      return new Response(
        JSON.stringify({ error: "Missing staff ID", logs }),
        { status: 400, headers: corsHeaders }
      );
    }

    // ✅ Delete from auth
    const { error: authError } = await supabase.auth.admin.deleteUser(id);
    if (authError) {
      logs.push(`Auth delete failed: ${authError.message}`);
      return new Response(
        JSON.stringify({ error: authError.message, logs }),
        { status: 400, headers: corsHeaders }
      );
    }

    logs.push("Deleted from auth");

    // ✅ Delete from staff table
    const { error: dbError } = await supabase
      .from("staff")
      .delete()
      .eq("id", id);

    if (dbError) {
      logs.push(`DB delete failed: ${dbError.message}`);
      return new Response(
        JSON.stringify({ error: dbError.message, logs }),
        { status: 400, headers: corsHeaders }
      );
    }

    logs.push("Deleted from staff table");

    return new Response(
      JSON.stringify({ success: true, logs }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    logs.push(`Unexpected error: ${error}`);
    return new Response(
      JSON.stringify({ error: String(error), logs }),
      { status: 500, headers: corsHeaders }
    );
  }
});
