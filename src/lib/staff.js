export async function fetchStaffForCurrentUser(supabase) {
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user?.email) return null;
  const { data, error } = await supabase
    .from("staff")
    .select("id, name, email, permission")
    .eq("email", user.email) // avoid uid column 400s
    .maybeSingle();
  if (error) return null;
  return data || null;
}
