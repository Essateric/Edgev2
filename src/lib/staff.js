// src/lib/staff.js
export async function fetchStaffForCurrentUser(supabase) {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user?.email) return null;

    const { data } = await supabase
      .from("staff")
      .select("id, name, email, permission")
      .eq("email", user.email)
      .maybeSingle();

    return data || null;
  } catch {
    return null;
  }
}
