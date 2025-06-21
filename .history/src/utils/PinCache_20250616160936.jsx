// src/utils/pinCache.js
import { set, get, del } from 'idb-keyval';

const CACHE_KEY = 'supabaseStaffPins';

export async function saveStaffPins(pinData) {
  return await set(CACHE_KEY, pinData);
}

export async function getStaffPins() {
  return (await get(CACHE_KEY)) || [];
}

// src/utils/pinCache.js

export async function getStaffPins() {
  const raw = localStorage.getItem('cachedStaff');
  if (!raw) return [];

  try {
    return JSON.parse(raw); // [{ id, name, pin, role }]
  } catch {
    return [];
  }
}

export async function cacheStaffPins(staffList) {
  // staffList: [{ id, name, role, pin }]
  localStorage.setItem('cachedStaff', JSON.stringify(staffList));
}
