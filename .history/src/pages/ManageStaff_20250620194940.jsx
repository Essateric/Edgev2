// ManageStaff.jsx - Final Version with Collapsible Services, Original Styling, and Full Logic

import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function ManageStaff() {
  const [staff, setStaff] = useState([]);
  const [servicesList, setServicesList] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [openCategories, setOpenCategories] = useState({});

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
    const { data: staffData } = await supabase.from("staff").select("*");
    setStaff(
      staffData.map(doc => ({
        id: doc.id,
        ...doc,
        weekly_hours: normaliseWeeklyHours(doc.weekly_hours),
      }))
    );

    const { data: servicesData } = await supabase.from("services").select("id, name, category");
    setServicesList(servicesData);

    const openStates = {};
    servicesData.forEach(s => (openStates[s.category] = false));
    setOpenCategories(openStates);
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
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
    const payload = {
      name: form.name,
      email: form.email,
      weekly_hours: form.weeklyHours,
    };

    if (editingId) {
      await supabase.from("staff").update(payload).eq("id", editingId);
    } else {
      await supabase.from("staff").insert([payload]);
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

  function handleDelete(id) {
    if (confirm("Delete staff member?")) {
      supabase.from("staff").delete().eq("id", id).then(() => fetchData());
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-chrome mb-4">Staff Management</h2>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-4 rounded shadow">
        <input name="name" value={form.name} onChange={handleChange} placeholder="Name" className="w-full p-2 border text-bronze border-bronze" />
        <input name="email" value={form.email} onChange={handleChange} placeholder="Email" className="w-full p-2 border text-bronze border-bronze" />

        <div className="border p-3 rounded text-bronze border-bronze">
          <h4 className="font-semibold text-left mb-2">Weekly Hours</h4>
          {Object.entries(form.weeklyHours).map(([day, times]) => (
            <div key={day} className="flex items-center mb-2 gap-2">
              <label className="w-24 capitalize">{day}:</label>
              <input type="time" value={times.start || ""} disabled={times.off} onChange={(e) => updateHours(day, "start", e.target.value)} className="border p-1 text-bronze border-bronze" />
              <span>to</span>
              <input type="time" value={times.end || ""} disabled={times.off} onChange={(e) => updateHours(day, "end", e.target.value)} className="border p-1 text-bronze border-bronze" />
              <button type="button" onClick={() => updateHours(day, "off", !times.off)} className={`ml-2 px-2 py-1 text-sm rounded ${times.off ? "bg-red-200" : "bg-gray-200"}`}>{times.off ? "Off" : "Set Off"}</button>
            </div>
          ))}
        </div>

        <div className="border p-3 rounded space-y-2">
          <h4 className="font-semibold text-bronze mb-2">Services</h4>
          {Array.from(new Set(servicesList.map(s => s.category))).map(category => (
            <div key={category} className="mb-3">
              <button
                type="button"
                className="font-bold w-full text-left mb-1 text-bronze"
                onClick={() => setOpenCategories(prev => ({ ...prev, [category]: !prev[category] }))}
              >
                {category}
              </button>
              {openCategories[category] && (
                <table className="w-full text-sm border">
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Name</th>
                      <th>Price</th>
                      <th>Hrs</th>
                      <th>Mins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servicesList.filter(s => s.category === category).map(service => {
                      const selected = form.services.find(s => s.name === service.name);
                      return (
                        <tr key={service.id} className="border-t">
                          <td><input type="checkbox" checked={!!selected} onChange={() => handleServiceToggle(service)} /></td>
                          <td>{service.name}</td>
                          <td><input type="number" value={selected?.price || ""} disabled={!selected} onChange={(e) => updateServiceValue(service.name, "price", parseFloat(e.target.value))} className="w-16" /></td>
                          <td><input type="number" value={selected?.duration?.hours || ""} disabled={!selected} onChange={(e) => updateServiceValue(service.name, "duration", { ...selected.duration, hours: parseInt(e.target.value || "0") })} className="w-12" /></td>
                          <td><input type="number" value={selected?.duration?.minutes || ""} disabled={!selected} onChange={(e) => updateServiceValue(service.name, "duration", { ...selected.duration, minutes: parseInt(e.target.value || "0") })} className="w-12" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>

        <button className="bg-bronze text-white px-4 py-2 rounded">
          {editingId ? "Update Staff" : "Add Staff"}
        </button>
      </form>
    </div>
  );
}
