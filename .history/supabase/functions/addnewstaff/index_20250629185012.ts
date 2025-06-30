import React, { useState } from "react";

const defaultWeeklyHours = {
  Monday: { start: "", end: "", off: false },
  Tuesday: { start: "", end: "", off: false },
  Wednesday: { start: "", end: "", off: false },
  Thursday: { start: "", end: "", off: false },
  Friday: { start: "", end: "", off: false },
  Saturday: { start: "", end: "", off: false },
  Sunday: { start: "", end: "", off: false },
};

export default function AddNewStaffModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    pin: "",
    permission: "Junior",
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name || !form.pin) {
      alert("Name and PIN are required.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        "https://vmtcofezozrblfxudauk.supabase.co/functions/v1/addnewstaff",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer essateric-secret-2025-edge", // ✅ Matches FUNCTION_SECRET in .env
          },
          body: JSON.stringify({
            name: form.name,
            email: form.email || null,
            pin: form.pin,
            permission: form.permission,
            weekly_hours: defaultWeeklyHours,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        console.error("❌ Error:", result);
        alert(result.error || "Failed to create staff.");
        return;
      }

      console.log("✅ Staff created:", result);
      onSaved();
      onClose();
    } catch (err) {
      console.error("❌ Error:", err);
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-[400px] p-6">
        <h3 className="text-xl font-bold mb-4">Add New Staff Member</h3>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Name"
            className="w-full p-2 border border-bronze text-bronze rounded"
            required
          />
          <input
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="Email (optional)"
            className="w-full p-2 border border-bronze text-bronze rounded"
          />
          <input
            name="pin"
            value={form.pin}
            onChange={handleChange}
            placeholder="4-digit PIN"
            className="w-full p-2 border border-bronze text-bronze rounded"
            required
          />
          <select
            name="permission"
            value={form.permission}
            onChange={handleChange}
            className="w-full p-2 border border-bronze text-bronze rounded"
          >
            <option value="Senior">Senior Stylist</option>
            <option value="Mid">Stylist</option>
            <option value="Junior">Junior Stylist</option>
          </select>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-300 px-4 py-2 rounded"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-bronze text-white px-4 py-2 rounded"
              disabled={loading}
            >
              {loading ? "Adding..." : "Add Staff"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
