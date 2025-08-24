import { useEffect, useState } from "react";
import Modal from "../Modal";
import Button from "../Button";
import { format } from "date-fns";
import ClientNotesModal from "../clients/ClientNotesModal";
import { useAuth } from "../../contexts/AuthContext";
import { useSaveClientDOB } from "../hooks/useSaveClientDOB";

// ---- Money helpers ----
const toNumber = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  // Strip anything that's not digit, dot, or minus (handles "£25", "25.00", " 25 ")
  const cleaned = String(v).replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};
const formatGBP = (v) => `£${toNumber(v).toFixed(2)}`;

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

  // saves clients.dob (DATE)
  const { dobInput, setDobInput, savingDOB, dobError, saveDOB } =
    useSaveClientDOB();

  const client = clients.find((c) => c.id === booking?.client_id);

  // debug user (kept from your code)
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

  // services for the booking group
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

    if (supabaseClient && booking?.booking_id) fetchRelatedBookings();
    return () => {
      active = false;
    };
  }, [supabaseClient, booking?.booking_id]);

  // seed DOB input
  useEffect(() => {
    if (!client) return;
    if (client?.dob) {
      const v = String(client.dob);
      setDobInput(v.includes("T") ? v.split("T")[0] : v); // "YYYY-MM-DD"
    } else {
      setDobInput("");
    }
  }, [client, setDobInput]);

  if (!booking || !client) return null;

  const clientName = `${client.first_name} ${client.last_name}`;
  const clientPhone = client.mobile || "N/A";

  // display as "22nd Aug"
  const displayDob = dobInput
    ? format(new Date(`${dobInput}T00:00:00`), "do MMM")
    : "DOB not set";

  // Sort once, reuse
  const sortedServices = [...relatedBookings].sort(
    (a, b) => new Date(a.start) - new Date(b.start)
  );

  // compute total safely
  const serviceTotal = sortedServices.reduce(
    (sum, s) => sum + toNumber(s.price),
    0
  );

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
      {/* <div className="bg-white rounded-md shadow p-4 max-w-md w-full max-h-[85vh]"> */}
 <div className="bg-white rounded-md shadow p-4 w-[420px] max-w-[90vw] max-h-[85vh]">

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
                  <span>{displayDob}</span>
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

          {sortedServices.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No services found.</p>
          ) : (
            <div className="space-y-1">
              {sortedServices.map((service, index) => {
                const startTime = new Date(service.start);
                const formattedTime = !isNaN(startTime)
                  ? format(startTime, "HH:mm")
                  : "--:--";

                return (
                  <div
                    key={index}
                    className="flex flex-col text-sm text-gray-700 border-b py-1"
                  >
                    <div className="flex justify-between items-center">
                      <span className="w-1/4">{formattedTime}</span>
                      <span className="w-2/4 font-medium">
                        {service.category || "Uncategorised"}:{" "}
                        {service.title || ""}
                      </span>

                      {/* RIGHT COLUMN = PRICE */}
                      <span className="w-1/4 text-right">
                        {formatGBP(service.price)}
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

              {/* TOTAL ROW */}
              <div className="flex justify-between items-center pt-2 border-t mt-2 text-sm">
                <span className="w-3/4 text-right font-semibold">Total</span>
                <span className="w-1/4 text-right font-semibold">
                  {formatGBP(serviceTotal)}
                </span>
              </div>
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
                className="block w-full text left hover:bg-gray-100 p-2 rounded"
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
