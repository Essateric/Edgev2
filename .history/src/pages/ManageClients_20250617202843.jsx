import React, { useState, useEffect } from "react";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import {supabase} from "../supabaseClient.js";

export default function ManageClients() {
  const [clients, setClients] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [clientsPerPage] = useState(10);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [notesModalOpen, setNotesModalOpen] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  async function fetchClients() {
    const { data, error } = await supabase.from("clients").select("*");
    if (error) return console.error("Error fetching clients:", error);
    setClients(data);
  }

  async function handleAddClient() {
    if (!newClientName.trim() || !newClientPhone.trim()) return;
    const { error } = await supabase.from("clients").insert({
      name: newClientName,
      phone: newClientPhone,
    });
    if (error) return console.error("Error adding client:", error);
    setNewClientName("");
    setNewClientPhone("");
    fetchClients();
  }

  const indexOfLastClient = currentPage * clientsPerPage;
  const indexOfFirstClient = indexOfLastClient - clientsPerPage;
  const currentClients = clients.slice(indexOfFirstClient, indexOfLastClient);
  const totalPages = Math.ceil(clients.length / clientsPerPage);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-bronze mb-4">Manage Clients</h1>

      <Card className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Add New Client</h2>
        <div className="flex space-x-2 mb-2">
<input
  type="text"
  value={newClientFirstName}
  onChange={(e) => setNewClientFirstName(e.target.value)}
  placeholder="First Name"
  className="border rounded p-2 flex-1 text-black"
/>
<input
  type="text"
  value={newClientLastName}
  onChange={(e) => setNewClientLastName(e.target.value)}
  placeholder="Last Name"
  className="border rounded p-2 flex-1 text-black"
/>

          <input
            type="text"
            value={newClientPhone}
            onChange={(e) => setNewClientPhone(e.target.value)}
            placeholder="Phone Number"
            className="border rounded p-2 flex-1"
          />
          <Button onClick={handleAddClient}>Add</Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-2">Current Clients</h2>
        <table className="w-full text-left">
          <thead>
            <tr className="text-bronze">
              <th className="py-2">Name</th>
              <th className="py-2">Phone</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentClients.map((client) => (
              <tr key={client.id} className="border-t">
<td>{client.first_name} {client.last_name}</td>
<td>{client.mobile}</td>

                <td className="py-2">
                  <Button onClick={() => { setSelectedClient(client); setNotesModalOpen(true); }}>
                    Notes
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between items-center mt-4">
          <span>
            Showing {indexOfFirstClient + 1} - {Math.min(indexOfLastClient, clients.length)} of {clients.length}
          </span>
          <div className="space-x-2">
            <Button onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} disabled={currentPage === 1}>
              Previous
            </Button>
            <Button onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages}>
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* Notes Modal */}
      {notesModalOpen && selectedClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-xl">
            <h3 className="text-lg font-bold mb-4 text-bronze">Notes for {selectedClient.name}</h3>
            <p className="text-sm text-gray-600 mb-2">(Previous notes and visit history to be implemented)</p>
            <textarea
              placeholder="Write a note..."
              className="w-full border p-2 rounded mb-4"
              rows="4"
            />
            <div className="flex justify-end space-x-2">
              <Button onClick={() => setNotesModalOpen(false)} className="bg-gray-400">
                Close
              </Button>
              <Button className="bg-bronze text-white">Save Note</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
