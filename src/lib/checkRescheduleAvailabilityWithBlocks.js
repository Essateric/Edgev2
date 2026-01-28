// src/lib/checkRescheduleAvailabilityWithBlocks.js

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

const toInList = (ids) => {
  const safe = (ids || []).filter(Boolean);
  if (!safe.length) return null;
  return `(${safe.map((id) => `"${id}"`).join(",")})`;
};

const buildSlots = ({ startDate, orderedRows, basket, chemicalGapMin }) => {
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

  return slots;
};

// overlaps if: existing.start < newEnd AND existing.end > newStart
const buildOverlapOr = (slots) => {
  return slots
    .map((s) => `and(start.lt."${s.endISO}",end.gt."${s.startISO}")`)
    .join(",");
};

// Same overlap, but also checks staff column and optional "global blocks" (null staff)
const buildOverlapOrWithStaff = (slots, staffCol, staffId, includeGlobal = true) => {
  const groups = [];

  for (const s of slots) {
    groups.push(
      `and(${staffCol}.eq."${staffId}",start.lt."${s.endISO}",end.gt."${s.startISO}")`
    );

    if (includeGlobal) {
      groups.push(
        `and(${staffCol}.is.null,start.lt."${s.endISO}",end.gt."${s.startISO}")`
      );
    }
  }

  return groups.join(",");
};

const isMissingColumnError = (err) => {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("column");
};

/**
 * Checks:
 * 1) Overlapping BOOKINGS for the stylist (excluding the bookings being moved)
 * 2) Overlapping SCHEDULE_BLOCKS (locked blocks / active blocks)
 *
 * Returns { ok: true } or { ok: false, message, conflict? }
 */
export async function checkRescheduleAvailabilityWithBlocks({
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

  const slots = buildSlots({ startDate, orderedRows, basket, chemicalGapMin });

  // ---------- 1) BOOKINGS overlap ----------
  const excludeIds = orderedRows.map((r) => r?.id).filter(Boolean);
  const inList = toInList(excludeIds);
  const orExprBookings = buildOverlapOr(slots);

  let qb = db
    .from("bookings")
    .select("id,start,end,resource_id")
    .eq("resource_id", staffId)
    .or(orExprBookings)
    .limit(1);

  if (inList) qb = qb.not("id", "in", inList);

  const { data: bookingHits, error: bookingErr } = await qb;
  if (bookingErr) throw bookingErr;

  if (bookingHits?.length) {
    return {
      ok: false,
      message: "That time isn’t available for this stylist (booking conflict).",
      conflict: bookingHits[0],
    };
  }

  // ---------- 2) SCHEDULE_BLOCKS overlap ----------
  // Your RLS allows SELECT only where is_active = true (via public policy),
  // so we check only active blocks (which is exactly what you want to block bookings).
  const tryBlocksQuery = async (staffCol) => {
    const orExprBlocks = buildOverlapOrWithStaff(slots, staffCol, staffId, true);

    const { data, error } = await db
      .from("schedule_blocks")
      .select("id,start,end,is_locked,is_active")
      .eq("is_active", true)
      .or(orExprBlocks)
      .limit(1);

    return { data, error };
  };

  // Try common column name first: resource_id
  let blocksRes = await tryBlocksQuery("resource_id");

  // If their schedule_blocks uses staff_id instead, fallback
  if (blocksRes.error && isMissingColumnError(blocksRes.error)) {
    blocksRes = await tryBlocksQuery("staff_id");
  }

  if (blocksRes.error) throw blocksRes.error;

  if (blocksRes.data?.length) {
    return {
      ok: false,
      message: "That time is blocked (schedule block). Pick another slot.",
      conflict: blocksRes.data[0],
    };
  }

  return { ok: true };
}
