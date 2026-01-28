import React, { useState, useEffect, useMemo } from "react";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import toast from "react-hot-toast";
import { supabase as defaultSupabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { logEvent } from "../lib/logEvent";
import { isAdminLike } from "../utils/roleUtils";

export default function ManageServices({ staffId }) {
  const { currentUser, supabaseClient } = useAuth();
  const supabase = supabaseClient || defaultSupabase;

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

  const [services, setServices] = useState([]);

  // kept (unused) to preserve existing logic surface
  // eslint-disable-next-line no-unused-vars
  const [customData, setCustomData] = useState({});

  const [saving, setSaving] = useState(false);

  const [newServiceName, setNewServiceName] = useState("");
  const [newCategory, setNewCategory] = useState("Uncategorized");
  const [newBasePrice, setNewBasePrice] = useState(0);
  const [newBaseDuration, setNewBaseDuration] = useState(30);

  const [openCategories, setOpenCategories] = useState({});
  const [selectedService, setSelectedService] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const [staffList, setStaffList] = useState([]);

  // service ⇄ stylist assignments for the modal
  // shape: { [staff_id]: { checked: boolean, price: number|string, mins: number } }
  const [assignments, setAssignments] = useState({});

  // who am I? (permission gate for delete button)
  const [me, setMe] = useState(null);

  // delete confirm state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);


  const myPermission =
  me?.permission ||
  currentUser?.permission ||
  currentUser?.user?.permission ||
  currentUser?.role ||
  currentUser?.user?.role ||
  null;

const isAdmin = isAdminLike({ permission: myPermission });


  const categories = [
    "Uncategorized",
    "Cut and Finish",
    "Highlights",
    "Tints",
    "Blow Dry",
    "Gents",
  ];

  const getActor = () => {
    const actorEmail = currentUser?.email || currentUser?.user?.email || null;
    const actorId = currentUser?.id || currentUser?.user?.id || null;
    return { actorEmail, actorId };
  };

  const fetchMe = async () => {
    const uid =
      staffId ||
      currentUser?.staff_id ||
      currentUser?.user?.staff_id ||
      currentUser?.id ||
      currentUser?.user?.id ||
      null;
    if (!uid) return;

    const { data, error } = await withTimeout(
      supabase
        .from("staff")
        .select("id,name,permission,email")
        .eq("id", uid)
        .maybeSingle(),
      5000,
      "fetch me"
    );

    if (error) {
      console.warn("Failed to fetch current staff record:", error);
      setMe(null);
      return;
    }

    setMe(data || null);
  };

  const fetchServices = async () => {
    const { data, error } = await withTimeout(
      supabase.from("services").select("*").order("category").order("name"),
      5000,
      "fetch services"
    );
    if (error) {
      toast.error("Failed to fetch services");
      console.error(error);
    } else {
      setServices(data || []);
    }
  };

  const fetchStaff = async () => {
    const { data, error } = await withTimeout(
      supabase.from("staff").select("id,name,permission,email").order("name"),
      5000,
      "fetch staff"
    );
    if (error) {
      toast.error("Failed to fetch staff");
      console.error(error);
    } else {
      setStaffList(data || []);
    }
  };

  useEffect(() => {
    fetchServices();
    fetchStaff();
    fetchMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddService = async () => {
    if (!newServiceName.trim()) {
      toast.error("Service name is required");
      return;
    }

    const payload = {
      name: newServiceName.trim(),
      category: newCategory,
      base_price: Number(newBasePrice) || 0,
      base_duration: Number(newBaseDuration) || 0,
    };

    const { error, data } = await supabase
      .from("services")
      .insert([payload])
      .select("*")
      .maybeSingle();

    if (error) {
      toast.error("Failed to add service");
      console.error(error);
      return;
    }

    try {
      const { actorEmail, actorId } = getActor();
      await logEvent({
        entityType: "service",
        entityId: data?.id || null,
        action: "service_created",
        details: { service: data || payload },
        actorId,
        actorEmail,
        supabaseClient: supabase,
      });
    } catch (auditErr) {
      console.warn("[Audit] service create failed", auditErr);
    }

    toast.success("Service added successfully");
    setNewServiceName("");
    setNewCategory("Uncategorized");
    setNewBasePrice(0);
    setNewBaseDuration(30);
    fetchServices();
  };

  // ===== Join-table helpers (modal) =====
  const setAssigned = (staff_id, checked) =>
    setAssignments((prev) => ({
      ...prev,
      [staff_id]: { ...(prev[staff_id] || {}), checked },
    }));

  const setPrice = (staff_id, value) =>
    setAssignments((prev) => ({
      ...prev,
      [staff_id]: { ...(prev[staff_id] || { checked: true }), price: value },
    }));

  const setHrs = (staff_id, hours) =>
    setAssignments((prev) => {
      const cur = prev[staff_id] || { checked: true, mins: 0 };
      const total = (Number(hours) || 0) * 60 + ((Number(cur.mins) || 0) % 60);
      return { ...prev, [staff_id]: { ...cur, mins: total } };
    });

  const setMins = (staff_id, minutes) =>
    setAssignments((prev) => {
      const cur = prev[staff_id] || { checked: true, mins: 0 };
      const h = Math.floor((Number(cur.mins) || 0) / 60);
      const total = h * 60 + (Number(minutes) || 0);
      return { ...prev, [staff_id]: { ...cur, mins: total } };
    });

  // Open modal and load current assignments from staff_services
  const handleServiceClick = async (service) => {
    setSelectedService(service);
    setShowModal(true);
    setAssignments({});

    const { data, error } = await supabase
      .from("staff_services")
      .select("staff_id, price, duration")
      .eq("service_id", service.id);

    if (error) {
      console.error("Failed to load service assignments:", error);
      setAssignments({});
      return;
    }

    const map = {};
    for (const row of data || []) {
      map[row.staff_id] = {
        checked: true,
        price: row.price ?? 0,
        mins: Number(row.duration) || 0,
      };
    }
    setAssignments(map);
  };

  // Save (upsert checked + delete unchecked)
  const handleSaveStylist = async () => {
    if (!selectedService?.id) return;

    setSaving(true);
    try {
      const { data: existing, error: loadErr } = await supabase
        .from("staff_services")
        .select("staff_id,price,duration")
        .eq("service_id", selectedService.id);

      if (loadErr) throw loadErr;

      const existingSet = new Set((existing || []).map((r) => r.staff_id));
       const beforeAssignments = (existing || []).map((row) => ({
        staff_id: row.staff_id,
        price: row.price ?? 0,
        duration: Number(row.duration) || 0,
      }));

      const upserts = Object.entries(assignments)
        .filter(([, v]) => v?.checked)
        .map(([staff_id, v]) => ({
          staff_id,
          service_id: selectedService.id,
          price: Number(v.price) || 0,
          duration: Number(v.mins) || 0,
          active: true,
        }));

        const afterAssignments = upserts.map((row) => ({
        staff_id: row.staff_id,
        price: row.price,
        duration: row.duration,
      }));

      if (upserts.length) {
        const { error: upErr } = await supabase
          .from("staff_services")
          .upsert(upserts, { onConflict: "staff_id,service_id" });
        if (upErr) throw upErr;
      }

      const uncheckedStaff = Object.entries(assignments)
        .filter(([, v]) => !v?.checked)
        .map(([staff_id]) => staff_id);

      const toDelete = [...existingSet].filter((id) =>
        uncheckedStaff.includes(id)
      );

      if (toDelete.length) {
        const { error: delErr } = await supabase
          .from("staff_services")
          .delete()
          .eq("service_id", selectedService.id)
          .in("staff_id", toDelete);
        if (delErr) throw delErr;
      }

      try {
        const { actorEmail, actorId } = getActor();
        const assignedStaffIds = upserts.map((row) => row.staff_id);

        await logEvent({
          entityType: "staff_service",
          entityId: selectedService.id,
          action: "staff_services_saved",
          details: {
            service_id: selectedService.id,
            service_name: selectedService.name || null,
            assigned_staff_ids: assignedStaffIds,
            unassigned_staff_ids: toDelete,
            upsert_count: upserts.length,
            delete_count: toDelete.length,
          },
          actorId,
          actorEmail,
          supabaseClient: supabase,
        });
        await logEvent({
          entityType: "service",
          entityId: selectedService.id,
          action: "service_updated",
          details: {
            service_id: selectedService.id,
            service_name: selectedService.name || null,
            before_assignments: beforeAssignments,
            after_assignments: afterAssignments,
            unassigned_staff_ids: toDelete,
          },
          actorId,
          actorEmail,
          supabaseClient: supabase,
        });
      } catch (auditErr) {
        console.warn("[Audit] staff services save failed", auditErr);
      }

      toast.success("Saved!");
      setShowModal(false);
      fetchServices();
    } catch (e) {
      console.error("Save failed:", e);
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // open delete confirmation
  const requestDeleteService = (service) => {
    if (!isAdmin) {
      toast.error("Only admins and senior stylists can delete services.");
      return;
    }
    setDeleteTarget(service);
  };

  // actually delete + audit log
  const confirmDeleteService = async () => {
    if (!deleteTarget?.id) return;

    if (!isAdmin) {
      toast.error("Only admins and senior stylists can delete services.");
      setDeleteTarget(null);
      return;
    }

    setDeleting(true);
    const svc = deleteTarget;

    try {
      const { count: assignedCount, error: countErr } = await supabase
        .from("staff_services")
        .select("id", { count: "exact", head: true })
        .eq("service_id", svc.id);

      if (countErr) {
        console.warn("Could not count staff_services for service:", countErr);
      }

      const { error: delErr } = await supabase
        .from("services")
        .delete()
        .eq("id", svc.id);

      if (delErr) throw delErr;

      try {
        const { actorEmail, actorId } = getActor();
        await logEvent({
          entityType: "service",
          entityId: svc.id,
          action: "service_deleted",
          details: {
            service: {
              id: svc.id,
              name: svc.name,
              category: svc.category,
              base_price: svc.base_price,
              base_duration: svc.base_duration,
            },
            cascade_deleted_staff_services_count: assignedCount ?? null,
            note: "Deleted from ManageServices UI",
          },
          actorId,
          actorEmail,
          supabaseClient: supabase,
        });
      } catch (auditErr) {
        console.warn("[Audit] service delete failed", auditErr);
      }

      toast.success("Service deleted");
      setDeleteTarget(null);

      if (selectedService?.id === svc.id) {
        setShowModal(false);
        setSelectedService(null);
        setAssignments({});
      }

      fetchServices();
    } catch (e) {
      console.error("Delete service failed:", e);
      toast.error(e?.message || "Failed to delete service");
    } finally {
      setDeleting(false);
    }
  };

  // Group services by category
  const groupedServices = useMemo(() => {
    return (services || []).reduce((acc, service) => {
      const cat = service.category || "Uncategorized";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(service);
      return acc;
    }, {});
  }, [services]);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-chrome mb-4">Manage Services</h1>

      {/* Add Service */}
      <Card className="mb-4">
        <h2 className="text-lg text-bronze font-semibold mb-3">
          Add New Service
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
          <div className="flex flex-col">
            <label className="text-sm text-gray-700 mb-1">Service Name</label>
            <input
              type="text"
              placeholder="Service Name"
              value={newServiceName}
              onChange={(e) => setNewServiceName(e.target.value)}
              className="w-full border-2 border-gray-500 rounded p-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#cd7f32]"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-sm text-gray-700 mb-1">
              Select Category
            </label>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="w-full border-2 border-gray-500 rounded p-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#cd7f32]"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-sm text-gray-700 mb-1">Base Price (£)</label>
            <input
              type="number"
              placeholder="Base Price (£)"
              value={newBasePrice}
              onChange={(e) => setNewBasePrice(e.target.value)}
              className="w-full border-2 border-gray-500 rounded p-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#cd7f32]"
              min="0"
              step="0.01"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-sm text-gray-700 mb-1">
              Base Duration (mins)
            </label>
            <input
              type="number"
              placeholder="Base Duration (mins)"
              value={newBaseDuration}
              onChange={(e) => setNewBaseDuration(e.target.value)}
              className="w-full border-2 border-gray-500 rounded p-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#cd7f32]"
              min="0"
              step="1"
            />
          </div>
        </div>

        <Button
          onClick={handleAddService}
          className="bg-[#cd7f32] text-white hover:bg-[#b36c2c]"
        >
          Add Service
        </Button>
      </Card>

      {/* Grouped Services */}
      <Card className="mb-4">
        <h2 className="text-lg font-semibold mb-4 text-bronze">
          Current Services
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Object.entries(groupedServices).map(([category, servicesInCategory]) => (
            <div
              key={category}
              className="border border-gray-200 rounded-lg bg-white overflow-hidden"
            >
              <button
                onClick={() =>
                  setOpenCategories((prev) => ({
                    ...prev,
                    [category]: !prev[category],
                  }))
                }
                className="w-full text-left px-4 py-3 font-semibold text-chrome bg-bronze hover:text-white hover:bg-amber-600 flex items-center justify-between"
              >
                <span>{category}</span>
                <span className="text-gray-100/80">
                  {openCategories[category] ? "−" : "+"}
                </span>
              </button>

              <div className={openCategories[category] ? "p-4 block" : "hidden"}>
                <div className="grid grid-cols-1 gap-3">
                  {servicesInCategory.map((service) => (
                    <div
                      key={service.id}
                      onClick={() => handleServiceClick(service)}
                      className="relative bg-white text-left border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleServiceClick(service);
                        }
                      }}
                    >
                     <p className="text-sm text-bronze font-medium">
                        {service.name}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        £{Number(service.base_price || 0).toFixed(2)} •{" "}
                        {Number(service.base_duration || 0)} mins
                      </p>

                      {isAdmin && (
                        <p className="text-[11px] text-gray-400 mt-2">
                          Tip: you can delete here or in the modal
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Modal */}
      {showModal && selectedService && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl shadow-xl overflow-y-auto max-h-[90vh]">
           <div className="sticky top-0 z-10 bg-white pb-3 border-b border-gray-200">
  <div className="flex items-center justify-between gap-3">
    <h3 className="text-lg font-semibold text-chrome">
      {selectedService.name} — Assign stylists
    </h3>

    <div className="flex items-center gap-2">
      {isAdmin && (
        <button
          onClick={() => requestDeleteService(selectedService)}
          className="h-9 px-3 text-sm rounded-md bg-red-600 text-white hover:bg-red-700"
          disabled={saving || deleting}
        >
          Delete
        </button>
      )}

      <button
        onClick={() => setShowModal(false)}
        className="h-9 px-3 text-sm rounded-md bg-gray-300 text-gray-900 hover:bg-gray-400"
        disabled={saving || deleting}
      >
        Cancel
      </button>

      <Button
        onClick={handleSaveStylist}
        className="h-9 px-4 text-sm bg-[#cd7f32] text-white hover:bg-[#b36c2c]"
        disabled={saving || deleting}
      >
        {saving ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  </div>
</div>


            <div className="space-y-3">
              {staffList.map((stylist) => {
                const rec = assignments[stylist.id] || {};
                const total = Number(rec.mins) || 0;
                const hrs = Math.floor(total / 60);
                const mins = total % 60;

                return (
                  <div
                    key={stylist.id}
                    className="text-gray-700 border p-4 rounded-lg bg-gray-50 grid grid-cols-6 gap-4 items-center"
                  >
                    <label className="col-span-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!rec.checked}
                        onChange={(e) =>
                          setAssigned(stylist.id, e.target.checked)
                        }
                      />
                      <span className="text-sm font-semibold text-bronze">
                        {stylist.name}
                      </span>
                    </label>

                    <div className="col-span-2 flex flex-col">
                      <label className="text-xs text-gray-700 mb-1">
                        Price (£)
                      </label>
                      <input
                        type="number"
                        value={rec.price ?? ""}
                        onChange={(e) => setPrice(stylist.id, e.target.value)}
                        placeholder="Price"
                        className="border rounded p-1 w-full"
                        min="0"
                        step="0.01"
                      />
                    </div>

                    <div className="flex flex-col">
                      <label className="text-xs text-gray-700 mb-1">Hours</label>
                      <input
                        type="number"
                        value={hrs || ""}
                        onChange={(e) => setHrs(stylist.id, e.target.value)}
                        placeholder="Hours"
                        className="border rounded p-1 w-full"
                        min="0"
                      />
                    </div>

                    <div className="flex flex-col">
                      <label className="text-xs text-gray-700 mb-1">
                        Minutes
                      </label>
                      <input
                        type="number"
                        value={mins || ""}
                        onChange={(e) => setMins(stylist.id, e.target.value)}
                        placeholder="Minutes"
                        className="border rounded p-1 w-full"
                        min="0"
                        max="59"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold text-chrome mb-2">
              Delete service?
            </h3>
            <p className="text-sm text-gray-700 mb-4">
              You are about to delete{" "}
              <span className="font-semibold">{deleteTarget.name}</span>.
              <br />
              This will remove it from the list and also delete any stylist
              assignments linked to it.
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-md bg-gray-200 hover:bg-gray-300"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteService}
                className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700"
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
