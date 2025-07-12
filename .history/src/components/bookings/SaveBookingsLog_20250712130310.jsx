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

    // Use logged_by if passed, else try Supabase Auth
    let staffLogger = logged_by || null;

    if (!staffLogger) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && user.id) {
        const { data: staffMatch } = await supabase
          .from("staff")
          .select("id")
          .eq("auth_id", user.id)
          .single();

        if (staffMatch && staffMatch.id) {
          staffLogger = staffMatch.id;
        } else {
          staffLogger = user.id;
        }
      }
    }

    // If still no UUID, set as null. Do not use "Unknown"
    if (!staffLogger) {
      staffLogger = null;
    }

    const logPayload = {
      action,
      booking_id,
      snapshot,
      reason,
      logged_by: staffLogger, // This is now null or UUID
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
