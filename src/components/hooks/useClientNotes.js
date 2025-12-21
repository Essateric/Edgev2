import { useEffect, useState } from "react";

export function useClientNotes({ isOpen, clientId, groupRowIds, supabase }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let on = true;
    (async () => {
      if (!isOpen || !clientId || !supabase) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("client_notes")
          .select("id, client_id, booking_id, note_content, created_at, created_by")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false });
        if (error) throw error;

 if (on) setNotes(data || []);
      } catch {
        if (on) setNotes([]);
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
}, [isOpen, clientId, supabase, JSON.stringify(groupRowIds || []) ]);

  return { notes, loading, setNotes };
}
