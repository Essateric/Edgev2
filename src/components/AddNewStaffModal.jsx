// src/components/AddNewStaffModal.jsx
import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../supabaseClient";

const daysOrder = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const defaultWeeklyHours = Object.fromEntries(
  daysOrder.map((day) => [
    day,
    { start: "", end: "", off: day === "Saturday" || day === "Sunday" },
  ])
);

export default function AddNewStaffModal({ open, isOpen, onClose, onSaved }) {
  const { currentUser } = useAuth();

  const [form, setForm] = useState({
    name: "",
    email: "",
    pin: "",
    permission: "Junior Stylist",
  });
  const [weeklyHours, setWeeklyHours] = useState(defaultWeeklyHours);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleHourChange = (day, field, value) =>
    setWeeklyHours((p) => ({ ...p, [day]: { ...p[day], [field]: value } }));

  const handleToggleOff = (day) =>
    setWeeklyHours((p) => ({
      ...p,
      [day]: {
        ...p[day],
        off: !p[day].off,
        ...(p[day].off ? {} : { start: "", end: "" }), // clearing times when toggling to Off
      },
    }));

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

  // ---------------- helpers ----------------
  const handlePostSuccess = async (result) => {
    const staff = result?.staff || result?.user || null;
    console.debug("📩 Function return (no login/OTP path):", { hasStaff: !!staff });

    // ✅ Do NOT verifyOtp here. Admin stays logged in.
    console.info("🎉 Staff added; refreshing list and closing modal");
    await onSaved?.(); // refresh staff in parent
    onClose?.(); // close modal
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Basic validation (keeps your current logic)
    if (!form.name || !form.pin) {
      alert("Name and PIN are required.");
      return;
    }
    if (!form.email) {
      alert("Email is required.");
      return;
    }

    console.groupCollapsed(
      "%c➕ AddNewStaffModal.handleSubmit",
      "color:#8b5cf6;font-weight:bold"
    );

    try {
      setLoading(true);

      // Get JWT
      let token = currentUser?.token || null;
      if (!token) {
        const { data: sess, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) console.warn("⚠️ getSession error:", sessErr);
        token = sess?.session?.access_token || null;
      }

      console.debug("🔐 JWT present?", Boolean(token));
      console.debug("🧾 Form:", { ...form, pin: form.pin ? "****" : "" });
      console.debug("🕒 Weekly hours (raw):", weeklyHours);

      if (!token) {
        console.error("⛔ No JWT available");
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

      console.debug("📦 Payload to function:", { ...payload, pin: "****" });

      // -------------------------------
      // 1) Try supabase.functions.invoke (WITH timeout so it can't hang)
      // -------------------------------
      console.time("⏱️ addnewstaff invoke");
      let data, error;

      const INVOKE_TIMEOUT_MS = 15000;

      try {
        const resp = await Promise.race([
          supabase.functions.invoke("addnewstaff", {
            body: payload,
            headers: { Authorization: `Bearer ${token}` }, // keep your existing logic
          }),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`invoke timeout after ${INVOKE_TIMEOUT_MS}ms`)),
              INVOKE_TIMEOUT_MS
            )
          ),
        ]);

        data = resp?.data;
        error = resp?.error;
      } catch (err) {
        // Timeout / invoke exception => force fallback fetch path
        data = null;
        error = err;
      } finally {
        console.timeEnd("⏱️ addnewstaff invoke");
      }

      // If invoke worked, continue
      if (!error) {
        if (data?.logs && Array.isArray(data.logs)) {
          console.groupCollapsed(
            "%c✅ addnewstaff success logs (invoke)",
            "color:#22c55e"
          );
          data.logs.forEach((line, i) => console.log(`${i + 1}.`, line));
          console.groupEnd();
        } else {
          console.debug("✅ addnewstaff success via invoke (no logs returned)");
        }

        // accept either shape (success/ok) just in case
        if (!(data?.success || data?.ok)) {
          alert(data?.error || "Add staff failed.");
          return;
        }

        await handlePostSuccess(data);
        return;
      }

      // ---------------------------------------------------
      // 2) Fallback: direct fetch for full error visibility
      // ---------------------------------------------------
      console.warn("⚠️ invoke failed — trying direct fetch to read raw response…");

      const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/addnewstaff`;

      // Timeout for fetch as well (so it can't hang)
      const controller = new AbortController();
      const FETCH_TIMEOUT_MS = 15000;
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      let res;
      try {
        res = await fetch(FN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      // log basic response meta
      const meta = {
        status: res.status,
        ok: res.ok,
        sb_request_id: res.headers.get("sb_request_id"),
        x_sb_error_code: res.headers.get("x_sb_error_code"),
        content_type: res.headers.get("content-type"),
      };
      console.error("🟥 Direct fetch response meta:", meta);

      // try parse body as JSON, else text
      let server = {};
      let text = "";
      try {
        if (meta.content_type && meta.content_type.includes("application/json")) {
          server = await res.clone().json();
        } else {
          text = await res.clone().text();
          server = text ? { raw: text } : {};
        }
      } catch (parseErr) {
        console.warn("⚠️ Could not parse body:", parseErr);
      }

      // dump server logs if present
      if (server && Array.isArray(server.logs)) {
        console.groupCollapsed(
          "%c📝 Edge Function logs (direct fetch)",
          "color:#f59e0b"
        );
        server.logs.forEach((line, i) => console.log(`${i + 1}.`, line));
        console.groupEnd();
      } else if (text) {
        console.debug("📜 Raw body:", text);
      } else {
        console.debug("ℹ️ No body returned from function");
      }

      if (!res.ok) {
        const msg =
          server?.error ||
          server?.details ||
          server?.message ||
          `Add staff failed (HTTP ${meta.status})`;
        alert(msg);
        return;
      }

      // success via direct fetch
      if (!(server?.success || server?.ok)) {
        alert(server?.error || "Add staff failed.");
        return;
      }

      await handlePostSuccess(server);
    } catch (err) {
      console.error("🟥 AddNewStaffModal.handleSubmit error:", err);
      alert(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
      console.groupEnd();
    }
  };

  // Support either prop name (keeps existing behavior + prevents modal mismatch issues)
  const modalOpen = Boolean(open ?? isOpen);
  if (!modalOpen) return null;

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
