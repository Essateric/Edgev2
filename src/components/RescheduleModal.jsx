import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import Modal from "./Modal";
import Button from "./Button";
import { useAuth } from "../contexts/AuthContext.jsx";

/* ===== Gap after chemical services ===== */
const CHEMICAL_GAP_MIN = 30;

const isChemical = (service) => {
  const text = [service?.name, service?.title, service?.category]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const keywords = [
    "tint",
    "colour",
    "color",
    "bleach",
    "toner",
    "gloss",
    "highlights",
    "balayage",
    "foils",
    "perm",
    "relaxer",
    "keratin",
    "chemical",
    "straightening",
  ];

  return keywords.some((k) => text.includes(k));
};

// datetime-local helpers (local wall-clock)
const toLocalDateTimeValue = (d) => {
  if (!d) return "";
  const pad = (v) => String(v).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

const parseLocalDateTime = (s) => {
  if (!s || typeof s !== "string" || !s.includes("T")) return null;
  const [datePart, timePart] = s.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  if (![y, m, d, hh, mm].every(Number.isFinite)) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0);
};

export default function RescheduleModal({
  isOpen,
  onClose,
  onConfirm,
  clients,
  clientObj,
  stylistList,
  selectedClient,
  selectedSlot,
  basket,
  rescheduleMeta,
}) {
  const { supabaseClient } = useAuth();
  const db = supabaseClient;

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const orderedRows = useMemo(() => {
    const rows = rescheduleMeta?.bookingRows || [];
    return [...rows].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
    );
  }, [rescheduleMeta]);

  const originalStart = orderedRows?.[0]?.start ? new Date(orderedRows[0].start) : null;
  const originalEnd = orderedRows?.length
    ? new Date(
        Math.max(...orderedRows.map((r) => new Date(r.end).getTime()))
      )
    : null;

  const clientFromList = useMemo(
    () => clients?.find((c) => c.id === selectedClient) || null,
    [clients, selectedClient]
  );

  const resolvedClientName = useMemo(() => {
    // prefer what’s already on the booking rows first (super reliable)
    const rowName = orderedRows?.[0]?.client_name;
    if (rowName) return rowName;

    const first = clientObj?.first_name ?? clientFromList?.first_name ?? "";
    const last = clientObj?.last_name ?? clientFromList?.last_name ?? "";
    const nm = `${first} ${last}`.trim();
    return nm || "Unknown Client";
  }, [orderedRows, clientObj, clientFromList]);

  // chosen staff (default from selected slot, else from first booking row)
  const [staffId, setStaffId] = useState(null);

  // chosen new start datetime-local string
  const [newStartValue, setNewStartValue] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    const slotStaff = selectedSlot?.resourceId ?? selectedSlot?.resource_id ?? null;
    const rowStaff =
      orderedRows?.[0]?.resource_id ?? orderedRows?.[0]?.resourceId ?? null;

    setStaffId(slotStaff || rowStaff || null);

    const slotStart = selectedSlot?.start ? new Date(selectedSlot.start) : null;
    const base = slotStart || originalStart || new Date();
    setNewStartValue(toLocalDateTimeValue(base));
  }, [isOpen, selectedSlot?.start, selectedSlot?.resourceId, orderedRows, originalStart]);

  const chosenStylist = useMemo(() => {
    return stylistList?.find((s) => s.id === staffId) || null;
  }, [stylistList, staffId]);

  const previewEnd = useMemo(() => {
    const startDate = parseLocalDateTime(newStartValue);
    if (!startDate || !orderedRows?.length) return null;

    let current = new Date(startDate);
    let lastEnd = new Date(startDate);

    for (let i = 0; i < orderedRows.length; i++) {
      const row = orderedRows[i];
      const durationMins = Math.max(
        1,
        Number(row?.duration ?? basket?.[i]?.displayDuration ?? basket?.[i]?.duration ?? 0)
      );

      const end = new Date(current.getTime() + durationMins * 60000);
      lastEnd = end;

      const serviceForGap =
        basket?.[i] ?? { name: row?.title, title: row?.title, category: row?.category };

      current = isChemical(serviceForGap)
        ? new Date(end.getTime() + CHEMICAL_GAP_MIN * 60000)
        : new Date(end);
    }

    return lastEnd;
  }, [newStartValue, orderedRows, basket]);

  const handleConfirm = async () => {
    setErrorMsg("");

    if (!db) return setErrorMsg("No Supabase client available.");
    if (!orderedRows?.length) return setErrorMsg("No booking rows found to reschedule.");

    const startDate = parseLocalDateTime(newStartValue);
    if (!startDate) return setErrorMsg("Pick a valid new date/time.");
    if (!staffId) return setErrorMsg("Pick a stylist.");

    setLoading(true);

    try {
      const newBookings = [];
      let currentStart = new Date(startDate);

      for (let index = 0; index < orderedRows.length; index++) {
        const row = orderedRows[index];

        const durationMins = Math.max(
          1,
          Number(
            row?.duration ??
              basket?.[index]?.displayDuration ??
              basket?.[index]?.duration ??
              0
          )
        );

        const startISO = currentStart.toISOString();
        const currentEnd = new Date(currentStart.getTime() + durationMins * 60000);
        const endISO = currentEnd.toISOString();

        const { data: bookingData, error: bookingError } = await db
          .from("bookings")
          .update({
            start: startISO,
            end: endISO,
            resource_id: staffId,
          })
          .eq("id", row.id)
          .select("*")
          .single();

        if (bookingError) throw bookingError;

        // IMPORTANT: keep any extra display props that existed on the original event row
        newBookings.push({
          ...row,
          ...bookingData,
          start: new Date(bookingData.start),
          end: new Date(bookingData.end),
          resourceId: bookingData.resource_id,
          stylistName: chosenStylist?.title || row?.stylistName,
        });

        const serviceForGap =
          basket?.[index] ?? { name: row?.title, title: row?.title, category: row?.category };

        currentStart = isChemical(serviceForGap)
          ? new Date(currentEnd.getTime() + CHEMICAL_GAP_MIN * 60000)
          : new Date(currentEnd);
      }

      onConfirm?.(newBookings);
    } catch (err) {
      console.error("🔥 Reschedule error:", err);
      setErrorMsg(err?.message || "Something went wrong while rescheduling.");
    } finally {
      setLoading(false);
    }
  };

  const originalLabel =
    originalStart && originalEnd
      ? `${format(originalStart, "eee dd MMM yyyy, HH:mm")} – ${format(originalEnd, "HH:mm")}`
      : "—";

  const newStartDate = parseLocalDateTime(newStartValue);
  const newLabel =
    newStartDate && previewEnd
      ? `${format(newStartDate, "eee dd MMM yyyy, HH:mm")} – ${format(previewEnd, "HH:mm")}`
      : "—";

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-md shadow p-4 max-w-md w-full">
        <h2 className="text-lg font-bold text-bronze mb-2">Reschedule Booking</h2>

        {!!errorMsg && <div className="mb-3 text-sm text-red-600">{errorMsg}</div>}

        <div className="mb-3">
          <p className="font-semibold text-gray-700">{resolvedClientName}</p>
          <p className="text-sm text-gray-600">
            <span className="font-medium">Current:</span> {originalLabel}
          </p>
          <p className="text-sm text-gray-600">
            <span className="font-medium">New:</span> {newLabel}
          </p>
        </div>

        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            New date / time
          </label>
          <input
            type="datetime-local"
            value={newStartValue}
            onChange={(e) => setNewStartValue(e.target.value)}
            disabled={loading}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Stylist
          </label>
          <select
            value={staffId || ""}
            onChange={(e) => setStaffId(e.target.value || null)}
            disabled={loading}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            <option value="">Select stylist</option>
            {(stylistList || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title || s.name || "Stylist"}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-between mt-4">
          <Button type="button" onClick={onClose} disabled={loading}>
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleConfirm}
            className="bg-green-600 text-white hover:bg-green-700"
            disabled={loading}
          >
            {loading ? "Rescheduling..." : "Confirm Reschedule"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
