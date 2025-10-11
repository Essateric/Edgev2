import { useEffect, useMemo, useState } from "react";

export function useDisplayClient({ isOpen, booking, clients, supabase }) {
  const [clientRow, setClientRow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // clear stale when booking changes
  useEffect(() => { setClientRow(null); setErr(""); setLoading(false); }, [booking?.id]);

  const clientFromList = useMemo(
    () => clients.find((c) => c.id === booking?.client_id),
    [clients, booking?.client_id]
  );

  useEffect(() => {
    let on = true;
    (async () => {
      setErr("");
      if (!isOpen || !booking?.client_id || clientFromList) return;
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("clients")
          .select("id, first_name, last_name, email, mobile, dob")
          .eq("id", booking.client_id)
          .maybeSingle();
        if (!on) return;
        if (error) throw error;
        setClientRow(data || null);
      } catch (e) {
        if (on) setErr(e?.message || "Failed to load client.");
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, [isOpen, booking?.client_id, clientFromList, supabase]);

  const client = clientFromList || clientRow || null;

  const displayClient = client || {
    id: null,
    first_name: booking?.client_name || booking?.customer_name || "",
    last_name: "",
    mobile: booking?.client_mobile || booking?.customer_mobile || null,
    email: booking?.client_email || booking?.customer_email || null,
    dob: null,
  };

  return { client, displayClient, loading, err };
}
