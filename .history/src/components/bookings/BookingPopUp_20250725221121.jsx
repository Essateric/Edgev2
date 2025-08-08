import { useEffect, useState } from "react";
import Modal from "../Modal";
import Button from "../Button";
import { format } from "date-fns";
import { supabase } from "../../supabaseClient";
import ClientNotesModal from "./ClientNotesModal"; // adjust path if needed



export default function BookingPopUp({
  isOpen,
  booking,
  onClose,
  onEdit,
  onDeleteSuccess,
  stylistList = [],
  clients = [],
}) {
  const [showActions, setShowActions] = useState(false);
  const [relatedBookings, setRelatedBookings] = useState([]);
  const [showNotesModal, setShowNotesModal] = useState(false);


  useEffect(() => {
    const fetchRelatedBookings = async () => {
      if (!booking?.booking_id) return;
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("booking_id", booking.booking_id);

      if (error) {
        console.error("Error fetching related bookings:", error);
      } else {
        setRelatedBookings(data || []);
      }
    };

    fetchRelatedBookings();
  }, [booking?.booking_id]);

  if (!booking) return null;

  const stylistName =
    stylistList.find((s) => s.id === booking?.resource_id)?.title ||
    "Unknown";

  const client = clients.find((c) => c.id === booking?.client_id);
  const clientName = client
    ? `${client.first_name} ${client.last_name}`
    : "Unknown";
  const clientPhone = client?.mobile || "N/A";

  const handleCancelBooking = async () => {
    const confirmDelete = window.confirm(
      "Are you sure you want to cancel this booking?"
    );
    if (!confirmDelete) return;

    try {
      const { error } = await supabase
        .from("bookings")
        .delete()
        .eq("id", booking.id);

      if (error) {
        console.error("Failed to delete booking:", error);
        alert("Something went wrong.");
      } else {
        onDeleteSuccess(booking.id);
        onClose();
      }
    } catch (err) {
      console.error("Failed to cancel booking:", err);
      alert("Something went wrong. Please try again.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white rounded-md shadow p-4 max-w-md w-full">
        <div className="flex justify-between items-center mb-2">
          <div>
            <h2 className="text-lg font-bold text-rose-600">{clientName}</h2>
            <p className="text-sm text-gray-700">{clientPhone}</p>
            
          </div>
          <Button
  className="mt-1 text-xs text-bronze underline"
  onClick={() => setShowNotesModal(true)}
>
  View/Add Notes
</Button>

        </div>

        <div className="mt-4">
          <p className="text-md font-semibold text-gray-800 mb-1">Services</p>

          {relatedBookings.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No services found.</p>
          ) : (
            <div className="space-y-1">
              {relatedBookings
                .sort((a, b) => new Date(a.start) - new Date(b.start))
                .map((service, index) => {
                  const startTime = new Date(service.start);
                  const formattedTime = !isNaN(startTime)
                    ? format(startTime, "HH:mm")
                    : "--:--";

                  return (
                    <div
                      key={index}
                      className="flex justify-between text-sm text-gray-700"
                    >
                      {/* Time */}
                      <span className="w-1/5">{formattedTime}</span>

                      {/* Category + Service */}
                      <span className="w-3/5 font-medium">
                        {`${service.category || "Uncategorised"}: ${
                          service.title || ""
                        }`}
                      </span>

                      {/* Stylist */}
                      <span className="w-1/5 text-right">
                        {stylistList.find((s) => s.id === service.resource_id)
                          ?.title || "Unknown"}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <span className="text-sm text-green-700 font-semibold">
            Confirmed
          </span>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded">
            Arrived
          </button>
          <button className="bg-gray-500 text-white px-3 py-1 rounded">
            Checkout
          </button>
          <button
            onClick={() => setShowActions(true)}
            className="bg-gray-200 text-gray-800 px-3 py-1 rounded"
          >
            &#x2022;&#x2022;&#x2022;
          </button>
        </div>

        {/* More Actions */}
        {showActions && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-4 w-full max-w-xs shadow-md space-y-2">
              <button className="block w-full text-left hover:bg-gray-100 p-2 rounded">
                No show
              </button>
              <button className="block w-full text-left hover:bg-gray-100 p-2 rounded">
                Awaiting review
              </button>
              <button className="block w-full text-left hover:bg-gray-100 p-2 rounded">
                Rebook
              </button>
              <button
                onClick={onEdit}
                className="block w-full text-left hover:bg-gray-100 p-2 rounded"
              >
                Edit
              </button>
              <button
                onClick={handleCancelBooking}
                className="block w-full text-left text-red-600 hover:bg-red-100 p-2 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowActions(false)}
                className="mt-2 w-full bg-gray-200 text-gray-700 py-1 rounded"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
