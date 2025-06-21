import bcrypt from "bcryptjs";
import { supabase } from "../supabaseClient";

export async function verifyPinLogin(pin) {
  const { data: staffList, error } = await supabase
    .from("staff")
    .select("*");

  if (error) throw error;

  const matched = staffList.find((staff) =>
    bcrypt.compareSync(pin, staff.pin_hash)
  );

  return matched || null;
}
