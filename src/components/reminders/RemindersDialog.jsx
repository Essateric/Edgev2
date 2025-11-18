// src/components/reminders/RemindersDialog.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { REMINDER_DEFAULT_TEMPLATE } from "../../utils/Reminders";

// ===== Helpers =====
const mondayStartOfWeek = (d) => {
  const x = new Date(d);
  const day = x.getDay(); // 0..6 (Sun..Sat)
  const diff = (day === 0 ? -6 : 1) - day; // Monday start
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfWeekFrom = (start) => {
  const e = new Date(start);
  e.setDate(e.getDate() + 7);
  e.setMilliseconds(-1);
  return e;
};

const fmtDateUK = (iso) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Europe/London",
  }).format(new Date(iso));

const fmtTimeUK = (iso) =>
  new Intl.DateTimeFormat("en-GB", {
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(iso));

// Safely read client fields
const getClientFirstName = (c = {}) =>
  c.first_name || c.firstname || c.fname || c.given_name || "";

const getClientLastName = (c = {}) =>
  c.last_name || c.lastname || c.surname || c.family_name || "";

const getClientEmail = (c = {}) => c.email || c.email_address || c.mail || "";

// Mobile is the main phone field for you
const getClientPhone = (c = {}) =>
  c.mobile ||
  c.phone ||
  c.mobile_number ||
  c.phone_number ||
  c.contact_number ||
  "";

const CHANNELS = ["email", "sms", "whatsapp"];

export default function RemindersDialog({
  isOpen,
  onClose,
  initialFrom,
  initialTo,
  defaultWeekFromDate,
}) {
  const [from, setFrom] = useState(
    initialFrom ?? mondayStartOfWeek(defaultWeekFromDate ?? new Date())
  );
  const [to, setTo] = useState(
    initialTo ?? endOfWeekFrom(mondayStartOfWeek(defaultWeekFromDate ?? new Date()))
  );
  const [channel, setChannel] = useState("email");
  const [template, setTemplate] = useState(REMINDER_DEFAULT_TEMPLATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [search, setSearch] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setResult(null);
  }, [isOpen]);

  const fetchBookings = async () => {
    setError("");
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id,
          booking_id,
          start,
          end,
          client_id,
          title,
          clients:client_id (*)
        `)
        .gte("start", from.toISOString())
        .lte("start", to.toISOString())
        .order("start", { ascending: true });

      if (error) throw error;

      // Group rows by booking_id (one reminder per appointment).
      // If booking_id is null (older/manual bookings), fall back to row id.
      const byBooking = new Map();

      for (const b of data ?? []) {
        const c = b.clients || {};
        const phone = getClientPhone(c);
        const groupKey = b.booking_id || b.id;

        const baseRow = {
          id: groupKey, // used for selection
          booking_id: b.booking_id || null,
          start_time: b.start,
          end_time: b.end,
          title: b.title || "Appointment",
          client: {
            id: c.id,
            first_name: getClientFirstName(c),
            last_name: getClientLastName(c),
            email: getClientEmail(c),
            phone,
            // Auto-opt-in to WhatsApp if they have a mobile/phone
            whatsapp_opt_in: !!phone,
          },
        };

        const existing = byBooking.get(groupKey);

        if (!existing) {
          byBooking.set(groupKey, baseRow);
        } else {
          // Keep the earliest start and latest end for that booking
          if (new Date(baseRow.start_time) < new Date(existing.start_time)) {
            existing.start_time = baseRow.start_time;
          }
          if (new Date(baseRow.end_time) > new Date(existing.end_time)) {
            existing.end_time = baseRow.end_time;
          }
          byBooking.set(groupKey, existing);
        }
      }

      const mapped = Array.from(byBooking.values());

      setRows(mapped);
      setSelectedIds(new Set(mapped.map((x) => x.id))); // preselect all
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to load bookings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, isOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((b) => {
      const name = `${b.client.first_name} ${b.client.last_name}`.toLowerCase();
      return (
        name.includes(q) ||
        (b.client.email || "").toLowerCase().includes(q) ||
        (b.client.phone || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search]);

  const toggleAll = (checked) => {
    if (checked) setSelectedIds(new Set(filtered.map((r) => r.id)));
    else setSelectedIds(new Set());
  };

  const onSend = async () => {
    setError("");
    setResult(null);
    setLoading(true);
    try {
      let selected = rows.filter((r) => selectedIds.has(r.id));
      if (!selected.length) throw new Error("No bookings selected");

      if (channel === "whatsapp") {
        // Only send to clients with a mobile number
        selected = selected.filter((r) => r.client.phone);
        if (!selected.length) {
          throw new Error("No recipients with a mobile number for WhatsApp");
        }
      }

      const resp = await fetch("/.netlify/functions/sendBulkReminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          template,
          timezone: "Europe/London",
          bookings: selected.map((b) => ({
            booking_id: b.booking_id || b.id,
            start_time: b.start_time,
            end_time: b.end_time,
            client: b.client,
          })),
        }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(t || "Failed to send reminders");
      }
      const json = await resp.json();
      setResult(json);
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to send reminders");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6">
      <div className="w-full sm:max-w-4xl bg-white text-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b flex items-center gap-3 bg-gray-50">
          <div>
            <h2 className="text-base sm:text-lg font-semibold">Send Reminders</h2>
            <p className="text-xs sm:text-sm text-gray-600">
              Choose bookings, edit the message and send via Email / SMS / WhatsApp.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              className="px-3 py-1.5 text-xs sm:text-sm rounded border"
              onClick={() => {
                const s = mondayStartOfWeek(new Date());
                const e = endOfWeekFrom(s);
                setFrom(s);
                setTo(e);
              }}
            >
              This week
            </button>
            <button
              className="px-3 py-1.5 text-xs sm:text-sm rounded border"
              onClick={() => {
                const base = new Date();
                base.setDate(base.getDate() + 7);
                const s = mondayStartOfWeek(base);
                const e = endOfWeekFrom(s);
                setFrom(s);
                setTo(e);
              }}
            >
              Next week
            </button>
            <button
              className="px-3 py-1.5 text-xs sm:text-sm rounded border"
              onClick={() => {
                const d = new Date();
                const s = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
                const e = new Date(
                  d.getFullYear(),
                  d.getMonth() + 1,
                  0,
                  23,
                  59,
                  59,
                  999
                );
                setFrom(s);
                setTo(e);
              }}
            >
              This month
            </button>
            <button
              className="px-3 py-1.5 text-xs sm:text-sm rounded border"
              onClick={fetchBookings}
              disabled={loading}
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
            <button
              className="px-3 py-1.5 text-xs sm:text-sm rounded border"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="p-4 grid gap-3 sm:grid-cols-4 items-start border-b">
          <div className="sm:col-span-2 flex items-center gap-2">
            <label className="text-xs sm:text-sm w-14 sm:w-16">From</label>
            <input
              type="date"
              className="border rounded px-2 py-2 w-full text-sm"
              value={from.toISOString().slice(0, 10)}
              onChange={(e) => {
                const d = new Date(e.target.value);
                d.setHours(0, 0, 0, 0);
                setFrom(d);
              }}
            />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <label className="text-xs sm:text-sm w-14 sm:w-16">To</label>
            <input
              type="date"
              className="border rounded px-2 py-2 w-full text-sm"
              value={to.toISOString().slice(0, 10)}
              onChange={(e) => {
                const d = new Date(e.target.value);
                d.setHours(23, 59, 59, 999);
                setTo(d);
              }}
            />
          </div>

          <div className="sm:col-span-1">
            <label className="block text-xs sm:text-sm mb-1">Channel</label>
            <select
              className="border rounded px-2 py-2 w-full text-sm"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            <label className="block text-xs sm:text-sm mb-1">Message template</label>
            <textarea
              className="border rounded px-3 py-2 w-full min-h-[110px] text-sm"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Tokens: {"{{first_name}}"}, {"{{last_name}}"}, {"{{date}}"}, {"{{time}}"}
            </p>
          </div>
        </div>

        {/* Search + main action */}
        <div className="px-4 pt-3 pb-2 flex flex-wrap items-center gap-2">
          <input
            className="border rounded px-3 py-2 text-sm flex-1 min-w-[200px]"
            placeholder="Search name, email, phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs sm:text-sm whitespace-nowrap">
            <input
              type="checkbox"
              checked={filtered.length && selectedIds.size === filtered.length}
              onChange={(e) => toggleAll(e.target.checked)}
            />
            <span>Select all ({filtered.length})</span>
          </label>
          <button
            className="ml-auto bg-black text-white rounded px-4 py-2 text-sm"
            onClick={onSend}
            disabled={loading}
          >
            {loading ? "Sending…" : "Send reminders"}
          </button>
        </div>

        {/* Feedback */}
        {error && (
          <div className="px-4 pb-2">
            <div className="p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
          </div>
        )}
        {result && (
          <div className="px-4 pb-2">
            <div className="p-3 bg-green-50 text-green-700 rounded text-sm">
              <div className="font-semibold">Sent</div>
              <div className="mt-1">
                Total: {result.total} | Success: {result.success} | Failed:{" "}
                {result.failed}
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="p-4 overflow-auto border-t">
          <table className="min-w-full text-xs sm:text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="p-2 text-left w-10">Sel</th>
                <th className="p-2 text-left">Client</th>
                <th className="p-2 text-left">Contact</th>
                <th className="p-2 text-left">Appointment</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const checked = selectedIds.has(b.id);
                return (
                  <tr key={b.id} className="border-t align-top">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = new Set(selectedIds);
                          if (e.target.checked) next.add(b.id);
                          else next.delete(b.id);
                          setSelectedIds(next);
                        }}
                      />
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {b.client.first_name} {b.client.last_name}
                    </td>
                    <td className="p-2">
                      <div className="truncate max-w-[180px]">
                        {b.client.email || "—"}
                      </div>
                      <div className="text-gray-500">{b.client.phone || "—"}</div>
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      <div>{fmtDateUK(b.start_time)}</div>
                      <div className="text-gray-500">{fmtTimeUK(b.start_time)}</div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-gray-500 text-sm">
                    No bookings in range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
