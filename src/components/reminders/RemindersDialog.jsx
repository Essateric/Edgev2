// ==========================================
// FILE: src/components/reminders/RemindersDialog.jsx
// ==========================================
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { REMINDER_DEFAULT_TEMPLATE } from "../../utils/Reminders";

// ---- Date helpers (prevents off-by-one with <input type="date">)
const dateToInputValue = (date) => {
  const d = new Date(date);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
};

const normalizeUkMobileToE164 = (raw) => {
  const s = String(raw || "").trim();
  if (!s) return "";

  // remove spaces, dashes, brackets
  let n = s.replace(/[^\d+]/g, "");

  // already E.164
  if (n.startsWith("+")) return n;

  // 00 prefix -> +
  if (n.startsWith("00")) return "+" + n.slice(2);

  // UK mobile 07xxxxxxxxx -> +447xxxxxxxxx
  if (n.startsWith("07")) return "+44" + n.slice(1);

  // UK without leading 0 (7xxxxxxxxx) -> +447xxxxxxxxx
  if (n.startsWith("7") && n.length === 10) return "+44" + n;

  return n; // fallback
};


const inputValueToDate = (yyyyMmDd, endOfDay = false) => {
  const [y, m, d] = String(yyyyMmDd).split("-").map(Number);
  return new Date(
    y,
    (m || 1) - 1,
    d || 1,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
};

const mondayStartOfWeek = (base) => {
  const d = new Date(base);
  const day = d.getDay(); // 0..6
  const diff = (day === 0 ? -6 : 1) - day; // Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
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

// ---- Client field helpers
const getClientFirstName = (c = {}, client_name = "") =>
  c.first_name || client_name.split(" ")[0] || "";

const getClientLastName = (c = {}, client_name = "") =>
  c.last_name || client_name.split(" ").slice(1).join(" ") || "";

const getClientEmail = (c = {}) => c.email || "";
const getClientPhone = (c = {}) => c.mobile || "";

const CHANNELS = ["email", "sms", "whatsapp"];

// Round to minute so tiny timestamp differences don’t create duplicates
const minuteKey = (iso) => {
  try {
    return new Date(iso).toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  } catch {
    return String(iso || "");
  }
};

export default function RemindersDialog({
  isOpen,
  onClose,
  initialFrom,
  initialTo,
  defaultWeekFromDate,
}) {
  const { currentUser, supabaseClient, baseSupabaseClient } = useAuth();

  // ✅ IMPORTANT: use the token-backed client (auto refreshes token)
  const db = supabaseClient || baseSupabaseClient;

  const baseDate = defaultWeekFromDate ? new Date(defaultWeekFromDate) : new Date();
  const defaultFrom = mondayStartOfWeek(baseDate);
  const defaultTo = endOfWeekFrom(defaultFrom);

  const [from, setFrom] = useState(initialFrom ? new Date(initialFrom) : defaultFrom);
  const [to, setTo] = useState(initialTo ? new Date(initialTo) : defaultTo);

  const [channel, setChannel] = useState("email");
  const [template, setTemplate] = useState(REMINDER_DEFAULT_TEMPLATE);

  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [search, setSearch] = useState("");
  const [result, setResult] = useState(null);

  // reset range on open
  useEffect(() => {
    if (!isOpen) return;

    setError("");
    setResult(null);
    setSearch("");

    const base = initialFrom ? new Date(initialFrom) : mondayStartOfWeek(baseDate);
    base.setHours(0, 0, 0, 0);

    const end = initialTo ? new Date(initialTo) : endOfWeekFrom(base);
    end.setHours(23, 59, 59, 999);

    setFrom(base);
    setTo(end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const fetchBookings = useCallback(async () => {
    setError("");
    setResult(null);
    setLoading(true);

    // If they are offline or token is missing, reminders won’t work anyway
    if (!db) {
      setLoading(false);
      setRows([]);
      setSelectedIds(new Set());
      setError("Database client not ready yet.");
      return;
    }

    if (currentUser?.offline) {
      setLoading(false);
      setRows([]);
      setSelectedIds(new Set());
      setError("Reminders need an online login (offline mode can’t send reminders).");
      return;
    }

    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);

    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    try {
      // ✅ Your real columns are start + "end"
      const { data, error } = await db
        .from("bookings")
        .select(
          `
          id,
          booking_id,
          title,
          client_id,
          client_name,
          start,
          end,
          clients:client_id ( id, first_name, last_name, mobile, email )
        `
        )
        .gte("start", fromDate.toISOString())
        .lte("start", toDate.toISOString())
        .order("start", { ascending: true });

      if (error) throw error;

      // ✅ One row per APPOINTMENT (not per row in bookings table)
      // Priority:
      // 1) booking_id (if exists)
      // 2) fallback key = client + start(minute)  (prevents duplicates when booking_id is null)
      const byKey = new Map();

      for (const b of data || []) {
        const c = b.clients || {};
        const clientName = b.client_name || "";
        const phone = getClientPhone(c);

        const clientKey =
          c.id || b.client_id || clientName || "unknown-client";

        const key =
          (b.booking_id && String(b.booking_id).trim()) ||
          `${clientKey}__${minuteKey(b.start)}`;

        const baseRow = {
          id: String(key),
          booking_id: b.booking_id || null,
          start_time: b.start,
          end_time: b.end || null,
          title: b.title || "Appointment",
          client: {
            id: c.id || b.client_id || null,
            first_name: getClientFirstName(c, clientName),
            last_name: getClientLastName(c, clientName),
            email: getClientEmail(c),
            phone,
            whatsapp_opt_in: !!phone,
          },
        };

        const existing = byKey.get(baseRow.id);
        if (!existing) {
          byKey.set(baseRow.id, baseRow);
        } else {
          // Keep earliest start and latest end (covers multi-row bookings)
          if (new Date(baseRow.start_time) < new Date(existing.start_time)) {
            existing.start_time = baseRow.start_time;
          }
          if (
            baseRow.end_time &&
            (!existing.end_time || new Date(baseRow.end_time) > new Date(existing.end_time))
          ) {
            existing.end_time = baseRow.end_time;
          }
          byKey.set(baseRow.id, existing);
        }
      }

      const mapped = Array.from(byKey.values());
      setRows(mapped);
      setSelectedIds(new Set(mapped.map((x) => x.id)));
    } catch (e) {
      console.error(e);
      setRows([]);
      setSelectedIds(new Set());
      setError(e?.message || "Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }, [db, currentUser?.offline, from, to]);

  useEffect(() => {
    if (!isOpen) return;
    fetchBookings();
  }, [isOpen, fetchBookings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((b) => {
      const name = `${b.client.first_name || ""} ${b.client.last_name || ""}`.toLowerCase();
      const email = (b.client.email || "").toLowerCase();
      const phone = (b.client.phone || "").toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q);
    });
  }, [rows, search]);

  const toggleAll = (checked) => {
    if (checked) setSelectedIds(new Set(filtered.map((r) => r.id)));
    else setSelectedIds(new Set());
  };
const onSend = async () => {
  setError("");
  setResult(null);
  setSending(true);

  try {
    let selected = rows.filter((r) => selectedIds.has(r.id));
    if (!selected.length) throw new Error("No bookings selected");

    // ✅ normalize channel so it always matches your Netlify function keys
    const normalizedChannel = String(channel || "email").toLowerCase().trim();

    if (normalizedChannel === "whatsapp") {
      selected = selected.filter((r) => r.client.phone);
      if (!selected.length)
        throw new Error("No recipients with a mobile number for WhatsApp");
    }

    const payload = {
      channel: normalizedChannel, // ✅ send the normalized value
      template,
      timezone: "Europe/London",
   bookings: selected.map((b) => ({
  id: b.id,                 // ✅ bookings.id (uuid) — required
  booking_id: b.booking_id, // ✅ bookings.booking_id (text) — group key
  start_time: b.start_time,
  end_time: b.end_time,
  client: b.client,
})),
    };

    console.log("[RemindersDialog] SEND payload", payload);

   const resp = await fetch("/.netlify/functions/sendBulkReminders", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    channel,
    template,
    timezone: "Europe/London",
    bookings: selected.map((b) => ({
      id: b.id,  
      booking_id: b.booking_id || b.id,
      start_time: b.start_time,
      end_time: b.end_time,
      client: b.client,
    })),
  }),
});

const json = await resp.json().catch(() => null);

console.log("[RemindersDialog] SEND result", json);

const firstFail = json?.results?.find((r) => r && r.ok === false);
if (firstFail) {
  console.warn("[RemindersDialog] SEND first error", firstFail.error);
}

if (!resp.ok) {
  throw new Error((json && json.message) || "Failed to send reminders");
}

setResult(json);

  } catch (e) {
    console.error(e);
    setError(e?.message || "Failed to send reminders");
  } finally {
    setSending(false);
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
              Loaded: {rows.length} | Selected: {selectedIds.size}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              className="px-3 py-1.5 text-xs sm:text-sm rounded border"
              onClick={fetchBookings}
              disabled={loading || sending}
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
            <button className="px-3 py-1.5 text-xs sm:text-sm rounded border" onClick={onClose}>
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
              value={dateToInputValue(from)}
              onChange={(e) => setFrom(inputValueToDate(e.target.value, false))}
            />
          </div>

          <div className="sm:col-span-2 flex items-center gap-2">
            <label className="text-xs sm:text-sm w-14 sm:w-16">To</label>
            <input
              type="date"
              className="border rounded px-2 py-2 w-full text-sm"
              value={dateToInputValue(to)}
              onChange={(e) => setTo(inputValueToDate(e.target.value, true))}
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
          </div>
        </div>

        {/* Search + action */}
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
              checked={filtered.length > 0 && selectedIds.size === filtered.length}
              onChange={(e) => toggleAll(e.target.checked)}
            />
            <span>Select all ({filtered.length})</span>
          </label>

          <button
            className="ml-auto bg-black text-white rounded px-4 py-2 text-sm"
            onClick={onSend}
            disabled={sending || loading}
          >
            {sending ? "Sending…" : "Send reminders"}
          </button>
        </div>

        {error && (
          <div className="px-4 pb-2">
            <div className="p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
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
              {filtered.map((b) => (
                <tr key={String(b.id)} className="border-t align-top">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(b.id)}
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
                    <div className="truncate max-w-[180px]">{b.client.email || "—"}</div>
                    <div className="text-gray-500">{b.client.phone || "—"}</div>
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    <div>{fmtDateUK(b.start_time)}</div>
                    <div className="text-gray-500">{fmtTimeUK(b.start_time)}</div>
                  </td>
                </tr>
              ))}

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

        {result && (
          <div className="px-4 pb-4">
            <div className="p-3 bg-green-50 text-green-700 rounded text-sm">
              Sent. Total: {result.total} | Success: {result.success} | Failed: {result.failed}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
