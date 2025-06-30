import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import EditHoursModal from "../components/EditHoursModal";
import EditServicesModal from "../components/EditServicesModal";
import AddNewStaffModal from "../components/AddNewStaffModal";

const defaultWeeklyHours = {
  Monday: { start: "", end: "", off: false },
  Tuesday: { start: "", end: "", off: false },
  Wednesday: { start: "", end: "", off: false },
  Thursday: { start: "", end: "", off: false },
  Friday: { start: "", end: "", off: false },
  Saturday: { start: "", end: "", off: false },
  Sunday: { start: "", end: "", off: false },
};

export default function ManageStaff() {
  const [staff, setStaff] = useState([]);
  const [servicesList, setServicesList] = useState([]);

  const [showHoursModal, setShowHoursModal] = useState(false);
  const [modalHours, setModalHours] = useState(defaultWeeklyHours);
  const [modalStaff, setModalStaff] = useState(null);

  const [editServicesStaff, setEditServicesStaff] = useState(null);
  const [editServicesModalOpen, setEditServicesModalOpen] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: staffData } = await supabase.from("staff").select("*");
    const { data: servicesData } = await supabase
      .from("services")
      .select("id, name, category");

    setStaff(
      (staffData || []).map((doc) => ({
        ...doc,
        weekly_hours: normalizeWeeklyHours(doc.weekly_hours),
      }))
    );
    setServicesList(servicesData || []);
  };

  const normalizeWeeklyHours = (input) => {
    return Object.fromEntries(
      Object.entries(defaultWeeklyHours).map(([day]) => {
        const dayData = input?.[day] || {};
        return [
          day,
          {
            start: typeof dayData.start === "string" ? dayData.start : "",
            end: typeof dayData.end === "string" ? dayData.end : "",
            off: !!dayData.off,
          },
        ];
      })
    );
  };

const handleDelete = async (id) => {
  const confirm = window.confirm(
    "Are you sure you want to delete this staff member?"
  );
  if (!confirm) return;

  try {
    const res = await fetch(
      "https://vmtcofezozrblfxudauk.supabase.co/functions/v1/delete-staff",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentUser.token}`, // or session token if needed
        },
        body: JSON.stringify({ id }),
      }
    );

    const result = await res.json();

    if (!res.ok) {
      console.error(result);
      alert(result.error || "Failed to delete staff.");
      return;
    }

    fetchData();
    alert("✅ Staff deleted successfully.");
  } catch (err) {
    console.error(err);
    alert("❌ Error deleting staff.");
  }
};


  const openHoursModal = (member) => {
    setModalStaff(member);
    setModalHours(normalizeWeeklyHours(member.weekly_hours));
    setShowHoursModal(true);
  };

  const saveModalHours = async () => {
    await supabase
      .from("staff")
      .update({ weekly_hours: modalHours })
      .eq("id", modalStaff.id);
    setShowHoursModal(false);
    fetchData();
  };

  const openEditServicesModal = (staffMember) => {
    setEditServicesStaff(staffMember);
    setEditServicesModalOpen(true);
  };

  const closeEditServicesModal = () => {
    setEditServicesModalOpen(false);
    setEditServicesStaff(null);
  };

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
                  <h4 className="text-lg font-bold text-gray-800">
                    {member.name}
                  </h4>
                  <p className="text-sm text-gray-500">
                    Email: {member.email || "N/A"}
                  </p>
                  <p className="text-sm text-gray-500">
                    Role: {member.permission}
                  </p>

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
