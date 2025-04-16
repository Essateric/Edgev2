import React, { useState } from "react";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";

export default function ManageClients() {
  const [clientList, setClientList] = useState([
    { id: "1", name: "Jane Doe", phone: "123-456-7890" },
    { id: "2", name: "John Smith", phone: "987-654-3210" },
  ]);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");

  function handleAddClient() {
    if (!newClientName.trim() || !newClientPhone.trim()) return;
    const newClient = {
      id: Date.now().toString(),
      name: newClientName,
      phone: newClientPhone,
    };
    setCustomerList(prev => [...prev, newClient]);
    setNewClientName("");
    setNewClientPhone("");
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-bronze mb-4">Manage Clients</h1>

      <Card className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Add New Client</h2>
        <div className="flex space-x-2 mb-2">
          <input
            type="text"
            value={newClientName}
            onChange={(e) => setNewClietName(e.target.value)}
            placeholder="Client Name"
            className="border rounded p-2 flex-1"
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
        <h2 className="text-lg font-semibold mb-2">Current Client</h2>
        <ul className="list-disc pl-6">
          {clientList.map((client) => (
            <li key={client.id}>
              {client.name} - {client.phone}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
