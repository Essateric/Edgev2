// src/components/bookings/SaveBookingsLog.jsx
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
  logged_by,                 // pass staff UUID if available
  reason,
  skipStaffLookup = false,   // public site should pass true
}) {
  try {
    const { name: service_name, category, price, duration } = service || {};
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

    // Only use a real UUID for logged_by. Never "Unknown" string.
    let staffLogger = logged_by && logged_by !== "Unknown" ? logged_by : null;

    // Public site logs shouldn't try to resolve staff; keep null
    if (!staffLogger && String(reason || "").toLowerCase().includes("online booking")) {
      staffLogger = null;
    }

    // If we are allowed to try resolving a staff logger, do it WITHOUT the UID column.
    if (!skipStaffLookup && !staffLogger) {
      const { data: { user } = {} } = await supabase.auth.getUser();

      if (user) {
        // 1) Try by staff.email if we have a user email
        if (user.email) {
          const { data: byEmail, error: emailErr } = await supabase
            .from("staff")
            .select("id")
            .eq("email", user.email)
            .maybeSingle();

          if (!emailErr && byEmail?.id) {
            staffLogger = byEmail.id;
          } else {
            // 2) Fall back to storing the auth user.id (no extra select)
            staffLogger = user.id;
          }
        } else {
          // No email? just use the auth user.id
          staffLogger = user.id;
        }
      }
    }

    const logPayload = {
      action,
      booking_id,
      snapshot,
      reason,
      logged_by: staffLogger ?? null, // UUID or null
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
    throw err;
  }
}
