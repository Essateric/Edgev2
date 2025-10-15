// src/lib/staff.js
export async function fetchStaffForCurrentUser(supabase) {
  try {
    const { data: authData, error: uErr } = await supabase.auth.getUser();
    if (uErr) return null;
    const user = authData?.user;
    if (!user?.email) return null;

    const { data, error } = await supabase
      .from("staff")
      .select("id, name, email, permission, title, role")
      .eq("email", user.email)
      .maybeSingle();

    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}
