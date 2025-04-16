// src/components/ClientHistoryWidget.jsx

import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";

export default function ClientHistoryWidget() {
  const [clients, setClients] = useState([]);
  const [expandedClientId, setExpandedClientId] = useState(null);

  useEffect(() => {
    const fetchClients = async () => {
      const snapshot = await getDocs(collection(db, "clients"));
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setClients(data);
    };
    fetchClients();
  }, []);

  return (
    <div className="bg-white border border-chrome rounded p-4 shadow-sm">
      <h2 className="text-xl font-bold text-bronze mb-3">Client Visit History</h2>

      <div className="overflow-auto max-h-[400px]">
        <table className="w-full text-sm border border-chrome">
          <thead className="bg-black text-white sticky top-0">
            <tr>
              <th className="text-left px-4 py-2">Client</th>
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">Phone</th>
              <th className="text-left px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.slice(0, 5).map((client) => (
              <tr key={client.id} className="bg-white border-b border-chrome">
                <td className="px-4 py-2">{client.firstName} {client.lastName}</td>
                <td className="px-4 py-2">{client.email}</td>
                <td className="px-4 py-2">{client.mobile}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => setExpandedClientId(expandedClientId === client.id ? null : client.id)}
                    className="text-bronze flex items-center gap-1 text-sm"
                  >
                    {expandedClientId === client.id ? "Hide" : "Show"} <span>{expandedClientId === client.id ? <FaChevronUp /> : <FaChevronDown />}</span>
                  </button>
                </td>
              </tr>
            ))}

            {expandedClientId && clients.find(c => c.id === expandedClientId)?.visits?.map((visit, idx) => (
              <tr key={idx} className="bg-chrome/10">
                <td colSpan="4" className="px-4 py-2">
                  <div className="border border-chrome rounded p-3 text-black">
                    <p><strong>Date:</strong> {visit.date} at {visit.time}</p>
                    <p><strong>Services:</strong> {visit.services.join(", ")}</p>
                    <p><strong>Provider:</strong> {visit.stylist}</p>
                    <p><strong>Cost:</strong> £{visit.cost?.toFixed(2)}</p>
                    {visit.notes && <p><strong>Notes:</strong> {visit.notes}</p>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
