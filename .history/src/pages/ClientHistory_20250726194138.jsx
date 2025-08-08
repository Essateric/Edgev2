// src/components/clients/ClientHistoryFullScreen.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Modal from "../Modal";
import { format } from "date-fns";

export default function ClientHistoryFullScreen({ clientId, isOpen, onClose }) {
  const [bookings, setBookings] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [years, setYears] = useState([]);

  useEffect(() => {
    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("client_id", clientId)
        .order("start", { ascending: false });

      if (!error) {
        setBookings(data);
        const uniqueYears = Array.from(
          new Set(data.map((b) => new Date(b.start).getFullYear()))
        ).sort((a, b) => b - a);
        setYears(uniqueYears);
        setSelectedYear(uniqueYears[0] || new Date().getFullYear());
      } else {
        console.error("Error fetching history:", error.message);
      }
    };

    if (isOpen && clientId) {
      fetchHistory();
    }
  }, [clientId, isOpen]);

  const filteredBookings = bookings.filter(
    (b) => new Date(b.start).getFullYear() === selectedYear
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} fullScreen title="Client Service History">
      <div className="flex h-full">
        {/* Year Sidebar */}
        <div className="w-1/4 bg-gray-50 border-r p-4">
          <h3 className="font-semibold mb-2 text-center">Select a year</h3>
          <ul className="space-y-2">
            {years.map((year) => (
              <li
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`cursor-pointer px-3 py-1 rounded text-center ${
                  year === selectedYear ? "bg-neutral-800 text-white" : "hover:bg-gray-200"
                }`}
              >
                {year}
              </li>
            ))}
          </ul>
        </div>

        {/* History Table */}
        <div className="w-3/4 p-4 overflow-y-auto">
          {filteredBookings.length === 0 ? (
            <p className="text-gray-500 text-sm">No bookings in {selectedYear}</p>
          ) : (
            <table className="w-full text-sm border border-gray-300">
              <thead className="bg-black text-white sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-left">Service</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Stylist</th>
                  <th className="px-3 py-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="px-3 py-2">{format(new Date(b.start), "dd MMM yyyy")}</td>
                    <td className="px-3 py-2">{format(new Date(b.start), "HH:mm")}</td>
                    <td className="px-3 py-2">{b.title || "N/A"}</td>
                    <td className="px-3 py-2">{b.status || "N/A"}</td>
                    <td className="px-3 py-2">{b.resource_id || "N/A"}</td>
                    <td className="px-3 py-2">{b.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  );
}
