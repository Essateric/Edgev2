import React, { useState, useEffect, useMemo } from "react";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import toast from "react-hot-toast";
import { supabase as defaultSupabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { logEvent } from "../lib/logEvent";

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
  const [customData, setCustomData] = useState({}); // kept (unused) to preserve existing logic surface
  const [saving, setSaving] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [newCategory, setNewCategory] = useState("Uncategorized");
  const [newBasePrice, setNewBasePrice] = useState(0);
  const [newBaseDuration, setNewBaseDuration] = useState(30);
  const [openCategories, setOpenCategories] = useState({});
  const [selectedService, setSelectedService] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [staffList, setStaffList] = useState([]);

  // NEW: service ⇄ stylist assignments for the modal
  // shape: { [staff_id]: { checked: boolean, price: number|string, mins: number } }
  const [assignments, setAssignments] = useState({});

  const categories = [
    "Cut and Finish",
    "Highlights",
    "Tints",
    "Blow Dry",
    "Gents",
  ];

  const fetchServices = async () => {
    const { data, error } = await withTimeout(
      supabase.from("services").select("*"),
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
  }, []);

  const handleAddService = async () => {
    if (!newServiceName.trim()) {
      toast.error("Service name is required");
      return;
    }

    const { error } = await supabase.from("services").insert([
      {
        name: newServiceName,
        category: newCategory,
        base_price: Number(newBasePrice),
        base_duration: Number(newBaseDuration),
        // pricing JSON is no longer used; leaving it harmlessly empty
        pricing: {},
      },
    ]);

    if (error) {
      toast.error("Failed to add service");
      console.error(error);
    } else {
      toast.success("Service added successfully");
      setNewServiceName("");
      setNewCategory("Uncategorized");
      setNewBasePrice(0);
      setNewBaseDuration(30);
      fetchServices();
    }
  };

  // ===== NEW: Join-table helpers (for the modal) =====
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
      // What exists now (for delete-diff)
      const { data: existing, error: loadErr } = await supabase
        .from("staff_services")
        .select("staff_id")
        .eq("service_id", selectedService.id);

      if (loadErr) throw loadErr;

      const existingSet = new Set((existing || []).map((r) => r.staff_id));

      // Upserts
      const upserts = Object.entries(assignments)
        .filter(([, v]) => v?.checked)
        .map(([staff_id, v]) => ({
          staff_id,
          service_id: selectedService.id,
          price: Number(v.price) || 0,
          duration: Number(v.mins) || 0,
          active: true,
        }));

      if (upserts.length) {
        const { error: upErr } = await supabase
          .from("staff_services")
          .upsert(upserts, { onConflict: ["staff_id", "service_id"] });
        if (upErr) throw upErr;
      }

      // Deletes (those previously assigned but now unchecked)
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
        const actorEmail = currentUser?.email || currentUser?.user?.email || null;
        const actorId = currentUser?.id || currentUser?.user?.id || null;
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
      } catch (auditErr) {
        console.warn("[Audit] staff services save failed", auditErr);
      }


      toast.success("Saved!");
      setShowModal(false);
      fetchServices(); // optional refresh of list
    } catch (e) {
      console.error("Save failed:", e);
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Group services by category (unchanged)
  const groupedServices = useMemo(
    () =>
      services.reduce((acc, service) => {
        const cat = service.category || "Uncategorized";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(service);
        return acc;
      }, {}),
    [services]
  );

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-chrome mb-4">Manage Services</h1>

      {/* Add Service */}
      <Card className="mb-4">
        <h2 className="text-lg text-bronze font-semibold mb-3">Add New Service</h2>
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
            <label className="text-sm text-gray-700 mb-1">Select Category</label>
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
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-700 mb-1">Base Duration (mins)</label>
            <input
              type="number"
              placeholder="Base Duration (mins)"
              value={newBaseDuration}
              onChange={(e) => setNewBaseDuration(e.target.value)}
              className="w-full border-2 border-gray-500 rounded p-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#cd7f32]"
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
  <h2 className="text-lg font-semibold mb-4 text-bronze">Current Services</h2>

  {/* ⬇️ 3-column grid for categories (1 col on mobile, 2 on md, 3 on xl) */}
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
    {Object.entries(groupedServices).map(([category, services]) => (
      <div
        key={category}
        className="border border-gray-200 rounded-lg bg-white overflow-hidden"
      >
        {/* Category header (click to expand/collapse) */}
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
          <span className="text-gray-100/80">{openCategories[category] ? "−" : "+"}</span>
        </button>

        {/* Category body */}
        <div className={openCategories[category] ? "p-4 block" : "hidden"}>
          {/* Services inside each category still shown as a small grid */}
          <div className="grid grid-cols-1 gap-3">
            {services.map((service) => (
              <button
                key={service.id}
                onClick={() => handleServiceClick(service)}
                className="bg-white text-left border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition"
              >
                <p className="text-sm text-bronze font-medium">{service.name}</p>
              </button>
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
            <h3 className="text-lg font-semibold text-chrome mb-4">
              {selectedService.name} — Assign stylists
            </h3>

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
                        onChange={(e) => setAssigned(stylist.id, e.target.checked)}
                      />
                      <span className="text-sm font-semibold text-bronze">{stylist.name}</span>
                    </label>

                    <div className="col-span-2 flex flex-col">
                      <label className="text-xs text-gray-700 mb-1">Price (£)</label>
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
                      <label className="text-xs text-gray-700 mb-1">Minutes</label>
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

            <div className="flex justify-end mt-6 gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="bg-gray-400 text-white px-4 py-2 rounded-lg shadow hover:bg-gray-500"
              >
                Cancel
              </button>
              <Button
                onClick={handleSaveStylist}
                className="bg-[#cd7f32] text-white"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
