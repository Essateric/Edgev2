// scripts/hashAndSavePin.js
import bcrypt from 'bcryptjs';
import { supabase } from '../supabaseClient.js'; // adjust the path if needed

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
hashAndSavePin("a1b521c2-aff9-471d-a5fb-33f8f6d9687a", "2108"); // Replace with actual ID + PIN
hashAndSavePin("a8b80070-b1ea-4c89-b2ac-ab93ad163316", "1978"); // Replace with actual ID + PIN
