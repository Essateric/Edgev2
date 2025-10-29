// src/auth/initAuthAudit.js
import { supabase } from "../supabaseClient";
import { logAuditIfAuthed } from "../lib/audit";

export function initAuthAudit() {
  supabase.auth.onAuthStateChange(async (event, session) => {
    // Avoid synthetic initial event
    if (event === "INITIAL_SESSION") return;

    try {
      const user = session?.user || null;

      // On SIGNED_OUT there is no session/JWT, so skip here.
      // We'll log sign-out proactively inside logout() before signOut().
      if (event === "SIGNED_OUT") return;

      await logAuditIfAuthed({
        entity_type: "auth",
        entity_id: user?.id ?? null,
        action: String(event || "").toLowerCase(),
        source: "auth",
        details: {
          email: user?.email ?? null,
          ua: typeof navigator !== "undefined" ? navigator.userAgent : null,
        },
      });
    } catch {
      /* no-op */
    }
  });
}
