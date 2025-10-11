import { format } from "date-fns";

export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
export const setHMS = (d, h, m, s = 0, ms = 0) => { const x = new Date(d); x.setHours(h, m, s, ms); return x; };
export const clampDayInMonth = (y, m, day) => Math.min(day, daysInMonth(y, m));
export const addMonthsPreserveDay = (base, add, dayOverride = null) => {
  const y = base.getFullYear(); const m = base.getMonth(); const d = dayOverride ?? base.getDate();
  const targetY = y + Math.floor((m + add) / 12); const targetM = (m + add) % 12;
  const dd = clampDayInMonth(targetY, targetM, d);
  const res = new Date(base); res.setFullYear(targetY, targetM, dd); return res;
};
export const addYearsPreserveDay = (base, years) => {
  const y = base.getFullYear() + years; const m = base.getMonth();
  const d = clampDayInMonth(y, m, base.getDate()); const res = new Date(base);
  res.setFullYear(y, m, d); return res;
};
export const toLocalSQL = (d) => format(d, "yyyy-MM-dd HH:mm:ss");
export const asLocalDate = (v) => {
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const s = v.includes("T") ? v : v.replace(" ", "T");
    return new Date(s);
  }
  return new Date(v);
};
export const isProcessingRow = (row) => {
  const cat = String(row?.category || "").toLowerCase();
  const title = String(row?.title || "").toLowerCase();
  return cat === "processing" || title.includes("processing time");
};
