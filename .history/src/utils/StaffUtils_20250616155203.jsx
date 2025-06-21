// utils/staffUtils.js
import bcrypt from "bcryptjs";
import { supabase } from "../supabaseClient";

// Save or update staff member
export async function saveStaff(form, editingId) {
  const pinHash = form.pin
    ? bcrypt.hashSync(form.pin, 10)
    : undefined;

  const staffData = {
    name: form.name,
    email: form.email,
    weekly_hours: form.weeklyHours,
    services: form.services,
    ...(pinHash && { pin_hash: pinHash }),
  };

  if (editingId) {
    const { error } = await supabase
      .from("staff")
      .update(staffData)
      .eq("id", editingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("staff").insert([staffData]);
    if (error) throw error;
  }
}
