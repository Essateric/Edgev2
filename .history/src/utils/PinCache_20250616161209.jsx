// src/utils/pinCache.js

// Get cached staff PINs from localStorage
export async function getStaffPins() {
  const raw = localStorage.getItem('cachedStaff');
  if (!raw) return [];

  try {
    return JSON.parse(raw); // [{ id, name, pin, role }]
  } catch {
    return [];
  }
}

// Save staff PINs to localStorage
export async function cacheStaffPins(staffList) {
  // staffList: [{ id, name, role, pin }]
  localStorage.setItem('cachedStaff', JSON.stringify(staffList));
}
