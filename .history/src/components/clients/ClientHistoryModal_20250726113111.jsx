// src/components/clients/ClientHistoryModal.jsx
import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import Modal from "../Modal";
import { format } from "date-fns";

export default function ClientHistoryModal({ isOpen, onClose, clientId }) {
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("client_id", clientId)
        .order("start", { ascending: false });

      if (!error) setBookings(data);
      else console.error("Error fetching history:", error.message);
    };

    if (isOpen && clientId) {
      fetchHistory();
    }
  }, [clientId, isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Service History">
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {bookings.length === 0 ? (
          <p className="text-gray-500 text-sm">No history available.</p>
        ) : (
          bookings.map((b) => (
            <div key={b.id} className="border rounded p-3 text-sm">
              <p><strong>Date:</strong> {format(new Date(b.start), "dd MMM yyyy")}</p>
              <p><strong>Time:</strong> {format(new Date(b.start), "HH:mm")}</p>
              <p><strong>Service:</strong> {b.title || "N/A"}</p>
              <p><strong>Category:</strong> {b.category || "Uncategorised"}</p>
              <p><strong>Stylist ID:</strong> {b.resource_id}</p>
              {b.notes && (
                <p><strong>Notes:</strong> {b.notes}</p>
              )}
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
