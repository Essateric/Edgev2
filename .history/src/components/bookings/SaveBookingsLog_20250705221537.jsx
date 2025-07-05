// SaveBookingsLog.js
import { supabase } from "../../supabaseClient";

/**
 * Logs a booking action (create/edit/delete) with full snapshot of service.
 *
 * @param {Object} params
 * @param {string} params.action - 'created', 'edited', 'deleted'
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

  // Build full snapshot
  const snapshot = {
    name: service_name,
    category,
    price,
    duration,
    start,
    end,
    resource_id: stylist_id,
    resource_name: stylist_name,
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
