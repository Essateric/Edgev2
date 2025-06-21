// ManageStaff.jsx - Updated with collapsible service categories and full existing logic

import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function ManageStaff() {
  const [staff, setStaff] = useState([]);
  const [servicesList, setServicesList] = useState([]);
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [editingId, setEditingId] = useState(null);

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
    if (staffError) return console.error("Error fetching staff:", staffError);

    setStaff(
      staffData.map((doc) => ({
        ...doc,
        weekly_hours: normaliseWeeklyHours(doc.weekly_hours),
      }))
    );

    const { data: servicesData, error: servicesError } = await supabase.from("services").select("id, name, category");
    if (servicesError) return console.error("Error fetching services:", servicesError);

    setServicesList(servicesData);
    const allCategories = [...new Set(servicesData.map((s) => s.category))];
    const collapsed = Object.fromEntries(allCategories.map((cat) => [cat, true]));
    setCollapsedCategories(collapsed);
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleServiceToggle(service) {
    const exists = form.services.find((s) => s.name === service.name);
    setForm({
      ...form,
      services: exists
        ? form.services.filter((s) => s.name !== service.name)
        : [...form.services, { ...service, price: 0, duration: { hours: 0, minutes: 0 } }],
    });
  }

  function updateServiceValue(serviceName, field, value) {
    setForm((prev) => ({
      ...prev,
      services: prev.services.map((s) => {
        if (s.name !== serviceName) return s;
        if (field === "price") return { ...s, price: value };
        if (field === "duration") return { ...s, duration: value };
        return s;
      }),
    }));
  }

  function updateHours(day, type, value) {
    setForm((prev) => ({
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
      (s) => !s.price && s.price !== 0 || !s.duration || (s.duration.hours === 0 && s.duration.minutes === 0)
    );
    if (hasInvalidServices) return alert("Please enter valid price and duration.");

    const payload = {
      name: form.name,
      email: form.email,
      weekly_hours: form.weeklyHours,
    };

    try {
      editingId
        ? await supabase.from("staff").update(payload).eq("id", editingId)
        : await supabase.from("staff").insert([payload]);
    } catch (err) {
      console.error("Submit failed:", err);
    }

    setForm({ name: "", email: "", services: [], weeklyHours: defaultWeeklyHours });
    setEditingId(null);
    fetchData();
  }

  function handleEdit(member) {
    setForm({
      name: member.name,
      email: member.email,
      services: member.services || [],
      weeklyHours: normaliseWeeklyHours(member.weekly_hours || {}),
    });
    setEditingId(member.id);
  }

  function toggleCategory(category) {
    setCollapsedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  }

  return (
    <div className="p-6">
      <form onSubmit={handleSubmit}>
        <input name="name" value={form.name} onChange={handleChange} placeholder="Name" className="block mb-2" />
        <input name="email" value={form.email} onChange={handleChange} placeholder="Email" className="block mb-4" />

        {Object.entries(form.weeklyHours).map(([day, obj]) => (
          <div key={day}>
            {day}: {obj.start} to {obj.end} {obj.off && "(Off)"}
          </div>
        ))}

        {Array.from(new Set(servicesList.map((s) => s.category))).map((category) => (
          <div key={category} className="my-4">
            <h4
              className="font-bold text-lg cursor-pointer text-bronze"
              onClick={() => toggleCategory(category)}
            >
              {collapsedCategories[category] ? "+" : "-"} {category}
            </h4>
            {!collapsedCategories[category] && (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th>Select</th>
                    <th>Name</th>
                    <th>Price</th>
                    <th>Hours</th>
                    <th>Minutes</th>
                  </tr>
                </thead>
                <tbody>
                  {servicesList
                    .filter((s) => s.category === category)
                    .map((service) => {
                      const selected = form.services.find((s) => s.name === service.name);
                      return (
                        <tr key={service.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={!!selected}
                              onChange={() => handleServiceToggle(service)}
                            />
                          </td>
                          <td>{service.name}</td>
                          <td>
                            <input
                              type="number"
                              value={selected?.price || ""}
                              disabled={!selected}
                              onChange={(e) =>
                                updateServiceValue(service.name, "price", parseFloat(e.target.value))
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={selected?.duration?.hours || ""}
                              disabled={!selected}
                              onChange={(e) =>
                                updateServiceValue(service.name, "duration", {
                                  ...selected.duration,
                                  hours: parseInt(e.target.value || "0", 10),
                                })
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={selected?.duration?.minutes || ""}
                              disabled={!selected}
                              onChange={(e) =>
                                updateServiceValue(service.name, "duration", {
                                  ...selected.duration,
                                  minutes: parseInt(e.target.value || "0", 10),
                                })
                              }
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

        <button type="submit" className="mt-4 px-4 py-2 bg-bronze text-white rounded">
          {editingId ? "Update Staff" : "Add Staff"}
        </button>
      </form>
    </div>
  );
}
