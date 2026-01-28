// src/lib/checkRescheduleAvailability.js

/* ===== Gap after chemical services ===== */
const DEFAULT_CHEMICAL_GAP_MIN = 30;

const isChemical = (service) => {
  const text = [service?.name, service?.title, service?.category]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const keywords = [
    "tint",
    "colour",
    "color",
    "bleach",
    "toner",
    "gloss",
    "highlights",
    "balayage",
    "foils",
    "perm",
    "relaxer",
    "keratin",
    "chemical",
    "straightening",
  ];

  return keywords.some((k) => text.includes(k));
};

const getDurationMins = (row, basketItem) => {
  return Math.max(
    1,
    Number(row?.duration ?? basketItem?.displayDuration ?? basketItem?.duration ?? 0)
  );
};

const buildOverlapOr = (slots) => {
  // overlaps if: existing.start < newEnd AND existing.end > newStart
  // PostgREST OR format: 'and(a.lt.x,b.gt.y),and(a.lt.x2,b.gt.y2)'
  return slots
    .map(
      (s) => `and(start.lt."${s.endISO}",end.gt."${s.startISO}")`
    )
    .join(",");
};

const toInList = (ids) => {
  // PostgREST expects: ( "id1","id2" )
  const safe = (ids || []).filter(Boolean);
  if (!safe.length) return null;
  return `(${safe.map((id) => `"${id}"`).join(",")})`;
};

/**
 * Checks if the new rescheduled time slots overlap any OTHER bookings for the same stylist.
 *
 * Returns: { ok: true } OR { ok: false, message, conflict? }
 */
export async function checkRescheduleAvailability({
  db,
  staffId,
  startDate,
  orderedRows,
  basket,
  chemicalGapMin = DEFAULT_CHEMICAL_GAP_MIN,
}) {
  if (!db) return { ok: false, message: "No database client." };
  if (!staffId) return { ok: false, message: "Pick a stylist." };
  if (!startDate || !(startDate instanceof Date) || isNaN(startDate.getTime())) {
    return { ok: false, message: "Pick a valid new date/time." };
  }
  if (!Array.isArray(orderedRows) || orderedRows.length === 0) {
    return { ok: false, message: "No booking rows found to reschedule." };
  }

  // 1) Compute the exact slots you are ABOUT to write (same timing logic as your modal)
  const slots = [];
  let currentStart = new Date(startDate);

  for (let i = 0; i < orderedRows.length; i++) {
    const row = orderedRows[i];
    const basketItem = basket?.[i];

    const durationMins = getDurationMins(row, basketItem);

    const startISO = currentStart.toISOString();
    const currentEnd = new Date(currentStart.getTime() + durationMins * 60000);
    const endISO = currentEnd.toISOString();

    slots.push({ startISO, endISO });

    const serviceForGap =
      basketItem ?? { name: row?.title, title: row?.title, category: row?.category };

    currentStart = isChemical(serviceForGap)
      ? new Date(currentEnd.getTime() + chemicalGapMin * 60000)
      : new Date(currentEnd);
  }

  // 2) Query for ANY overlapping bookings for that stylist (excluding the rows we’re moving)
  const excludeIds = orderedRows.map((r) => r?.id).filter(Boolean);
  const inList = toInList(excludeIds);
  const orExpr = buildOverlapOr(slots);

  let q = db
    .from("bookings")
    .select("id,start,end,resource_id")
    .eq("resource_id", staffId)
    .or(orExpr)
    .limit(1);

  if (inList) q = q.not("id", "in", inList);

  const { data, error } = await q;
  if (error) throw error;

  if (data?.length) {
    return {
      ok: false,
      message: "That time isn’t available for this stylist. Please pick another slot.",
      conflict: data[0],
    };
  }

  return { ok: true };
}
