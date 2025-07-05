import React, { useState } from "react";
import Modal from "./Modal";
import Button from "./Button";
import { format } from "date-fns";
import { supabase } from "../supabaseClient";
import SaveBookingLog from "../bookings/SaveBookingsLog";

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
    if (!selectedSlot || basket.length === 0 || !selectedClient) return;
    setLoading(true);

    try {
      const bookingId = crypto.randomUUID();
      let currentTime = new Date(selectedSlot.start);

      const newEvents = [];

      for (const item of basket) {
        const endTime = new Date(
          currentTime.getTime() + (item.displayDuration || 0) * 60000
        );

        const bookingData = {
          booking_id: bookingId,
          client_id: selectedClient,
          client_name: clientName,
          title: item.name,
          category: item.category,
          start: currentTime.toISOString(),
          end: endTime.toISOString(),
          resource_id: selectedSlot.resourceId,
          price: item.displayPrice,
          duration: item.displayDuration,
          created_at: new Date().toISOString(),
        };

        // ✅ Insert into bookings
        const { error: bookingError } = await supabase
          .from("bookings")
          .insert([bookingData]);

        if (bookingError) {
          console.error("Booking insert error:", bookingError);
          throw bookingError;
        }

        // ✅ Insert into booking_logs
        await SaveBookingLog({
          action: "created",
          client_id: selectedClient,
          client_name: clientName,
          stylist_id: selectedSlot.resourceId,
          stylist_name: stylist?.title,
          service: item,
          start: bookingData.start,
          end: bookingData.end,
        });

        const event = {
          ...bookingData,
          start: new Date(bookingData.start),
          end: new Date(bookingData.end),
          resourceId: bookingData.resource_id,
        };

        newEvents.push(event);
        currentTime = endTime;
      }

      onConfirm(newEvents); // ✅ Pass back new bookings to update calendar
    } catch (error) {
      console.error("Booking failed:", error);
      alert("Failed to create booking. Please try again.");
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
                {Math.floor(b.displayDuration / 60)}h {b.displayDuration % 60}m
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
