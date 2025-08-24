import { useEffect, useState } from "react";
import Modal from "../Modal";
import Button from "../Button";
import { format } from "date-fns";
import ClientNotesModal from "../clients/ClientNotesModal";
// import { formatDayMonth } from "../../utils/formatDate"; // not used here
import { useAuth } from "../../contexts/AuthContext"; // adjust path if needed
import { useSaveClientDOB } from "../hooks/useSaveClientDOB";

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
  const [isEditingDob, setIsEditingDob] = useState(false);

  const { supabaseClient } = useAuth();

  // ✅ Use the custom hook: all hooks stay at top-level
  // Set storeFullDate:true to also update a DATE column `dob` (matches your previous logic)
  const {
    dobInput,
    setDobInput,
    savingDOB,
    dobError,
    saveDOB,
  } = useSaveClientDOB({ storeFullDate: true });

  const client = clients.find((c) => c.id === booking?.client_id);

  // Debug: current user (kept from your code)
  useEffect(() => {
    let mounted = true;
    const checkUser = async () => {
      const { data: user, error } = await supabaseClient.auth.getUser();
      if (!mounted) return;
      console.log("🧠 Supabase user:", user);
      if (error) console.error("❌ Supabase auth error:", error);
    };
    if (supabaseClient) checkUser();
    return () => {
      mounted = false;
    };
  }, [supabaseClient]);

  // Fetch related bookings for the same booking_id
  useEffect(() => {
    let active = true;
    const fetchRelatedBookings = async () => {
      if (!booking?.booking_id) return;
      const { data, error } = await supabaseClient
        .from("bookings")
        .select("*")
        .eq("booking_id", booking.booking_id);

      if (!active) return;

      if (error) {
        console.error("Error fetching related bookings:", error);
      } else {
        setRelatedBookings(data || []);
      }
    };

    if (supabaseClient && booking?.booking_id) {
      fetchRelatedBookings();
    }

    return () => {
      active = false;
    };
  }, [supabaseClient, booking?.booking_id]);

  // Seed DOB input from client (prefer full `dob` if present)
  useEffect(() => {
    if (!client) return;
    // If you also store dob_day/month, you could fallback to them when dob is null.
if (client?.dob) {
  const v = String(client.dob);
  setDobInput(v.includes("T") ? v.split("T")[0] : v); // handles "YYYY-MM-DD" or ISO
} else if (client?.dob_month && client?.dob_day) {
      const mm = String(client.dob_month).padStart(2, "0");
      const dd = String(client.dob_day).padStart(2, "0");
      // Use a dummy year if only day/month are stored
      setDobInput(`2000-${mm}-${dd}`);
    } else {
      setDobInput("");
    }
  }, [client, setDobInput]);

  if (!booking || !client) return null;

  const stylistName =
    stylistList.find((s) => s.id === booking?.resource_id)?.title || "Unknown";

  const clientName = `${client.first_name} ${client.last_name}`;
  const clientPhone = client.mobile || "N/A";

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
        onDeleteSuccess(booking.id);
        onClose();
      }
    } catch (err) {
      console.error("Failed to cancel booking:", err);
      alert("Something went wrong. Please try again.");
    }
  };

  // ✅ Handler calls a plain function from the hook (no hooks inside)
  const handleSaveDOBClick = async () => {
    if (!dobInput) {
      alert("Please pick a date before saving!");
      return;
    }

    console.log("Attempting to save DOB", { dobInput, clientId: client.id });
    const res = await saveDOB({ clientId: client.id, dob: dobInput });
    if (res.ok) {
      alert("DOB updated! Check Supabase to confirm.");
      setIsEditingDob(false);
    } else {
      alert("Supabase error: " + (res.error?.message || "Failed to save DOB"));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} hideCloseIcon>
      <div className="bg-white rounded-md shadow p-4 max-w-md w-full">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h2 className="text-lg font-bold text-rose-600">{clientName}</h2>
            <p className="text-sm text-gray-700">📞 {clientPhone}</p>

            <div className="text-sm text-gray-700 flex items-center gap-2">
              🎂{" "}
              {isEditingDob ? (
                <>
                  <input
                    type="date"
                    value={dobInput || ""}
                    onChange={(e) => {
                      setDobInput(e.target.value);
                      console.log("Picked date:", e.target.value);
                    }}
                    className="border p-1 text-sm"
                  />
                  <Button
                    onClick={handleSaveDOBClick}
                    className="text-xs"
                    disabled={!dobInput || savingDOB}
                  >
                    {savingDOB ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    onClick={() => setIsEditingDob(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span>{dobInput || "DOB not set"}</span>
                  <button
                    onClick={() => setIsEditingDob(true)}
                    className="text-xs text-blue-600 underline"
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
            {dobError && (
              <p className="text-xs text-red-600 mt-1">{dobError}</p>
            )}
          </div>

          <Button onClick={() => setShowNotesModal(true)} className="text-sm">
            View Details
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
                      className="flex flex-col text-sm text-gray-700 border-b py-1"
                    >
                      <div className="flex justify-between">
                        <span className="w-1/4">{formattedTime}</span>
                        <span className="w-2/4 font-medium">
                          {service.category || "Uncategorised"}:{" "}
                          {service.title || ""}
                        </span>
                        <span className="w-1/4 text-right">
                          {stylistList.find((s) => s.id === service.resource_id)
                            ?.title || "Unknown"}
                        </span>
                      </div>
                      {service.notes && (
                        <div className="text-xs text-gray-500 italic mt-1">
                          Notes: {service.notes}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <span className="text-sm text-green-700 font-semibold">Confirmed</span>
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
          <button
            onClick={onClose}
            className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded"
          >
            Close
          </button>
        </div>

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
                className="mt-2 w-full bg-gray-2 00 text-gray-700 py-1 rounded"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {showNotesModal && (
          <ClientNotesModal
            clientId={client.id}
            isOpen={showNotesModal}
            onClose={() => setShowNotesModal(false)}
          />
        )}
      </div>
    </Modal>
  );
}
