// src/onlinebookings/api.js
import { supabase } from "../supabaseClient";

export async function safeInsertBookings(rows) {
  const cleanRows = (Array.isArray(rows) ? rows : []).map((r) =>
    Object.fromEntries(Object.entries(r || {}).filter(([, v]) => v !== undefined))
  );

  const { data, error } = await supabase.rpc("public_create_booking_multi", {
    p_rows: cleanRows,
  });

  if (error) {
    console.error("[public_create_booking_multi] FAILED", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw error;
  }

  return data ?? [];
}
