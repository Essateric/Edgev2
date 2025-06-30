import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function AddNewStaffModal({ open, onClose, onSaved }) {
  const { currentUser } = useAuth();

  const [form, setForm] = useState({
    name: "",
    email: "",
    pin: "",
    permission: "Junior",
  });

  const [weeklyHours, setWeeklyHours] = useState({
    Monday: { start: "", end: "", off: false },
    Tuesday: { start: "", end: "", off: false },
    Wednesday: { start: "", end: "", off: false },
    Thursday: { start: "", end: "", off: false },
    Friday: { start: "", end: "", off: false },
    Saturday: { start: "", end: "", off: true },
    Sunday: { start: "", end: "", off: true },
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleHourChange = (day, field, value) => {
    setWeeklyHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  const handleToggleOff = (day) => {
    setWeeklyHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], off: !prev[day].off },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name || !form.pin) {
      alert("Name and PIN are required.");
      return;
    }

    if (!currentUser || !currentUser.token) {
      alert("❌ You must be logged in.");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(
        "https://vmtcofezozrblfxudauk.supabase.co/functions/v1/addnewstaff",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${currentUser.token}`,
          },
          body: JSON.stringify({
            name: form.name,
            email: form.email || null,
            pin: form.pin,
            permission: form.permission,
            weekly_hours: weeklyHours, // ✅ Correct structure with capitalized days
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        console.error("❌ Error:", data);
        alert(data.error || "Failed to create staff");
        return;
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      alert("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-[500px] p-6 overflow-y-auto max-h-[90vh]">
        <h3 className="text-xl font-bold mb-4 text-bronze">
          Add New Staff Member
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            placeholder="PIN (4 digits)"
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

          <div className="border-t border-bronze pt-4">
            <h4 className="font-semibold mb-2 text-bronze">Working Hours</h4>
            {days.map((day) => (
              <div
                key={day}
                className="flex items-center gap-2 mb-2 text-[15px]"
              >
                <label className="w-20">{day}:</label>
                <input
                  type="time"
                  disabled={weeklyHours[day].off}
                  value={weeklyHours[day].start}
                  onChange={(e) =>
                    handleHourChange(day, "start", e.target.value)
                  }
                  className="p-1 border rounded text-bronze border-bronze"
                />
                <span>to</span>
                <input
                  type="time"
                  disabled={weeklyHours[day].off}
                  value={weeklyHours[day].end}
                  onChange={(e) =>
                    handleHourChange(day, "end", e.target.value)
                  }
                  className="p-1 border rounded text-bronze border-bronze"
                />
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={weeklyHours[day].off}
                    onChange={() => handleToggleOff(day)}
                  />
                  Off
                </label>
              </div>
            ))}
          </div>

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
