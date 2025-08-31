import { supabase } from "../../supabaseClient.js";

// ...imports unchanged...

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
  logged_by,          // pass staff UUID if available
  reason,
  skipStaffLookup = false, // <-- NEW: let callers disable staff table lookups
}) {
  try {
    const { name: service_name, category, price, duration } = service || {};

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

    // Only use a real UUID for logged_by. Never "Unknown" string.
    let staffLogger = logged_by && logged_by !== "Unknown" ? logged_by : null;

       // Public site logs shouldn't try to resolve staff; keep null
   if (!staffLogger && String(reason || "").toLowerCase().includes("online booking")) {
     staffLogger = null;
   }

    // ⛔ Skip staff lookups when requested (public site)
    if (!skipStaffLookup && !staffLogger) {
      const { data: { user } = {} } = await supabase.auth.getUser();

      if (user?.id) {
        // 1) Prefer staff.uid === auth user.id
        const byUid = await supabase
          .from("staff")
          .select("id")
          .eq('"UID"', user.id)
          .maybeSingle();

        if (!byUid.error && byUid.data?.id) {
          staffLogger = byUid.data.id;
        } else if (user.email) {
          // 2) Fallback by email
          const byEmail = await supabase
            .from("staff")
            .select("id")
            .eq("email", user.email)
            .maybeSingle();

          if (!byEmail.error && byEmail.data?.id) {
            staffLogger = byEmail.data.id;
          } else {
            // 3) Last resort: auth UID itself
            staffLogger = user.id;
          }
        } else {
          staffLogger = user.id;
        }
      }
    }

    const logPayload = {
      action,
      booking_id,
      snapshot,
      reason,
      logged_by: staffLogger ?? null, // UUID or null
      created_at: new Date().toISOString(),
    };

    console.log("📦 Booking log payload:", logPayload);

    const { error: insertError } = await supabase
      .from("booking_logs")
      .insert([logPayload]);

    if (insertError) throw insertError;
  } catch (err) {
    console.error("❌ SaveBookingsLog failed:", err?.message || err);
    console.log("🔍 booking_id was:", booking_id);
    throw err;
  }
}
