// SaveBookingsLog.jsx
import { supabase } from "../../supabaseClient";

/**
 * Logs a booking action (create/edit/delete) with full snapshot of the booking service.
 *
 * @param {Object} params
 * @param {string} params.action - 'created', 'edited', or 'deleted'
 * @param {string} params.booking_id - ID linking this log to the original booking
 * @param {string} params.client_id
 * @param {string} params.client_name
 * @param {string} params.stylist_id
 * @param {string} params.stylist_name
 * @param {Object} params.service - Original service object used in the booking
 * @param {string} params.start - ISO start time of the service
 * @param {string} params.end - ISO end time of the service
 */
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
}) {
  const {
    name: service_name,
    category,
    price,
    duration,
  } = service;

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

  console.log("📦 Booking log payload:", {
  action,
  booking_id,
  snapshot,
  created_at: new Date().toISOString(),
});


  const { error } = await supabase.from("booking_logs").insert([
    {
      action,
      booking_id, // ✅ FIXED: Now included in the insert
      snapshot,
      created_at: new Date().toISOString(),
    },
  ]);

  if (error) {
    console.error("❌ Error saving booking log:", error.message);
    throw new Error(error.message);
  }
}
