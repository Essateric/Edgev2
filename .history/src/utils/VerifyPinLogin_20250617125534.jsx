import bcrypt from "bcryptjs";
import { supabase } from "../supabaseClient";

export async function verifyPinLogin(pin) {
  const { data: staffList, error } = await supabase
    .from("staff")
    .select("id, name, role, pin_hash");

  if (error) throw error;

  const matched = staffList.find((staff) => {
    const { pin_hash } = staff;
    return typeof pin_hash === "string" && bcrypt.compareSync(pin, pin_hash);
  });

  return matched || null;
}
