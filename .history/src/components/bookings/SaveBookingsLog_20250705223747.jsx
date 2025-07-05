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
  try {
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
        booking_id,
        snapshot,
        created_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      throw error;
    }
  } catch (err) {
    console.error("❌ SaveBookingsLog failed:", err.message);
    console.log("🔍 booking_id was:", booking_id);
    throw err;
  }
}
