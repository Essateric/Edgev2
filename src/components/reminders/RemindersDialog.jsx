// ==========================================
// FILE: src/components/reminders/RemindersDialog.jsx
// ==========================================
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { REMINDER_DEFAULT_TEMPLATE } from "../../utils/Reminders.js";

const PAGE_SIZE = 8;

// ---- Date helpers (prevents off-by-one with <input type="date">)
const dateToInputValue = (date) => {
  const d = new Date(date);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
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
  c.first_name || String(client_name || "").split(" ")[0] || "";

const getClientLastName = (c = {}, client_name = "") =>
  c.last_name || String(client_name || "").split(" ").slice(1).join(" ") || "";

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

// Cancelled check (handles "cancelled", "canceled", whitespace, case)
const isCancelledStatus = (status) => {
  const s = String(status || "").trim().toLowerCase();
  return s === "cancelled" || s === "canceled" || s.startsWith("cancel");
};

const isOnlineBooking = (source) => {
  const s = String(source || "").trim().toLowerCase();
  return s === "public" || s === "online" || s.includes("online_booking");
};

const getConfirmationStatus = (response) => {
  const s = String(response || "").trim().toLowerCase();
  if (!s) return "pending";

  if (
    s.startsWith("confirm") ||
    s === "yes" ||
    s === "y" ||
    s === "ok" ||
    s === "okay"
  ) {
    return "confirmed";
  }

  if (s.startsWith("cancel") || s === "no") {
    return "cancelled";
  }

  return "pending";
};

// Confirmation responses may come back as strings ("confirmed"), booleans, or even
// structured objects ({ status: "confirmed" }). Normalise them so selection logic
// doesn’t miss confirmed/cancelled states.
const normalizeConfirmationInput = (input) => {
  if (!input && input !== false) return null;

  if (typeof input === "string") return input;

  if (typeof input === "boolean") return input ? "confirmed" : "cancelled";

  if (typeof input === "object") {
    const candidate =
      input.status ||
      input.response ||
      input.reply ||
      input.choice ||
      input.value;
    if (candidate) return normalizeConfirmationInput(candidate);
  }

  return String(input || "");
};

const deriveConfirmationStatus = (input) => {
  const normalized = normalizeConfirmationInput(input);
  return getConfirmationStatus(normalized);
};

const isPastBooking = (startIso, now = new Date()) => {
  const d = new Date(startIso);
  return Number.isFinite(d.getTime()) && d.getTime() < now.getTime();
};

const normalizeResponse = (resp) => {
  const s = String(resp || "").trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("confirm")) return "confirmed";
  if (s.startsWith("cancel")) return "cancelled";
  return s;
};

const isFinalResponse = (resp) => {
  const r = normalizeResponse(deriveConfirmationStatus(resp));
  return r === "confirmed" || r === "cancelled";
};

const uniq = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

const pickLatestByTime = (items, getTimeIso) => {
  let best = null;
  let bestT = 0;

  for (const it of items || []) {
    const iso = getTimeIso(it);
    const t = new Date(iso || 0).getTime();
    if (!Number.isFinite(t)) continue;
    if (!best || t > bestT) {
      best = it;
      bestT = t;
    }
  }
  return best;
};

// Treat "confirmed" on bookings table as final too
const isBookingConfirmed = (row) => {
  const a = String(row?.status || "").trim().toLowerCase();
  const b = String(row?.booking_confirmation_status || "")
    .trim()
    .toLowerCase();
  return a === "confirmed" || b === "confirmed";
};

export default function RemindersDialog({
  isOpen,
  onClose,
  initialFrom,
  initialTo,
  defaultWeekFromDate,
}) {
  const { currentUser, supabaseClient, baseSupabaseClient } = useAuth();
  const db = supabaseClient || baseSupabaseClient;

  const baseDate = defaultWeekFromDate
    ? new Date(defaultWeekFromDate)
    : new Date();

  const defaultFrom = mondayStartOfWeek(baseDate);
  const defaultTo = endOfWeekFrom(defaultFrom);

  const [from, setFrom] = useState(
    initialFrom ? new Date(initialFrom) : defaultFrom
  );
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
  const [page, setPage] = useState(1);

  // reset range + template on open
  useEffect(() => {
    if (!isOpen) return;

    setError("");
    setResult(null);
    setSearch("");
    setTemplate(REMINDER_DEFAULT_TEMPLATE);

    const base = initialFrom
      ? new Date(initialFrom)
      : mondayStartOfWeek(baseDate);
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
      setError(
        "Reminders need an online login (offline mode can’t send reminders)."
      );
      return;
    }

    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);

    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    try {
      // ✅ We keep cancelled + past visible. We only disable sending/selecting.
      // IMPORTANT: also pull booking.confirmation_status so "confirmed" bookings are not selectable
      const { data, error: bookingsErr } = await db
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
            status,
            confirmation_status,
            client_response,
            confirmed_at,
            cancelled_at,
            source,
            clients:client_id ( id, first_name, last_name, mobile, email )
          `
        )
        .gte("start", fromDate.toISOString())
        .lte("start", toDate.toISOString())
        .order("start", { ascending: true });

      if (bookingsErr) throw bookingsErr;

      // ✅ One row per APPOINTMENT (grouped by booking_id, fallback to client+minute)
      const byKey = new Map();

      for (const b of data || []) {
        const c = b.clients || {};
        const clientName = b.client_name || "";
        const phone = getClientPhone(c);

        const clientKey = c.id || b.client_id || clientName || "unknown-client";
        const key =
          (b.booking_id && String(b.booking_id).trim()) ||
          `${clientKey}__${minuteKey(b.start)}`;

        const slotUuid = b.id;

        // Base confirmation derived from BOOKINGS row
        const baseConfirmStatus = deriveConfirmationStatus(
          b.confirmation_status ?? b.status ?? b.client_response
        );

        const row = {
          id: String(key), // group key for selection
          booking_uuid: slotUuid, // primary uuid (aligned to earliest slot)
          booking_id: b.booking_id || null,
          start_time: b.start,
          end_time: b.end || null,
          title: b.title || "Appointment",
          status: b.status || null,
          source: b.source || null,
          booking_confirmation_status: b.confirmation_status || null,
          client_response: b.client_response || null,
          confirmed_at: b.confirmed_at || null,
          cancelled_at: b.cancelled_at || null,

          // IMPORTANT: keep ALL slot UUIDs that got grouped into this row
          slot_uuids: uniq([slotUuid]),

          // Base confirmation (may get overridden by booking_confirmations query)
          confirmation: {
            status: baseConfirmStatus || "pending",
            respondedAt: b.confirmed_at || b.cancelled_at || null,
            response: b.client_response ?? b.confirmation_status ?? null,
          },

          client: {
            id: c.id || b.client_id || null,
            first_name: getClientFirstName(c, clientName),
            last_name: getClientLastName(c, clientName),
            email: getClientEmail(c),
            phone,
            whatsapp_opt_in: !!phone,
          },
        };

        const existing = byKey.get(row.id);
        if (!existing) {
          byKey.set(row.id, row);
          continue;
        }

        // Merge slot UUIDs (so confirmations/reminders attached to any slot are detected)
        existing.slot_uuids = uniq([...(existing.slot_uuids || []), slotUuid]);

        // Keep earliest start and latest end
        if (new Date(row.start_time) < new Date(existing.start_time)) {
          existing.start_time = row.start_time;
          existing.booking_uuid = row.booking_uuid; // align uuid to earliest slot
        }
        if (
          row.end_time &&
          (!existing.end_time ||
            new Date(row.end_time) > new Date(existing.end_time))
        ) {
          existing.end_time = row.end_time;
        }

        // ✅ If ANY slot is cancelled, treat the whole block as cancelled (wins)
        const existingCancelled =
          isCancelledStatus(existing.status) ||
          isCancelledStatus(existing.booking_confirmation_status);
        const rowCancelled =
          isCancelledStatus(row.status) ||
          isCancelledStatus(row.booking_confirmation_status);

        if (existingCancelled || rowCancelled) {
          existing.status = "cancelled";
          existing.booking_confirmation_status = "cancelled";
          existing.confirmation = {
            status: "cancelled",
            respondedAt:
              existing.confirmation?.respondedAt ||
              row.confirmation?.respondedAt ||
              existing.cancelled_at ||
              row.cancelled_at ||
              null,
            response: "cancelled",
          };
        } else {
          // ✅ Else, if ANY slot is confirmed, treat the whole block as confirmed
          const existingConf = isBookingConfirmed(existing);
          const rowConf = isBookingConfirmed(row);

          if (existingConf || rowConf) {
            existing.status = "confirmed";
            existing.booking_confirmation_status = "confirmed";
            existing.confirmation = {
              status: "confirmed",
              respondedAt:
                existing.confirmation?.respondedAt ||
                row.confirmation?.respondedAt ||
                existing.confirmed_at ||
                row.confirmed_at ||
                null,
              response: "confirmed",
            };
          } else {
            // keep as-is (pending/other)
            if (!existing.booking_confirmation_status && row.booking_confirmation_status) {
              existing.booking_confirmation_status = row.booking_confirmation_status;
            }
          }
        }

        // prefer any non-null confirmed/cancel timestamps
        existing.confirmed_at = existing.confirmed_at || row.confirmed_at || null;
        existing.cancelled_at = existing.cancelled_at || row.cancelled_at || null;

        byKey.set(row.id, existing);
      }

      let mapped = Array.from(byKey.values());

      // Collect ALL slot UUIDs across the grouped rows
      const allSlotUuids = uniq(
        mapped.flatMap((r) =>
          r.slot_uuids?.length ? r.slot_uuids : [r.booking_uuid]
        )
      );

      // Load latest reminder audit (best-effort)
      try {
        if (allSlotUuids.length) {
          const { data: reminders, error: reminderErr } = await db
            .from("audit_events")
            .select("entity_id, action, reason, created_at, details")
            .in("entity_id", allSlotUuids)
            .eq("action", "reminder_sent")
            .order("created_at", { ascending: false });

          if (reminderErr) throw reminderErr;

          // Latest per slot UUID
          const latestBySlot = new Map();
          for (const r of reminders || []) {
            if (!latestBySlot.has(r.entity_id)) latestBySlot.set(r.entity_id, r);
          }

          // For each grouped row, pick the latest reminder across its slots
          mapped = mapped.map((row) => {
            const slots = row.slot_uuids?.length
              ? row.slot_uuids
              : [row.booking_uuid];
            const candidates = slots
              .map((id) => latestBySlot.get(id))
              .filter(Boolean);

            const latest = pickLatestByTime(candidates, (x) => x.created_at);
            if (!latest) return row;

            const details = latest.details || {};
            return {
              ...row,
              lastReminder: {
                channel: latest.reason || details.channel || null,
                sentAt: latest.created_at || details.sent_at || null,
                staff: details.staff_name || details.staff_email || null,
              },
            };
          });
        }
      } catch (remErr) {
        console.warn(
          "[RemindersDialog] failed to load reminder history",
          remErr?.message
        );
      }

      // Load latest confirmation response (best-effort)
      // IMPORTANT: if none exists, DO NOT overwrite bookings.confirmation_status-derived state
      try {
        if (allSlotUuids.length) {
          const { data: confirmations, error: confirmationErr } = await db
            .from("booking_confirmations")
            .select("booking_id, response, responded_at, created_at")
            .in("booking_id", allSlotUuids)
            .order("responded_at", { ascending: false })
            .order("created_at", { ascending: false });

          if (confirmationErr) throw confirmationErr;

          // Latest per slot UUID
          const latestBySlot = new Map();
          for (const c of confirmations || []) {
            if (!latestBySlot.has(c.booking_id)) latestBySlot.set(c.booking_id, c);
          }

          mapped = mapped.map((row) => {
            const slots = row.slot_uuids?.length
              ? row.slot_uuids
              : [row.booking_uuid];
            const candidates = slots
              .map((id) => latestBySlot.get(id))
              .filter(Boolean);

            const latest = pickLatestByTime(
              candidates,
              (x) => x.responded_at || x.created_at
            );

            // No DB confirmation row -> keep whatever we already derived from bookings table
            if (!latest) return row;

            const confirmationStatus = deriveConfirmationStatus(
              latest.response ?? latest.status
            );

            return {
              ...row,
              confirmation: {
                status: confirmationStatus,
                respondedAt: latest.responded_at || latest.created_at || null,
                response: latest.response ?? latest.status ?? null,
              },
            };
          });
        }
      } catch (confirmationErr) {
        console.warn(
          "[RemindersDialog] failed to load booking confirmations",
          confirmationErr?.message
        );
      }

      // Ensure a default confirmation so downstream checks don’t break.
      mapped = mapped.map((r) => ({
        ...r,
        confirmation:
          r.confirmation || {
            status: isOnlineBooking(r.source) ? "confirmed" : "pending",
            respondedAt: null,
            response: null,
          },
      }));

      const now = new Date();

      // ✅ Preselect only contactable bookings (not cancelled/past/responded/confirmed)
      const selectable = mapped.filter((r) => {
        const confirmationStatus = deriveConfirmationStatus(
          r.confirmation?.status ?? r.confirmation?.response ?? r.confirmation
        );

        const responded = isFinalResponse(confirmationStatus);
        const confirmedByBooking = isBookingConfirmed(r);

        return (
          !isCancelledStatus(r.status) &&
          !isPastBooking(r.start_time, now) &&
          !responded &&
          !confirmedByBooking
        );
      });

      setRows(mapped);
      setSelectedIds(new Set(selectable.map((x) => x.id)));
      setPage(1);
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

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
    [filtered.length]
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    if (page < 1) setPage(1);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const showingFrom = paginated.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const showingTo = paginated.length ? showingFrom + paginated.length - 1 : 0;

  const filteredSelectable = useMemo(() => {
    const now = new Date();
    return paginated.filter((r) => {
      const confirmationStatus = deriveConfirmationStatus(r.confirmation?.status);
      const bookingConf = isBookingConfirmed(r);
      return (
        !isCancelledStatus(r.status) &&
        !isPastBooking(r.start_time, now) &&
        !isFinalResponse(confirmationStatus) &&
        !bookingConf
      );
    });
  }, [paginated]);

  const selectedInFiltered = useMemo(
    () => filteredSelectable.filter((r) => selectedIds.has(r.id)).length,
    [filteredSelectable, selectedIds]
  );

  const allSelectableSelected =
    filteredSelectable.length > 0 &&
    filteredSelectable.every((r) => selectedIds.has(r.id));

  const toggleAll = (checked) => {
    const next = new Set(selectedIds);
    if (checked) {
      filteredSelectable.forEach((r) => next.add(r.id));
    } else {
      filteredSelectable.forEach((r) => next.delete(r.id));
    }
    setSelectedIds(next);
  };

  const changePage = (next) => {
    if (next < 1 || next > totalPages) return;
    setPage(next);
  };

  const onSend = async () => {
    setError("");
    setResult(null);
    setSending(true);

    try {
      const normalizedChannel = String(channel || "email").toLowerCase().trim();

      let selected = rows.filter((r) => selectedIds.has(r.id));
      const now = new Date();

      // ✅ Hard block: never send to cancelled OR past OR responded OR confirmed
      selected = selected.filter((r) => {
        const confirmationStatus = deriveConfirmationStatus(
          r.confirmation?.status ?? r.confirmation?.response ?? r.confirmation
        );
        const responded = isFinalResponse(confirmationStatus);
        const confirmedByBooking = isBookingConfirmed(r);

        return (
          !isCancelledStatus(r.status) &&
          !isPastBooking(r.start_time, now) &&
          !responded &&
          !confirmedByBooking
        );
      });

      if (!selected.length) {
        throw new Error(
          "No contactable bookings selected (cancelled/past/responded/confirmed bookings can’t be contacted)."
        );
      }

      // Optional but sensible: ensure the required contact exists for the chosen channel
      if (normalizedChannel === "whatsapp" || normalizedChannel === "sms") {
        selected = selected.filter((r) => r.client.phone);
        if (!selected.length) {
          throw new Error("No recipients with a mobile number for this channel.");
        }
      }
      if (normalizedChannel === "email") {
        selected = selected.filter((r) => r.client.email);
        if (!selected.length) {
          throw new Error("No recipients with an email address.");
        }
      }

      const payload = {
        channel: normalizedChannel,
        template,
        timezone: "Europe/London",
        actor: {
          id: currentUser?.id || null,
          email: currentUser?.email || null,
          name: currentUser?.name || null,
        },
        bookings: selected.map((b) => ({
          id: b.booking_uuid, // ✅ FK-safe uuid (earliest slot UUID for the group)
          booking_id: b.booking_id, // optional group id
          start_time: b.start_time,
          end_time: b.end_time,
          client: b.client,
        })),
      };

      const resp = await fetch("/.netlify/functions/sendBulkReminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await resp.json().catch(() => null);

      if (!resp.ok) {
        throw new Error((json && json.message) || "Failed to send reminders");
      }

      setResult(json);
      fetchBookings(); // refresh table so latest reminder metadata shows up
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to send reminders");
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  const nowForCounts = new Date();
  const cancelledCount = rows.filter((r) => isCancelledStatus(r.status)).length;
  const pastCount = rows.filter((r) => isPastBooking(r.start_time, nowForCounts)).length;

  return (
    <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center bg-black/40 p-0 lg:p-6">
      <div className="w-full lg:max-w-4xl bg-white text-gray-900 rounded-t-2xl lg:rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b flex items-center gap-3 bg-gray-50">
          <div>
            <h2 className="text-base lg:text-lg font-semibold">Send Reminders</h2>
            <p className="text-xs sm:text-lg text-gray-600">
              Loaded: {rows.length}
              {cancelledCount ? ` • ${cancelledCount} cancelled` : ""}
              {pastCount ? ` • ${pastCount} past` : ""}
              {" • "}
              Selected: {selectedIds.size}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              className="px-3 py-1.5 text-xs lg:text-lg rounded border"
              onClick={fetchBookings}
              disabled={loading || sending}
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
            <button
              className="px-3 py-1.5 text-xs lg:text-lg rounded border"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="p-4 grid gap-3 lg:grid-cols-4 items-start border-b">
          <div className="lg:col-span-2 flex items-center gap-2">
            <label className="text-xs lg:text-lg w-14 lg:w-16">From</label>
            <input
              type="date"
              className="border rounded px-2 py-2 w-full text-lg"
              value={dateToInputValue(from)}
              onChange={(e) => setFrom(inputValueToDate(e.target.value, false))}
            />
          </div>

          <div className="lg:col-span-2 flex items-center gap-2">
            <label className="text-xs lg:text-lg w-14 lg:w-16">To</label>
            <input
              type="date"
              className="border rounded px-2 py-2 w-full text-lg"
              value={dateToInputValue(to)}
              onChange={(e) => setTo(inputValueToDate(e.target.value, true))}
            />
          </div>

          <div className="lg:col-span-1">
            <label className="block text-xs lg:text-lg mb-1">Channel</label>
            <div className="flex gap-2 items-center">
              {CHANNELS.map((c) => {
                const isActive = channel === c;
                const disabledLook = !isActive ? "opacity-60" : "";
                return (
                  <label
                    key={c}
                    className={`flex items-center gap-1 text-xs sm:text-sm px-2 py-1 border rounded cursor-pointer ${disabledLook}`}
                  >
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={() => setChannel(c)}
                      className="h-4 w-4"
                    />
                    <span>{c.toUpperCase()}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-3">
            <label className="block text-xs lg:text-lg mb-1">
              Message template
            </label>
            <textarea
              className="border rounded px-3 py-2 w-full min-h-[110px] text-lg"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
          </div>
        </div>

        {/* Search + action */}
        <div className="px-4 pt-3 pb-2 flex flex-wrap items-center gap-2">
          <input
            className="border rounded px-3 py-2 text-lg flex-1 min-w-[200px]"
            placeholder="Search name, email, phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <label className="flex items-center gap-2 text-xs lg:text-lg whitespace-nowrap">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={allSelectableSelected}
              onChange={(e) => toggleAll(e.target.checked)}
            />
            <span>Select all ({selectedInFiltered} selected)</span>
          </label>

          <button
            className="ml-auto bg-black text-white rounded px-4 py-2 text-lg"
            onClick={onSend}
            disabled={sending || loading}
          >
            {sending ? "Sending…" : "Send reminders"}
          </button>
        </div>

        {error && (
          <div className="px-4 pb-2">
            <div className="p-3 bg-red-50 text-red-700 rounded text-lg">
              {error}
            </div>
          </div>
        )}

        {/* Table */}
        <div className="p-4 border-t space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-700">
            <div>
              Showing {showingFrom ? `${showingFrom}-${showingTo}` : "0"} of{" "}
              {filtered.length} bookings
            </div>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1.5 rounded border text-sm disabled:opacity-50"
                onClick={() => changePage(page - 1)}
                disabled={page === 1}
              >
                Previous
              </button>
              <span className="px-2">
                Page {page} of {totalPages}
              </span>
              <button
                className="px-3 py-1.5 rounded border text-sm disabled:opacity-50"
                onClick={() => changePage(page + 1)}
                disabled={page === totalPages}
              >
                Next
              </button>
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block overflow-hidden rounded-xl border">
            <div className="max-h-[50vh] overflow-y-auto">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="p-2 text-left w-12">Sel</th>
                    <th className="p-2 text-left w-[18%]">Client</th>
                    <th className="p-2 text-left w-[20%]">Contact</th>
                    <th className="p-2 text-left w-[12%]">Status</th>
                    <th className="p-2 text-left w-[10%]">Channel</th>
                    <th className="p-2 text-left w-[16%]">Sent</th>
                    <th className="p-2 text-left w-[12%]">Staff</th>
                    <th className="p-2 text-left w-[12%]">Appointment</th>
                  </tr>
                </thead>

                <tbody>
                  {paginated.map((b) => {
                    const cancelled = isCancelledStatus(b.status);
                    const past = isPastBooking(b.start_time, new Date());

                    // Prefer explicit confirmation response; otherwise fallback to bookings table status/confirmation_status
                    const confirmationStatus = deriveConfirmationStatus(
                      b.confirmation?.status ??
                        b.confirmation?.response ??
                        b.confirmation
                    );

                    const bookingConf = isBookingConfirmed(b);

                    const rowStatus =
                      confirmationStatus !== "pending"
                        ? confirmationStatus
                        : bookingConf
                        ? "confirmed"
                        : cancelled
                        ? "cancelled"
                        : "pending";

                    const responded =
                      rowStatus === "confirmed" || rowStatus === "cancelled";
                    const disabled = cancelled || past || responded;
                    const checked = selectedIds.has(b.id);

                    let statusClass = "bg-white";
                    if (rowStatus === "confirmed")
                      statusClass = "bg-green-50 border-l-4 border-green-500";
                    if (rowStatus === "cancelled")
                      statusClass = "bg-pink-50 border-l-4 border-pink-500";
                    if (past && !responded) statusClass = "bg-gray-50";

                    return (
                      <tr
                        key={String(b.id)}
                        className={`border-t align-top ${statusClass} ${
                          disabled ? "opacity-70" : ""
                        }`}
                        title={
                          cancelled
                            ? "Cancelled booking (cannot send reminders)"
                            : responded && rowStatus === "confirmed"
                            ? "Client confirmed (reminders disabled)"
                            : responded && rowStatus === "cancelled"
                            ? "Client cancelled (reminders disabled)"
                            : past
                            ? "Past booking (cannot send reminders)"
                            : ""
                        }
                      >
                        <td className="p-2 align-top">
                          <input
                            type="checkbox"
                            className="h-5 w-5"
                            disabled={disabled}
                            checked={disabled ? false : checked}
                            onChange={(e) => {
                              const next = new Set(selectedIds);
                              if (e.target.checked) next.add(b.id);
                              else next.delete(b.id);
                              setSelectedIds(next);
                            }}
                          />
                        </td>

                        <td className="p-2 align-top">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {b.client.first_name} {b.client.last_name}
                            </span>

                            {cancelled && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                                CANCELLED
                              </span>
                            )}

                            {past && !cancelled && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border-gray-200">
                                PAST
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="p-2 align-top">
                          <div className="break-words">
                            {b.client.email || "—"}
                          </div>
                          <div className="text-gray-500">
                            {b.client.phone || "—"}
                          </div>
                        </td>

                        <td className="p-2 align-top">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border ${
                              rowStatus === "confirmed"
                                ? "bg-green-100 text-green-800 border-green-200"
                                : rowStatus === "cancelled"
                                ? "bg-pink-100 text-pink-800 border-pink-200"
                                : "bg-gray-100 text-gray-700 border-gray-200"
                            }`}
                          >
                            {rowStatus === "pending"
                              ? "PENDING"
                              : rowStatus.toUpperCase()}
                          </span>
                        </td>

                        <td className="p-2 align-top whitespace-nowrap">
                          {b.lastReminder?.channel
                            ? b.lastReminder.channel.toUpperCase()
                            : "—"}
                        </td>
                        <td className="p-2 align-top whitespace-nowrap">
                          {b.lastReminder?.sentAt ? (
                            <div>
                              <div>{fmtDateUK(b.lastReminder.sentAt)}</div>
                              <div className="text-gray-500">
                                {fmtTimeUK(b.lastReminder.sentAt)}
                              </div>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-2 align-top whitespace-nowrap">
                          {b.lastReminder?.staff || "—"}
                        </td>
                        <td className="p-2 align-top whitespace-nowrap">
                          <div className="font-medium">
                            {fmtDateUK(b.start_time)}
                          </div>
                          <div className="text-gray-500">
                            {fmtTimeUK(b.start_time)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {!filtered.length && (
                    <tr>
                      <td
                        colSpan={8}
                        className="p-6 text-center text-gray-500 text-base"
                      >
                        No bookings in range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {paginated.map((b) => {
              const cancelled = isCancelledStatus(b.status);
              const past = isPastBooking(b.start_time, new Date());

              const confirmationStatus = deriveConfirmationStatus(
                b.confirmation?.status ?? b.confirmation?.response ?? b.confirmation
              );
              const bookingConf = isBookingConfirmed(b);

              const rowStatus =
                confirmationStatus !== "pending"
                  ? confirmationStatus
                  : bookingConf
                  ? "confirmed"
                  : cancelled
                  ? "cancelled"
                  : "pending";

              const responded = rowStatus === "confirmed" || rowStatus === "cancelled";
              const disabled = cancelled || past || responded;
              const checked = selectedIds.has(b.id);

              let statusClass = "bg-white";
              if (rowStatus === "confirmed")
                statusClass = "bg-green-50 border-l-4 border-green-500";
              if (rowStatus === "cancelled")
                statusClass = "bg-pink-50 border-l-4 border-pink-500";
              if (past && !responded) statusClass = "bg-gray-50";

              return (
                <div
                  key={String(b.id)}
                  className={`border rounded-xl p-3 shadow-sm ${statusClass} ${
                    disabled ? "opacity-70" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="h-5 w-5 mt-1"
                      disabled={disabled}
                      checked={disabled ? false : checked}
                      onChange={(e) => {
                        const next = new Set(selectedIds);
                        if (e.target.checked) next.add(b.id);
                        else next.delete(b.id);
                        setSelectedIds(next);
                      }}
                    />

                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-base">
                          {b.client.first_name} {b.client.last_name}
                        </span>

                        {cancelled && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                            CANCELLED
                          </span>
                        )}

                        {past && !cancelled && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border-gray-200">
                            PAST
                          </span>
                        )}

                        <span
                          className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border ${
                            rowStatus === "confirmed"
                              ? "bg-green-100 text-green-800 border-green-200"
                              : rowStatus === "cancelled"
                              ? "bg-pink-100 text-pink-800 border-pink-200"
                              : "bg-gray-100 text-gray-700 border-gray-200"
                          }`}
                        >
                          {rowStatus === "pending"
                            ? "PENDING"
                            : rowStatus.toUpperCase()}
                        </span>
                      </div>

                      <div className="text-sm">
                        <div className="break-words">{b.client.email || "—"}</div>
                        <div className="text-gray-500">{b.client.phone || "—"}</div>
                      </div>

                      <div className="text-sm">
                        <div className="font-medium">{fmtDateUK(b.start_time)}</div>
                        <div className="text-gray-500">{fmtTimeUK(b.start_time)}</div>
                      </div>

                      <div className="text-xs text-gray-600">
                        <div>
                          Last reminder:{" "}
                          {b.lastReminder?.channel
                            ? b.lastReminder.channel.toUpperCase()
                            : "—"}
                        </div>
                        {b.lastReminder?.sentAt ? (
                          <div>
                            {fmtDateUK(b.lastReminder.sentAt)} •{" "}
                            {fmtTimeUK(b.lastReminder.sentAt)}
                          </div>
                        ) : null}
                        {b.lastReminder?.staff ? (
                          <div>Staff: {b.lastReminder.staff}</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {!filtered.length && (
              <div className="p-6 text-center text-gray-500 text-base border rounded-xl">
                No bookings in range.
              </div>
            )}
          </div>
        </div>

        {result && (
          <div className="px-4 pb-4">
            <div className="p-3 bg-green-50 text-green-700 rounded text-lg">
              Sent. Total: {result.total_groups ?? result.total ?? "—"} | Success:{" "}
              {result.success ?? "—"} | Failed: {result.failed ?? "—"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
