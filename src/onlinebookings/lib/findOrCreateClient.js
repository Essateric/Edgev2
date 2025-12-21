// lib/findOrCreateClient.js
import { supabase } from "../../supabaseClient.js";

const normPhone = (s = "") => {
  const digits = String(s).replace(/[^\d]/g, "");
  if (!digits) return "";
  return String(s).trim().startsWith("+") ? `+${digits}` : digits;
};
const isEmail = (s = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());

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
    .limit(25);
    const phoneLike = mo ? `%${mo}%` : null;

if (em && mo) {
    q = q.or(
      [
        `email.ilike.${em}`,
        `email.eq.${em}`,
        `mobile.ilike.${phoneLike}`,
        `mobile.eq.${mo}`,
      ].join(",")
    );
  } else if (em) {
    q = q.or([`email.ilike.${em}`, `email.eq.${em}`].join(","));
  } else if (mo) {
    q = q.or([`mobile.ilike.${phoneLike}`, `mobile.eq.${mo}`].join(","));
  }

  const { data: found, error: findErr } = await q;
  if (findErr) throw findErr;

 const pickBestMatch = () => {
    if (!Array.isArray(found) || !found.length) return null;

    // 1) exact email (case-insensitive)
    const byEmail = found.find((r) => r.email && r.email.toLowerCase() === em);
    if (byEmail) return byEmail;

    // 2) exact digits match
    const byDigits = found.find((r) => normPhone(r.mobile || "") === mo && mo);
    if (byDigits) return byDigits;

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
