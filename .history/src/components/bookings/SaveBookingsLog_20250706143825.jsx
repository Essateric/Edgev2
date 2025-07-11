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
  reason = "Created from calendar", // Optional, default fallback
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

    // 🔐 Get current Supabase user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let logged_by = "Unknown";

    if (user?.id) {
      const { data: staffMatch, error } = await supabase
        .from("staff")
        .select("name")
        .eq("auth_id", user.id)
        .single();

      if (staffMatch?.name) {
        logged_by = staffMatch.name;
      } else {
        logged_by = user.email ?? "Unknown";
      }
    }

    console.log("📦 Booking log payload:", {
      action,
      booking_id,
      snapshot,
      reason,
      logged_by,
      created_at: new Date().toISOString(),
    });

    const { error: insertError } = await supabase.from("booking_logs").insert([
      {
        action,
        booking_id,
        snapshot,
        reason,
        logged_by,
        created_at: new Date().toISOString(),
      },
    ]);

    if (insertError) {
      throw insertError;
    }
  } catch (err) {
    console.error("❌ SaveBookingsLog failed:", err.message);
    console.log("🔍 booking_id was:", booking_id);
    throw err;
  }
}
