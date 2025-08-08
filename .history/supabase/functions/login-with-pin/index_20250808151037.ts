// /functions/login-with-pin/index.ts
import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.3";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const { pin } = await req.json();

    // 1) Find staff by pin
    const { data: staff, error } = await supabase.from("staff")
      .select("id,name,email,permission,pin_hash")
      .not("pin_hash", "is", null);

    if (error) throw error;

    const matched = staff?.find(s => bcrypt.compareSync(String(pin), s.pin_hash));
    if (!matched) return new Response(JSON.stringify({ error: "Invalid PIN" }), { status: 401, headers: corsHeaders });

    // 2) Ensure auth user exists
    const { data: userList, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw listErr;
    const authUser = userList.users.find(u => u.email?.toLowerCase() === matched.email?.toLowerCase());
    if (!authUser) {
      return new Response(JSON.stringify({ error: "Auth user not found" }), { status: 404, headers: corsHeaders });
    }

    // 3) Generate a magic link (no email sending needed)
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: matched.email,
      options: {
        redirectTo: "https://your-app.example.com/auth/callback", // not used in our programmatic flow
      },
    });
    if (linkErr) throw linkErr;

    // Return what the client needs to verify
    // `properties.token_hash` is the thing verifyOtp wants for magic links
    const token_hash = linkData?.properties?.hashed_token;
    if (!token_hash) throw new Error("No token_hash from generateLink");

    return new Response(JSON.stringify({
      email: matched.email,
      name: matched.name ?? matched.email,
      permission: matched.permission ?? "Staff",
      token_hash, // client will use this to verify
    }), { status: 200, headers: corsHeaders });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message ?? "Unexpected error" }), {
      status: 500, headers: corsHeaders
    });
  }
});
