// File: src/pages/ManageStaff.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase as defaultSupabase } from "../supabaseClient";
import EditHoursModal from "../components/EditHoursModal";
import EditServicesModal from "../components/EditServicesModal";
import AddNewStaffModal from "../components/AddNewStaffModal";
import { useAuth } from "../contexts/AuthContext";
import PageLoader from "../components/PageLoader.jsx";
import {
  hasAtLeastRole,
  canCreateRole,
  canManageRole,
} from "../utils/Roles.js";

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

export const ROLE_OPTIONS = [
  "Business Owner",
  "Admin",
  "Manager",
  "Senior Stylist",
  "Colour Specialist",
  "Stylist",
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

  const [showRoleModal, setShowRoleModal] = useState(false);
  const [roleStaff, setRoleStaff] = useState(null);

  // ✅ Change PIN modal
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinStaff, setPinStaff] = useState(null);

  const { currentUser, pageLoading, authLoading, supabaseClient } = useAuth();
  const [loading, setLoading] = useState(true);

  const supabase = supabaseClient || defaultSupabase;

  const myRole =
    currentUser?.permission ||
    currentUser?.user?.permission ||
    currentUser?.role ||
    currentUser?.user?.role ||
    "";

  const myId =
    currentUser?.id ||
    currentUser?.user?.id ||
    currentUser?.uid ||
    null;

  // Global abilities (keep existing intent)
  const canOpenAddStaff = hasAtLeastRole(myRole, "colour specialist");
  const canToggleStaffStatusGlobal = hasAtLeastRole(myRole, "colour specialist");
  const canDeleteStaffGlobal = hasAtLeastRole(myRole, "senior stylist");
  const canEditRolesGlobal = hasAtLeastRole(myRole, "senior stylist");

  // Keep these existing booleans (in case other logic relies on them)
  const canToggleStaffStatus = hasAtLeastRole(myRole, "colour specialist");
  const canDeleteStaff = hasAtLeastRole(myRole, "senior stylist");

  // Allowed roles for pickers
  const allowedCreateRoleOptions = useMemo(
    () => ROLE_OPTIONS.filter((r) => canCreateRole(myRole, r)),
    [myRole]
  );

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const openHoursModal = (member) => {
    const targetRole = member?.permission || "";
    const isSelf = myId && member?.id === myId;
    const canManageThis = canManageRole(myRole, targetRole);

    if (!isSelf && !canManageThis) {
      alert("❌ You cannot edit hours for staff at or above your rank.");
      return;
    }

    setModalStaff(member);
    setModalHours(normalizeWeeklyHours(member.weekly_hours));
    setShowHoursModal(true);
  };

  const saveModalHours = async (latestHours) => {
    if (!currentUser?.token) {
      alert("❌ You must be logged in to update staff hours.");
      return;
    }

    const { data: oldData, error: fetchError } = await withTimeout(
      supabase
        .from("staff")
        .select("weekly_hours")
        .eq("id", modalStaff.id)
        .single(),
      5000,
      "load weekly hours"
    );

    if (fetchError) {
      alert("❌ Error fetching current hours: " + fetchError.message);
      return;
    }

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

    const updatedWeeklyHours = { ...oldHours, ...changes };

    const { error: updateError } = await withTimeout(
      supabase
        .from("staff")
        .update({ weekly_hours: updatedWeeklyHours })
        .eq("id", modalStaff.id),
      5000,
      "update weekly hours"
    );

    if (updateError) {
      alert("❌ Error saving hours: " + updateError.message);
      return;
    }

    alert("✅ Hours updated successfully.");
    await fetchData();
    setShowHoursModal(false);
  };

  const handleDelete = async (id, member) => {
    if (!currentUser?.token) {
      alert("❌ You must be logged in to delete staff.");
      return;
    }

    if (!canDeleteStaff) {
      alert("❌ You do not have permission to delete staff.");
      return;
    }

    const targetRole = member?.permission || "";
    const isSelf = myId && member?.id === myId;
    const canManageThis = canManageRole(myRole, targetRole);

    if (isSelf) {
      alert("❌ You cannot delete yourself.");
      return;
    }

    if (!canManageThis) {
      alert("❌ You cannot delete staff at or above your rank.");
      return;
    }

    const confirm = window.confirm(
      "Are you sure you want to delete this staff member? This cannot be undone."
    );
    if (!confirm) return;

    try {
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

  const toggleActiveStatus = async (member) => {
    if (!currentUser?.token) {
      alert("❌ You must be logged in to update staff status.");
      return;
    }

    if (!canToggleStaffStatus) {
      alert("❌ You do not have permission to update staff status.");
      return;
    }

    const targetRole = member?.permission || "";
    const isSelf = myId && member?.id === myId;
    const canManageThis = canManageRole(myRole, targetRole);

    if (isSelf) {
      alert("❌ You cannot change your own active status here.");
      return;
    }

    if (!canManageThis) {
      alert("❌ You cannot change status for staff at or above your rank.");
      return;
    }

    const nextStatus = member?.is_active === false;
    const confirm = window.confirm(
      nextStatus
        ? `Make ${member?.name || "this staff member"} active?`
        : `Make ${member?.name || "this staff member"} inactive?`
    );
    if (!confirm) return;

    const { error } = await withTimeout(
      supabase.from("staff").update({ is_active: nextStatus }).eq("id", member.id),
      5000,
      "update staff status"
    );

    if (error) {
      alert("❌ Error updating staff status: " + error.message);
      return;
    }

    alert(
      `✅ ${member?.name || "Staff"} is now ${nextStatus ? "active" : "inactive"}.`
    );
    await fetchData();
  };

  const openEditServicesModal = (staffMember) => {
    const targetRole = staffMember?.permission || "";
    const isSelf = myId && staffMember?.id === myId;
    const canManageThis = canManageRole(myRole, targetRole);

    if (!isSelf && !canManageThis) {
      alert("❌ You cannot edit services for staff at or above your rank.");
      return;
    }

    setEditServicesStaff(staffMember);
    setEditServicesModalOpen(true);
  };

  const closeEditServicesModal = () => {
    setEditServicesModalOpen(false);
    setEditServicesStaff(null);
  };

  const openRoleModal = (staffMember) => {
    if (!canEditRolesGlobal) {
      alert("❌ You do not have permission to edit roles.");
      return;
    }

    const targetRole = staffMember?.permission || "";
    const isSelf = myId && staffMember?.id === myId;
    const canManageThis = canManageRole(myRole, targetRole);

    if (!isSelf && !canManageThis) {
      alert("❌ You cannot edit roles for staff at or above your rank.");
      return;
    }

    setRoleStaff(staffMember);
    setShowRoleModal(true);
  };

  const saveRole = async (newRole) => {
    if (!currentUser?.token) {
      alert("❌ You must be logged in to update roles.");
      return;
    }
    if (!roleStaff?.id) {
      alert("❌ No staff member selected.");
      return;
    }

    if (!canEditRolesGlobal) {
      alert("❌ You do not have permission to edit roles.");
      return;
    }

    // ✅ Prevent assigning a role above your rank
    if (!canCreateRole(myRole, newRole)) {
      alert("❌ You cannot assign a role above your rank.");
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

  const openPinModal = (staffMember) => {
    const targetRole = staffMember?.permission || "";
    const isSelf = myId && staffMember?.id === myId;
    const canManageThis = canManageRole(myRole, targetRole);

    if (!isSelf && !canManageThis) {
      alert("❌ You cannot change PIN for staff at or above your rank.");
      return;
    }

    setPinStaff(staffMember);
    setShowPinModal(true);
  };

  const savePin = async (newPin) => {
    if (!currentUser?.token) {
      alert("❌ You must be logged in to change PINs.");
      return;
    }
    if (!pinStaff?.id) {
      alert("❌ No staff member selected.");
      return;
    }

    const pin = String(newPin || "").trim();
    if (!/^\d{4}$/.test(pin)) {
      alert("❌ PIN must be exactly 4 digits.");
      return;
    }

    try {
      const res = await fetch(
        "https://vmtcofezozrblfxudauk.supabase.co/functions/v1/hash-pin",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + currentUser.token,
          },
          body: JSON.stringify({ staff_id: pinStaff.id, pin }),
        }
      );

      const result = await res.json();

      if (!res.ok) {
        alert("❌ Failed to update PIN: " + (result?.error || "Unknown error"));
        if (result?.logs) console.error(result.logs);
        return;
      }

      alert(`✅ PIN updated for ${pinStaff.name}.`);
      setShowPinModal(false);
      setPinStaff(null);
      await fetchData();
    } catch (err) {
      console.error("❌ Error updating PIN:", err);
      alert("❌ Error updating PIN.");
    }
  };

  if (pageLoading || authLoading || loading) return <PageLoader />;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-chrome">Staff Management</h2>

        <button
          onClick={() => {
            if (!canOpenAddStaff) {
              alert("❌ You do not have permission to add staff.");
              return;
            }
            setShowAddModal(true);
          }}
          className="bg-bronze text-white px-4 py-2 rounded"
        >
          + Add New Staff
        </button>
      </div>

      <div className="mt-6">
        <h3 className="text-lg font-bold text-chrome mb-4">Current Staff</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {staff.map((member) => {
            const targetRole = member?.permission || "";
            const isSelf = myId && member?.id === myId;

            const canManageThis = canManageRole(myRole, targetRole); // strictly below

            const canEditHours = isSelf || canManageThis;
            const canEditServices = isSelf || canManageThis;
            const canChangePin = isSelf || canManageThis;

            const canToggleStatus =
              !isSelf && canToggleStaffStatusGlobal && canManageThis;

            const canDelete =
              !isSelf && canDeleteStaffGlobal && canManageThis;

            const canEditRole =
              canEditRolesGlobal && (isSelf || canManageThis);

            return (
              <div
                key={member.id}
                className={`bg-white rounded-2xl shadow-md p-4 border border-bronze ${
                  member.is_active === false ? "opacity-70" : ""
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4
                      className={`text-lg font-bold text-gray-800 ${
                        canEditRole ? "cursor-pointer hover:underline" : ""
                      }`}
                      title={canEditRole ? "Click to edit role" : "Role editing not allowed"}
                      onClick={() => {
                        if (!canEditRole) return;
                        openRoleModal(member);
                      }}
                    >
                      {member.name}
                    </h4>

                    <p className="text-sm text-gray-500">
                      Email: {member.email || "N/A"}
                    </p>
                    <p className="text-sm text-gray-500">
                      Role: {member.permission || "—"}
                    </p>
                    <p className="text-sm text-gray-500">
                      Status: {member.is_active === false ? "Inactive" : "Active"}
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
                    {canEditHours && (
                      <button
                        onClick={() => openHoursModal(member)}
                        className="bg-bronze text-white px-3 py-1 rounded"
                      >
                        Edit Hours
                      </button>
                    )}

                    {canEditServices && (
                      <button
                        onClick={() => openEditServicesModal(member)}
                        className="bg-green-600 text-white px-3 py-1 rounded"
                      >
                        Edit Services
                      </button>
                    )}

                    {canEditRole && (
                      <button
                        onClick={() => openRoleModal(member)}
                        className="bg-indigo-600 text-white px-3 py-1 rounded"
                      >
                        Edit Role
                      </button>
                    )}

                    {canChangePin && (
                      <button
                        onClick={() => openPinModal(member)}
                        className="bg-amber-600 text-white px-3 py-1 rounded"
                        title="Change this staff member's PIN"
                      >
                        Change PIN
                      </button>
                    )}

                    {canToggleStatus && (
                      <button
                        onClick={() => toggleActiveStatus(member)}
                        className={`px-3 py-1 rounded text-white ${
                          member.is_active === false ? "bg-emerald-600" : "bg-slate-600"
                        }`}
                      >
                        {member.is_active === false ? "Activate" : "Deactivate"}
                      </button>
                    )}

                    {canDelete && (
                      <button
                        onClick={() => handleDelete(member.id, member)}
                        className="bg-red-600 text-white px-3 py-1 rounded"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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

      {showRoleModal && (
        <EditRoleModal
          open={showRoleModal}
          staff={roleStaff}
          roleOptions={allowedCreateRoleOptions}
          onClose={() => {
            setShowRoleModal(false);
            setRoleStaff(null);
          }}
          onSave={saveRole}
        />
      )}

      {showPinModal && (
        <EditPinModal
          staff={pinStaff}
          onClose={() => {
            setShowPinModal(false);
            setPinStaff(null);
          }}
          onSave={savePin}
        />
      )}

      {showAddModal && (
        <AddNewStaffModal
          open={showAddModal}
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSaved={fetchData}
          roleOptions={allowedCreateRoleOptions}
        />
      )}
    </div>
  );
}

/* ========= Role editor modal ========= */
function EditRoleModal({ open, staff, roleOptions = [], onClose, onSave }) {
  const [selected, setSelected] = useState(staff?.permission || "");

  // Keep selected in sync when staff changes
  useEffect(() => {
    setSelected(staff?.permission || "");
  }, [staff]);

  if (!open) return null;

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

/* ========= PIN editor modal ========= */
function EditPinModal({ staff, onClose, onSave }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave = /^\d{4}$/.test(pin) && pin === confirm && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(pin);
    } finally {
      setSaving(false);
      setPin("");
      setConfirm("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
        <h3 className="text-xl font-semibold mb-2 text-gray-800">Change PIN</h3>
        <p className="text-sm text-gray-600 mb-4">
          Set a new 4-digit PIN for <b>{staff?.name}</b>.
        </p>

        <label className="block text-sm text-gray-700 mb-1">New PIN</label>
        <input
          type="password"
          inputMode="numeric"
          pattern="\d*"
          maxLength={4}
          className="w-full border rounded p-2 mb-3"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
        />

        <label className="block text-sm text-gray-700 mb-1">Confirm PIN</label>
        <input
          type="password"
          inputMode="numeric"
          pattern="\d*"
          maxLength={4}
          className="w-full border rounded p-2 mb-4"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
        />

        {pin && confirm && pin !== confirm && (
          <div className="text-sm text-red-600 mb-3">Pins do not match.</div>
        )}

        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 rounded bg-gray-200 text-gray-800"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded bg-amber-600 text-white disabled:opacity-50"
            disabled={!canSave}
            onClick={handleSave}
          >
            {saving ? "Saving..." : "Save PIN"}
          </button>
        </div>
      </div>
    </div>
  );
}
