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

  // From the list provided by the parent
  const fromList = useMemo(() => {
    if (!booking?.client_id) return null;
    return clients.find((c) => c.id === booking.client_id) || null;
  }, [clients, booking?.client_id]);

  // A safe “display” object so the popup can still render even if we’re fetching/falling back.
  const displayClient = useMemo(() => {
    // Prefer the DB row (row or fromList)
    const base = row || fromList;
    if (base) return base;

    // Fallback: synthesize from booking so the header shows *something*
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
      mobile:
        booking?.client_mobile ?? booking?.mobile ?? booking?.phone ?? null,
      dob: null,
    };
  }, [row, fromList, booking]);

  // Verbose debug to console so we can see the truth quickly
  useEffect(() => {
    if (!isOpen || !booking) return;
    // Toggle this line if it’s too chatty:
    console.log("[BookingPopUp] booking payload", booking);
  }, [isOpen, booking]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setErr(null);
      setRow(null);

      if (!isOpen || !supabase || !booking) return;

      // If parent already provided the row from a list, use it and stop.
      if (fromList) {
        setRow(fromList);
        return;
      }

      const normEmail = (booking?.client_email || booking?.email || "")
        .trim()
        .toLowerCase();
      const rawMobile =
        booking?.client_mobile ?? booking?.mobile ?? booking?.phone ?? "";
      const normDigits = String(rawMobile).replace(/[^\d+]/g, "");

      // If there is a client_id, fetch by id first.
      if (booking.client_id) {
        try {
          setLoading(true);
          console.log("[useDisplayClient] fetch by id:", booking.client_id);
          const { data, error } = await supabase
            .from("clients")
            .select("id, first_name, last_name, email, mobile, dob")
            .eq("id", booking.client_id)
            .maybeSingle();

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
      }

      // No row yet — try fallbacks that help with online/public bookings.

      // 1) by email (case-insensitive)
      if (normEmail) {
        try {
          setLoading(true);
          console.log("[useDisplayClient] fallback by email:", normEmail);
          const { data, error } = await supabase
            .from("clients")
            .select("id, first_name, last_name, email, mobile, dob")
            .ilike("email", normEmail) // case-insensitive exact match
            .maybeSingle();

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

      // 2) by mobile / phone (normalized)
      if (normDigits) {
        try {
          setLoading(true);
          console.log("[useDisplayClient] fallback by mobile:", normDigits);

          // Try exact first
          let q = supabase
            .from("clients")
            .select("id, first_name, last_name, email, mobile, dob")
            .eq("mobile", rawMobile)
            .maybeSingle();

          let { data, error } = await q;
          if (!alive) return;
          if (!error && data) {
            setRow(data);
            return;
          }

          // Then fuzzy (contains digits)
          const fuzzy = await supabase
            .from("clients")
            .select("id, first_name, last_name, email, mobile, dob")
            .ilike("mobile", `%${normDigits}%`)
            .limit(1);

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

      // 3) by name (best-effort; may match multiple – we take first)
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

      // If we’re here, we didn’t find a DB row. Not a hard error — UI will use displayClient.
      console.log(
        "[useDisplayClient] no DB client row found. Using booking fallback."
      );
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
