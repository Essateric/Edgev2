import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Modal from "../../compoonents/Modal";
import { format } from "date-fns";

export default function ClientHistoryFullScreen({ clientId, isOpen, onClose }) {
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    if (!clientId) return;

    const fetchBookings = async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("client_id", clientId)
        .order("start", { ascending: false });

      if (!error) setBookings(data || []);
      else console.error("Error fetching history:", error.message);
    };

    fetchBookings();
  }, [clientId]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Client Full Visit History"
      className="!max-w-screen-xl !w-screen !h-screen p-6 overflow-auto"
    >
      <div className="bg-white w-full h-full p-6 rounded shadow space-y-4">
        <div className="text-lg font-bold text-bronze border-b pb-2">Visit Records</div>

        {bookings.length === 0 ? (
          <p className="text-gray-500 italic">No history available for this client.</p>
        ) : (
          <table className="w-full border text-sm text-left">
            <thead className="bg-black text-white">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Service</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Stylist</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-b">
                  <td className="px-3 py-2">{format(new Date(b.start), "dd MMM yyyy")}</td>
                  <td className="px-3 py-2">{format(new Date(b.start), "HH:mm")}</td>
                  <td className="px-3 py-2">{b.title || "N/A"}</td>
                  <td className="px-3 py-2">{b.status || "N/A"}</td>
                  <td className="px-3 py-2">{b.stylist_name || "N/A"}</td>
                  <td className="px-3 py-2">{b.notes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="text-right pt-4">
          <button
            onClick={onClose}
            className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-800"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
