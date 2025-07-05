// SaveBookingsLog.js
import { supabase } from "../../supabaseClient";

/**
 * Logs a booking action (create/edit/delete) with a full snapshot of service and booking details.
 *
 * @param {Object} params
 * @param {string} params.action - 'created', 'edited', 'deleted'
 * @param {string} params.client_id
 * @param {string} params.client_name
 * @param {string} params.stylist_id
 * @param {string} params.stylist_name
 * @param {Object} params.service - Service object used in the booking
 * @param {string} params.start - ISO string of booking start time
 * @param {string} params.end - ISO string of booking end time
 */
export default async function SaveBookingsLog({
  action,
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

  // Build a snapshot of the booking at the time of action
  const snapshot = {
    service_name,
    category,
    price,
    duration,
    start,
    end,
    stylist_id,
    stylist_name,
    client_id,
    client_name,
  };

  const { error } = await supabase.from("booking_logs").insert([
    {
      action,
      client_id,
      client_name,
      stylist_id,
      stylist_name,
      service_name,
      category,
      snapshot,
      created_at: new Date().toISOString(),
    },
  ]);

  if (error) {
    console.error("❌ Error saving booking log:", error.message);
    throw new Error(error.message);
  }
}
