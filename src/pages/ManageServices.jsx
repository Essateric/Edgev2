import React, { useState } from "react";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";

export default function ManageServices() {
  const [serviceList, setServiceList] = useState([
    { id: "1", name: "Haircut" },
    { id: "2", name: "Color" },
    { id: "3", name: "Blow Dry" },
  ]);
  const [newServiceName, setNewServiceName] = useState("");

  function handleAddService() {
    if (!newServiceName.trim()) return;
    const newService = { id: Date.now().toString(), name: newServiceName };
    setServiceList(prev => [...prev, newService]);
    setNewServiceName("");
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-bronze mb-4">Manage Services</h1>

      <Card className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Add New Service</h2>
        <div className="flex space-x-2">
          <input
            type="text"
            value={newServiceName}
            onChange={(e) => setNewServiceName(e.target.value)}
            placeholder="Service Name"
            className="border rounded p-2 flex-1"
          />
          <Button onClick={handleAddService}>Add</Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-2">Current Services</h2>
        <ul className="list-disc pl-6">
          {serviceList.map((service) => (
            <li key={service.id}>{service.name}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
