// src/onlinebookings/helpers.js

// very simple email check + common gmail typo guard
export function isValidEmail(s) {
  if (!s) return false;
  const e = String(s).trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  if (!ok) return false;
  const typos = ["gmail.c", "gmail.co", "gmail.con", "gmail.coom", "gmail.cc"];
  if (typos.some((t) => e.endsWith(`@${t}`))) return false;
  return true;
}

export const uniqById = (arr) => {
  const seen = new Set();
  return arr.filter((x) => {
    if (!x?.id || seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
};

// chemical if DB flag set OR category contains "treat" (Treatments)
export const isChemicalService = (svc) => {
  const cat = String(svc?.category || "").toLowerCase();
  return Boolean(svc?.is_chemical) || cat.includes("treat");
};

export const minsToLabel = (total) => {
  const d = Number(total) || 0;
  if (!d) return "—";
  const h = Math.floor(d / 60);
  const m = d % 60;
  return `${h ? `${h}h ` : ""}${m || (!h ? d : 0)}m`;
};

// Optional—kept for parity even if unused right now
export function normalizeServiceIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s.startsWith("[") && s.endsWith("]")) {
      try {
        const arr = JSON.parse(s);
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    }
    if (s.includes(",")) return s.split(",").map((x) => x.trim()).filter(Boolean);
    return [s];
  }
  return [raw];
}
