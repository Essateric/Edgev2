import React, { useMemo, useState } from "react";
import Modal from "./Modal";
import Button from "./Button";
import { format } from "date-fns";
import SaveBookingsLog from "./bookings/SaveBookingsLog";
import { v4 as uuidv4 } from "uuid";
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

// Prevent “Booking…” hanging forever if log call stalls
const withTimeout = (promise, ms, label = "Operation") =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);

/* ✅ Small toggle switch (no deps) */
function ToggleSwitch({ checked, onChange, disabled = false, label }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-gray-700">{label}</span>

      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          onChange?.(!checked);
        }}
        className={[
          "relative inline-flex h-6 w-11 items-center rounded-full transition",
          checked ? "bg-emerald-600" : "bg-gray-300",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-5 w-5 rounded-full bg-white transition transform",
            checked ? "translate-x-5" : "translate-x-1",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

export default function ReviewModal({
  isOpen,
  onClose,
  onBack,
  onConfirm,
  clients,
  clientObj, // ✅ passed from CalendarPage
  reviewData, // ✅ payload from NewBooking.onNext(...)
  stylistList,
  selectedClient,
  selectedSlot,
  basket,
}) {
  const { supabaseClient, currentUser } = useAuth();
  const db = supabaseClient;

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // ✅ NEW: lock toggle (applies to all rows created for this booking_id group)
  const [lockBooking, setLockBooking] = useState(false);

  // Existing lookup (may fail if clients[] doesn’t contain the selected client)
  const clientFromList = useMemo(
    () => clients?.find((c) => c.id === selectedClient) || null,
    [clients, selectedClient]
  );

  const stylist = useMemo(
    () => stylistList?.find((s) => s.id === selectedSlot?.resourceId) || null,
    [stylistList, selectedSlot?.resourceId]
  );

  // ✅ FIX: resolve client id using reviewData FIRST
  const resolvedClientId = useMemo(() => {
    return (
      reviewData?.client_id ??
      reviewData?.client?.id ??
      clientObj?.id ??
      clientFromList?.id ??
      selectedClient ??
      null
    );
  }, [reviewData, clientObj, clientFromList, selectedClient]);

  // ✅ FIX: resolve displayable name reliably
  const resolvedClientName = useMemo(() => {
    return (
      reviewData?.client_name ||
      (clientObj
        ? `${clientObj.first_name ?? ""} ${clientObj.last_name ?? ""}`.trim()
        : clientFromList
        ? `${clientFromList.first_name ?? ""} ${clientFromList.last_name ?? ""}`.trim()
        : "Unknown Client")
    );
  }, [reviewData, clientObj, clientFromList]);

  const timeLabel = selectedSlot
    ? `${format(selectedSlot.start, "eeee dd MMM yyyy")} ${format(
        selectedSlot.start,
        "HH:mm"
      )} - ${format(selectedSlot.end, "HH:mm")}`
    : "No time selected";

  const mins = basket.reduce(
    (sum, s) => sum + (Number(s.displayDuration) || 0),
    0
  );
  const hrs = Math.floor(mins / 60);
  const remainingMins = mins % 60;

  const totalPrice = basket.reduce(
    (sum, s) => sum + (Number(s.displayPrice) || 0),
    0
  );

  const handleConfirm = async () => {
    setErrorMsg("");

    if (!db) {
      setErrorMsg("No Supabase client available.");
      return;
    }
    if (!selectedSlot?.start) {
      setErrorMsg("No start time selected.");
      return;
    }
    if (!basket?.length) {
      setErrorMsg("Please add at least one service.");
      return;
    }

    setLoading(true);

    try {
      const pathname =
        (typeof window !== "undefined" && window.location?.pathname) || "";

      const isPublicBooking =
        /\/(book|booking|online)/i.test(pathname) || pathname === "/";

      // For your PIN system, currentUser.id is typically staff.id
      const logged_by = isPublicBooking ? null : currentUser?.id ?? null;

      const resource_id = stylist?.id ?? selectedSlot?.resourceId ?? null;
      const resource_name = stylist?.title ?? "Unknown";

      const booking_id = uuidv4();

      // Public policy expects client_id null
      const client_id_for_booking = isPublicBooking ? null : resolvedClientId;
      const source = isPublicBooking ? "public" : "staff";
      const status = "pending";

      const newBookings = [];
      let currentStart = new Date(selectedSlot.start);

      // optional extra fields to carry into returned event objects (not DB columns)
      const ext = reviewData?.extendedProps || {};

      for (const service of basket) {
        const durationMins = Math.max(1, Number(service.displayDuration || 0));

        const startISO = currentStart.toISOString();
        const currentEnd = new Date(
          currentStart.getTime() + durationMins * 60000
        );
        const endISO = currentEnd.toISOString();

        const newBooking = {
          booking_id,
          client_id: client_id_for_booking,
          client_name: resolvedClientName,
          resource_id,
          start: startISO,
          end: endISO,
          title: service.name,
          price: Number(service.displayPrice) || 0,
          duration: durationMins,
          category: service.category || "Uncategorised",
          source,
          status,

          // ✅ NEW: lock flag stored in DB
          is_locked: !!lockBooking,
        };

        console.log("[ReviewModal] inserting booking", newBooking);

        const { data: bookingData, error: bookingError } = await db
          .from("bookings")
          .insert([newBooking])
          .select("*")
          .single();

        console.log("[ReviewModal] insert result", { bookingData, bookingError });

        if (bookingError) throw bookingError;

        // ✅ Merge extra “display-only” props into the calendar event objects we return
        newBookings.push({
          ...bookingData,
          ...ext,
          start: new Date(bookingData.start),
          end: new Date(bookingData.end),
          resourceId: bookingData.resource_id,
        });

        withTimeout(
          SaveBookingsLog({
            action: "created",
            booking_id,
            client_id: client_id_for_booking,
            client_name: resolvedClientName,
            stylist_id: resource_id,
            stylist_name: resource_name,
            service,
            start: startISO,
            end: endISO,
            logged_by,
            reason: isPublicBooking ? "Public Booking" : "Manual Booking",
            before_snapshot: null,
            after_snapshot: newBooking, // includes is_locked
          }),
          8000,
          "SaveBookingsLog"
        ).catch((e) => {
          console.warn(
            "[ReviewModal] log failed (non-blocking):",
            e?.message || e
          );
        });

        // Add chemical gap
        if (isChemical(service)) {
          currentStart = new Date(
            currentEnd.getTime() + CHEMICAL_GAP_MIN * 60000
          );
        } else {
          currentStart = new Date(currentEnd);
        }
      }

      console.log("✅ All bookings saved");
      if (typeof onConfirm === "function") onConfirm(newBookings);
    } catch (err) {
      console.error("🔥 Booking error:", err);
      setErrorMsg(err?.message || "Something went wrong while booking.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-md shadow p-4 max-w-md w-full">
        <h2 className="text-lg font-bold text-bronze mb-2">Review Booking</h2>

        {!!errorMsg && (
          <div className="mb-3 text-sm text-red-600">{errorMsg}</div>
        )}

        <div className="mb-2">
          <p className="font-semibold text-gray-700">{resolvedClientName}</p>
          <p className="text-sm text-gray-600">{timeLabel}</p>
          <p className="text-sm text-gray-600">
            Stylist: {stylist?.title || "Unknown"}
          </p>
        </div>

        {/* ✅ Toggle instead of checkbox */}
        <div className="mb-3 border rounded p-2 bg-gray-50">
          <ToggleSwitch
            checked={lockBooking}
            onChange={(v) => setLockBooking(!!v)}
            disabled={loading}
            label="Lock booking (can’t be moved)"
          />
        </div>

        <div className="border rounded p-2 mb-3">
          <h4 className="font-semibold text-bronze mb-1">Services</h4>

          {basket.map((b, i) => (
            <div key={i} className="flex justify-between text-sm text-gray-700">
              <span>{b.name}</span>
              <span>£{Number(b.displayPrice || 0)}</span>
              <span>
                {Math.floor(Number(b.displayDuration || 0) / 60)}h{" "}
                {Number(b.displayDuration || 0) % 60}m
              </span>
            </div>
          ))}

          <div className="mt-2 border-t pt-1 flex justify-between font-semibold">
            <span>Total</span>
            <span>£{totalPrice.toFixed(2)}</span>
            <span>
              {hrs}h {remainingMins}m
            </span>
          </div>
        </div>

        <div className="flex justify-between mt-4">
          <Button type="button" onClick={onBack} disabled={loading}>
            Back
          </Button>

          <Button
            type="button"
            onClick={handleConfirm}
            className="bg-green-600 text-white hover:bg-green-700"
            disabled={loading}
          >
            {loading ? "Booking..." : "Confirm Booking"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
