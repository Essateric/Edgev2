// BookingPopup.jsx
import React from "react";
import Modal from "./Modal";
import { doc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import Button from "./Button";

export default function BookingPopup({
  isOpen,
  booking,
  onClose,
  onEdit,
  onDeleteSuccess,
}) {
  if (!booking) return null;

  const handleCancelBooking = async () => {
    const confirmDelete = window.confirm("Are you sure you want to cancel this booking?");
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, "bookings", booking.id));
      onDeleteSuccess(booking.id); // Remove from calendar
      onClose();
    } catch (err) {
      console.error("Failed to cancel booking:", err);
      alert("Something went wrong. Please try again.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="text-left space-y-2 max-w-md">
        <h2 className="text-xl font-bold text-bronze">Booking Details</h2>
        <p className="text-sm">
          <strong>Client:</strong> {booking.clientName || "Unknown"}
        </p>
        <p className="text-sm">
          <strong>Service:</strong> {booking.title}
        </p>
        <p className="text-sm">
          <strong>Time:</strong> {new Date(booking.start).toLocaleTimeString()} – {new Date(booking.end).toLocaleTimeString()}
        </p>

        <div className="flex justify-between mt-4">
          <Button onClick={onEdit} className="bg-blue-600 hover:bg-blue-700 text-white">
            Edit Booking
          </Button>
          <Button onClick={handleCancelBooking} className="bg-red-500 hover:bg-red-600 text-white">
            Cancel Booking
          </Button>
        </div>
      </div>
    </Modal>
  );
}
