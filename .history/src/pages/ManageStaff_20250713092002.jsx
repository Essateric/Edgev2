import React, { useEffect, useState } from "react";
import { supabase as defaultSupabase } from "../supabaseClient";
import { createClient } from "@supabase/supabase-js";
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

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // Fetch staff and services data from DB
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: staffData, error: staffError } = await defaultSupabase.from("staff").select("*");
      const { data: servicesData, error: servicesError } = await defaultSupabase.from("services").select("id, name, category");

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

  // Called when user clicks 'Edit Hours' button for a staff member
  const openHoursModal = (member) => {
    console.log("🟢 openHoursModal called with member:", member);
    console.log("🟢 Member ID:", member?.id);
    setModalStaff(member);
    setModalHours(normalizeWeeklyHours(member.weekly_hours));
    setShowHoursModal(true);
  };

  // PATCH-style save: Only changed days are updated, the rest remain.
  // Accept latestHours as parameter (comes from the modal!)
  const saveModalHours = async (latestHours) => {
    if (!currentUser?.token) {
      alert("❌ You must be logged in to update staff hours.");
      return;
    }

    console.log("✅ Attempting to save hours for modalStaff:", modalStaff);
    console.log("✅ modalStaff.id:", modalStaff?.id);
    console.log("✅ Hours payload to save:", latestHours);

    // 1. Fetch current weekly_hours from DB (for patch/merge)
    const { data: oldData, error: fetchError } = await defaultSupabase
      .from("staff")
      .select("weekly_hours")
      .eq("id", modalStaff.id)
      .single();

    if (fetchError) {
      alert("❌ Error fetching current hours: " + fetchError.message);
      return;
    }

    // 2. Prepare only changed days
    const oldHours = oldData?.weekly_hours || {};
    const changes = {};
    for (const day of daysOrder) {
      const modalDay = latestHours[day] || {};
      const oldDay = oldHours[day] || {};
      if (
        String(modalDay.start) !== String(oldDay.start) ||
        String(modalDay.end) !== String(oldDay.end) ||
        Boolean(modalDay.off) !== Boolean(oldDay.off)
      ) {
        changes[day] = {
          start: modalDay.start || "",
          end: modalDay.end || "",
          off: !!modalDay.off,
        };
      }
    }

    if (Object.keys(changes).length === 0) {
      alert("No changes to save.");
      return;
    }

    // 3. Merge changes into previous weekly_hours
    const updatedWeeklyHours = { ...oldHours, ...changes };
    console.log("🚀 PATCH: Only these days changed:", changes);
    console.log("🚀 Final merged weekly_hours object:", updatedWeeklyHours);

    // 4. Patch to DB
    const supabaseWithAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${currentUser.token}`,
        },
      },
    });

    const { data, error } = await supabaseWithAuth
      .from("staff")
      .update({ weekly_hours: updatedWeeklyHours })
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

  // Delete staff by id
  const handleDelete = async (id) => {
    const confirm = window.confirm(
      "Are you sure you want to delete this staff member?"
    );
    if (!confirm) return;

    try {
      // Delete from Supabase Auth users
      const { error: authError } = await defaultSupabase.auth.admin.deleteUser(id);
      if (authError) {
        alert("❌ Error deleting user from auth: " + authError.message);
        return;
      }

      // Delete from staff table
      const { error: dbError } = await defaultSupabase
        .from("staff")
        .delete()
        .eq("id", id);

      if (dbError) {
        alert("❌ Error deleting staff from database: " + dbError.message);
        return;
      }

      alert("✅ Staff deleted successfully.");
      await fetchData();
    } catch (err) {
      console.error("❌ Error deleting staff:", err);
      alert("❌ Error deleting staff.");
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
          onSave={saveModalHours} // Don't call with modalHours here!
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
