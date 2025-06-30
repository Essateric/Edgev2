import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function EditServicesModal({
  staff,
  servicesList,
  onClose,
}) {
  const [staffServices, setStaffServices] = useState([]);
  const [categoryCollapse, setCategoryCollapse] = useState({});

  useEffect(() => {
    fetchStaffServices();
  }, []);

  const fetchStaffServices = async () => {
    const { data } = await supabase
      .from("staff_services")
      .select("*")
      .eq("staff_id", staff.id);
    setStaffServices(data || []);
  };

  const getStaffService = (serviceId) =>
    staffServices.find((s) => s.service_id === serviceId) || {};

  const handleServiceChange = (serviceId, field, value) => {
    setStaffServices((prev) =>
      prev.some((ss) => ss.service_id === serviceId)
        ? prev.map((ss) =>
            ss.service_id === serviceId ? { ...ss, [field]: value } : ss
          )
        : [
            ...prev,
            { staff_id: staff.id, service_id: serviceId, [field]: value },
          ]
    );
  };

  const saveStaffServices = async () => {
    const toUpsert = staffServices
      .filter((s) => s.price && s.duration)
      .map((s) => ({
        ...s,
        staff_id: staff.id,
        price: Number(s.price),
        duration: Number(s.duration),
      }));

    if (toUpsert.length === 0) {
      alert("Nothing to save!");
      return;
    }

    const { error } = await supabase
      .from("staff_services")
      .upsert(toUpsert, { onConflict: ["staff_id", "service_id"] });

    if (error) {
      console.error("Supabase upsert error:", error.message);
      alert("Failed to save: " + error.message);
    } else {
      onClose();
    }
  };

  const categories = Array.from(
    new Set(servicesList.map((s) => s.category))
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8">
        <h3 className="text-xl font-bold mb-4">
          Edit Services for {staff?.name}
        </h3>
        {categories.map((cat) => (
          <div key={cat} className="mb-4">
            <button
              onClick={() =>
                setCategoryCollapse((prev) => ({
                  ...prev,
                  [cat]: !prev[cat],
                }))
              }
              className="w-full text-left text-lg font-semibold text-bronze mb-2"
            >
              {categoryCollapse[cat] ? "▼" : "▶"} {cat}
            </button>
            {!categoryCollapse[cat] && (
              <table className="w-full text-sm border">
                <thead>
                  <tr>
                    <th className="text-left px-2 py-1">Service</th>
                    <th className="text-left px-2 py-1">Price (£)</th>
                    <th className="text-left px-2 py-1">Hrs</th>
                    <th className="text-left px-2 py-1">Mins</th>
                  </tr>
                </thead>
                <tbody>
                  {servicesList
                    .filter((s) => s.category === cat)
                    .map((service) => {
                      const sServ = getStaffService(service.id);
                      const mins = sServ.duration
                        ? Number(sServ.duration) % 60
                        : "";
                      const hrs = sServ.duration
                        ? Math.floor(Number(sServ.duration) / 60)
                        : "";
                      return (
                        <tr key={service.id}>
                          <td className="px-2">{service.name}</td>
                          <td>
                            <input
                              className="w-20 border px-2 py-1 rounded"
                              type="number"
                              value={sServ.price || ""}
                              onChange={(e) =>
                                handleServiceChange(
                                  service.id,
                                  "price",
                                  e.target.value
                                )
                              }
                              min="0"
                              step="0.01"
                            />
                          </td>
                          <td>
                            <input
                              className="w-14 border px-2 py-1 rounded"
                              type="number"
                              value={hrs}
                              onChange={(e) => {
                                const hours = Number(e.target.value) || 0;
                                const minutes = mins ? Number(mins) : 0;
                                const total = hours * 60 + minutes;
                                handleServiceChange(
                                  service.id,
                                  "duration",
                                  total
                                );
                              }}
                              min="0"
                            />
                          </td>
                          <td>
                            <input
                              className="w-14 border px-2 py-1 rounded"
                              type="number"
                              value={mins}
                              onChange={(e) => {
                                const minutes = Number(e.target.value) || 0;
                                const hours = hrs ? Number(hrs) : 0;
                                const total = hours * 60 + minutes;
                                handleServiceChange(
                                  service.id,
                                  "duration",
                                  total
                                );
                              }}
                              min="0"
                              max="59"
                            />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>
        ))}
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="bg-gray-300 px-4 py-2 rounded"
          >
            Cancel
          </button>
          <button
            onClick={saveStaffServices}
            className="bg-bronze text-white px-4 py-2 rounded"
          >
            Save Services
          </button>
        </div>
      </div>
    </div>
  );
}
