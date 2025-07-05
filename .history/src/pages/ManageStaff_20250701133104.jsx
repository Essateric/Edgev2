import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import EditHoursModal from "../components/EditHoursModal";
import EditServicesModal from "../components/EditServicesModal";
import AddNewStaffModal from "../components/AddNewStaffModal";
import { useAuth } from "../contexts/AuthContext";
import PageLoader from "../components/PageLoader.jsx";

const daysOrder = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

const defaultWeeklyHours = Object.fromEntries(
  daysOrder.map((day) => [
    day,
    { start: "", end: "", off: false }
  ])
);

export default function ManageStaff() {
  const [staff, setStaff] = useState([]);
  const [servicesList, setServicesList] = useState([]);

  const [showHoursModal, setShowHoursModal] = useState(false);
  const [modalHours, setModalHours] = useState(defaultWeeklyHours);
  const [modalStaff, setModalStaff] = useState(null);

  const [editServicesStaff, setEditServicesStaff] = useState(null);
  const [editServicesModalOpen, setEditServicesModalOpen] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);

  const { currentUser, pageLoading, authLoading } = useAuth();

  const [loading, setLoading] = useState(true);

  // Fetch staff and services data from DB
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: staffData, error: staffError } = await supabase.from("staff").select("*");
      const { data: servicesData, error: servicesError } = await supabase.from("services").select("id, name, category");

      if (staffError) {
        console.error("❌ Error fetching staff:", staffError);
      } else {
        console.log("✅ Staff fetched from DB:", staffData);
        setStaff(
          (staffData || []).map((doc) => ({
            ...doc,
            weekly_hours: normalizeWeeklyHours(doc.weekly_hours),
          }))
        );
      }

      if (servicesError) {
        console.error("❌ Error fetching services:", servicesError);
      } else {
        console.log("✅ Services fetched from DB:", servicesData);
        setServicesList(servicesData || []);
      }
    } catch (err) {
      console.error("❌ Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  const normalizeWeeklyHours = (input) => {
    return Object.fromEntries(
      daysOrder.map((day) => [
        day,
        {
          start: input?.[day]?.start || "",
          end: input?.[day]?.end || "",
          off: typeof input?.[day]?.off === "boolean" ? input[day].off : false,
        },
      ])
    );
  };

  const openHoursModal = (member) => {
    console.log("🟢 openHoursModal called with member:", member);
    console.log("🟢 Member ID:", member?.id);
    setModalStaff(member);
    setModalHours(normalizeWeeklyHours(member.weekly_hours));
    setShowHoursModal(true);
  };

  const saveModalHours = async () => {
    console.log("✅ Attempting to save hours for modalStaff:", modalStaff);
    console.log("✅ modalStaff.id:", modalStaff?.id);
    console.log("✅ Hours payload to save:", modalHours);

    const match = staff.find((s) => s.id === modalStaff.id);
    console.log("🔍 Match found in staff state:", match);

    const payload = {};
    Object.entries(modalHours).forEach(([day, value]) => {
      payload[day] = {
        start: value.start || "",
        end: value.end || "",
        off: !!value.off,
      };
    });

    console.log("🚀 Final payload for DB update:", payload);

    const { data, error } = await supabase
      .from("staff")
      .update({ weekly_hours: payload })
      .eq("id", modalStaff.id)
      .select();

    console.log("📦 Supabase update response data:", data);
    console.log("❌ Supabase update response error:", error);

    if (error) {
      alert("❌ Error saving hours: " + error.message);
      return;
    }

    if (!data || data.length === 0) {
      alert("❌ No matching staff found to update.");
      return;
    }

    alert("✅ Hours updated successfully.");
    await fetchData();
    setShowHoursModal(false);
  };

  // Full handleDelete function with confirmation and fetch call to delete API
  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this staff member?"
    );
    if (!confirmDelete) return;

    try {
      const response = await fetch(
        "https://vmtcofezozrblfxudauk.supabase.co/functions/v1/delete-staff",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${currentUser.token}`, // send user token
          },
          body: JSON.stringify({ id }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Delete failed:", data.error);
        alert("Failed to delete staff: " + (data.error || "Unknown error"));
        return;
      }

      alert("✅ Staff deleted successfully.");
      await fetchData();
    } catch (err) {
      console.error("Error calling delete function:", err);
      alert("An unexpected error occurred while deleting staff.");
    }
  };

  const openEditServicesModal = (staffMember) => {
    setEditServicesStaff(staffMember);
    setEditServicesModalOpen(true);
  };

  const closeEditServicesModal = () => {
    setEditServicesModalOpen(false);
    setEditServicesStaff(null);
  };

  if (pageLoading || authLoading || loading) {
    return <PageLoader />;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-chrome">Staff Management</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-bronze text-white px-4 py-2 rounded"
        >
          + Add New Staff
        </button>
      </div>

      <div className="mt-6">
        <h3 className="text-lg font-bold text-chrome mb-4">Current Staff</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {staff.map((member) => (
            <div
              key={member.id}
              className="bg-white rounded-2xl shadow-md p-4 border border-bronze"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-lg font-bold text-gray-800">{member.name}</h4>
                  <p className="text-sm text-gray-500">Email: {member.email || "N/A"}</p>
                  <p className="text-sm text-gray-500">Role: {member.permission}</p>

                  <div className="mt-2">
                    <h5 className="text-md font-semibold mb-1">Hours:</h5>
                    <table className="w-full text-[14px]">
                      <tbody>
                        {Object.entries(member.weekly_hours || {}).map(
                          ([day, { start, end, off }]) => (
                            <tr key={day}>
                              <td className="pr-2 font-medium">{day}:</td>
                              <td className="text-gray-600">
                                {off ? (
                                  <span className="text-red-500">Off</span>
                                ) : start && end ? (
                                  `${start} - ${end}`
                                ) : (
                                  "-"
                                )}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => openHoursModal(member)}
                    className="bg-bronze text-white px-3 py-1 rounded"
                  >
                    Edit Hours
                  </button>
                  <button
                    onClick={() => openEditServicesModal(member)}
                    className="bg-green-600 text-white px-3 py-1 rounded"
                  >
                    Edit Services
                  </button>
                  <button
                    onClick={() => handleDelete(member.id)}
                    className="bg-red-600 text-white px-3 py-1 rounded"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showHoursModal && (
        <EditHoursModal
          staff={modalStaff}
          hours={modalHours}
          setHours={setModalHours}
          onClose={() => setShowHoursModal(false)}
          onSave={saveModalHours}
        />
      )}

      {editServicesModalOpen && (
        <EditServicesModal
          staff={editServicesStaff}
          servicesList={servicesList}
          onClose={closeEditServicesModal}
        />
      )}

      {showAddModal && (
        <AddNewStaffModal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}
