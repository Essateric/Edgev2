// src/onlinebookings/api.js
import { supabase } from "../supabaseClient";

// Insert via RPC (no read-after-insert)
export async function safeInsertBookings(rows) {
  const { error } = await supabase.rpc("public_create_booking_multi", {
    p_rows: rows,
  });
  if (error) throw error;
  return [];
}
