// src/components/hooks/useRelatedBookings.js
import { useEffect, useMemo, useState } from "react";

/**
 * Tiny utils kept local to the hook so it’s self-contained.
 */
const asLocalDate = (v) => {
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const s = v.includes("T") ? v : v.replace(" ", "T");
    return new Date(s);
  }
  return new Date(v);
};

const isProcessingRow = (row) => {
  const cat = String(row?.category || "").toLowerCase();
  const title = String(row?.title || "").toLowerCase();
  return cat === "processing" || title.includes("processing time");
};
/**
 * useRelatedBookings
 * Fetches all rows in a booking "group" (same booking_id), then provides
 * sorted services, filtered display services, and a simple blueprint
 * (base start + items with offsets/durations) you use for repeats.
 *
 * @param {Object} opts
 * @param {Object} opts.supabase   - Supabase client instance
 * @param {string|null} opts.bookingGroupId - UUID in bookings.booking_id (group id)
 * @param {string|null} opts.repeatSeriesId - UUID linking a repeat series (bookings.repeat_series_id)
 *
 * @returns {{
 *   relatedBookings: Array,
 *   loading: boolean,
 *   error: string | null,
 *  repeatSeriesOccurrences: Array,
 *   sortedAllServices: Array,
 *   displayServices: Array,
 *   blueprint: null | {
 *     baseStart: Date,
 *     baseHour: number,
 *     baseMin: number,
 *     items: Array<{ title: string, category: string|null, price: number|null, duration: number, offsetMin: number }>
 *   },
 *   refresh: () => Promise<void>
 * }}
 */
export function useRelatedBookings({ supabase, bookingGroupId, repeatSeriesId }) {
  const [relatedBookings, setRelatedBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
   const [repeatSeriesOccurrences, setRepeatSeriesOccurrences] = useState([]);

  /**
   * Internal fetcher (also exposed via refresh)
   */
  const fetchGroup = async () => {
    setError(null);
    if (!supabase || !bookingGroupId) {
      setRelatedBookings([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("booking_id", bookingGroupId);

      if (error) throw error;
      setRelatedBookings(Array.isArray(data) ? data : []);
    } catch (e) {
      setRelatedBookings([]);
      setError(e?.message || "Failed to load related bookings");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Auto-load when group id changes
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      await fetchGroup();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, bookingGroupId]);

   /**
   * Derived: fetch all occurrences in the repeat series (one row per booking_id)
   */
  useEffect(() => {
    if (!supabase || !repeatSeriesId) {
      setRepeatSeriesOccurrences([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("bookings")
          .select("id, booking_id, start, title, category, resource_id, repeat_series_id")
          .eq("repeat_series_id", repeatSeriesId)
          .order("start", { ascending: true });

        if (error) throw error;

        // Collapse multiple service rows into one entry per booking_id
        const byBookingId = new Map();
        for (const row of data || []) {
          if (!row?.booking_id) continue;
          if (!byBookingId.has(row.booking_id)) {
            byBookingId.set(row.booking_id, row);
          }
        }

        if (!cancelled) {
          setRepeatSeriesOccurrences(Array.from(byBookingId.values()));
        }
      } catch (e) {
        if (!cancelled) {
          console.warn("[useRelatedBookings] repeat series fetch failed:", e?.message || e);
          setRepeatSeriesOccurrences([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, repeatSeriesId]);


  /**
   * Derived: sort all services by start
   */
  const sortedAllServices = useMemo(() => {
    if (!Array.isArray(relatedBookings) || relatedBookings.length === 0) return [];
    return [...relatedBookings].sort(
      (a, b) => asLocalDate(a.start) - asLocalDate(b.start)
    );
  }, [relatedBookings]);

  /**
   * Derived: filter out “processing time” rows
   */
  const displayServices = useMemo(
    () => sortedAllServices.filter((row) => !isProcessingRow(row)),
    [sortedAllServices]
  );

  /**
   * Derived: blueprint used for repeat generation elsewhere
   * (baseStart + per-item offset/duration)
   */
  const blueprint = useMemo(() => {
    if (!sortedAllServices.length) return null;

    const baseStart = asLocalDate(sortedAllServices[0].start);
    const baseHour = baseStart.getHours();
    const baseMin = baseStart.getMinutes();

    const items = sortedAllServices.map((row) => {
      const sStart = asLocalDate(row.start);
      const sEnd = asLocalDate(row.end);
      const offsetMin = Math.round((sStart - baseStart) / 60000);
      const duration = Math.round((sEnd - sStart) / 60000);
      return {
        title: row.title,
        category: row.category || null,
        price: row.price ?? null,
        duration,
        offsetMin,
      };
    });

    return { baseStart, baseHour, baseMin, items };
  }, [sortedAllServices]);

  return {
    relatedBookings,
    loading,
    error,
    repeatSeriesOccurrences,
    sortedAllServices,
    displayServices,
    blueprint,
    refresh: fetchGroup,
  };
}

export default useRelatedBookings;
