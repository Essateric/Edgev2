import React from "react";
import Modal from "./Modal";
import { format } from "date-fns";

export default function BookingDetailModal({
  isOpen,
  onClose,
  booking,
  stylistList,
  onEdit,
  onCancelBooking,
}) {
  const stylistName = stylistList.find(s => s.id === booking?.resourceId)?.title || "Unknown";

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h3 className="text-lg font-bold text-bronze mb-4">Booking Details</h3>
      <p className="mb-1 text-sm text-gray-700"><strong>Service:</strong> {booking?.title}</p>
      <p className="mb-1 text-sm text-gray-700"><strong>Stylist:</strong> {stylistName}</p>
      <p className="mb-3 text-sm text-gray-700">
        <strong>Time:</strong>{" "}
        {booking?.start && format(new Date(booking.start), "dd/MM/yyyy HH:mm")} –{" "}
        {booking?.end && format(new Date(booking.end), "HH:mm")}
      </p>

      <div className="flex justify-between mt-4">
        <button
          onClick={onEdit}
          className="bg-bronze text-white px-4 py-2 rounded"
        >
          Edit
        </button>

        <button
          onClick={onCancelBooking}
          className="bg-red-500 text-white px-4 py-2 rounded"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
