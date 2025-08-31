import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../supabaseClient";

const daysOrder = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
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
        // If turning OFF (prev.off was false), clear times; if turning ON, keep whatever is there
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
    if (!form.email) {
      alert("Email is required.");
      return;
    }

    try {
      setLoading(true);

      // Prefer existing token, but fall back to the live session if needed
      let token = currentUser?.token || null;
      if (!token) {
        const { data: sess } = await supabase.auth.getSession();
        token = sess?.session?.access_token || null;
      }
      if (!token) {
        alert("❌ You must be logged in.");
        return;
      }

      const payload = {
        name: form.name,
        email: form.email || null,
        pin: form.pin,
        permission: form.permission,
        weekly_hours: normalizeWeeklyHours(weeklyHours),
      };

      // ✅ Use Supabase Functions client; it attaches the current session JWT automatically
      const { data, error } = await supabase.functions.invoke("addnewstaff", {
        body: payload,
      });

      if (error) {
        console.error("❌ Add staff error:", error);
        alert(error.message || "Failed to create staff");
        return;
      }

      // Support both old/new shapes:
      // - Old: { user, token_hash?, email_otp? }
      // - New: { ok: true, staff: {...} }
      const user = data?.user || data?.staff || null;
      const token_hash = data?.token_hash;
      const email_otp = data?.email_otp;

      // (Optional) If your function returns magic link / OTP material and you still want to auto-login
      if (token_hash || email_otp) {
        let out;
        if (token_hash) {
          out = await supabase.auth.verifyOtp({
            type: "magiclink",
            token_hash, // with magiclink you do NOT pass email
          });
        } else {
          out = await supabase.auth.verifyOtp({
            type: "email",
            email: user?.email,
            token: email_otp,
          });
        }
        if (out.error) throw out.error;

        const session = out.data.session;
        const stored = {
          id: out.data.user.id,
          email: out.data.user.email,
          name: user?.name,
          permission: user?.permission,
          token: session?.access_token,
          offline: false,
        };
        localStorage.setItem("currentUser", JSON.stringify(stored));
      }

      onSaved?.();   // refresh staff list in parent
      onClose?.();   // close modal
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

          <div className="border-t border-bronze pt-4">
            <h4 className="font-semibold mb-2 text-bronze">Working Hours</h4>
            {daysOrder.map((day) => (
              <div key={day} className="flex items-center gap-2 mb-2 text-[15px]">
                <label className="w-20">{day}:</label>
                <input
                  type="time"
                  disabled={weeklyHours[day].off}
                  value={weeklyHours[day].start}
                  onChange={(e) => handleHourChange(day, "start", e.target.value)}
                  className="p-1 border rounded text-bronze border-bronze"
                />
                <span>to</span>
                <input
                  type="time"
                  disabled={weeklyHours[day].off}
                  value={weeklyHours[day].end}
                  onChange={(e) => handleHourChange(day, "end", e.target.value)}
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
