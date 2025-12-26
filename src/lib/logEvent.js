// src/lib/logEvent.js
import { supabase } from "../supabaseClient";

export async function logEvent({
  entityType,     // 'booking' | 'slot' | 'note' | ...
  entityId = null,
  bookingId = null,
  action,         // 'create' | 'update' | 'move' | ...
  reason = null,  // 'Manual Booking', 'Online Booking (multi)', etc.
  details = null, // JSON: before/after, extra context
  source = "app", // 'public' | 'admin' | 'system' | 'app'
  actorId = null,
  actorEmail = null,
  requestId = null,
  sessionId = null,
  supabaseClient = null,
}) {
  const client = supabaseClient || supabase;
  // If admin path and no actor provided, try resolve from auth
  if (!actorId || !actorEmail) {
    const { data: { user } = {} } = await client.auth.getUser();
    if (user) {
      actorEmail = actorEmail ?? user.email ?? null;
      // If you map auth.uid -> staff.id, resolve here if you want a staff UUID
      // Otherwise store auth uid directly in actor_id
      actorId = actorId ?? user.id ?? null;
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
}
