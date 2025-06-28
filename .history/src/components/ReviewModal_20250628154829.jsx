import React from "react";
import Modal from "./Modal";
import { format } from "date-fns";

export default function ReviewModal({
  isOpen,
  onClose,
  clients,
  stylistList,
  selectedSlot,
  selectedClient,
  onBack,
  onConfirm,
}) {
  const clientObj = clients.find((c) => c.id === selectedClient);
  const stylist = stylistList.find((s) => s.id === selectedSlot?.resourceId);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h3 className="text-lg font-bold mb-4 text-bronze">
        Review Details
      </h3>

      <div className="text-sm text-gray-700 mb-1">
        <p>
          <strong>Client:</strong> {clientObj?.first_name} {clientObj?.last_name}
        </p>
        <p>
          <strong>Phone:</strong> {clientObj?.mobile}
        </p>
        <p>
          <strong>Time:</strong>{" "}
          {selectedSlot
            ? `${format(
                selectedSlot.start,
                "eeee dd MMMM yyyy"
              )} ${format(selectedSlot.start, "HH:mm")} - ${format(
                selectedSlot.end,
                "HH:mm"
              )}`
            : ""}
        </p>
        <p>
          <strong>Stylist:</strong> {stylist?.title}
        </p>
      </div>

      <div className="flex justify-between mt-4">
        <button onClick={onBack} className="text-gray-500">
          Back
        </button>
        <button
          onClick={onConfirm}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Confirm
        </button>
      </div>
    </Modal>
  );
}
