import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../supabaseClient"; // ✅ NEW

const daysOrder = [
  "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday",
];

const defaultWeeklyHours = Object.fromEntries(
  daysOrder.map((day) => [
    day,
    { start: "", end: "", off: day === "Saturday" || day === "Sunday" },
  ])
);

export default function AddNewStaffModal({ open, onClose, onSaved }) {
  const { currentUser } = useAuth();

  const [form, setForm] = useState({
    name: "",
    email: "",
    pin: "",
    permission: "Junior Stylist",
  });

  const [weeklyHours, setWeeklyHours] = useState(defaultWeeklyHours);
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
      [day]: {
        ...prev[day],
        off: !prev[day].off,
        ...(prev[day].off ? {} : { start: "", end: "" }),
      },
    }));
  };

  const normalizeWeeklyHours = (input) =>
    Object.fromEntries(
      daysOrder.map((day) => [
        day,
        {
          start: input?.[day]?.start || "",
          end: input?.[day]?.end || "",
          off: typeof input?.[day]?.off === "boolean" ? input[day].off : false,
        },
      ])
    );

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

      const payload = {
        name: form.name,
        email: form.email || null,
        pin: form.pin,
        permission: form.permission,
        weekly_hours: normalizeWeeklyHours(weeklyHours),
      };

      console.log("📦 Sending new staff payload:", payload);

      const res = await fetch(
        "https://vmtcofezozrblfxudauk.supabase.co/functions/v1/addnewstaff",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${currentUser.token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        console.error("❌ Error:", data);
        alert(data.error || "Failed to create staff");
        return;
      }

      // data should contain: { user: { id, email, name, permission }, token_hash?, email_otp? }
      const { user, token_hash, email_otp } = data;

      // ✅ NEW: Immediately verify the token to create a Supabase session for the new user
      if (token_hash || email_otp) {
        let out;
        if (token_hash) {
          out = await supabase.auth.verifyOtp({
            type: "magiclink",
            token_hash, // ⚠️ do NOT pass email with magiclink
          });
        } else {
          out = await supabase.auth.verifyOtp({
            type: "email",
            email: user.email,
            token: email_otp,
          });
        }
        if (out.error) throw out.error;

        // Optional: stash richer UI info so your AuthContext picks it up on restore
        const session = out.data.session;
        const stored = {
          id: out.data.user.id,
          email: out.data.user.email,
          name: user.name,
          permission: user.permission,
          token: session?.access_token,
          offline: false,
        };
        localStorage.setItem("currentUser", JSON.stringify(stored));
      }

      // Refresh list
      onSaved?.();

      // Close modal
      onClose?.();

      // Note: Your AuthContext onAuthStateChange listener will pick up the new session automatically.
      // This will replace the admin session with the new staff session on this device.
    } catch (err) {
      console.error(err);
      alert(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-[500px] p-6 overflow-y-auto max-h-[90vh]">
        <h3 className="text-xl font-bold mb-4 text-bronze">Add New Staff Member</h3>

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
            placeholder="Email"
            className="w-full p-2 border border-bronze text-bronze rounded"
            required
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
            <option>Senior Stylist</option>
            <option>Stylist</option>
            <option>Junior Stylist</option>
          </select>

            {/* hours UI unchanged */}
            {/* ... */}

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
