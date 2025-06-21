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
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value || "" });
  }

  function handleServiceToggle(service) {
    const exists = form.services.find(s => s.id === service.id);
    if (exists) {
      setForm({
        ...form,
        services: form.services.filter(s => s.id !== service.id),
      });
    } else {
      setForm({
        ...form,
        services: [...form.services, { ...service, price: 0, duration: { hours: 0, minutes: 0 } }],
      });
    }
  }

  function updateServiceValue(serviceId, field, value) {
    setForm(prev => ({
      ...prev,
      services: prev.services.map(s => {
        if (s.id !== serviceId) return s;
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

    try {
      if (editingId) {
        await supabase.from("staff").update(payload).eq("id", editingId);
      } else {
        await supabase.from("staff").insert([payload]);
      }
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

  function handleDelete(id) {
    if (confirm("Are you sure you want to delete this staff member?")) {
      supabase.from("staff").delete().eq("id", id).then(() => fetchData());
    }
  }

  function toggleCategory(cat) {
    setExpandedCategories(prev => ({
      ...prev,
      [cat]: !prev[cat],
    }));
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-chrome mb-4">Staff Management</h2>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-4 rounded shadow">
        <input name="name" value={form.name || ''} onChange={handleChange} placeholder="Name" className="w-full p-2" />
        <input name="email" value={form.email || ''} onChange={handleChange} placeholder="Email" className="w-full p-2" />

        <div className="border p-3 rounded">
          <h4 className="font-semibold mb-2">Weekly Hours</h4>
          {Object.entries(form.weeklyHours).map(([day, times]) => (
            <div key={day} className="flex items-center mb-2 gap-2">
              <label className="w-24 capitalize">{day}:</label>
              <input type="time" value={times.start || ''} disabled={times.off} onChange={(e) => updateHours(day, "start", e.target.value)} className="border p-1" />
              <span>to</span>
              <input type="time" value={times.end || ''} disabled={times.off} onChange={(e) => updateHours(day, "end", e.target.value)} className="border p-1" />
              <button type="button" onClick={() => updateHours(day, "off", !times.off)} className="ml-2 px-2 py-1 text-sm rounded bg-gray-200">
                {times.off ? "Off" : "Set Off"}
              </button>
            </div>
          ))}
        </div>

        <div className="border p-3 rounded space-y-2">
          <h4 className="font-semibold mb-2">Services</h4>
          {Array.from(new Set(servicesList.map(s => s.category))).map(category => (
            <div key={category} className="mb-3">
              <button type="button" onClick={() => toggleCategory(category)} className="font-semibold text-left text-lg w-full text-bronze">
                {expandedCategories[category] ? '▼' : '►'} {category}
              </button>
              {expandedCategories[category] && (
                <table className="w-full text-sm border mt-2">
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
                      const selected = form.services.find(s => s.id === service.id);
                      return (
                        <tr key={service.id} className="border-t">
                          <td>
                            <input type="checkbox" checked={!!selected} onChange={() => handleServiceToggle(service)} />
                          </td>
                          <td>{service.name}</td>
                          <td>
                            <input type="number" value={selected?.price || ''} disabled={!selected} onChange={(e) => updateServiceValue(service.id, "price", parseFloat(e.target.value))} className="w-16 border p-1" />
                          </td>
                          <td>
                            <input type="number" min={0} max={10} value={selected?.duration?.hours || ''} disabled={!selected} onChange={(e) => updateServiceValue(service.id, "duration", { ...selected.duration, hours: parseInt(e.target.value || '0', 10) })} className="w-16 border p-1" />
                          </td>
                          <td>
                            <input type="number" min={0} max={59} value={selected?.duration?.minutes || ''} disabled={!selected} onChange={(e) => updateServiceValue(service.id, "duration", { ...selected.duration, minutes: parseInt(e.target.value || '0', 10) })} className="w-16 border p-1" />
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

        <button className="bg-bronze text-white px-4 py-2 rounded">{editingId ? "Update Staff" : "Add Staff"}</button>
      </form>

      <div className="mt-6">
        <h3 className="text-lg font-bold text-chrome mb-4">Current Staff</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {staff.map((member) => (
            <div key={member.id} className="bg-white rounded-2xl shadow-md p-4 border border-gray-200">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="text-lg font-semibold text-gray-800">{member.name}</h4>
                  <p className="text-sm text-gray-500">{member.email}</p>
                </div>
                <div className="text-sm space-x-4">
                  <button onClick={() => handleEdit(member)} className="text-blue-600 hover:underline">Edit</button>
                  <button onClick={() => handleDelete(member.id)} className="text-red-500 hover:underline">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
