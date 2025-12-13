// src/utils/fetchAndCachePins.js
import { supabase } from '../supabaseClient';
import { saveStaffPins } from '.PinCache';

export async function syncPinsFromSupabase() {
  const { data, error } = await supabase
    .from('staff')
    .select('id, name, role, pin');

  if (error) {
    console.error('Failed to fetch PINs:', error);
    return;
  }

  await saveStaffPins(data);
}
