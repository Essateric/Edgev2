import { flushQueuedAuditEvents, queueAuditEvent } from "./pendingAuditQueue";

const CLIENT_SESSION_KEY = "audit_client_session_id_v1";

function getOrCreateClientSessionId() {
  try {
    let id = localStorage.getItem(CLIENT_SESSION_KEY);
    if (!id) {
      id =
        (globalThis.crypto?.randomUUID?.() ||
          `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`);
      localStorage.setItem(CLIENT_SESSION_KEY, id);
    }
    return id;
  } catch {
    return `sess_${Date.now()}`;
  }
}

function resolveStaffInfo(currentUser, session) {
  // Your "staff name is same as actor/stylist"
  // We'll set staff_* if we can, otherwise fallback to actor fields.
  const actorId = session?.user?.id ?? null;
  const actorEmail = session?.user?.email ?? null;

  const staffId = currentUser?.id ?? currentUser?.staff_id ?? actorId;
  const staffEmail = currentUser?.email ?? currentUser?.staff_email ?? actorEmail;
  const staffName = currentUser?.name ?? currentUser?.staff_name ?? null;

  return {
    actor_id: actorId,
    actor_email: actorEmail,
    staff_id: staffId,
    staff_email: staffEmail,
    staff_name: staffName,
  };
}

/**
 * Attach audit logging to Supabase auth state changes.
 * Minimal wiring in AuthContext.
 */
export function attachAuthAuditListener({
  supabase,
  getCurrentUser, // function that returns latest currentUser
  source = "app",
  logTokenRefreshed = false, // optional (can be noisy)
}) {
  if (!supabase) {
    return { markManualSignOut: () => {}, unsubscribe: () => {} };
  }

  let manualSignOut = false;
  let lastKnownSessionUser = null;

  const markManualSignOut = () => {
    manualSignOut = true;
  };

  const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      lastKnownSessionUser = session.user;
    }

    // SIGNED_IN: flush pending + log login
    if (event === "SIGNED_IN" && session?.user) {
      // Flush any queued "session_expired" etc
      await flushQueuedAuditEvents(supabase);

      const currentUser = typeof getCurrentUser === "function" ? getCurrentUser() : null;
      const actorStaff = resolveStaffInfo(currentUser, session);

      const session_id = getOrCreateClientSessionId();

      // Best effort insert
      try {
        await supabase.from("audit_events").insert({
          entity_type: "auth",
          action: "login",
          occurred_at: new Date().toISOString(),
          source,
          session_id,
          ...actorStaff,
          details: { auth_event: event },
        });
      } catch {
        // ignore
      }
    }

    // TOKEN_REFRESHED (optional)
    if (event === "TOKEN_REFRESHED" && session?.user && logTokenRefreshed) {
      const currentUser = typeof getCurrentUser === "function" ? getCurrentUser() : null;
      const actorStaff = resolveStaffInfo(currentUser, session);

      try {
        await supabase.from("audit_events").insert({
          entity_type: "auth",
          action: "token_refreshed",
          occurred_at: new Date().toISOString(),
          source,
          session_id: getOrCreateClientSessionId(),
          ...actorStaff,
          details: { auth_event: event },
        });
      } catch {
        // ignore
      }
    }

    // SIGNED_OUT: manual vs expired
    if (event === "SIGNED_OUT") {
      const wasManual = manualSignOut;
      manualSignOut = false;

      if (wasManual) {
        // Manual logout (best effort)
        try {
          await supabase.from("audit_events").insert({
            entity_type: "auth",
            action: "logout_manual",
            occurred_at: new Date().toISOString(),
            source,
            actor_id: lastKnownSessionUser?.id ?? null,
            actor_email: lastKnownSessionUser?.email ?? null,
            session_id: getOrCreateClientSessionId(),
          });
        } catch {
          // ignore
        }
        return;
      }

      // Likely token expired / stale session
      // Queue it, then flush on next SIGNED_IN
      queueAuditEvent({
        entity_type: "auth",
        action: "session_expired",
        reason: "token_expired",
        occurred_at: new Date().toISOString(),
        source,
        actor_id: lastKnownSessionUser?.id ?? null,
        actor_email: lastKnownSessionUser?.email ?? null,
        session_id: getOrCreateClientSessionId(),
        details: {
          note: "Signed out by auth state change (likely expired session).",
          auth_event: event,
        },
      });
    }
  });

  const unsubscribe = () => data?.subscription?.unsubscribe?.();

  return { markManualSignOut, unsubscribe };
}