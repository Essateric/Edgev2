import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3';

serve(async (req) => {
  const { staffId, plainPin } = await req.json();

  if (!staffId || !plainPin) {
    return new Response(
      JSON.stringify({ error: 'Missing staffId or plainPin' }),
      { status: 400 }
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const hash = bcrypt.hashSync(plainPin, 10);

  const { error } = await supabase
    .from('staff')
    .update({ pin_hash: hash })
    .eq('id', staffId);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  return new Response(JSON.stringify({ success: true }));
});
