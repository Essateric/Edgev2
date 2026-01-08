// Time + money helpers
export const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
export const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
export const endOfDay   = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
export const addMinutes = (date, mins) => { const d = new Date(date); d.setMinutes(d.getMinutes() + mins); return d; };
export const fmtTime    = (d) => { const h = d.getHours(); const m = d.getMinutes(); const hh = ((h + 11) % 12) + 1; return `${hh}:${pad(m)} ${h < 12 ? "AM" : "PM"}`; };
export const money      = (v) => (v == null || isNaN(Number(v)) ? "" : `£${Number(v).toFixed(2)}`);

// Overlap utils
export const rangesOverlap = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;

// Robust weekly hours parser (unchanged)
export function getWindowsForWeekday(weekly_hours, weekday) {
  if (!weekly_hours) return [];
  let wh = weekly_hours;
  if (typeof wh === "string") { try { wh = JSON.parse(wh); } catch { return []; } }

  const keys = [
    String(weekday),
    ["sun","mon","tue","wed","thu","fri","sat"][weekday],
    ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][weekday],
  ];
  let raw = null;
  for (const k of keys) {
    if (wh[k] != null) { raw = wh[k]; break; }
    const found = Object.keys(wh).find((kk) => kk.toLowerCase() === k);
    if (found) { raw = wh[found]; break; }
  }
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((w) => {
      if (!w?.start || !w?.end) return null;
      const norm = (s) => {
        const [hh, mm] = String(s).split(":").map(Number);
        return `${pad(isFinite(hh) ? hh : 0)}:${pad(isFinite(mm) ? mm : 0)}`;
      };
      return { start: norm(w.start), end: norm(w.end) };
    })
    .filter(Boolean);
}

// Slot builder (unchanged)
export function buildSlotsFromWindows(date, windows, stepMins, durationMins) {
  const out = [];
  for (const w of windows) {
    const [sh, sm] = String(w.start).split(":").map(Number);
    const [eh, em] = String(w.end).split(":").map(Number);
    const wStart = new Date(date); wStart.setHours(sh||0, sm||0, 0, 0);
    const wEnd   = new Date(date); wEnd.setHours(eh||0, em||0, 0, 0);
    for (let t = new Date(wStart); addMinutes(t, durationMins) <= wEnd; t = addMinutes(t, stepMins)) {
      const sEnd = addMinutes(t, durationMins);
      if (sEnd <= wEnd) out.push(new Date(t));
    }
  }
  return out;
}

// Month planner helper (unchanged)
export function monthDays(viewDate) {
  const y = viewDate.getFullYear(), m = viewDate.getMonth();
  const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
  const days = [];
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) days.push(new Date(d));
  return days;
}

/* ------------------------------------------------------------------ */
/* NEW: Money display with TBA when price is 0                        */
/* ------------------------------------------------------------------ */
export const moneyOrTBA = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return "TBA";
  return `£${n.toFixed(2)}`;
};

/* ------------------------------------------------------------------ */
/* NEW: Per-stylist price/duration override                           */
/* Looks up an override in staffServiceOverrides for the given staff. */
/* Falls back to service.base_price & service.base_duration.          */
/* ------------------------------------------------------------------ */
export function getEffectivePriceAndDuration(
  service,
  staffServiceOverrides = [],
  staffId = null
) {
  let price = service?.base_price ?? null;
  let duration = service?.base_duration ?? null;
  const baseDuration = Number(service?.base_duration ?? 0);

  if (!service?.id || !staffId || !Array.isArray(staffServiceOverrides)) {
    return { price, duration };
  }

  // Accept common field name variants just in case
  const ov = staffServiceOverrides.find((o) => {
    const oStaff = o.staff_id ?? o.staffId ?? o.employee_id ?? o.employeeId;
    const oSvc   = o.service_id ?? o.serviceId ?? o.svc_id ?? o.svcId;
    return oStaff === staffId && oSvc === service.id;
  });

  if (ov) {
    const candPrice = Number(
      ov.price ?? ov.override_price ?? ov.base_price ?? ov.cost
    );
    const candDuration = Number(
      ov.duration ?? ov.minutes ?? ov.override_duration ?? ov.base_duration
    );
    if (Number.isFinite(candPrice)) price = candPrice;
    if (Number.isFinite(candDuration) && candDuration > 0) {
      duration = candDuration;
    } else if (Number.isFinite(baseDuration)) {
      duration = baseDuration;
    }
  }

  return { price, duration };
}
