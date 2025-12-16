const normPhone = (s = "") => s.replace(/[^\d+]/g, "");
const isEmail = (s = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());

export async function findOrCreateClientStaff(supabaseClient, { first_name="", last_name="", email="", mobile="" }) {
  if (!supabaseClient) throw new Error("Missing staff session (supabaseClient).");

  const fn = first_name.trim();
  const ln = last_name.trim();
  const em = email.trim().toLowerCase();
  const mo = normPhone(mobile);

  if (!fn || !ln) throw new Error("First name and last name are required.");
  if (em && !isEmail(em)) throw new Error("Please enter a valid email address.");

  const canLookup = !!em || !!mo;

  if (canLookup) {
    let q = supabaseClient
      .from("clients")
      .select("id, first_name, last_name, email, mobile")
      .limit(1);

    if (em && mo) q = q.or(`email.eq.${em},mobile.eq.${mo}`);
    else if (em) q = q.eq("email", em);
    else if (mo) q = q.eq("mobile", mo);

    const { data: found, error: findErr } = await q;
    if (findErr) throw findErr;
    if (found?.length) return found[0];
  }

  const { data: created, error: insErr } = await supabaseClient
    .from("clients")
    .insert([{ first_name: fn, last_name: ln, email: em || null, mobile: mo || null }])
    .select("id, first_name, last_name, email, mobile")
    .single();

  if (insErr) throw insErr;
  return created;
}
