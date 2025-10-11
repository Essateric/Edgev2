// src/config/brand.js
// Centralised brand config with resilient fallbacks for both name and palette.

// ---- Defaults (safe to ship) ----
const DEFAULT_PALETTE = {
  // toast / accent colours
  successBg:  "#052e1c",  // deep green background
  successEdge:"#22c55e",  // green edge
  successText:"#ffffff",
  errorBg:    "#2e0b0b",  // deep red background
  errorEdge:  "#ef4444",  // red edge
  errorText:  "#ffffff",
};

// Keys we recognise for a palette (prevents unexpected props from leaking in)
const PALETTE_KEYS = Object.keys(DEFAULT_PALETTE);

// ---- Brand NAME resolution (string) ----
export const BRAND_NAME =
  // optional globals
  (typeof window !== "undefined" && (window.BRAND_NAME || window.BRAND?.name)) ||
  // build-time envs
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_BRAND) ||
  (typeof process !== "undefined" && process.env?.REACT_APP_BRAND) ||
  // final fallback
  "The Edge";

// ---- Brand PALETTE resolution (object) ----
function coercePalette(source) {
  if (!source || typeof source !== "object") return { ...DEFAULT_PALETTE };

  // Allow window.BRAND.colors or window.BRAND itself to be the palette
  const maybe = source.colors && typeof source.colors === "object" ? source.colors : source;

  // Pick only known keys and merge over defaults for safety
  const picked = {};
  for (const k of PALETTE_KEYS) {
    picked[k] = typeof maybe[k] === "string" && maybe[k] ? maybe[k] : DEFAULT_PALETTE[k];
  }
  return picked;
}

const GLOBAL_BRAND =
  (typeof window !== "undefined" && window.BRAND) ||
  null;

// Exported palette object (backwards-compatible: code can do BRAND.successBg, etc.)
export const BRAND = coercePalette(GLOBAL_BRAND);

// Optional: single object if you ever want both together (non-breaking extra)
export const BRAND_FULL = { name: BRAND_NAME, ...BRAND };

// (No default export to encourage named imports and avoid tree-shaking surprises)
