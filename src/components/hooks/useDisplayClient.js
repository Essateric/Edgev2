import { useEffect, useMemo, useState } from "react";

/**
 * Tries hard to provide a displayable "client-like" object for a booking.
 * Order:
 *  1) If caller passed a clients[] list, use that by exact id.
 *  2) If booking.client_id exists -> select from clients by id.
 *  3) Fallbacks for online bookings:
 *     - Try exact email (case-insensitive).
 *     - Try mobile (normalized digits: exact and fuzzy).
 *     - Try name match (first + last) if we can split booking.client_name.
 *
 * While loading/fallbacking, returns a "displayClient" built from booking so the UI never shows a hard error.
 */
export function useDisplayClient({ isOpen, booking, clients = [], supabase }) {
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const isBlank = (v) => v === null || v === undefined || String(v).trim() === "";

  // From the list provided by the parent
  const fromList = useMemo(() => {
    if (!booking?.client_id) return null;
    return clients.find((c) => c.id === booking.client_id) || null;
  }, [clients, booking?.client_id]);

  // Booking-derived fallback values (used to keep UI populated even when DB lookup fails)
  const bookingFallback = useMemo(() => {
    const name = booking?.client_name || "";
    let first_name = "";
    let last_name = "";
    if (name) {
      const parts = String(name).trim().split(/\s+/);
      first_name = parts[0] || "";
      last_name = parts.slice(1).join(" ") || "";
    }

    return {
      id: booking?.client_id ?? null,
      first_name,
      last_name,
      email: booking?.client_email ?? booking?.email ?? null,
      mobile: booking?.client_mobile ?? booking?.mobile ?? booking?.phone ?? null,
      dob: null,
    };
  }, [booking]);

  // A safe “display” object so the popup can still render even if we’re fetching/falling back.
  const displayClient = useMemo(() => {
    const base = row || fromList;

    // If we have a base row, still fill blanks from bookingFallback
    if (base) {
      return {
        ...base,
        first_name: !isBlank(base.first_name) ? base.first_name : bookingFallback.first_name,
        last_name: !isBlank(base.last_name) ? base.last_name : bookingFallback.last_name,
        email: !isBlank(base.email) ? base.email : bookingFallback.email,
        mobile: !isBlank(base.mobile) ? base.mobile : bookingFallback.mobile,
        dob: base.dob ?? bookingFallback.dob,
      };
    }

    // Otherwise return the fallback
    return bookingFallback;
  }, [row, fromList, bookingFallback]);

  // Verbose debug to console so we can see the truth quickly
  useEffect(() => {
    if (!isOpen || !booking) return;
    console.log("[BookingPopUp] booking payload", booking);
  }, [isOpen, booking]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      setRow(null);

      if (!isOpen || !supabase || !booking) return;

      const normEmail = (booking?.client_email || booking?.email || "")
        .trim()
        .toLowerCase();

      const rawMobile = booking?.client_mobile ?? booking?.mobile ?? booking?.phone ?? "";
      const normDigits = String(rawMobile).replace(/[^\d+]/g, "");

      // If parent provided a row from a list, use it immediately for fast UI…
      if (fromList) {
        setRow(fromList);
      }

      // …BUT still fetch from DB if we’re missing key fields like email/mobile/dob.
      // This fixes “mobile shows but email doesn’t” when clients[] is selected without email.
      const shouldFetchById =
        !!booking.client_id &&
        (!fromList ||
          isBlank(fromList.email) ||
          isBlank(fromList.mobile) ||
          fromList.dob === undefined);

      // 1) If there is a client_id, fetch by id first (or upgrade fromList)
      if (shouldFetchById) {
        try {
          setLoading(true);
          console.log("[useDisplayClient] fetch by id:", booking.client_id);

          const { data, error } = await supabase
            .from("clients")
            .select("id, first_name, last_name, email, mobile, dob")
            .eq("id", booking.client_id)
            .maybeSingle();

          console.log("[useDisplayClient] fetch by id result:", { data, error });

          if (!alive) return;
          if (error) throw error;

          if (data) {
            setRow(data);
            return;
          }
        } catch (e) {
          if (!alive) return;
          console.warn("[useDisplayClient] by id failed:", e?.message || e);
          setErr(e?.message || "Client lookup by id failed");
        } finally {
          if (alive) setLoading(false);
        }
      } else {
        // If we already have a complete fromList (including email), stop here.
        if (fromList && !isBlank(fromList.email)) {
          return;
        }
      }

      // 2) No row yet — try fallbacks that help with online/public bookings.

      // 2.1) by email (case-insensitive)
      if (normEmail) {
        try {
          setLoading(true);
          console.log("[useDisplayClient] fallback by email:", normEmail);

          const { data, error } = await supabase
            .from("clients")
            .select("id, first_name, last_name, email, mobile, dob")
            // ilike is pattern match; without % this is an exact case-insensitive match
            .ilike("email", normEmail)
            .maybeSingle();

          console.log("[useDisplayClient] fallback by email result:", { data, error });

          if (!alive) return;
          if (error) throw error;

          if (data) {
            setRow(data);
            return;
          }
        } catch (e) {
          if (!alive) return;
          console.warn("[useDisplayClient] by email failed:", e?.message || e);
        } finally {
          if (alive) setLoading(false);
        }
      }

      // 2.2) by mobile / phone (normalized)
      if (normDigits) {
        try {
          setLoading(true);
          console.log("[useDisplayClient] fallback by mobile:", normDigits);

          // Try exact first (as stored)
          const exact = await supabase
            .from("clients")
            .select("id, first_name, last_name, email, mobile, dob")
            .eq("mobile", rawMobile)
            .maybeSingle();

          console.log("[useDisplayClient] fallback mobile exact result:", exact);

          if (!alive) return;
          if (!exact.error && exact.data) {
            setRow(exact.data);
            return;
          }

          // Then fuzzy (contains digits)
          const fuzzy = await supabase
            .from("clients")
            .select("id, first_name, last_name, email, mobile, dob")
            .ilike("mobile", `%${normDigits}%`)
            .limit(1);

          console.log("[useDisplayClient] fallback mobile fuzzy result:", fuzzy);

          if (!alive) return;
          if (!fuzzy.error && fuzzy.data && fuzzy.data[0]) {
            setRow(fuzzy.data[0]);
            return;
          }
        } catch (e) {
          if (!alive) return;
          console.warn("[useDisplayClient] by mobile failed:", e?.message || e);
        } finally {
          if (alive) setLoading(false);
        }
      }

      // 2.3) by name (best-effort; may match multiple – we take first)
      const full = (booking?.client_name || "").trim();
      if (full) {
        const parts = full.split(/\s+/);
        const fn = parts[0] || "";
        const ln = parts.slice(1).join(" ");
        if (fn && ln) {
          try {
            setLoading(true);
            console.log("[useDisplayClient] fallback by name:", fn, ln);

            const { data, error } = await supabase
              .from("clients")
              .select("id, first_name, last_name, email, mobile, dob")
              .ilike("first_name", fn)
              .ilike("last_name", ln)
              .limit(1);

            console.log("[useDisplayClient] fallback by name result:", { data, error });

            if (!alive) return;
            if (error) throw error;

            if (data && data[0]) {
              setRow(data[0]);
              return;
            }
          } catch (e) {
            if (!alive) return;
            console.warn("[useDisplayClient] by name failed:", e?.message || e);
          } finally {
            if (alive) setLoading(false);
          }
        }
      }

      console.log("[useDisplayClient] no DB client row found. Using booking fallback.");
    })();

    return () => {
      alive = false;
    };
    // NOTE: do NOT depend on `displayClient` here to avoid re-run loops.
  }, [isOpen, supabase, booking, fromList]);

  return {
    client: row,
    displayClient, // always defined enough to render
    loading,
    err,
  };
}

export default useDisplayClient;
