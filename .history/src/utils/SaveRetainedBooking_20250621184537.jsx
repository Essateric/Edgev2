import { supabase } from "../supabaseClient";

const CHEMICAL_CATEGORIES = ["Highlights", "Tints", "Treatments"];

export default async function SaveRetainedBooking({ client_id, client_name, stylist_id, stylist_name, service, start, end }) {
  const { data, error } = await supabase
    .from('retained_bookings') // Your Supabase table
    .insert([
      {
       client_id,
    client_name,
    stylist_id,
    stylist_name,
    service_name: service.name,
    category: service.category,
    price: service.basePrice,
    duration: service.baseDuration,
    start,
    end,
    created_at: new Date().toISOString(),
      }
    ]);

  if (error) {
    console.error("Error saving retained booking:", error.message);
    throw new Error(error.message);
  }

  return data;
}
