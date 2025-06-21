// ManageStaff.jsx - Staff cards now support per-staff service editing

import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const defaultWeeklyHours = {
  Monday: { start: "", end: "", off: false },
  Tuesday: { start: "", end: "", off: false },
  Wednesday: { start: "", end: "", off: false },
  Thursday: { start: "", end: "", off: false },
  Friday: { start: "", end: "", off: false },
  Saturday: { start: "", end: "", off: false },
  Sunday: { start: "", end: "", off: false },
};

export default function ManageStaff() {
  const [staff, setStaff] = useState([]);
  const [servicesList, setServicesList] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [showHoursModal, setShowHoursModal] = useState(false);
  const [modalHours, setModalHours] = useState(defaultWeeklyHours);
  const [modalStaff, setModalStaff] = useState(null);
  const [editingServicesFor, setEditingServicesFor] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", services: [] });

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
    if (staffError) return console.error("Error fetching staff:", staffError.message);
    setStaff(staffData.map(doc => ({ ...doc, weekly_hours: normaliseWeeklyHours(doc.weekly_hours) })));

    const { data: servicesData, error: servicesError } = await supabase.from("services").select("id, name, category");
    if (servicesError) return console.error("Error fetching services:", servicesError.message);
    setServicesList(servicesData);
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value || "" });
  }

  function handleSubmit(e) {
    e.preventDefault();
    const payload = { name: form.name, email: form.email };
    (async () => {
      try {
        if (editingId) {
          const { error } = await supabase.from("staff").update(payload).eq("id", editingId);
          if (error) console.error("Update error:", error);
        } else {
          const { error } = await supabase.from("staff").insert([payload]);
          if (error) console.error("Insert error:", error);
        }
        setForm({ name: "", email: "", services: [] });
        setEditingId(null);
        fetchData();
      } catch (err) {
        console.error("Submit failed:", err);
      }
    })();
  }

  function handleEdit(member) {
    setForm({ name: member.name || "", email: member.email || "", services: [] });
    setEditingId(member.id);
  }

  function openHoursModal(member) {
    setModalStaff(member);
    setModalHours(normaliseWeeklyHours(member.weekly_hours));
    setShowHoursModal(true);
  }

  function updateModalHours(day, field, value) {
    setModalHours(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
      },
    }));
  }

  async function saveModalHours() {
    const { error } = await supabase.from("staff").update({ weekly_hours: modalHours }).eq("id", modalStaff.id);
    if (!error) {
      setShowHoursModal(false);
      fetchData();
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-chrome mb-4">Staff Management</h2>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-4 rounded shadow">
        <input name="name" value={form.name} onChange={handleChange} placeholder="Name" className="w-full text-left p-2 text-bronze border-bronze" />
        <input name="email" value={form.email} onChange={handleChange} placeholder="Email" className="w-full text-left p-2 text-bronze border-bronze" />
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
                  <button onClick={() => openHoursModal(member)} className="text-orange-500 hover:underline">View Hours</button>
                  <button onClick={() => setEditingServicesFor(member.id)} className="text-bronze hover:underline">Edit Services</button>
                </div>
              </div>
              {editingServicesFor === member.id && (
                <div className="border p-3 rounded space-y-2">
                  <h4 className="font-semibold text-bronze mb-2">Services</h4>
                  {Array.from(new Set(servicesList.map(s => s.category))).map(category => (
                    <details key={category} className="mb-2">
                      <summary className="cursor-pointer font-semibold text-orange-700">{category}</summary>
                      <table className="w-full text-sm border mt-2">
                        <thead>
                          <tr>
                            <th className="text-left px-2">Name</th>
                          </tr>
                        </thead>
                        <tbody>
                          {servicesList.filter(s => s.category === category).map(service => (
                            <tr key={service.id} className="border-t">
                              <td className="px-2 text-bronze">{service.name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {showHoursModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-[400px] max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Edit Weekly Hours for {modalStaff?.name}</h3>
            {Object.entries(modalHours).map(([day, config]) => (
              <div key={day} className="flex items-center mb-2 gap-2">
                <label className="w-24 capitalize">{day}:</label>
                <input type="time" value={config.start} disabled={config.off} onChange={e => updateModalHours(day, "start", e.target.value)} className="border p-1 text-bronze border-bronze" />
                <span>to</span>
                <input type="time" value={config.end} disabled={config.off} onChange={e => updateModalHours(day, "end", e.target.value)} className="border p-1 text-bronze border-bronze" />
                <button type="button" onClick={() => setModalHours(prev => ({ ...prev, [day]: { ...prev[day], off: !prev[day].off, start: "", end: "" } }))} className={`ml-2 px-2 py-1 text-sm rounded ${config.off ? "bg-red-200 text-red-700" : "bg-gray-200 text-gray-700"}`}>{config.off ? "Off" : "Set Off"}</button>
              </div>
            ))}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowHoursModal(false)} className="bg-gray-300 px-4 py-2 rounded">Cancel</button>
              <button onClick={saveModalHours} className="bg-bronze text-white px-4 py-2 rounded">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
