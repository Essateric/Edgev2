import { supabase } from "../supabaseClient";

const CHEMICAL_CATEGORIES = ["Highlights", "Tints", "Treatments"];

export default async function SaveRetainedBooking({ clientId, clientName, stylistId, stylistName, service, start, end }) {
  const { data, error } = await supabase
    .from('retained_bookings') // Your Supabase table
    .insert([
      {
       clientId,
    clientName,
    stylistId,
    stylistName,
    serviceName: service.name,
    category: service.category,
    price: service.basePrice,
    duration: service.baseDuration,
    start,
    end,
    createdAt: new Date().toISOString(),
      }
    ]);

  if (error) {
    console.error("Error saving retained booking:", error.message);
    throw new Error(error.message);
  }

  return data;
}
