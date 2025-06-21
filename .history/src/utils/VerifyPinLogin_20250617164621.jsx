import bcrypt from 'bcryptjs';
import { supabase } from '../supabaseClient';

export async function verifyPinLogin(pin) {
  const { data: staffList, error } = await supabase.from('staff').select('*');

  if (error || !staffList) {
    console.error("❌ Error fetching staff list:", error);
    return null;
  }

  console.log("👥 Staff count:", staffList.length);

  for (const staff of staffList) {
    console.log("🔍 Checking:", staff.name || staff.id);
    const isMatch = await bcrypt.compare(pin, staff.pin_hash);
    console.log("➡️ Comparing", pin, "with", staff.pin_hash, "→", isMatch);
    if (isMatch) {
      console.log("✅ Matched with", staff.name || staff.id);
      return staff;
    }
  }

  console.warn("❌ No match found for PIN:", pin);
  return null;
}
