// src/lib/ensureClient.js
export async function ensureClient(supabase, { first_name, last_name, email, mobile }) {
  // 1) try by email
  if (email) {
    const { data: byEmail, error: e1 } = await supabase
      .from("clients")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!e1 && byEmail?.id) return byEmail.id;
  }

  // 2) optional: try by mobile
  if (mobile) {
    const { data: byMobile, error: e2 } = await supabase
      .from("clients")
      .select("id")
      .eq("mobile", mobile)
      .maybeSingle();
    if (!e2 && byMobile?.id) return byMobile.id;
  }

  // 3) insert
  const { data: inserted, error } = await supabase
    .from("clients")
    .insert([{ first_name, last_name, email, mobile }])
    .select("id")
    .single();
  if (error) throw error;
  return inserted.id;
}
