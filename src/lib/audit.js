// src/lib/audit.js
import { supabase } from "../supabaseClient";

/**
 * Insert an audit row only if we have a valid session/JWT.
 * Silently skips when signed-out (prevents 401s).
 */
export async function logAuditIfAuthed(payload) {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) return; // optional: skip offline
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return; // no JWT -> skip
    const { error } = await supabase.from("audit_events").insert([payload]);
    if (error) throw error;
  } catch {
    // best-effort; don't block UX
  }
}
