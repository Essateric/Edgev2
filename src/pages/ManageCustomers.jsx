import React, { useState } from "react";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";

export default function ManageCustomers() {
  const [customerList, setCustomerList] = useState([
    { id: "1", name: "Jane Doe", phone: "123-456-7890" },
    { id: "2", name: "John Smith", phone: "987-654-3210" },
  ]);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");

  function handleAddCustomer() {
    if (!newCustomerName.trim() || !newCustomerPhone.trim()) return;
    const newCustomer = {
      id: Date.now().toString(),
      name: newCustomerName,
      phone: newCustomerPhone,
    };
    setCustomerList(prev => [...prev, newCustomer]);
    setNewCustomerName("");
    setNewCustomerPhone("");
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-bronze mb-4">Manage Customers</h1>

      <Card className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Add New Customer</h2>
        <div className="flex space-x-2 mb-2">
          <input
            type="text"
            value={newCustomerName}
            onChange={(e) => setNewCustomerName(e.target.value)}
            placeholder="Customer Name"
            className="border rounded p-2 flex-1"
          />
          <input
            type="text"
            value={newCustomerPhone}
            onChange={(e) => setNewCustomerPhone(e.target.value)}
            placeholder="Phone Number"
            className="border rounded p-2 flex-1"
          />
          <Button onClick={handleAddCustomer}>Add</Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-2">Current Customers</h2>
        <ul className="list-disc pl-6">
          {customerList.map((customer) => (
            <li key={customer.id}>
              {customer.name} - {customer.phone}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
