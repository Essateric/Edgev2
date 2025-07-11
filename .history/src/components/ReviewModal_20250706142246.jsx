import React, { useState } from "react";
import Modal from "./Modal";
import Button from "./Button";
import { format } from "date-fns";
import { supabase } from "../supabaseClient.js";
import SaveBookingsLog from "./bookings/SaveBookingsLog";

export default function ReviewModal({
  isOpen,
  onClose,
  onBack,
  onConfirm,
  clients,
  stylistList,
  selectedClient,
  selectedSlot,
  basket,
}) {
  const [loading, setLoading] = useState(false);

  const client = clients.find((c) => c.id === selectedClient);
  const stylist = stylistList.find((s) => s.id === selectedSlot?.resourceId);

  const clientName = client
    ? `${client.first_name} ${client.last_name}`
    : "Unknown Client";

  const timeLabel = selectedSlot
    ? `${format(selectedSlot.start, "eeee dd MMM yyyy")} ${format(
        selectedSlot.start,
        "HH:mm"
      )} - ${format(selectedSlot.end, "HH:mm")}`
    : "No time selected";

  const mins = basket.reduce((sum, s) => sum + (s.displayDuration || 0), 0);
  const hrs = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  const totalPrice = basket.reduce(
    (sum, s) => sum + (Number(s.displayPrice) || 0),
    0
  );

const handleConfirm = async () => {
  try {
    setLoading(true);

    const client_id = client?.id;
    const client_name = `${client?.first_name ?? ""} ${client?.last_name ?? ""}`.trim();
    const resource_id = stylist?.id;
    const resource_name = stylist?.name ?? "Unknown";
    const booking_id = uuidv4(); // ✅ shared ID

    const newBookings = [];
    let currentStart = new Date(selectedSlot.start);

    for (const service of basket) {
      const durationMins = service.displayDuration || 0;
      const currentEnd = new Date(currentStart.getTime() + durationMins * 60000);

      const { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .insert([
          {
            booking_id, // ✅ shared across all items
            client_id,
            client_name,
            resource_id,
            start: currentStart.toISOString(),
            end: currentEnd.toISOString(),
            title: service.name,
            price: service.displayPrice,
            duration: service.displayDuration,
            category: service.category || "Uncategorised", // ✅ new field
          },
        ])
        .select()
        .single();

      if (bookingError) {
        console.error("❌ Booking failed:", bookingError.message);
        return;
      }

      newBookings.push({
        ...bookingData,
        start: new Date(bookingData.start),
        end: new Date(bookingData.end),
        resourceId: bookingData.resource_id,
      });

      await SaveBookingsLog({
        action: "created",
        booking_id, // ✅ shared ID
        client_id,
        client_name,
        stylist_id: resource_id,
        stylist_name: resource_name,
        service,
        start: currentStart.toISOString(),
        end: currentEnd.toISOString(),
      });

      currentStart = new Date(currentEnd);
    }

    console.log("✅ All bookings and logs saved");
    onConfirm(newBookings);
  } catch (err) {
    console.error("🔥 Something went wrong:", err.message);
  } finally {
    setLoading(false);
  }
};




  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-md shadow p-4 max-w-md w-full">
        <h2 className="text-lg font-bold text-bronze mb-2">Review Booking</h2>

        <div className="mb-2">
          <p className="font-semibold text-gray-700">{clientName}</p>
          <p className="text-sm text-gray-600">{timeLabel}</p>
          <p className="text-sm text-gray-600">
            Stylist: {stylist?.title || "Unknown"}
          </p>
        </div>

        <div className="border rounded p-2 mb-3">
          <h4 className="font-semibold text-bronze mb-1">Services</h4>
          {basket.map((b, i) => (
            <div
              key={i}
              className="flex justify-between text-sm text-gray-700"
            >
              <span>{b.name}</span>
              <span>£{b.displayPrice}</span>
              <span>
                {Math.floor(b.displayDuration / 60)}h{" "}
                {b.displayDuration % 60}m
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
          <Button onClick={onBack}>Back</Button>
          <Button
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
