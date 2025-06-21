import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const defaultWeeklyHours = {
  Monday: { start: '', end: '', off: false },
  Tuesday: { start: '', end: '', off: false },
  Wednesday: { start: '', end: '', off: false },
  Thursday: { start: '', end: '', off: false },
  Friday: { start: '', end: '', off: false },
  Saturday: { start: '', end: '', off: false },
  Sunday: { start: '', end: '', off: false },
};

export default function ManageStaff() {
  const [staffList, setStaffList] = useState([]);
  const [editingMember, setEditingMember] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    pin: '',
    role: '',
    weekly_hours: defaultWeeklyHours,
  });

  useEffect(() => {
    fetchStaff();
  }, []);

  async function fetchStaff() {
    const { data, error } = await supabase.from('staff').select('*');
    if (error) {
      console.error('Error fetching staff:', error);
    } else {
      setStaffList(data);
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function handleHoursChange(day, field, value) {
    setFormData((prev) => ({
      ...prev,
      weekly_hours: {
        ...prev.weekly_hours,
        [day]: {
          ...prev.weekly_hours[day],
          [field]: value,
        },
      },
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      name: formData.name,
      email: formData.email,
      pin: formData.pin,
      role: formData.role,
      weekly_hours: formData.weekly_hours,
    };

    console.log('Updating staff with payload:', payload);

    const { error } = await supabase
      .from('staff')
      .update(payload)
      .eq('id', editingMember.id);

    if (error) {
      console.error('Update error:', error);
    } else {
      setEditingMember(null);
      setFormData({
        name: '',
        email: '',
        pin: '',
        role: '',
        weekly_hours: defaultWeeklyHours,
      });
      fetchStaff();
    }
  }

  function handleEdit(member) {
    console.log('Editing member:', member);
    setEditingMember(member);
    setFormData({
      name: member.name,
      email: member.email,
      pin: member.pin,
      role: member.role,
      weekly_hours: member.weekly_hours || defaultWeeklyHours,
    });
  }

  function handleDelete(id) {
    if (confirm("Are you sure you want to delete this staff member?")) {
      supabase.from("staff").delete().eq("id", id).then(() => fetchData());
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-chrome mb-4">Staff Management</h2>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-4 rounded shadow">
        <input
          name="name"
          value={form.name || ''}
          onChange={handleChange}
          placeholder="Name"
          className="w-full text-left p-2 text-bronze border-bronze" 
        />
        <input
          name="email"
          value={form.email || ''}
          onChange={handleChange}
          placeholder="Email"
          className="w-full text-left p-2 text-bronze border-bronze"
        />

        <div className="border p-3 rounded text-bronze border-bronze">
          <h4 className="font-semibold text-left mb-2">Weekly Hours</h4>
          {Object.entries(form.weeklyHours).map(([day, times]) => {
            console.log(`Rendering ${day}:`, times);
            return (
              <div key={day} className="flex items-center mb-2 gap-2">
                <label className="w-24 capitalize">{day}:</label>
                <input
                  type="time"
                  value={typeof times.start === "string" ? times.start : "" || ''}
                  disabled={times.off}
                  onChange={(e) => updateHours(day, "start", e.target.value)}
                  className="border p-1 text-bronze border-bronze"
                />
                <span>to</span>
                <input
                  type="time"
                  value={typeof times.end === "string" ? times.end : "" || ''}
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
            );
          })}
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
