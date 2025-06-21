// src/utils/pinCache.js
import { set, get, del } from 'idb-keyval';

const CACHE_KEY = 'supabaseStaffPins';

export async function saveStaffPins(pinData) {
  return await set(CACHE_KEY, pinData);
}

export async function getStaffPins() {
  return (await get(CACHE_KEY)) || [];
}

export async function clearStaffPins() {
  return await del(CACHE_KEY);
}
