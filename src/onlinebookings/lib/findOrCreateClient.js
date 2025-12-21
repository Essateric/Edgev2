// lib/findOrCreateClient.js
import { supabase } from "../../supabaseClient.js";

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

/**
 * Find a client by email/mobile; create if missing.
 * - For ONLINE bookings we *require* email.
 * - If an existing client is found, we *patch missing names/mobile*.
 * Returns the full client row.
 */
export async function findOrCreateClient({
  first_name = "",
  last_name = "",
  email = "",
  mobile = "",
  requireEmail = false, // set true in online flow
}) {
  const fn = first_name.trim();
  const ln = last_name.trim();
  const em = email.trim().toLowerCase();
  const mo = normPhone(mobile);
  const emDomain = emailDomain(em);
  const normalizedInputEmail = normalizeEmailForMatch(em);
  const fnLower = fn.toLowerCase();
  const lnLower = ln.toLowerCase();

  if (!fn || !ln) {
    throw new Error("First name and last name are required.");
  }
  if (requireEmail && !em) {
    throw new Error("Email is required for online bookings.");
  }
  if (em && !isEmail(em)) {
    throw new Error("Please enter a valid email address.");
  }

  // 1) Look up by email/mobile to avoid duplicates
  let q = supabase.from("clients")
    .select("id, first_name, last_name, email, mobile")
    .limit(50);
  const phoneLike = mo ? `%${mo}%` : null;
  const ors = [];

  if (em) {
    ors.push(`email.ilike.${em}`, `email.eq.${em}`);
    if (emDomain) {
      ors.push(`email.ilike.%@${emDomain}`);
    }
  }
  if (mo) {
    ors.push(`mobile.ilike.${phoneLike}`, `mobile.eq.${mo}`);
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

   // 1) exact email (case-insensitive) or normalized email (e.g. dotted Gmail)
    const byEmail = found.find((r) => r.email && normalizeEmailForMatch(r.email) === normalizedInputEmail);
    if (byEmail) return byEmail;

    // 2) exact digits match
    const byDigits = found.find((r) => normPhone(r.mobile || "") === mo && mo);
    if (byDigits) return byDigits;

    // 3) same names + same email domain
    const byNameAndDomain = found.find((r) =>
      r.first_name?.trim().toLowerCase() === fnLower &&
      r.last_name?.trim().toLowerCase() === lnLower &&
      emailDomain(r.email) === emDomain
    );
    if (byNameAndDomain) return byNameAndDomain;

    // 4) first non-null candidate

    // 3) first non-null candidate
    return found[0];
  };

  const existing = pickBestMatch();

  if (existing?.id) {
    const patch = {};
    if (!existing.first_name && fn) patch.first_name = fn;
    if (!existing.last_name  && ln) patch.last_name  = ln;
    if (!existing.email      && em) patch.email      = em;
    if (!existing.mobile     && mo) patch.mobile     = mo;

    if (Object.keys(patch).length) {
      const { data: updated, error: updErr } = await supabase
        .from("clients")
        .update(patch)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (updErr) throw updErr;
      return updated;
    }
    return existing;
  }

  // 2) Create new client
  const { data: created, error: insErr } = await supabase
    .from("clients")
    .insert([{
      first_name: fn,
      last_name:  ln,
      email:  em || null,
      mobile: mo || null,
    }])
    .select("*")
    .single();

  if (insErr) throw insErr;
  return created;
}
