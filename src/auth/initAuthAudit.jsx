// src/auth/initAuthAudit.ts
import { supabase } from "../supabaseClient";

export function initAuthAudit() {
  supabase.auth.onAuthStateChange(async (event, session) => {
    // SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED, PASSWORD_RECOVERY, etc.
    try {
      const user = session?.user || null; // Note: for SIGNED_OUT, this is null
      await supabase.from("audit_events").insert([{
        entity_type: "auth",
        entity_id: user?.id ?? null,
        action: event.toLowerCase(),       // "signed_in" | "signed_out" | ...
        source: "auth",
        details: {
          email: user?.email ?? null,
          ua: typeof navigator !== "undefined" ? navigator.userAgent : null,
        },
      }]);
    } catch (_) {
      // best-effort; don't block UX
    }
  });
}
