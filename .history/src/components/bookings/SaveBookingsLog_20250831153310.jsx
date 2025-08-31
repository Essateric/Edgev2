import { supabase } from "../../supabaseClient.js";

export default async function SaveBookingsLog({
  action,
  booking_id,
  client_id,
  client_name,
  stylist_id,
  stylist_name,
  service,
  start,
  end,
  logged_by, // pass staff UUID if available (prefer currentUser.staff_id), else currentUser.id
  reason = "Created from calendar",
}) {
  try {
    const {
      name: service_name,
      category,
      price,
      duration,
    } = service || {};

    const snapshot = {
      service_name,
      category,
      price,
      duration,
      start,
      end,
      client_id,
      client_name,
      stylist_id,
      stylist_name,
    };

    // Prefer caller-provided UUID; never "Unknown"
    let staffLogger = logged_by && logged_by !== "Unknown" ? logged_by : null;

    // Fallback to Supabase Auth user id (no staff table lookup)
    if (!staffLogger) {
      const { data: { user } = {} } = await supabase.auth.getUser();
      if (user?.id) {
        staffLogger = user.id;
      }
    }

    // If still none, set null
    if (!staffLogger) {
      staffLogger = null;
    }

    const logPayload = {
      action,
      booking_id,
      snapshot,
      reason,
      logged_by: staffLogger, // UUID or null
      created_at: new Date().toISOString(),
    };

    console.log("📦 Booking log payload:", logPayload);

    const { error: insertError } = await supabase
      .from("booking_logs")
      .insert([logPayload]);

    if (insertError) throw insertError;
  } catch (err) {
    console.error("❌ SaveBookingsLog failed:", err?.message || err);
    console.log("🔍 booking_id was:", booking_id);
    // keep existing behavior: bubble up so caller can decide
    throw err;
  }
}
