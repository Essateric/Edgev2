import React, { useState, useEffect } from "react";
import { collection, getDocs, addDoc } from "firebase/firestore";
import { db } from "../firebase";
import SeedButton from "../components/SeedButton"; // Make sure this path is correct

export default function ManageStaff() {
  const [staffList, setStaffList] = useState([]);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    hours: "",
    services: "",
  });

  // 🔁 Fetch staff on mount
  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    const snapshot = await getDocs(collection(db, "stylist"));
    const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    setStaffList(data);
  };

  // 🧾 Handle form submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "stylist"), formData);
    setFormData({ name: "", email: "", hours: "", services: "" });
    fetchStaff(); // ⬅ Refresh list
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4 text-bronze">Manage Staff</h2>

      {/* 🔘 One-click seed button */}
      <SeedButton />

      {/* 📝 Add new staff form */}
      <form onSubmit={handleSubmit} className="mb-6 space-y-4 mt-6">
        <input
          className="block w-full border border-gray-300 p-2 rounded"
          placeholder="Name"
          value={formData.name}
          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
        />
        <input
          className="block w-full border border-gray-300 p-2 rounded"
          placeholder="Email"
          value={formData.email}
          onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
        />
        <input
          className="block w-full border border-gray-300 p-2 rounded"
          placeholder="Hours (e.g. Mon-Fri 10am-6pm)"
          value={formData.hours}
          onChange={(e) => setFormData((prev) => ({ ...prev, hours: e.target.value }))}
        />
        <textarea
          className="block w-full border border-gray-300 p-2 rounded"
          placeholder="Services (e.g. Cut & Finish: £25)"
          rows={4}
          value={formData.services}
          onChange={(e) => setFormData((prev) => ({ ...prev, services: e.target.value }))}
        />
        <button type="submit" className="px-4 py-2 bg-bronze text-white rounded">
          ➕ Add Staff Member
        </button>
      </form>

      {/* 👥 Staff list */}
      <div className="space-y-4">
        {staffList.map((staff) => (
          <div
            key={staff.id}
            className="p-4 border border-gray-300 rounded bg-white text-black shadow-sm"
          >
            <h3 className="font-bold text-lg text-bronze">{staff.name}</h3>
            <p><strong>Email:</strong> {staff.email}</p>
            <p><strong>Hours:</strong> {staff.hours}</p>
            <p><strong>Services:</strong><br />{staff.services}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
