import bcrypt from 'bcryptjs';
import { supabase } from '../supabaseClient';

export const verifyPinLogin = async (pin) => {
  const { data: staffList, error } = await supabase
    .from('staff')
   .select('id, name, permission, pin_hash, is_active')
    .or('is_active.is.null,is_active.eq.true');

  if (error || !staffList) {
    console.error("❌ Error fetching staff list:", error);
    return null;
  }

  for (let staff of staffList) {
     if (staff.is_active === false) continue;
    if (!staff.pin_hash) continue;
    const isMatch = await bcrypt.compare(pin, staff.pin_hash);
    if (isMatch) return staff;
  }

  return null;
};
