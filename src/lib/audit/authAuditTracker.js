// src/lib/audit/authAuditTracker.js
import { queueAuditEvent, flushQueuedAuditEvents } from "./pendingAuditQueue";

const CLIENT_SESSION_KEY = "edgehd_client_session_id_v1";

function getOrCreateClientSessionId() {
  try {
    let id = localStorage.getItem(CLIENT_SESSION_KEY);
    if (!id) {
      id =
        globalThis.crypto?.randomUUID?.() ||
        `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(CLIENT_SESSION_KEY, id);
    }
    return id;
  } catch {
    return `sess_${Date.now()}`;
  }
}

function pickStaffFields(currentUser, sessionUser) {
  const actor_id = sessionUser?.id ?? currentUser?.id ?? null;
  const actor_email = sessionUser?.email ?? currentUser?.email ?? null;

  // Your "staff name is actor/stylist" — use currentUser where possible
  const staff_id = currentUser?.staff_id ?? currentUser?.id ?? actor_id;
  const staff_email = currentUser?.email ?? actor_email;
  const staff_name = currentUser?.name ?? currentUser?.staff_name ?? null;

  return { actor_id, actor_email, staff_id, staff_email, staff_name };
}

export function createAuthAuditTracker({
  supabase,
  getCurrentUser, // () => latest currentUser
  source = "app",
  logTokenRefreshed = false,
} = {}) {
  let manualSignOut = false;
  let lastSessionUser = null;

  const markManualSignOut = () => {
    manualSignOut = true;
  };

  const handleAuthStateChange = async (event, session) => {
    if (!supabase) return;
    if (localStorage.getItem("offlineUser")) return;

    if (session?.user) lastSessionUser = session.user;

    // ✅ When user logs in, flush queued "session_expired" events, then log login
    if (event === "SIGNED_IN" && session?.user) {
      try {
        await flushQueuedAuditEvents(supabase);
      } catch {
        // ignore
      }

      const currentUser = typeof getCurrentUser === "function" ? getCurrentUser() : null;
      const fields = pickStaffFields(currentUser, session.user);

      try {
        await supabase.from("audit_events").insert({
          entity_type: "auth",
          action: "login",
          occurred_at: new Date().toISOString(),
          source,
          session_id: getOrCreateClientSessionId(),
          ...fields,
          details: { auth_event: event },
        });
      } catch {
        // ignore
      }
    }

    // Optional (can be noisy)
    if (event === "TOKEN_REFRESHED" && session?.user && logTokenRefreshed) {
      const currentUser = typeof getCurrentUser === "function" ? getCurrentUser() : null;
      const fields = pickStaffFields(currentUser, session.user);

      try {
        await supabase.from("audit_events").insert({
          entity_type: "auth",
          action: "token_refreshed",
          occurred_at: new Date().toISOString(),
          source,
          session_id: getOrCreateClientSessionId(),
          ...fields,
          details: { auth_event: event },
        });
      } catch {
        // ignore
      }
    }

    // ✅ SIGNED_OUT
    if (event === "SIGNED_OUT") {
      const wasManual = manualSignOut;
      manualSignOut = false;

      // Manual logout is logged BEFORE signOut in your logout() function.
      // So here: do nothing to avoid duplicates.
      if (wasManual) return;

      // Not manual -> likely session expired / token stale
      queueAuditEvent({
        entity_type: "auth",
        action: "session_expired",
        reason: "token_expired",
        occurred_at: new Date().toISOString(),
        source,
        session_id: getOrCreateClientSessionId(),
        actor_id: lastSessionUser?.id ?? null,
        actor_email: lastSessionUser?.email ?? null,
        details: {
          note: "SIGNED_OUT without manual logout (likely expired/stale session).",
          auth_event: event,
        },
      });
    }
  };

  // ✅ Call this from handleAuthLoss() before you clear everything
  const queueSessionExpired = (reason = "auth_loss", details = {}) => {
    const u = typeof getCurrentUser === "function" ? getCurrentUser() : null;
    queueAuditEvent({
      entity_type: "auth",
      action: "session_expired",
      reason,
      occurred_at: new Date().toISOString(),
      source,
      session_id: getOrCreateClientSessionId(),
      actor_id: u?.id ?? null,
      actor_email: u?.email ?? null,
      staff_id: u?.staff_id ?? null,
      staff_email: u?.email ?? null,
      staff_name: u?.name ?? null,
      details,
    });
  };

  return {
    markManualSignOut,
    handleAuthStateChange,
    queueSessionExpired,
  };
}
