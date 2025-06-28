// supabase/functions/hash-pin/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts'

serve(async (req: Request) => {
  const { staff_id, pin } = await req.json()

  if (!staff_id || !pin) {
    return new Response(JSON.stringify({ error: 'Missing staff_id or pin' }), { status: 400 })
  }

  const supabaseClient = createClient(
    Deno.env.get('PROJECT_URL')!,
    Deno.env.get('SERVICE_ROLE_KEY')! // Full access
  )

  // ✅ 1. Authenticate the user making the request
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized: No token provided' }), { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '').trim()

  const {
    data: user,
    error: userError,
  } = await supabaseClient.auth.getUser(token)

  if (userError || !user?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), { status: 401 })
  }

  // ✅ 2. Check if user is a manager in the "staff" table
  const { data: staffData, error: staffError } = await supabaseClient
    .from('staff')
    .select('role')
    .eq('id', user.user.id)
    .single()

  if (staffError || !staffData || staffData.role !== 'Admin') {
    return new Response(JSON.stringify({ error: 'Forbidden: Must be an Admin User' }), { status: 403 })
  }

  // ✅ 3. Hash the PIN
  const hash = await bcrypt.hash(pin)

  const { error } = await supabaseClient
    .from('staff')
    .update({ pin_hash: hash })
    .eq('id', staff_id)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ success: true }))
})
