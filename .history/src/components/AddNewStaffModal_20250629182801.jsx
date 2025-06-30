import React, { useState } from "react";
import { supabase } from "../supabaseClient";

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
    permission: "Junior",
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name) {
      alert("Name is required");
      return;
    }

    const { name, email, permission } = form;

    const payload = {
      name,
      email: email || null,
      permission,
      weekly_hours: defaultWeeklyHours,
    };

    try {
      setLoading(true);
      let authId = null;

      if (email) {
        const { data, error: authError } = await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
        });

        if (authError) {
          alert(authError.message);
          setLoading(false);
          return;
        }

        authId = data.user.id;
      }

      const { error } = await supabase.from("staff").insert({
        ...payload,
        auth_id: authId,
      });

      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }

      onSaved();
      onClose();
    } catch (err) {
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
