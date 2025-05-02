import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function ManageStaff() {
  const [staff, setStaff] = useState([]);
  const [servicesList, setServicesList] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    services: [],
    weeklyHours: {
      Monday: { start: "", end: "", off: false },
      Tuesday: { start: "", end: "", off: false },
      Wednesday: { start: "", end: "", off: false },
      Thursday: { start: "", end: "", off: false },
      Friday: { start: "", end: "", off: false },
      Saturday: { start: "", end: "", off: false },
      Sunday: { start: "", end: "", off: false },
    },
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data: staffData, error: staffError } = await supabase.from("staff").select("*");
    if (staffError) {
      console.error("Error fetching staff:", staffError.message);
      return;
    }
    setStaff(staffData.map(doc => ({ id: doc.id, ...doc })));

    const { data: servicesData, error: servicesError } = await supabase.from("services").select("id, name, category");
    if (servicesError) {
      console.error("Error fetching services:", servicesError.message);
      return;
    }
    setServicesList(servicesData.map(doc => ({
      id: doc.id,
      name: doc.name,
      category: doc.category,
    })));
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
        services: [...form.services, {
          ...service,
          price: 0,
          duration: { hours: 0, minutes: 0 },
        }],
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
    const hasInvalidServices = form.services.some(s =>
      !s.price || !s.duration || (s.duration.hours === 0 && s.duration.minutes === 0)
    );
    if (hasInvalidServices) {
      alert("Please add both price and duration (hours/minutes) for selected services.");
      return;
    }

    if (editingId) {
      await supabase.from("staff")
  .update({
    name: form.name,
    email: form.email,
    services: form.services,
    weekly_hours: form.weeklyHours,
  })
  .eq("id", editingId);

    } else {
      await supabase.from("staff").insert([
        {
          name: form.name,
          email: form.email,
          services: form.services,
          weekly_hours: form.weeklyHours, // matches your state structure
        }
      ]);
      
    }

    setForm({
      name: "", email: "", services: [], weeklyHours: {
        Monday: { start: "", end: "", off: false },
        Tuesday: { start: "", end: "", off: false },
        Wednesday: { start: "", end: "", off: false },
        Thursday: { start: "", end: "", off: false },
        Friday: { start: "", end: "", off: false },
        Saturday: { start: "", end: "", off: false },
        Sunday: { start: "", end: "", off: false },
      }
    });
    setEditingId(null);
    fetchData();
  }

  async function handleDelete(id) {
    await deleteDoc(doc(db, "staff", id));
    fetchData();
  }

  function handleEdit(member) {
    setForm(member);
    setEditingId(member.id);
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-chrome mb-4">Staff Management</h2>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-4 rounded shadow">
        <input
          name="name"
          value={form.name}
          onChange={handleChange}
          placeholder="Name"
          className="w-full text-left p-2 text-bronze border-bronze"
        />
        <input
          name="email"
          value={form.email}
          onChange={handleChange}
          placeholder="Email"
          className="w-full text-left p-2  text-bronze border-bronze"
        />

        <div className="border p-3 rounded  text-bronze border-bronze">
          <h4 className="font-semibold text-left text-bronze mb-2">Weekly Hours</h4>
          {Object.entries(form.weeklyHours).map(([day, times]) => (
            <div key={day} className="flex items-center mb-2 gap-2">
              <label className="w-24 capitalize">{day}:</label>
              <input
                type="time"
                value={times.start}
                disabled={times.off}
                onChange={(e) => updateHours(day, "start", e.target.value)}
                className="border p-1 text-bronze border-bronze"
              />
              <span>to</span>
              <input
                type="time"
                value={times.end}
                disabled={times.off}
                onChange={(e) => updateHours(day, "end", e.target.value)}
                className="border p-1 text-bronze border-bronze"
              />
              <button
                type="button"
                onClick={() =>
                  setForm(prev => ({
                    ...prev,
                    weeklyHours: {
                      ...prev.weeklyHours,
                      [day]: {
                        ...prev.weeklyHours[day],
                        off: !prev.weeklyHours[day].off,
                        start: "",
                        end: "",
                      },
                    },
                  }))
                }
                className={`ml-2 px-2 py-1 text-sm rounded ${
                  times.off ? "bg-red-200 text-red-700" : "bg-gray-200 text-gray-700"
                }`}
              >
                {times.off ? "Off" : "Set Off"}
              </button>
            </div>
          ))}
        </div>

        <div className="border p-3 rounded space-y-2">
          <h4 className="font-semibold text-bronze mb-2">Services</h4>
          {Array.from(new Set(servicesList.map(s => s.category))).map(category => (
            <div key={category} className="mb-3">
              <h5 className="font-semibold text-gray-950 mb-1">{category}</h5>
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
              <span className="text-gray-600 whitespace-nowrap">£{s.price} ({s.duration?.hours || 0}h {s.duration?.minutes || 0}m)</span>
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
