import React, { useState } from "react";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";

export default function ManageStaff() {
  const [staffList, setStaffList] = useState([
    { id: "1", name: "Stylist A" },
    { id: "2", name: "Stylist B" },
    { id: "3", name: "Stylist C" },
  ]);
  const [newStaffName, setNewStaffName] = useState("");

  function handleAddStaff() {
    if (!newStaffName.trim()) return;
    const newStaff = { id: Date.now().toString(), name: newStaffName };
    setStaffList(prev => [...prev, newStaff]);
    setNewStaffName("");
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-bronze mb-4">Manage Staff</h1>

      <Card className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Add New Staff</h2>
        <div className="flex space-x-2">
          <input
            type="text"
            value={newStaffName}
            onChange={(e) => setNewStaffName(e.target.value)}
            placeholder="Staff Name"
            className="border rounded p-2 flex-1"
          />
          <Button onClick={handleAddStaff}>Add</Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-2">Current Staff</h2>
        <ul className="list-disc pl-6">
          {staffList.map((staff) => (
            <li key={staff.id}>{staff.name}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
