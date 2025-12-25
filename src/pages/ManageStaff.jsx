// File: src/pages/ManageStaff.jsx
import React, { useEffect, useState } from "react";
import { supabase as defaultSupabase } from "../supabaseClient";
import EditHoursModal from "../components/EditHoursModal";
import EditServicesModal from "../components/EditServicesModal";
import AddNewStaffModal from "../components/AddNewStaffModal";
import { useAuth } from "../contexts/AuthContext";
import PageLoader from "../components/PageLoader.jsx";

const daysOrder = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const defaultWeeklyHours = Object.fromEntries(
  daysOrder.map((day) => [day, { start: "", end: "", off: false }])
);

// 🔹 Central list of roles (includes the new "Colour Specialist")
export const ROLE_OPTIONS = [
  "Business Owner",
  "Admin",
  "Manager",
  "Senior Stylist",
  "Stylist",
  "Colour Specialist", // NEW
  "Apprentice",
  "Reception",
];

export default function ManageStaff() {
  const [staff, setStaff] = useState([]);
  const [servicesList, setServicesList] = useState([]);

  const [showHoursModal, setShowHoursModal] = useState(false);
  const [modalHours, setModalHours] = useState(defaultWeeklyHours);
  const [modalStaff, setModalStaff] = useState(null);

  const [editServicesStaff, setEditServicesStaff] = useState(null);
  const [editServicesModalOpen, setEditServicesModalOpen] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);

  // 🔹 New: Role editing modal state
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [roleStaff, setRoleStaff] = useState(null);

 const { currentUser, pageLoading, authLoading, supabaseClient } = useAuth();

  const [loading, setLoading] = useState(true);

 const supabase = supabaseClient || defaultSupabase;

  // Fetch staff and services data from DB
  useEffect(() => {
    fetchData();
  }, []);

  const withTimeout = async (promise, ms, label) => {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${label} timeout after ${ms}ms`)),
            ms
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
       const { data: staffData, error: staffError } = await withTimeout(
        supabase.from("staff").select("*"),
        5000,
        "staff fetch"
      );
      const { data: servicesData, error: servicesError } = await withTimeout(
        supabase.from("services").select("id, name, category"),
        5000,
        "services fetch"
      );

      if (staffError) {
        console.error("❌ Error fetching staff:", staffError);
      } else {
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

   const { data: oldData, error: fetchError } = await withTimeout(
      supabase.from("staff").select("weekly_hours").eq("id", modalStaff.id).single(),
      5000,
      "load weekly hours"
    );

    if (fetchError) {
      alert("❌ Error fetching current hours: " + fetchError.message);
      return;
    }

    // 2) Compute only changed days
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

    // 3) Merge and log
    const updatedWeeklyHours = { ...oldHours, ...changes };

// 4) Update — reuse Supabase; DO NOT call .select() here
    const { error: updateError } = await withTimeout(
      supabase.from("staff").update({ weekly_hours: updatedWeeklyHours }).eq("id", modalStaff.id),
      5000,
      "update weekly hours"
    );

    if (updateError) {
      alert("❌ Error saving hours: " + updateError.message);
      return;
    }

    // ✅ Success
    alert("✅ Hours updated successfully.");
    await fetchData();
    setShowHoursModal(false);
  };

  // Delete staff by id (uses Edge Function)
  const handleDelete = async (id) => {
    if (!currentUser?.token) {
      alert("❌ You must be logged in to delete staff.");
      return;
    }

    const confirm = window.confirm(
      "Are you sure you want to delete this staff member? This cannot be undone."
    );
    if (!confirm) return;

    try {
      // Call your Edge Function instead of Supabase admin API directly!
      const res = await fetch(
        "https://vmtcofezozrblfxudauk.supabase.co/functions/v1/delete-staff",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + currentUser.token,
          },
          body: JSON.stringify({ id }),
        }
      );
      const result = await res.json();

      if (result.success) {
        alert("✅ Staff deleted successfully.");
        await fetchData();
      } else {
        alert("❌ Error deleting staff: " + (result.error || "Unknown error"));
        if (result.logs) console.error(result.logs);
      }
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

  // 🔹 Open role editor (click name or button)
  const openRoleModal = (staffMember) => {
    setRoleStaff(staffMember);
    setShowRoleModal(true);
  };

  // 🔹 Save role to DB
  const saveRole = async (newRole) => {
    if (!currentUser?.token) {
      alert("❌ You must be logged in to update roles.");
      return;
    }
    if (!roleStaff?.id) {
      alert("❌ No staff member selected.");
      return;
    }
    const { error } = await withTimeout(
      supabase.from("staff").update({ permission: newRole }).eq("id", roleStaff.id),
      5000,
      "update role"
    );

    if (error) {
      alert("❌ Error updating role: " + error.message);
      return;
    }

    alert("✅ Role updated.");
    setShowRoleModal(false);
    setRoleStaff(null);
    await fetchData();
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
                  <h4
                    className="text-lg font-bold text-gray-800 cursor-pointer hover:underline"
                    title="Click to edit role"
                    onClick={() => openRoleModal(member)}
                  >
                    {member.name}
                  </h4>
                  <p className="text-sm text-gray-500">
                    Email: {member.email || "N/A"}
                  </p>
                  <p className="text-sm text-gray-500">
                    Role: {member.permission || "—"}
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
                    onClick={() => openRoleModal(member)}
                    className="bg-indigo-600 text-white px-3 py-1 rounded"
                  >
                    Edit Role
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

      {/* 🔹 Role editor modal */}
      {showRoleModal && (
        <EditRoleModal
          open={showRoleModal}
          staff={roleStaff}
          roleOptions={ROLE_OPTIONS}
          onClose={() => {
            setShowRoleModal(false);
            setRoleStaff(null);
          }}
          onSave={saveRole}
        />
      )}

      {showAddModal && (
        <AddNewStaffModal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSaved={fetchData}
          // 🔹 If your AddNewStaffModal supports it, pass the same options
          roleOptions={ROLE_OPTIONS}
        />
      )}
    </div>
  );
}

/* ========= Simple role editor modal (local component) ========= */
function EditRoleModal({ open, staff, roleOptions = [], onClose, onSave }) {
  const [selected, setSelected] = useState(staff?.permission || "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
        <h3 className="text-xl font-semibold mb-2 text-gray-800">Edit Role</h3>
        <p className="text-sm text-gray-600 mb-4">
          Update the role for <b>{staff?.name}</b>.
        </p>

        <label className="block text-sm text-gray-700 mb-1">Role</label>
        <select
          className="w-full border rounded p-2 mb-4"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="" disabled>
            Select a role…
          </option>
          {roleOptions.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>

        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 rounded bg-gray-200 text-gray-800"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-50"
            disabled={!selected}
            onClick={() => onSave(selected)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
