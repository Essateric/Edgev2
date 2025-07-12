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
  logged_by, // pass staff UUID if available
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

    // Only use a real UUID for logged_by. Never "Unknown" string!
    let staffLogger = logged_by && logged_by !== "Unknown" ? logged_by : null;

    // If not provided, try from Supabase Auth
    if (!staffLogger) {
      const { data: { user } = {} } = await supabase.auth.getUser();

      if (user && user.id) {
        // Try to get the staff.id (UUID) using the auth_id mapping
        const { data: staffMatch } = await supabase
          .from("staff")
          .select("id")
          .eq("auth_id", user.id)
          .single();

        if (staffMatch && staffMatch.id) {
          staffLogger = staffMatch.id;
        } else {
          // Fallback to Supabase auth user.id (still a UUID)
          staffLogger = user.id;
        }
      }
    }

    // If still no UUID, set as null (never "Unknown")
    if (!staffLogger) {
      staffLogger = null;
    }

    const logPayload = {
      action,
      booking_id,
      snapshot,
      reason,
      logged_by: staffLogger, // UUID or null (never "Unknown" string!)
      created_at: new Date().toISOString(),
    };

    console.log("📦 Booking log payload:", logPayload);

    const { error: insertError } = await supabase
      .from("booking_logs")
      .insert([logPayload]);

    if (insertError) throw insertError;
  } catch (err) {
    console.error("❌ SaveBookingsLog failed:", err.message);
    console.log("🔍 booking_id was:", booking_id);
    throw err;
  }
}
