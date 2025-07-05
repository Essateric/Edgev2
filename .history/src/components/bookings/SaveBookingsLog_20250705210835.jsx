// SaveBookingLog.js
import { supabase } from "../supabaseClient";

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
  const { name: service_name, category, price, duration } = service;

  const { error } = await supabase.from("booking_logs").insert([
    {
      action,
      client_id,
      client_name,
      stylist_id,
      stylist_name,
      service_name,
      category,
      price,
      duration,
      start,
      end,
      created_at: new Date().toISOString(),
    },
  ]);

  if (error) {
    console.error("Error saving booking log:", error.message);
    throw new Error(error.message);
  }
}
