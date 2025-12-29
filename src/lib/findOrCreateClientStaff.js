const normPhone = (s = "") => {
  const digits = String(s).replace(/[^\d]/g, "");
  if (!digits) return "";
  return String(s).trim().startsWith("+") ? `+${digits}` : digits;
};

const isEmail = (s = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());

const normalizeEmailForMatch = (s = "") => {
  const trimmed = String(s).trim().toLowerCase();
  const [local = "", domain = ""] = trimmed.split("@");
  if (!domain) return trimmed;
  const withoutTag = local.split("+")[0];
  const collapsedLocal = withoutTag.replace(/[^a-z0-9]/gi, "");
  return `${collapsedLocal}@${domain}`;
};
const emailDomain = (s = "") => normalizeEmailForMatch(s).split("@")[1] || "";


export async function findOrCreateClientStaff(
  supabaseClient,
  { first_name = "", last_name = "", email = "", mobile = "" }
) {
  if (!supabaseClient) throw new Error("Missing staff session (supabaseClient).");

  const fn = first_name.trim();
  const ln = last_name.trim();
  const em = email.trim().toLowerCase();
  const mo = normPhone(mobile);

   const fnLower = fn.toLowerCase();
  const lnLower = ln.toLowerCase();
  const emDomain = emailDomain(em);
  const normalizedInputEmail = normalizeEmailForMatch(em);

  if (!fn || !ln) throw new Error("First name and last name are required.");
  if (!em && !mo) throw new Error("Enter a mobile number or email.");
  if (em && !isEmail(em)) throw new Error("Please enter a valid email address.");

  const canLookup = !!em || !!mo;
  let q = supabaseClient.from("clients").select("id, first_name, last_name, email, mobile").limit(50);
  const ors = [];

 if (em) {
    ors.push(`email.eq.${em}`, `email.ilike.${em}`);
    if (emDomain) {
      ors.push(`email.ilike.%@${emDomain}`);
    }
  }
  if (mo) {
    const phoneLike = `%${mo}%`;
    ors.push(`mobile.eq.${mo}`, `mobile.ilike.${phoneLike}`);
  }
  if (fn && ln) {
    ors.push(`and(first_name.ilike.${fn},last_name.ilike.${ln})`);
  }

  if (ors.length) {
    q = q.or(ors.join(","));
  }

  const { data: found, error: findErr } = await q;
  if (findErr) throw findErr;

  const pickBestMatch = () => {
    if (!Array.isArray(found) || !found.length) return null;

    const byEmail = found.find(
      (r) => r.email && normalizeEmailForMatch(r.email) === normalizedInputEmail
    );
    if (byEmail) return byEmail;

    const byDigits = found.find((r) => normPhone(r.mobile || "") === mo && mo);
    if (byDigits) return byDigits;

    const byNameAndDomain = found.find(
      (r) =>
        r.first_name?.trim().toLowerCase() === fnLower &&
        r.last_name?.trim().toLowerCase() === lnLower &&
        emailDomain(r.email) === emDomain
    );
    if (byNameAndDomain) return byNameAndDomain;

    return found[0];
  };

  const existing = pickBestMatch();

     if (existing?.id) {
    const patch = {};
    if (!existing.first_name && fn) patch.first_name = fn;
    if (!existing.last_name && ln) patch.last_name = ln;
    if (!existing.email && em) patch.email = em;
    if (!existing.mobile && mo) patch.mobile = mo;

    if (Object.keys(patch).length) {
      const { data: updated, error: updErr } = await supabaseClient
        .from("clients")
        .update(patch)
        .eq("id", existing.id)
        .select("id, first_name, last_name, email, mobile")
        .single();
      if (updErr) throw updErr;
      return { client: updated, existing: true };
    }
    return { client: existing, existing: true };
  }

  const { data: created, error: insErr } = await supabaseClient
    .from("clients")
    .insert([{ first_name: fn, last_name: ln, email: em || null, mobile: mo || null }])
    .select("id, first_name, last_name, email, mobile")
    .single();

  if (insErr) throw insErr;
   return { client: created, existing: false };
}
