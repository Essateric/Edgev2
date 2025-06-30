// Example pseudo-code for adding new staff

async function addNewStaff({ name, email, pin, permission }) {
  // 1. Hash the PIN
  const pinHashRes = await fetch('/functions/hash-pin', {
    method: 'POST',
    headers: { Authorization: `Bearer ${FUNCTION_SECRET}` },
    body: JSON.stringify({ pin })
  });
  const { hash } = await pinHashRes.json();

  // 2. Create Supabase Auth User (optional)
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (authError) throw new Error(authError.message);

  // 3. Save to staff table
  const { error } = await supabase.from('staff').insert({
    id: authUser.user.id,
    name,
    email,
    permission,
    pin_hash: hash,
  });
  if (error) throw new Error(error.message);
}
