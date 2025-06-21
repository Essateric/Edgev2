// ManageStaff.jsx - With collapsible service categories and existing styles preserved

import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function ManageStaff() {
  const [staff, setStaff] = useState([]);
  const [servicesList, setServicesList] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});

  const defaultWeeklyHours = {
    Monday: { start: "", end: "", off: false },
    Tuesday: { start: "", end: "", off: false },
    Wednesday: { start: "", end: "", off: false },
    Thursday: { start: "", end: "", off: false },
    Friday: { start: "", end: "", off: false },
    Saturday: { start: "", end: "", off: false },
    Sunday: { start: "", end: "", off: false },
  };

  const [form, setForm] = useState({
    name: "",
    email: "",
    services: [],
    weeklyHours: defaultWeeklyHours,
  });

  useEffect(() => {
    fetchData();
  }, []);

  function normaliseWeeklyHours(input) {
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
  }

  async function fetchData() {
    const { data: staffData, error: staffError } = await supabase.from("staff").select("*");
    if (staffError) {
      console.error("Error fetching staff:", staffError.message);
      return;
    }
    setStaff(
      staffData.map(doc => ({
        id: doc.id,
        ...doc,
        weekly_hours: normaliseWeeklyHours(doc.weekly_hours),
      }))
    );

    const { data: servicesData, error: servicesError } = await supabase.from("services").select("id, name, category");
    if (servicesError) {
      console.error("Error fetching services:", servicesError.message);
      return;
    }
    setServicesList(servicesData);
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value || "" });
  }

  function handleServiceToggle(service) {
    const exists = form.services.find(s => s.name === service.name);
    if (exists) {
      setForm({
        ...form,
        services: form.services.filter(s => s.name !== service.name),
      });
    } else {
      setForm({
        ...form,
        services: [...form.services, { ...service, price: 0, duration: { hours: 0, minutes: 0 } }],
      });
    }
  }

  function updateServiceValue(serviceName, field, value) {
    setForm(prev => ({
      ...prev,
      services: prev.services.map(s => {
        if (s.name !== serviceName) return s;
        if (field === "price") return { ...s, price: value };
        if (field === "duration") return { ...s, duration: value };
        return s;
      }),
    }));
  }

  function updateHours(day, type, value) {
    setForm(prev => ({
      ...prev,
      weeklyHours: {
        ...prev.weeklyHours,
        [day]: {
          ...prev.weeklyHours[day],
          [type]: value,
        },
      },
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const hasInvalidServices = form.services.some(
      s => !s.price && s.price !== 0 || !s.duration || (s.duration.hours === 0 && s.duration.minutes === 0)
    );
    if (hasInvalidServices) {
      alert("Please add both price and duration (hours/minutes) for selected services.");
      return;
    }

    const payload = {
      name: form.name,
      email: form.email,
      services: form.services,
      weekly_hours: Object.fromEntries(
        Object.entries(form.weeklyHours).map(([day, config]) => [
          day,
          {
            start: config.start || "",
            end: config.end || "",
            off: config.off || false,
          },
        ])
      ),
    };

    try {
      if (editingId) {
        const { error } = await supabase.from("staff").update(payload).eq("id", editingId);
        if (error) console.error("Update error:", error);
      } else {
        const { error } = await supabase.from("staff").insert([payload]);
        if (error) console.error("Insert error:", error);
      }
    } catch (err) {
      console.error("Submit failed:", err);
    }

    setForm({ name: "", email: "", services: [], weeklyHours: defaultWeeklyHours });
    setEditingId(null);
    fetchData();
  }

  function handleEdit(member) {
    console.log("Editing member:", member);
    setForm({
      name: member.name || "",
      email: member.email || "",
      services: member.services || [],
      weeklyHours: normaliseWeeklyHours(member.weekly_hours || {}),
    });
    setEditingId(member.id);
  }

  function handleDelete(id) {
    if (confirm("Are you sure you want to delete this staff member?")) {
      supabase.from("staff").delete().eq("id", id).then(() => fetchData());
    }
  }

  function toggleCategory(cat) {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-chrome mb-4">Staff Management</h2>

      {/* FORM AND OTHER UI OMITTED FOR BREVITY */}

      <div className="border p-3 rounded space-y-2">
        <h4 className="font-semibold text-bronze mb-2">Services</h4>
        {Array.from(new Set(servicesList.map(s => s.category))).map(category => (
          <div key={category} className="mb-3">
            <h5
              className="font-semibold text-gray-950 mb-1 cursor-pointer"
              onClick={() => toggleCategory(category)}
            >
              {category} {expandedCategories[category] ? "▲" : "▼"}
            </h5>
            {expandedCategories[category] && (
              <table className="w-full text-sm border">
                <thead>
                  <tr>
                    <th className="text-left px-2 py-1">Select</th>
                    <th className="text-bronze text-left">Name</th>
                    <th className="text-bronze text-left">Price (£)</th>
                    <th className="text-bronze text-left">Duration (hrs)</th>
                    <th className="text-bronze text-left">Duration (mins)</th>
                  </tr>
                </thead>
                <tbody>
                  {servicesList
                    .filter(s => s.category === category)
                    .map(service => {
                      const selected = form.services.find(s => s.name === service.name);
                      return (
                        <tr key={service.id} className="border-t">
                          <td>
                            <input
                              type="checkbox"
                              checked={!!selected}
                              onChange={() => handleServiceToggle(service)}
                              className="ml-2 text-bronze border-bronze"
                            />
                          </td>
                          <td className="px-2 text-bronze">{service.name}</td>
                          <td>
                            <input
                              type="number"
                              value={selected?.price || ""}
                              disabled={!selected}
                              onChange={(e) =>
                                updateServiceValue(service.name, "price", parseFloat(e.target.value))
                              }
                              className="w-16 border p-1 text-bronze border-bronze"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              max={10}
                              value={selected?.duration?.hours || ""}
                              disabled={!selected}
                              onChange={(e) =>
                                updateServiceValue(service.name, "duration", {
                                  ...selected.duration,
                                  hours: parseInt(e.target.value || "0", 10),
                                })
                              }
                              className="w-16 border p-1 text-bronze border-bronze"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              max={59}
                              value={selected?.duration?.minutes || ""}
                              disabled={!selected}
                              onChange={(e) =>
                                updateServiceValue(service.name, "duration", {
                                  ...selected.duration,
                                  minutes: parseInt(e.target.value || "0", 10),
                                })
                              }
                              className="w-16 border p-1 text-bronze border-bronze"
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
      </div>
    </div>
  );
}
