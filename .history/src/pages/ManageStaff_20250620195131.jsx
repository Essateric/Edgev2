import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function ManageStaff() {
  const [staff, setStaff] = useState([]);
  const [servicesList, setServicesList] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState([]);
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
    const { data: staffData } = await supabase.from("staff").select("*");
    setStaff(
      staffData.map((doc) => ({
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
    const exists = form.services.find((s) => s.name === service.name);
    if (exists) {
      setForm({
        ...form,
        services: form.services.filter((s) => s.name !== service.name),
      });
    } else {
      setForm({
        ...form,
        services: [...form.services, { ...service, price: 0, duration: { hours: 0, minutes: 0 } }],
      });
    }
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
    const payload = {
      name: form.name,
      email: form.email,
      services: form.services,
      weekly_hours: form.weeklyHours,
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

  const toggleCategory = (category) => {
    setExpandedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-chrome mb-4">Staff Management</h2>
      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-4 rounded shadow">
        <input name="name" value={form.name || ""} onChange={handleChange} placeholder="Name" className="w-full text-left p-2 text-bronze border-bronze" />
        <input name="email" value={form.email || ""} onChange={handleChange} placeholder="Email" className="w-full text-left p-2 text-bronze border-bronze" />

        <div className="border p-3 rounded text-bronze border-bronze">
          <h4 className="font-semibold text-left mb-2">Weekly Hours</h4>
          {Object.entries(form.weeklyHours).map(([day, times]) => (
            <div key={day} className="flex items-center mb-2 gap-2">
              <label className="w-24 capitalize">{day}:</label>
              <input type="time" value={times.start || ""} disabled={times.off} onChange={(e) => updateHours(day, "start", e.target.value)} className="border p-1 text-bronze border-bronze" />
              <span>to</span>
              <input type="time" value={times.end || ""} disabled={times.off} onChange={(e) => updateHours(day, "end", e.target.value)} className="border p-1 text-bronze border-bronze" />
              <button
                type="button"
                onClick={() => updateHours(day, "off", !times.off)}
                className={`ml-2 px-2 py-1 text-sm rounded ${times.off ? "bg-red-200 text-red-700" : "bg-gray-200 text-gray-700"}`}
              >
                {times.off ? "Off" : "Set Off"}
              </button>
            </div>
          ))}
        </div>

        <div className="border p-3 rounded space-y-2">
          <h4 className="font-semibold text-bronze mb-2">Services</h4>
          {Array.from(new Set(servicesList.map((s) => s.category))).map((category) => (
            <div key={category} className="mb-3">
              <button type="button" onClick={() => toggleCategory(category)} className="font-semibold text-left w-full text-lg text-chrome">
                {expandedCategories.includes(category) ? "▼" : "►"} {category}
              </button>
              {expandedCategories.includes(category) && (
                <table className="w-full text-sm border">
                  <thead>
                    <tr>
                      <th className="text-left px-2 py-1">Select</th>
                      <th>Name</th>
                      <th>Price</th>
                      <th>Hrs</th>
                      <th>Mins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servicesList.filter((s) => s.category === category).map((service) => {
                      const selected = form.services.find((s) => s.name === service.name);
                      return (
                        <tr key={service.id} className="border-t">
                          <td><input type="checkbox" checked={!!selected} onChange={() => handleServiceToggle(service)} /></td>
                          <td>{service.name}</td>
                          <td><input type="number" value={selected?.price || ""} disabled={!selected} onChange={(e) => updateServiceValue(service.name, "price", parseFloat(e.target.value))} /></td>
                          <td><input type="number" value={selected?.duration?.hours || ""} disabled={!selected} onChange={(e) => updateServiceValue(service.name, "duration", { ...selected.duration, hours: parseInt(e.target.value || "0", 10) })} /></td>
                          <td><input type="number" value={selected?.duration?.minutes || ""} disabled={!selected} onChange={(e) => updateServiceValue(service.name, "duration", { ...selected.duration, minutes: parseInt(e.target.value || "0", 10) })} /></td>
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
              <ul className="mt-2 space-y-1 text-sm text-gray-700">
                {member.services?.map((s, i) => (
                  <li key={i} className="flex justify-between border-b py-1 last:border-b-0">
                    <span>{s.name}</span>
                    <span className="text-gray-600 whitespace-nowrap">
                      £{s.price} ({s.duration?.hours || 0}h {s.duration?.minutes || 0}m)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
