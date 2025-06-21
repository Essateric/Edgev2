// scripts/hashAndSavePin.js
import bcrypt from 'bcryptjs';
import { supabase } from '../supabaseClient'; // adjust the path if needed

export async function hashAndSavePin(staffId, plainPin) {
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(plainPin, salt);

  const { error } = await supabase
    .from('staff')
    .update({ pin_hash: hash })
    .eq('id', staffId);

  if (error) {
    console.error('❌ Error updating pin_hash:', error.message);
  } else {
    console.log(`✅ PIN for ${staffId} hashed and saved.`);
  }
}

// Example usage (only run when needed)
hashAndSavePin("AHJL50iVvVzzSP1NxZze", "1978"); // Replace with actual ID + PIN
