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
import RepeatBookingsModal from "./popup/RepeatBookingsModal"; // ESM import

/* Layout styles for the roomy popup */
import "../../styles/modal-tidy.css";

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
}) {
  const { supabaseClient } = useAuth();

  const [showActions, setShowActions] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [isEditingDob, setIsEditingDob] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);

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
    client,
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
  const groupRowIds = (relatedBookings || []).map((r) => r.id);
  const { notes, loading: notesLoading, setNotes } = useClientNotes({
    isOpen,
    clientId: displayClient?.id,
    groupRowIds,
    supabase: supabaseClient,
  });

  // DOB
  const { dobInput, setDobInput, savingDOB, dobError, saveDOB } = useSaveClientDOB();
  useEffect(() => {
    if (!displayClient) return;
    if (displayClient?.dob) {
      const v = String(displayClient.dob);
      setDobInput(v.includes("T") ? v.split("T")[0] : v);
    } else {
      setDobInput("");
    }
  }, [displayClient, setDobInput]);

  // derived
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
  const stylist = stylistList.find((s) => s.id === booking.resource_id);
  const isOnline =
    booking?.source === "public" ||
    (Array.isArray(relatedBookings) &&
      relatedBookings.some((r) => r.source === "public"));

  // handlers
  const handleCancelBooking = async () => {
    const confirmDelete = window.confirm(
      "Are you sure you want to cancel this booking?"
    );
    if (!confirmDelete) return;
    try {
      const { error } = await supabaseClient.from("bookings").delete().eq("id", booking.id);
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

  // loading guards — keep the same wrapper
  if (!displayClient && clientLoading) {
    return (
      <ModalLarge isOpen={isOpen} onClose={onClose}>
        <div className="p-4 text-sm text-gray-700">Loading client…</div>
      </ModalLarge>
    );
  }

  if (!displayClient && !clientLoading) {
    return (
      <ModalLarge isOpen={isOpen} onClose={onClose}>
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
    <ModalLarge isOpen={isOpen} onClose={onClose} hideCloseIcon>
      {/* === New layout wrapper that lets the popup breathe === */}
      <div className="modal-panel">
        {/* Header region */}
        <div className="modal-panel__header">
          <BookingHeader
            clientName={clientName}
            clientPhone={clientPhone}
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
        </div>

        {/* Scrollable body region */}
        <div className="modal-panel__body">
          <ServicesList
            displayServices={displayServices}
            serviceTotal={serviceTotal}
          />
        </div>

        {/* Actions row (flex, wraps on small screens) */}
        <div className="modal-panel__actions">
          <ActionsBar
            onOpenRepeat={() => setShowRepeat(true)}
            onOpenActions={() => setShowActions(true)}
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
          clientId={displayClient?.id || booking?.client_id || null}
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
              setNotes(filtered);
            } catch {
              /* ignore */
            }
          }}
        />
      )}

      {/* Repeat bookings modal */}
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
