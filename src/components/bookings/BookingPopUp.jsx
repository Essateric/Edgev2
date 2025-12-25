// src/components/bookings/BookingPopUp.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { fetchStaffForCurrentUser } from "../../lib/staff";
import { useDisplayClient } from "../hooks/useDisplayClient";
import useRelatedBookings from "../hooks/useRelatedBookings";
import { useClientNotes } from "../hooks/useClientNotes";
import { useSaveClientDOB } from "../hooks/useSaveClientDOB";

/* UI modules */
import ModalLarge from "../ModalLarge";
import BookingHeader from "./popup/BookingHeader";
import ServicesList from "./popup/ServicesList";
import ActionsBar from "./popup/ActionsBar";
import ActionsPopover from "./popup/ActionsPopover";
import ClientNotesModal from "../clients/ClientNotesModal";
import RepeatBookingsModal from "./popup/RepeatBookingsModal";

/* Layout styles for the roomy popup */
import "../../styles/modal-tidy.css";
import { format, differenceInDays } from "date-fns";
import { Check, X, Clock } from "lucide-react";

/* ✅ Small toggle switch (no deps) */
function ToggleSwitch({ checked, onChange, disabled = false, label }) {
  return (
    <div className="flex items-center justify-between gap-3 w-full">
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

// Defensive cancelled check (handles "cancelled", "canceled", whitespace, case)
const isCancelledStatus = (status) => {
  const s = String(status || "").trim().toLowerCase();
  return (
    s === "cancelled" ||
    s === "canceled" ||
    s.startsWith("cancel") ||
    s.includes("cancelled") ||
    s.includes("canceled")
  );
};

const toDateSafe = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const getStart = (b) => toDateSafe(b?.start ?? b?.start_time);
const getEnd = (b) => toDateSafe(b?.end ?? b?.end_time) ?? getStart(b);

function guessRepeatLabel(series) {
  if (!series || series.length < 2) return "Repeat bookings";

  const s0 = getStart(series[0]);
  const s1 = getStart(series[1]);
  if (!s0 || !s1) return "Repeat bookings";

  const d = differenceInDays(s1, s0);
  if (d >= 27 && d <= 33) return "Monthly";
  if (d >= 6 && d <= 8) return "Weekly";
  if (d >= 13 && d <= 15) return "Fortnightly";
  return "Repeat (custom)";
}

export default function BookingPopUp(props) {
  const { isOpen, booking } = props;
  if (!isOpen || !booking) return null;
  return <BookingPopUpBody {...props} />;
}

function BookingPopUpBody({
  isOpen,
  booking,
  onClose,
  onEdit,
  onDeleteSuccess,
  stylistList = [],
  clients = [],

  // ✅ optional: lets CalendarPage update its local events immediately
  onBookingUpdated,
}) {
  const { supabaseClient } = useAuth();

  const [showActions, setShowActions] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [isEditingDob, setIsEditingDob] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);

  // ✅ lock UI state
  const [lockBooking, setLockBooking] = useState(false);
  const [lockSaving, setLockSaving] = useState(false);
  const [lockError, setLockError] = useState("");

  // who is adding notes
  const [currentStaff, setCurrentStaff] = useState(null);
  useEffect(() => {
    let on = true;
    (async () => {
      if (!isOpen || !supabaseClient) return;
      const staff = await fetchStaffForCurrentUser(supabaseClient);
      if (on) setCurrentStaff(staff);
    })();
    return () => {
      on = false;
    };
  }, [isOpen, supabaseClient]);

  // client
  const {
    client, // kept (existing logic)
    displayClient,
    loading: clientLoading,
    err: clientError,
  } = useDisplayClient({ isOpen, booking, clients, supabase: supabaseClient });

  // group + services + blueprint
  const { relatedBookings, displayServices, blueprint } = useRelatedBookings({
    supabase: supabaseClient,
    bookingGroupId: booking?.booking_id,
  });

  // notes
  const groupRowIds = useMemo(
    () => (relatedBookings || []).map((r) => r.id),
    [relatedBookings]
  );

  const { notes, loading: notesLoading, setNotes } = useClientNotes({
    isOpen,
    clientId: displayClient?.id,
    groupRowIds,
    supabase: supabaseClient,
  });

  // DOB
  const { dobInput, setDobInput, savingDOB, dobError, saveDOB } =
    useSaveClientDOB();

  useEffect(() => {
    if (!displayClient) return;
    if (displayClient?.dob) {
      const v = String(displayClient.dob);
      setDobInput(v.includes("T") ? v.split("T")[0] : v);
    } else {
      setDobInput("");
    }
  }, [displayClient, setDobInput]);

  // derived totals
  const serviceTotal = useMemo(
    () =>
      (displayServices || []).reduce(
        (sum, s) => sum + (Number.isFinite(+s.price) ? +s.price : 0),
        0
      ),
    [displayServices]
  );

  const clientName =
    `${displayClient?.first_name ?? ""} ${displayClient?.last_name ?? ""}`.trim() ||
    "Client";

  const clientPhone = displayClient?.mobile || "N/A";

  // ✅ email derived safely
  const clientEmail =
    displayClient?.email || booking?.client_email || booking?.email || "N/A";

  const stylist = stylistList.find((s) => s.id === booking.resource_id);

  const isOnline =
    booking?.source === "public" ||
    (Array.isArray(relatedBookings) &&
      relatedBookings.some((r) => r.source === "public"));

  // ✅ lock derived (treat the group as locked if ANY row is locked)
  const derivedLocked = useMemo(() => {
    const fromGroup =
      Array.isArray(relatedBookings) && relatedBookings.length > 0
        ? relatedBookings.some((r) => !!r.is_locked)
        : null;

    if (fromGroup !== null) return fromGroup;
    return !!booking?.is_locked;
  }, [relatedBookings, booking?.is_locked]);

  // keep toggle in sync when popup opens + when relatedBookings finishes loading
  useEffect(() => {
    if (!isOpen) return;
    setLockBooking(!!derivedLocked);
    setLockError("");
  }, [isOpen, derivedLocked]);

  // ✅ FIX: show repeat bookings summary + list on the popup page
  const repeatSeries = useMemo(() => {
    // If we have a group, use it; otherwise just show the single booking.
    const base = Array.isArray(relatedBookings) && relatedBookings.length
      ? relatedBookings
      : [booking];

    // De-dupe by id and sort by start time
    const map = new Map();
    for (const b of base) {
      if (b?.id) map.set(b.id, b);
    }

    const list = Array.from(map.values()).sort((a, b) => {
      const sa = getStart(a)?.getTime() ?? 0;
      const sb = getStart(b)?.getTime() ?? 0;
      return sa - sb;
    });

    return list;
  }, [relatedBookings, booking]);

  const repeatSummary = useMemo(() => {
    if (!repeatSeries || repeatSeries.length <= 1) return null;

    const now = new Date();
    const label = guessRepeatLabel(repeatSeries);
    const pastCount = repeatSeries.filter((b) => {
      const end = getEnd(b);
      return end && end < now;
    }).length;

    // Best-effort "attended": past + not cancelled (no attendance column exists)
    const attendedCount = repeatSeries.filter((b) => {
      const end = getEnd(b);
      if (!end || end >= now) return false;
      return !isCancelledStatus(b?.status);
    }).length;

    return {
      label,
      total: repeatSeries.length,
      pastCount,
      attendedCount,
    };
  }, [repeatSeries]);

  // handlers
  const handleCancelBooking = async () => {
    const confirmDelete = window.confirm(
      "Are you sure you want to cancel this booking?"
    );
    if (!confirmDelete) return;
    try {
      const { error } = await supabaseClient
        .from("bookings")
        .delete()
        .eq("id", booking.id);

      if (error) {
        console.error("Failed to delete booking:", error);
        alert("Something went wrong.");
      } else {
        onDeleteSuccess?.(booking.id);
        onClose();
      }
    } catch (err) {
      console.error("Failed to cancel booking:", err);
      alert("Something went wrong. Please try again.");
    }
  };

  const handleSaveDOBClick = async () => {
    if (!dobInput) return alert("Please pick a date before saving!");
    if (!displayClient?.id)
      return alert("This booking isn’t linked to a client record yet.");

    const res = await saveDOB({ clientId: displayClient.id, dob: dobInput });
    if (res.ok) {
      alert("DOB updated!");
      setIsEditingDob(false);
    } else {
      alert("Supabase error: " + (res.error?.message || "Failed to save DOB"));
    }
  };

  const handleAddNoteSafe = async ({ clientId, noteText, bookingId }) => {
    const text = (noteText || "").trim();
    if (!text) return { ok: false, error: { message: "Empty note" } };

    const { data: authData } = await supabaseClient.auth.getUser();
    const payload = {
      client_id: clientId,
      note_content: text,
      booking_id: bookingId ?? null,
      created_by:
        currentStaff?.name ||
        currentStaff?.email ||
        authData?.user?.email ||
        "unknown",
    };

    const { data, error } = await supabaseClient
      .from("client_notes")
      .insert(payload)
      .select()
      .single();

    if (error) return { ok: false, error };
    return { ok: true, data };
  };

  // ✅ lock/unlock booking group
  const handleToggleLock = async (nextVal) => {
    if (!supabaseClient) return;
    setLockError("");
    setLockSaving(true);

    try {
      const next = !!nextVal;

      if (booking?.booking_id) {
        // update ALL rows in the group
        const { error } = await supabaseClient
          .from("bookings")
          .update({ is_locked: next })
          .eq("booking_id", booking.booking_id);

        if (error) throw error;
      } else {
        // fallback: update just this one row
        const { error } = await supabaseClient
          .from("bookings")
          .update({ is_locked: next })
          .eq("id", booking.id);

        if (error) throw error;
      }

      setLockBooking(next);

      onBookingUpdated?.({
        id: booking.id,
        booking_id: booking.booking_id ?? null,
        is_locked: next,
      });
    } catch (e) {
      console.error("[BookingPopUp] lock update failed:", e);
      setLockError(e?.message || "Failed to update lock");
      setLockBooking(!!derivedLocked);
    } finally {
      setLockSaving(false);
    }
  };

  if (!displayClient && clientLoading) {
    return (
      <ModalLarge isOpen={isOpen} onClose={onClose} zIndex={50}>
        <div className="p-4 text-sm text-gray-700">Loading client…</div>
      </ModalLarge>
    );
  }

  if (!displayClient && !clientLoading) {
    return (
      <ModalLarge isOpen={isOpen} onClose={onClose} zIndex={50}>
        <div className="p-4">
          <h2 className="text-lg font-bold text-rose-600">Client not found</h2>
          {clientError && (
            <p className="text-sm text-red-600 mt-1">{clientError}</p>
          )}
          <div className="mt-3">
            <button
              onClick={onClose}
              className="bg-orange-500 text-white px-3 py-1 rounded"
            >
              Close
            </button>
          </div>
        </div>
      </ModalLarge>
    );
  }

  return (
    <ModalLarge isOpen={isOpen} onClose={onClose} hideCloseIcon zIndex={50}>
      <div className="modal-panel">
        {/* Header region */}
        <div className="modal-panel__header">
          <BookingHeader
            clientName={clientName}
            clientPhone={clientPhone}
            clientEmail={clientEmail}
            isOnline={isOnline}
            isEditingDob={isEditingDob}
            dobInput={dobInput}
            setDobInput={setDobInput}
            savingDOB={savingDOB}
            dobError={dobError}
            onSaveDOB={handleSaveDOBClick}
            setIsEditingDob={setIsEditingDob}
            onOpenDetails={() => setShowNotesModal(true)}
          />

          {/* ✅ Toggle instead of checkbox */}
          <div className="mt-3 w-full">
            <div className="border rounded p-2 bg-gray-50">
              <ToggleSwitch
                checked={!!lockBooking}
                disabled={lockSaving}
                onChange={(v) => handleToggleLock(!!v)}
                label="Lock booking (can’t be moved)"
              />

              <div className="mt-1 flex items-center gap-2">
                {lockSaving && (
                  <span className="text-xs text-gray-500">Saving…</span>
                )}
                {!!lockError && (
                  <span className="text-xs text-red-600">{lockError}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable body region */}
        <div className="modal-panel__body">
          <ServicesList
            displayServices={displayServices}
            serviceTotal={serviceTotal}
          />

          {/* ✅ Repeat bookings summary + dates list (on the popup page) */}
          <div className="mt-4">
            <div className="border rounded-lg p-3 bg-gray-50">
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold text-gray-900">
                  {repeatSummary
                    ? `Repeat bookings: ${repeatSummary.label} (${repeatSummary.total})`
                    : "Repeat bookings: None"}
                </div>

                {repeatSummary && (
                  <div className="text-sm text-gray-600 whitespace-nowrap">
                    Completed: {repeatSummary.attendedCount}/{repeatSummary.pastCount}
                  </div>
                )}
              </div>

              {repeatSummary && (
                <div className="mt-3 space-y-2">
                  {repeatSeries.map((b) => {
                    const start = getStart(b);
                    const end = getEnd(b) ?? start;
                    const now = new Date();

                    const cancelled = isCancelledStatus(b?.status);
                    const isPast = !!end && end < now;
                    const isFuture = !!start && start >= now;

                    let Icon = Clock;
                    let iconClass = "text-gray-400";
                    let rightLabel = "Upcoming";

                    if (cancelled) {
                      Icon = X;
                      iconClass = "text-red-600";
                      rightLabel = "Cancelled";
                    } else if (isPast) {
                      Icon = Check;
                      iconClass = "text-green-600";
                      rightLabel = "Done";
                    } else if (isFuture) {
                      Icon = Clock;
                      iconClass = "text-gray-400";
                      rightLabel = "Upcoming";
                    }

                    return (
                      <div
                        key={b.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon className={`w-4 h-4 ${iconClass}`} />
                          <span className="font-medium truncate">
                            {start
                              ? `${format(start, "eee dd MMM yyyy")} • ${format(
                                  start,
                                  "HH:mm"
                                )}`
                              : "Unknown date"}
                          </span>
                        </div>

                        <span className="text-gray-600">{rightLabel}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {!repeatSummary && (
                <div className="mt-2 text-sm text-gray-500">
                  This booking isn’t part of a repeat series.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions row */}
        <div className="modal-panel__actions">
          <ActionsBar
            onOpenRepeat={() => setShowRepeat(true)}
            onOpenActions={() => setShowActions(true)}
            onCancelBooking={handleCancelBooking}
            onClose={onClose}
          />
        </div>
      </div>

      {/* Popover stays outside so it can layer over actions */}
      <ActionsPopover
        open={showActions}
        onClose={() => setShowActions(false)}
        onEdit={onEdit}
        onCancelBooking={handleCancelBooking}
      />

      {/* Notes modal */}
      {showNotesModal && (
        <ClientNotesModal
          modalZIndex={60}
          clientId={displayClient?.id || booking?.client_id || null}
          clientEmail={clientEmail}
          bookingId={booking?.id}
          isOpen={showNotesModal}
          onClose={() => setShowNotesModal(false)}
          staffContext={currentStaff || null}
          onAddNote={handleAddNoteSafe}
          onAfterChange={async () => {
            try {
              const { data } = await supabaseClient
                .from("client_notes")
                .select(
                  "id, client_id, booking_id, note_content, created_at, created_by"
                )
                .eq("client_id", displayClient.id)
                .order("created_at", { ascending: false });

              const groupIds = new Set((relatedBookings || []).map((r) => r.id));
              const filtered = (data || []).filter(
                (n) => !n.booking_id || groupIds.has(n.booking_id)
              );

              // kept from the other version (prevents “removed” diff)
              const _clientEmail =
                displayClient?.email ||
                booking?.client_email ||
                booking?.email ||
                "N/A";
              void _clientEmail;

              setNotes(filtered);
            } catch {
              /* ignore */
            }
          }}
        />
      )}

      {/* Repeat bookings modal (still used to create/manage repeats) */}
      <RepeatBookingsModal
        open={showRepeat}
        onClose={() => setShowRepeat(false)}
        booking={booking}
        blueprint={blueprint}
        stylist={stylist}
        supabaseClient={supabaseClient}
      />
    </ModalLarge>
  );
}
