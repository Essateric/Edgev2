// src/lib/logEvent.js
import * as supabaseModule from "../supabaseClient";

// supports either: export default supabase OR export const supabase
const baseSupabase = supabaseModule.supabase || supabaseModule.default;

export async function logEvent({
  entityType, // 'booking' | 'slot' | 'note' | ...
  entityId = null,
  bookingId = null,
  action, // 'create' | 'update' | 'move' | ...
  reason = null, // 'Manual Booking', 'Online Booking (multi)', etc.
  details = null, // JSON: before/after, extra context
  source = "app", // 'public' | 'admin' | 'system' | 'app'
  actorId = null,
  actorEmail = null,
  requestId = null,
  sessionId = null,
  supabaseClient = null,
} = {}) {
  const client = supabaseClient || baseSupabase;
  if (!client) throw new Error("No Supabase client available for logEvent");

  // If no actor provided, try resolve from auth (only if this client supports it)
  if (!actorId || !actorEmail) {
    try {
      if (typeof client?.auth?.getUser === "function") {
        const { data } = await client.auth.getUser();
        const user = data?.user;
        if (user) {
          if (!actorEmail) actorEmail = user.email ?? null;
          if (!actorId) actorId = user.id ?? null;
        }
      }
    } catch (err) {
      const msg = err?.message || String(err);

      // Avoid noisy console spam for "accessToken option" clients
      if (!/accessToken option/i.test(msg)) {
        console.warn("[Audit] auth lookup failed", msg);
      }
    }
  }

  const payload = {
    entity_type: entityType,
    entity_id: entityId,
    booking_id: bookingId,
    action,
    reason,
    details,
    source,
    actor_id: actorId,
    actor_email: actorEmail,
    request_id: requestId,
    session_id: sessionId,
  };

  const { error } = await client.from("audit_events").insert([payload]);
  if (error) throw error;

  return payload;
}