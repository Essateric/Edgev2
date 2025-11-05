import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";

// Helpers
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
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/London" }).format(
    new Date(iso)
  );
const fmtTimeUK = (iso) =>
  new Intl.DateTimeFormat("en-GB", { timeStyle: "short", timeZone: "Europe/London" }).format(
    new Date(iso)
  );

const DEFAULT_TEMPLATE =
  "Hi {{first_name}}, just a friendly reminder of your appointment on {{date}} at {{time}}. See you soon!";

const CHANNELS = ["email", "sms", "whatsapp"];

export default function RemindersDialog({
  isOpen,
  onClose,
  initialFrom,          // optional Date
  initialTo,            // optional Date
  defaultWeekFromDate,  // optional Date to auto-pick that week (usually Calendar visibleDate)
}) {
  const [from, setFrom] = useState(
    initialFrom ?? mondayStartOfWeek(defaultWeekFromDate ?? new Date())
  );
  const [to, setTo] = useState(
    initialTo ?? endOfWeekFrom(mondayStartOfWeek(defaultWeekFromDate ?? new Date()))
  );
  const [channel, setChannel] = useState("email");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [search, setSearch] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    // reset any previous result/errors when opening
    setError("");
    setResult(null);
  }, [isOpen]);

  const fetchBookings = async () => {
    setError("");
    setLoading(true);
    try {
      // Adjust names if your schema differs
      const { data, error } = await supabase
        .from("bookings")
        .select(
          `
          id,
          start,
          end,
          client_id,
          title,
          clients:client_id ( id, first_name, last_name, email, phone, whatsapp_opt_in )
        `
        )
        .gte("start", from.toISOString())
        .lte("start", to.toISOString())
        .order("start", { ascending: true });

      if (error) throw error;
      const mapped = (data ?? []).map((b) => ({
        id: b.id,
        start_time: b.start,
        end_time: b.end,
        title: b.title || "Appointment",
        client: {
          id: b.clients?.id,
          first_name: b.clients?.first_name || "",
          last_name: b.clients?.last_name || "",
          email: b.clients?.email || "",
          phone: b.clients?.phone || "",
          whatsapp_opt_in: !!b.clients?.whatsapp_opt_in,
        },
      }));

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
  }, [from, to, isOpen]); // runs when dates change while dialog is open

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

  const renderTemplate = (tpl, b) =>
    tpl
      .replaceAll("{{first_name}}", b.client.first_name || "")
      .replaceAll("{{last_name}}", b.client.last_name || "")
      .replaceAll("{{date}}", fmtDateUK(b.start_time))
      .replaceAll("{{time}}", fmtTimeUK(b.start_time));

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

      // Gate WhatsApp opt-in on client record
      if (channel === "whatsapp") {
        selected = selected.filter((r) => r.client.whatsapp_opt_in);
        if (!selected.length) {
          throw new Error("No recipients opted in for WhatsApp");
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
            booking_id: b.id,
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
      <div className="w-full sm:max-w-4xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b flex items-center gap-3">
          <h2 className="text-lg font-semibold">Send Reminders</h2>
          <div className="ml-auto flex items-center gap-2">
            <button
              className="px-3 py-1.5 text-sm rounded border"
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
              className="px-3 py-1.5 text-sm rounded border"
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
              className="px-3 py-1.5 text-sm rounded border"
              onClick={() => {
                const d = new Date();
                const s = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
                const e = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
                setFrom(s);
                setTo(e);
              }}
            >
              This month
            </button>
            <button
              className="px-3 py-1.5 text-sm rounded border"
              onClick={fetchBookings}
              disabled={loading}
              title="Refresh bookings"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
            <button className="px-3 py-1.5 text-sm rounded border" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="p-4 grid gap-3 sm:grid-cols-4 items-start">
          <div className="sm:col-span-2 flex items-center gap-2">
            <label className="text-sm w-16">From</label>
            <input
              type="date"
              className="border rounded p-2 w-full"
              value={from.toISOString().slice(0, 10)}
              onChange={(e) => {
                const d = new Date(e.target.value);
                d.setHours(0, 0, 0, 0);
                setFrom(d);
              }}
            />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <label className="text-sm w-16">To</label>
            <input
              type="date"
              className="border rounded p-2 w-full"
              value={to.toISOString().slice(0, 10)}
              onChange={(e) => {
                const d = new Date(e.target.value);
                d.setHours(23, 59, 59, 999);
                setTo(d);
              }}
            />
          </div>

          <div className="sm:col-span-1">
            <label className="block text-sm mb-1">Channel</label>
            <select
              className="border rounded p-2 w-full"
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
            <label className="block text-sm mb-1">Message template</label>
            <textarea
              className="border rounded p-3 w-full min-h-[110px]"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              Tokens: {"{{first_name}}"}, {"{{last_name}}"}, {"{{date}}"}, {"{{time}}"}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pb-3 flex items-center gap-2">
          <input
            className="border rounded p-2 flex-1"
            placeholder="Search name, email, phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filtered.length && selectedIds.size === filtered.length}
              onChange={(e) => toggleAll(e.target.checked)}
            />
            <span>Select all ({filtered.length})</span>
          </label>
          <button
            className="ml-auto bg-black text-white rounded px-4 py-2"
            onClick={onSend}
            disabled={loading}
          >
            {loading ? "Sending…" : "Send reminders"}
          </button>
        </div>

        {/* Feedback */}
        {error ? (
          <div className="px-4 pb-3">
            <div className="p-3 bg-red-50 text-red-700 rounded">{error}</div>
          </div>
        ) : null}
        {result ? (
          <div className="px-4 pb-3">
            <div className="p-3 bg-green-50 text-green-700 rounded">
              <div className="font-semibold">Sent</div>
              <div>
                Total: {result.total} | Success: {result.success} | Failed: {result.failed}
              </div>
            </div>
          </div>
        ) : null}

        {/* Table */}
        <div className="p-4 overflow-auto border-t">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="p-2 text-left">Sel</th>
                <th className="p-2 text-left">Client</th>
                <th className="p-2 text-left">Contact</th>
                <th className="p-2 text-left">Appointment</th>
                <th className="p-2 text-left">Preview</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const checked = selectedIds.has(b.id);
                const preview = renderTemplate(template, b);
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
                    <td className="p-2">
                      {b.client.first_name} {b.client.last_name}
                    </td>
                    <td className="p-2">
                      <div>{b.client.email || "—"}</div>
                      <div className="text-gray-500">{b.client.phone || "—"}</div>
                    </td>
                    <td className="p-2">
                      <div>{fmtDateUK(b.start_time)}</div>
                      <div className="text-gray-500">{fmtTimeUK(b.start_time)}</div>
                    </td>
                    <td className="p-2 text-gray-700 whitespace-pre-wrap">{preview}</td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-500">
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
