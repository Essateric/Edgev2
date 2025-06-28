import { serve } from 'https://deno.land/std@0.181.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.3';
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';
import { create, getNumericDate, Header, Payload } from 'https://deno.land/x/djwt@v2.8/mod.ts';

console.log('🚀 Edge Function Loaded');

serve(async (req) => {
  const logs: string[] = [];
  try {
    logs.push('🚀 Request received');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const FUNCTION_SECRET = Deno.env.get('FUNCTION_SECRET')!;
    const JWT_SECRET = Deno.env.get('JWT_SECRET')!;

    logs.push(`🔑 Env PROJECT_URL: ${SUPABASE_URL}`);
    logs.push(`🔑 Env SERVICE_ROLE_KEY: ✅ Loaded`);
    logs.push(`🔑 Env FUNCTION_SECRET: ✅ Loaded`);
    logs.push(`🔑 Env JWT_SECRET: ✅ Loaded`);

    const authHeader = req.headers.get('Authorization') ?? '';
    logs.push(`🔐 Auth Header: ${authHeader}`);

    if (authHeader !== `Bearer ${FUNCTION_SECRET}`) {
      logs.push(`⛔ Invalid function secret`);
      return new Response(JSON.stringify({ error: 'Unauthorized', logs }), { status: 401 });
    }

    const { pin } = await req.json();
    logs.push(`🔢 Received PIN: ${pin}`);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Fetch staff
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('*');

    if (staffError || !staffData) {
      logs.push(`❌ Error fetching staff: ${staffError?.message}`);
      return new Response(JSON.stringify({ error: 'Error fetching staff', logs }), { status: 500 });
    }

    logs.push(`📄 Staff fetched: ${staffData.length} staff members`);

    let matchedStaff = null;

    for (const staff of staffData) {
      logs.push(`👤 Checking staff: ${staff.name} (${staff.email})`);
      logs.push(`→ pin_hash: ${staff.pin_hash}`);

      const match = staff.pin_hash && bcrypt.compareSync(pin, staff.pin_hash);
      logs.push(`→ Match result: ${match ? '✅ MATCH' : '❌ NO MATCH'}`);

      if (match) {
        matchedStaff = staff;
        break;
      }
    }

    if (!matchedStaff) {
      logs.push('❌ Invalid PIN - no matching staff');
      return new Response(JSON.stringify({ error: 'Invalid PIN', logs }), { status: 401 });
    }

    logs.push(`✅ PIN matched for: ${matchedStaff.name} (${matchedStaff.email})`);

    // ✅ Fetch auth user via Admin API (correct method)
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();

    if (authError || !users) {
      logs.push(`❌ Error fetching auth.users: ${authError?.message}`);
      return new Response(JSON.stringify({ error: 'Error fetching auth.users', logs }), { status: 500 });
    }

    logs.push(`📥 Found ${users.length} auth.users`);
    logs.push(`🧠 Emails in auth.users: ${users.map((u) => u.email).join(', ')}`);

    const authUser = users.find(
      (u) => u.email?.toLowerCase() === matchedStaff.email.toLowerCase()
    );

    if (!authUser) {
      logs.push(`❌ No auth user found for ${matchedStaff.email}`);
      return new Response(JSON.stringify({ error: 'Auth user not found', logs }), { status: 404 });
    }

    logs.push(`👤 Found auth user: ${authUser.email} (ID: ${authUser.id})`);

    const permission = matchedStaff.permission;
    logs.push(`🔑 Permission for ${matchedStaff.name}: ${permission}`);

    // ✅ Build JWT
    const header: Header = { alg: 'HS256', typ: 'JWT' };
    const payload: Payload = {
      sub: authUser.id,
      email: matchedStaff.email,
      role: permission,
      exp: getNumericDate(60 * 60 * 24 * 7), // expires in 7 days
    };

    logs.push(`🔐 Creating JWT for: ${matchedStaff.name} (${matchedStaff.email}), Role: ${permission}`);

    const jwt = await create(header, payload, JWT_SECRET);

    logs.push(`✅ JWT created successfully`);

    return new Response(
      JSON.stringify({
        token: jwt,
        user: {
          id: authUser.id,
          email: authUser.email,
          permission,
        },
        logs,
      }),
      { status: 200 }
    );
  } catch (err) {
    logs.push(`❌ Unexpected error: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message, logs }), { status: 500 });
  }
});
