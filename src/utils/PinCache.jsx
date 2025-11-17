// src/utils/pinCache.js

import bcrypt from "bcryptjs";
import supabase from "../supabaseClient"; // ✅ default export

// Single localStorage key used across app
const CACHE_KEY = "cachedStaffPins";

/**
 * Get cached staff (for offline PIN checks).
 * Shape: [{ id, name, email, permission, pin_hash }]
 */
export async function getStaffPins() {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    // defensive sanitize
    if (!Array.isArray(parsed)) return [];
    return parsed.map((s) => ({
      id: s.id ?? null,
      name: s.name ?? "",
      email: s.email ?? null,
      permission: String(s.permission ?? "staff").toLowerCase(),
      pin_hash: s.pin_hash ?? null,
    }));
  } catch {
    return [];
  }
}

/**
 * Cache staff list for offline PIN login.
 * Accepts rows from DB; stores only safe fields + pin_hash (no plaintext pins).
 */
export async function cacheStaffPins(staffList) {
  const safe = (Array.isArray(staffList) ? staffList : []).map((s) => ({
    id: s.id ?? null,
    name: s.name ?? "",
    email: s.email ?? null,
    permission: String(s.permission ?? "staff").toLowerCase(),
    pin_hash: s.pin_hash ?? null,
  }));
  localStorage.setItem(CACHE_KEY, JSON.stringify(safe));
}

/**
 * Online verification helper (when you want to check against live DB).
 * Returns the matched staff row (normalized) or null.
 */
export const verifyPinLogin = async (pin) => {
  // Pull the minimal fields we need; matches your schema
  const { data: staffList, error } = await supabase
    .from("staff")
    .select("id, name, email, permission, pin_hash");

  if (error || !staffList) {
    console.error("❌ Error fetching staff list:", error);
    return null;
  }

  // Prefer sync compare in a small loop for browser simplicity
  for (const staff of staffList) {
    if (!staff?.pin_hash) continue;
    const isMatch = bcrypt.compareSync(pin, staff.pin_hash);
    if (isMatch) {
      return {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        permission: String(staff.permission ?? "staff").toLowerCase(),
        pin_hash: staff.pin_hash,
      };
    }
  }

  return null;
};
