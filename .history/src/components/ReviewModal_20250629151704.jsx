import React from "react";
import Modal from "./Modal";
import Button from "./Button";
import { format } from "date-fns";

export default function ReviewModal({
  isOpen,
  onClose,
  onBack,
  onConfirm,
  clients,
  stylistList,
  selectedClient,
  selectedSlot,
  basket = [],
}) {
  const client = clients.find((c) => c.id === selectedClient);
  const stylist = stylistList.find((s) => s.id === selectedSlot?.resourceId);

  const timeLabel = selectedSlot
    ? `${format(selectedSlot.start, "eeee dd MMM yyyy")} ${format(
        selectedSlot.start,
        "HH:mm"
      )} - ${format(selectedSlot.end, "HH:mm")}`
    : "No Time Selected";

  const totalCost = basket.reduce(
    (sum, s) => sum + (Number(s.displayPrice) || 0),
    0
  );

  const totalDuration = basket.reduce(
    (sum, s) => sum + (Number(s.displayDuration) || 0),
    0
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-md p-4 max-w-lg w-full">
        <h2 className="text-xl font-bold text-bronze mb-4">
          Review Booking
        </h2>

        <div className="space-y-3">
          <div>
            <p className="font-semibold">Client:</p>
            <p>{client ? `${client.first_name} ${client.last_name}` : "Unknown"}</p>
          </div>

          <div>
            <p className="font-semibold">Stylist:</p>
            <p>{stylist?.title || "Unknown"}</p>
          </div>

          <div>
            <p className="font-semibold">Time:</p>
            <p>{timeLabel}</p>
          </div>

          <div>
            <p className="font-semibold">Services:</p>
            {basket.length === 0 ? (
              <p className="text-sm text-gray-500">No services selected.</p>
            ) : (
              <ul className="space-y-1">
                {basket.map((item, index) => (
                  <li key={index} className="flex justify-between">
                    <span>{item.name}</span>
                    <span>£{item.displayPrice}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t pt-2 flex justify-between font-semibold">
            <span>Total</span>
            <span>£{totalCost.toFixed(2)}</span>
          </div>
        </div>

        <div className="flex justify-between mt-4">
          <Button onClick={onBack}>Back</Button>
          <div className="flex gap-2">
            <Button onClick={onClose} className="bg-red-500 text-white">
              Cancel
            </Button>
            <Button
              onClick={onConfirm} // ✅ Simply closes review and goes back to NewBooking
              className="bg-green-600 text-white"
            >
              Confirm
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
