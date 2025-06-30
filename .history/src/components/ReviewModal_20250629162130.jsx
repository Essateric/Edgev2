import React, { useState } from "react";
import Modal from "./Modal";
import Button from "./Button";
import { format } from "date-fns";
import { supabase } from "../supabaseClient";
import SaveRetainedBooking from "../utils/SaveRetainedBooking";

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

        const { error: bookingError } = await supabase
          .from("bookings")
          .insert([bookingData]);

        if (bookingError) {
          console.error("Booking insert error:", bookingError);
          throw bookingError;
        }

        await SaveRetainedBooking({
          clientId: selectedClient,
          clientName,
          stylistId: selectedSlot.resourceId,
          stylistName: stylist?.title,
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

      onConfirm(newEvents);
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

        <div className="border rounded p-3 mb-3">
          <h4 className="font-semibold text-bronze mb-2">Services</h4>

          <div className="grid grid-cols-3 gap-4 font-semibold border-b pb-2">
            <div>Service</div>
            <div className="text-center">Price</div>
            <div className="text-right">Duration</div>
          </div>

          {basket.map((b, i) => (
            <div
              key={i}
              className="grid grid-cols-3 gap-4 py-1 border-b last:border-b-0"
            >
              <div>{b.name}</div>
              <div className="text-center">£{b.displayPrice}</div>
              <div className="text-right">
                {Math.floor(b.displayDuration / 60)}h {b.displayDuration % 60}m
              </div>
            </div>
          ))}

          <div className="grid grid-cols-3 gap-4 pt-2 font-bold">
            <div>Total</div>
            <div className="text-center">£{totalPrice.toFixed(2)}</div>
            <div className="text-right">
              {hrs}h {remainingMins}m
            </div>
          </div>
        </div>

        <div className="flex justify-between mt-4">
          <Button onClick={onBack}>Back</Button>
          <Button
            onClick={handleConfirm}
            className="bg-bronze text-white hover:bg-black"
            disabled={loading}
          >
            {loading ? "Booking..." : "Confirm Booking"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
