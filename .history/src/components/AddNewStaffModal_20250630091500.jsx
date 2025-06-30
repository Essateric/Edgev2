import React, { useState } from "react";

export default function AddNewStaffModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    pin: "",
    permission: "Junior",
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name || !form.pin) {
      alert("Name and PIN are required.");
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
            // 🔥 ✅ This sends your FUNCTION_SECRET to the Edge Function
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY=12eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtdGNvZmV6b3pyYmxmeHVkYXVrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTU4MjM1MCwiZXhwIjoyMDYxMTU4MzUwfQ.O6YvqNHfkIrl6Y-Mf-_Amejm9c7gWDtumMVriLyjX3Y
}`,
            "x-function-secret": import.meta.env.VITE_FUNCTION_SECRET,
          },

          body: JSON.stringify({
            name: form.name,
            email: form.email || null,
            pin: form.pin,
            permission: form.permission,
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
