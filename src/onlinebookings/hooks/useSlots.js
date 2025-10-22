// src/onlinebookings/hooks/useSlots.js
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { MIN_NOTICE_HOURS } from "../config";

/**
 * Inputs:
 *  - selectedServices: Service[]
 *  - selectedProvider: { id, weekly_hours? } | null
 *  - selectedDate: Date | string | null
 *  - timeline: [{ offsetMin, duration, svc }]
 *
 * Returns:
 *  - viewDate, setViewDate
 *  - availableSlots: Date[]
 *  - slotsLoading: boolean
 *  - recomputeFor: null
 */

/* ---------- Utilities ---------- */
const TITLE_KEYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const LONG_KEYS  = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const SHORT_KEYS = ["sun","mon","tue","wed","thu","fri","sat"];

function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseHHMM(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return null;
  const [h, m] = hhmm.split(":").map(n => Number(n || 0));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { h, m };
}

/** Robustly fetch a day's plan from various weekly_hours shapes */
function getDayPlan(weekly_hours, weekdayIndex) {
  if (!weekly_hours || typeof weekly_hours !== "object") return null;

  // 1) Title-Case keys (e.g. "Sunday")
  const title = weekly_hours[TITLE_KEYS[weekdayIndex]];
  if (title) return title;

  // 2) long lowercase keys (e.g. "sunday")
  const long = weekly_hours[LONG_KEYS[weekdayIndex]];
  if (long) return long;

  // 3) short keys (e.g. "sun")
  const short = weekly_hours[SHORT_KEYS[weekdayIndex]];
  if (short) return short;

  // 4) array shape
  if (Array.isArray(weekly_hours)) return weekly_hours[weekdayIndex] || null;

  return null;
}

export default function useSlots({
  selectedServices = [],
  selectedProvider = null,
  selectedDate = null,
  timeline = [],
}) {
  // Start calendar at (now + MIN_NOTICE_HOURS) and align to local day
  const [viewDate, setViewDate] = useState(() => {
    const minStart = new Date(Date.now() + MIN_NOTICE_HOURS * 3600 * 1000);
    return startOfLocalDay(minStart);
  });

  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const providerId = selectedProvider?.id || null;

  // Encode selected services to a stable key
  const svcKey = useMemo(
    () => selectedServices.map((s) => s?.id).filter(Boolean).join(","),
    [selectedServices]
  );

  // Encode timeline to a stable key
  const timelineKey = useMemo(
    () =>
      (Array.isArray(timeline) ? timeline : [])
        .map(
          (seg) =>
            `${Number(seg?.offsetMin) || 0}:${Number(seg?.duration) || 0}:${
              seg?.svc?.id || ""
            }`
        )
        .join("|"),
    [timeline]
  );

  // Normalize selectedDate to local day
  const selectedDay = useMemo(() => {
    if (!selectedDate) return null;
    const d = selectedDate instanceof Date ? selectedDate : new Date(selectedDate);
    return startOfLocalDay(d);
  }, [selectedDate]);

  // Total block length (minutes) = last (offset + duration). Default 30 like original page.
  const totalBlockMinutes = useMemo(() => {
    const t = Array.isArray(timeline) ? timeline : [];
    let maxEnd = 0;
    for (const seg of t) {
      const off = Number(seg?.offsetMin) || 0;
      const dur = Number(seg?.duration) || 0;
      if (off + dur > maxEnd) maxEnd = off + dur;
    }
    return maxEnd || 30;
  }, [timelineKey]);

  useEffect(() => {
    // Guards
    if (!providerId || !svcKey || !timelineKey || !selectedDay) {
      setAvailableSlots((prev) => (prev.length ? [] : prev));
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setSlotsLoading(true);

        /* ---------- 1) Opening window for the weekday ---------- */
        const weekday = selectedDay.getDay(); // 0=Sun..6=Sat
        const plan = getDayPlan(selectedProvider?.weekly_hours, weekday);

        // If no plan or explicitly off, no slots
        if (!plan || plan.off) {
          if (!cancelled) setAvailableSlots([]);
          return;
        }

        const startParsed = parseHHMM(plan.start);
        const endParsed = parseHHMM(plan.end);
        if (!startParsed || !endParsed) {
          if (!cancelled) setAvailableSlots([]);
          return;
        }

        const dayOpen = new Date(
          selectedDay.getFullYear(),
          selectedDay.getMonth(),
          selectedDay.getDate(),
          startParsed.h,
          startParsed.m,
          0,
          0
        );
        const dayClose = new Date(
          selectedDay.getFullYear(),
          selectedDay.getMonth(),
          selectedDay.getDate(),
          endParsed.h,
          endParsed.m,
          0,
          0
        );

        // Must have room for the block inside opening hours
        const lastPossibleStart = new Date(dayClose.getTime() - totalBlockMinutes * 60000);
        if (!(lastPossibleStart >= dayOpen)) {
          if (!cancelled) setAvailableSlots([]);
          return;
        }

        /* ---------- 2) Busy spans for the day ---------- */
        const dayStartISO = new Date(selectedDay.getTime()).toISOString();
        const dayEndISO = new Date(
          selectedDay.getFullYear(),
          selectedDay.getMonth(),
          selectedDay.getDate(),
          23,
          59,
          59,
          999
        ).toISOString();

        const { data: dayBookings, error: dayErr } = await supabase.rpc(
          "public_get_booked_spans",
          { p_staff: providerId, p_start: dayStartISO, p_end: dayEndISO }
        );
        if (dayErr) throw dayErr;

        const busy = (dayBookings || []).map((b) => ({
          start: new Date(b.start),
          end: new Date(b.end),
        }));

        /* ---------- 3) Build the 15-min grid & filter ---------- */
        const minStart = new Date(Date.now() + MIN_NOTICE_HOURS * 3600 * 1000);
        const gridMinutes = 15;

        const overlaps = (aStart, aEnd, bStart, bEnd) =>
          aStart < bEnd && aEnd > bStart;

        const blockFits = (start) => {
          const end = new Date(start.getTime() + totalBlockMinutes * 60000);
          if (start < minStart) return false; // min notice
          if (end > dayClose) return false;   // must finish before close
          for (const b of busy) {
            if (overlaps(start, end, b.start, b.end)) return false;
          }
          return true;
        };

        const next = [];
        for (
          let t = new Date(dayOpen);
          t <= lastPossibleStart;
          t = new Date(t.getTime() + gridMinutes * 60000)
        ) {
          if (blockFits(t)) next.push(new Date(t));
        }

        if (cancelled) return;

        // Only update if changed to avoid extra renders
        setAvailableSlots((prev) => {
          if (prev.length === next.length) {
            let same = true;
            for (let i = 0; i < prev.length; i++) {
              if (+prev[i] !== +next[i]) {
                same = false;
                break;
              }
            }
            if (same) return prev;
          }
          return next;
        });
      } catch {
        if (!cancelled) setAvailableSlots([]);
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // include weekly_hours so a staff change or hours edit recomputes slots
  }, [
    providerId,
    svcKey,
    timelineKey,
    selectedDay,
    totalBlockMinutes,
    selectedProvider?.weekly_hours,
  ]);

  return {
    viewDate,
    setViewDate,
    availableSlots,
    slotsLoading,
    recomputeFor: null,
  };
}
