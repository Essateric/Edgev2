// ==============================
// FILE: src/pages/AdminReminders.jsx
// ==============================
import React, { useEffect, useMemo, useState } from "react";
import supabase from "../supabaseClient";

// If you have a central auth/user hook, you can replace with that
import InitAuthAudit from "../auth/initAuthAudit.jsx";

// Simple utilities
const startOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = (day === 0 ? -6 : 1) - day; // Monday as start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfWeek = (date) => {
  const s = startOfWeek(date);
  const e = new Date(s);
  e.setDate(e.getDate() + 7);
  e.setMilliseconds(-1);
  return e;
};

const fmtDateTimeUK = (iso) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(iso));

const defaultTemplate = `Hi {{first_name}}, just a friendly reminder of your appointment on {{date}} at {{time}}. See you soon!`;

const channels = ["email", "sms", "whatsapp"];

// Helpers to safely read client fields even if names differ a bit
function getClientFirstName(c = {}) {
  return (
    c.first_name ||
    c.firstname ||
    c.fname ||
    c.given_name ||
    c.name_first ||
    ""
  );
}

function getClientLastName(c = {}) {
  return (
    c.last_name ||
    c.lastname ||
    c.surname ||
    c.family_name ||
    c.name_last ||
    ""
  );
}

function getClientEmail(c = {}) {
  return c.email || c.email_address || c.mail || "";
}

function getClientPhone(c = {}) {
  // Try a few likely column names – whichever exists will be used
  return (
    c.phone ||
    c.mobile ||
    c.mobile_number ||
    c.phone_number ||
    c.contact_number ||
    ""
  );
}

function getWhatsappOptIn(c = {}) {
  return !!(
    c.whatsapp_opt_in ||
    c.whatsapp ||
    c.allow_whatsapp ||
    c.sms_opt_in
  );
}

export default function AdminReminders() {
  const [from, setFrom] = useState(() => startOfWeek(new Date()));
  const [to, setTo] = useState(() => endOfWeek(new Date()));
  const [channel, setChannel] = useState("email");
  const [template, setTemplate] = useState(defaultTemplate);
  const [loading, setLoading] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [sentResult, setSentResult] = useState(null);

  // Replace with your real admin/role check if available
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      // Example: check a user_metadata role, or query a profile table
      if (user?.user_metadata?.role === "admin") setIsAdmin(true);
    })();
  }, []);

  const fetchBookings = async () => {
    setError("");
    setLoading(true);
    try {
      // bookings(id, start_time, end_time, client_id, note)
      // clients(id, first_name, last_name, email, <phone-ish>, whatsapp_opt_in)
      const { data, error } = await supabase
        .from("bookings")
        .select(
          `
          id,
          start_time,
          end_time,
          note,
          clients:client_id(*)
        `
        )
        .gte("start_time", from.toISOString())
        .lte("start_time", to.toISOString())
        .order("start_time", { ascending: true });

      if (error) throw error;

      const rows = (data || []).map((b) => {
        const c = b.clients || {};
        const client = {
          id: c.id,
          first_name: getClientFirstName(c),
          last_name: getClientLastName(c),
          email: getClientEmail(c),
          phone: getClientPhone(c),
          whatsapp_opt_in: getWhatsappOptIn(c),
        };
        return {
          id: b.id,
          start_time: b.start_time,
          end_time: b.end_time,
          note: b.note,
          client,
        };
      });

      setBookings(rows);
      setSelectedIds(new Set(rows.map((r) => r.id))); // preselect all
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to load bookings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter((b) => {
      const name = `${b.client.first_name} ${b.client.last_name}`.toLowerCase();
      return (
        name.includes(q) ||
        b.client.email.toLowerCase().includes(q) ||
        (b.client.phone || "").toLowerCase().includes(q)
      );
    });
  }, [bookings, search]);

  const toggleAll = (checked) => {
    if (checked) setSelectedIds(new Set(filtered.map((b) => b.id)));
    else setSelectedIds(new Set());
  };

  const onSend = async () => {
    setError("");
    setLoading(true);
    setSentResult(null);
    try {
      const selected = bookings.filter((b) => selectedIds.has(b.id));
      if (!selected.length) throw new Error("No bookings selected");

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
      setSentResult(json);
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to send reminders");
    } finally {
      setLoading(false);
    }
  };

  const replaceTokens = (tpl, b) => {
    const date = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeZone: "Europe/London",
    }).format(new Date(b.start_time));
    const time = new Intl.DateTimeFormat("en-GB", {
      timeStyle: "short",
      timeZone: "Europe/London",
    }).format(new Date(b.start_time));
    return tpl
      .replaceAll("{{first_name}}", b.client.first_name || "")
      .replaceAll("{{last_name}}", b.client.last_name || "")
      .replaceAll("{{date}}", date)
      .replaceAll("{{time}}", time);
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <InitAuthAudit />
        <h1 className="text-2xl font-semibold">Reminders</h1>
        <p className="mt-2 text-red-600">You must be an admin to access this page.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-slate-100/60 min-h-[calc(100vh-4rem)]">
      <InitAuthAudit />
      <div className="mx-auto max-w-5xl bg-white text-gray-900 rounded-lg shadow border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 bg-gray-50 border-b">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold">
              Send Appointment Reminders
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
              Choose a date range, edit the message, then send via Email / SMS / WhatsApp.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 sm:px-6 py-4 sm:py-6 space-y-6 text-sm">
          {/* Date range */}
          <section className="grid gap-3 md:grid-cols-4">
            <div className="col-span-2 flex items-center gap-2">
              <label className="text-xs sm:text-sm w-16 sm:w-20">From</label>
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
            <div className="col-span-2 flex items-center gap-2">
              <label className="text-xs sm:text-sm w-16 sm:w-20">To</label>
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
            <div className="col-span-4 flex flex-wrap gap-2 pt-1">
              <button
                className="border rounded px-3 py-1.5 text-xs sm:text-sm"
                onClick={() => {
                  const now = new Date();
                  setFrom(startOfWeek(now));
                  setTo(endOfWeek(now));
                }}
              >
                This week
              </button>
              <button
                className="border rounded px-3 py-1.5 text-xs sm:text-sm"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 7);
                  setFrom(startOfWeek(d));
                  setTo(endOfWeek(d));
                }}
              >
                Next week
              </button>
              <button
                className="border rounded px-3 py-1.5 text-xs sm:text-sm"
                onClick={() => {
                  const d = new Date();
                  setFrom(new Date(d.getFullYear(), d.getMonth(), 1));
                  setTo(
                    new Date(
                      d.getFullYear(),
                      d.getMonth() + 1,
                      0,
                      23,
                      59,
                      59,
                      999
                    )
                  );
                }}
              >
                This month
              </button>
              <button
                className="border rounded px-3 py-1.5 text-xs sm:text-sm ml-auto"
                onClick={fetchBookings}
                disabled={loading}
              >
                {loading ? "Loading…" : "Refresh bookings"}
              </button>
            </div>
          </section>

          {/* Channel + message template */}
          <section className="grid gap-4 md:grid-cols-4 items-start">
            <div className="col-span-4 md:col-span-1 space-y-2">
              <div>
                <label className="block text-xs sm:text-sm mb-1">Channel</label>
                <select
                  className="border rounded px-2 py-2 w-full text-sm"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  {channels.map((c) => (
                    <option key={c} value={c}>
                      {c.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="col-span-4 md:col-span-3">
              <label className="block text-xs sm:text-sm mb-1">
                Message template
              </label>
              <textarea
                className="border rounded px-3 py-2 w-full min-h-[110px] text-sm"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Tokens: {"{{first_name}}"}, {"{{last_name}}"}, {"{{date}}"},{" "}
                {"{{time}}"}
              </p>
            </div>
          </section>

          {/* Search + actions */}
          <section className="flex flex-wrap items-center gap-2">
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
          </section>

          {/* Error / result */}
          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded text-sm">
              {error}
            </div>
          )}
          {sentResult && (
            <div className="p-3 bg-green-50 text-green-700 rounded text-sm">
              <div className="font-semibold">Reminders sent</div>
              <div className="mt-1">
                Total: {sentResult.total} | Success: {sentResult.success} | Failed:{" "}
                {sentResult.failed}
              </div>
            </div>
          )}

          {/* Bookings table */}
          <section className="border rounded overflow-auto">
            <table className="min-w-full text-xs sm:text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-left w-10">Sel</th>
                  <th className="p-2 text-left">Client</th>
                  <th className="p-2 text-left">Contact</th>
                  <th className="p-2 text-left">Appointment</th>
                  <th className="p-2 text-left">Preview</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const checked = selectedIds.has(b.id);
                  const preview = replaceTokens(template, b);
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
                        <div className="text-gray-500">
                          {b.client.phone || "—"}
                        </div>
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        <div>{fmtDateTimeUK(b.start_time)}</div>
                        {b.end_time && (
                          <div className="text-gray-500">
                            Ends {fmtDateTimeUK(b.end_time)}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-gray-700 whitespace-pre-wrap max-w-xs sm:max-w-md">
                        {preview}
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length && (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-6 text-center text-gray-500 text-sm"
                    >
                      No bookings in range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="text-[11px] text-gray-500">
            <p>
              Note: This page expects a <code>bookings</code> table with a foreign
              key <code>client_id</code> pointing to a <code>clients</code> table.
              If your column names for first name / last name / email / phone are
              different, they are handled in the helper functions at the top of
              this file.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
