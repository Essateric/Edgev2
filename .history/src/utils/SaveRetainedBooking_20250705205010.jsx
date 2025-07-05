import { supabase } from "../supabaseClient";

export default async function SaveRetainedBookingFromBookingId(booking_id, stylistList = []) {
  if (!booking_id) {
    throw new Error("Missing booking ID");
  }

  // Step 1: Get all services in the booking group
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('booking_id', booking_id);

  if (error) {
    console.error("Failed to fetch bookings:", error.message);
    throw new Error(error.message);
  }

  // Step 2: Format data for retained_bookings
  const retainedRows = bookings.map(b => ({
    client_id: b.client_id,
    client_name: b.client_name,
    stylist_id: b.resource_id,
    stylist_name: stylistList.find(s => s.id === b.resource_id)?.title || "Unknown",
    service_name: b.title,
    category: b.category,
    price: b.price,
    duration: b.duration,
    start: b.start,
    end: b.end,
    created_at: new Date().toISOString(),
  }));

  // Step 3: Insert into retained_bookings
  const { error: insertError } = await supabase
    .from('retained_bookings')
    .insert(retainedRows);

  if (insertError) {
    console.error("Failed to insert into retained_bookings:", insertError.message);
    throw new Error(insertError.message);
  }

  return retainedRows;
}
