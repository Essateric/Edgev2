import { useEffect, useState } from "react";

export function useRelatedBookings(supabase, booking_group_id) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let on = true;
    (async () => {
      if (!supabase || !booking_group_id) { setRows([]); return; }
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("booking_id", booking_group_id);
      if (!on) return;
      setRows(error ? [] : (data || []));
    })();
    return () => { on = false; };
  }, [supabase, booking_group_id]);
  return rows;
}
