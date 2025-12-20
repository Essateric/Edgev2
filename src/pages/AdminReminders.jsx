// ==========================================
// FILE: src/components/reminders/RemindersDialog.jsx
// ==========================================
import React, { useEffect, useMemo, useState } from "react";
import supabase from "../../supabaseClient"; // ✅ default export
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

// Your schema uses mobile primarily
const getClientPhone = (c = {}) =>
  c.mobile ||
  c.phone ||
  c.mobile_number ||
  c.phone_number ||
  c.contact_number ||
  "";

const normalizeEmbedOne = (maybe) => {
  if (!maybe) return null;
  return Array.isArray(maybe) ? maybe[0] || null : maybe;
};

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
    initialTo ??
      endOfWeekFrom(mondayStartOfWeek(defaultWeekFromDate ?? new Date()))
  );

  const [channel, setChannel] = useState("email");
  const [template, setTemplate] = useState(REMINDER_DEFAULT_TEMPLATE);

  const [loadingBookings, setLoadingBookings] = useState(false);
  const [sending, setSending] = useState(false);

  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [search, setSearch] = useState("");
  const [result, setResult] = useState(null);

  // Reset when opened + set default range based on visibleDate
  useEffect(() => {
    if (!isOpen) return;

    setError("");
    setResult(null);
    setSearch("");

    const base = initialFrom
      ? new Date(initialFrom)
      : mondayStartOfWeek(defaultWeekFromDate ?? new Date());
    base.setHours(0, 0, 0, 0);

    const end = initialTo ? new Date(initialTo) : endOfWeekFrom(base);
    end.setHours(23, 59, 59, 999);

    setFrom(base);
    setTo(end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const fetchBookings = async () => {
    setError("");
    setResult(null);
    setLoadingBookings(true);

    try {
      const fromDate = new Date(from);
      fromDate.setHours(0, 0, 0, 0);

      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);

      // ✅ DB columns: start and "end"
      // Alias them to start_time/end_time for UI
      const { data, error: qErr } = await supabase
        .from("bookings")
        .select(
          `
          id,
          booking_id,
          title,
          category,
          start_time:start,
          end_time:end,
          client_id,
          client_name,
          clients:client_id (
            id,
            first_name,
            last_name,
            mobile,
            email
          )
        `
        )
        .gte("start", fromDate.toISOString())
        .lte("start", toDate.toISOString())
        .order("start", { ascending: true });

      if (qErr) throw qErr;

      const raw = data || [];

      // ------------------------------------------------------------
      // NEW: Backfill client contact details if embed is missing
      // ------------------------------------------------------------
      // If your embedded join comes back null for some rows (common when
      // relationship / RLS / postgrest embed issues happen), we fetch
      // clients separately by client_id and merge.
      const missingClientIds = Array.from(
        new Set(
          raw
            .filter((b) => {
              const embedded = normalizeEmbedOne(b.clients);
              const hasEmbed = !!embedded?.id;
              const hasContact =
                !!getClientEmail(embedded || {}) || !!getClientPhone(embedded || {});
              return !!b.client_id && (!hasEmbed || !hasContact);
            })
            .map((b) => b.client_id)
            .filter(Boolean)
        )
      );

      let clientsById = new Map();

      if (missingClientIds.length) {
        try {
          const { data: clientRows, error: cErr } = await supabase
            .from("clients")
            .select("id, first_name, last_name, email, mobile")
            .in("id", missingClientIds);

          if (cErr) {
            // Don't fail the whole dialog — just log and continue with what we have
            console.warn("[RemindersDialog] client backfill failed:", cErr.message);
          } else {
            clientsById = new Map((clientRows || []).map((c) => [c.id, c]));
          }
        } catch (e) {
          console.warn("[RemindersDialog] client backfill exception:", e?.message);
        }
      }

      const mapped = raw.map((b) => {
        const embedded = normalizeEmbedOne(b.clients);
        const backfill = b.client_id ? clientsById.get(b.client_id) : null;

        // Prefer embedded, but use backfill to fill missing bits
        const c = embedded || backfill || {};

        const firstFromName = (b.client_name || "").split(" ")[0] || "";
        const lastFromName = (b.client_name || "").split(" ").slice(1).join(" ") || "";

        const first =
          getClientFirstName(c) || firstFromName || "";
        const last =
          getClientLastName(c) || lastFromName || "";

        const email = getClientEmail(c) || "";
        const phone = getClientPhone(c) || "";

        return {
          id: b.id, // ✅ always use uuid for selection
          booking_id: b.booking_id || null, // optional text ref
          title: b.title || "Appointment",
          category: b.category || "",
          start_time: b.start_time,
          end_time: b.end_time || null,
          client: {
            id: c.id || b.client_id || null,
            first_name: first,
            last_name: last,
            email,
            phone,
            whatsapp_opt_in: !!phone,
          },
        };
      });

      // Optional dev visibility
      if (import.meta.env.DEV) {
        const missingContactCount = mapped.filter(
          (r) => !r.client.email && !r.client.phone
        ).length;
        console.log("[RemindersDialog] bookings loaded:", mapped.length);
        console.log("[RemindersDialog] missing contact rows:", missingContactCount);
        if (missingContactCount) {
          console.log(
            "[RemindersDialog] examples missing contact:",
            mapped.filter((r) => !r.client.email && !r.client.phone).slice(0, 3)
          );
        }
      }

      setRows(mapped);
      setSelectedIds(new Set(mapped.map((x) => x.id))); // preselect all
    } catch (e) {
      console.error(e);
      setRows([]);
      setSelectedIds(new Set());
      setError(e?.message || "Failed to load bookings");
    } finally {
      setLoadingBookings(false);
    }
  };

  // Fetch whenever the dialog is open and range changes
  useEffect(() => {
    if (!isOpen) return;
    fetchBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, from, to]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((b) => {
      const name = `${b.client.first_name || ""} ${b.client.last_name || ""}`
        .trim()
        .toLowerCase();
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

      if (channel === "whatsapp") {
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
              disabled={loadingBookings || sending}
            >
              {loadingBookings ? "Loading..." : "Refresh"}
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
            disabled={sending || loadingBookings}
          >
            {sending ? "Sending…" : "Send reminders"}
          </button>
        </div>

        {/* Feedback */}
        {error && (
          <div className="px-4 pb-2">
            <div className="p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
          </div>
        )}

        {result && (
          <div className="px-4 pb-2 space-y-2">
            <div className="p-3 bg-green-50 text-green-700 rounded text-sm">
              <div className="font-semibold">Sent</div>
              <div className="mt-1">
                Total: {result.total} | Success: {result.success} | Failed: {result.failed}
              </div>
            </div>

            {result.results && result.results.length > 0 && (
              <div className="p-3 bg-gray-50 text-gray-800 rounded text-xs max-h-40 overflow-auto">
                {result.results.map((r, idx) => (
                  <div key={idx} className="mb-1">
                    Booking {r.booking_id}:{" "}
                    {r.ok ? "✅ sent" : `❌ failed – ${r.error || "Unknown error"}`}
                  </div>
                ))}
              </div>
            )}
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
                      <div className="truncate max-w-[180px]">{b.client.email || "—"}</div>
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
