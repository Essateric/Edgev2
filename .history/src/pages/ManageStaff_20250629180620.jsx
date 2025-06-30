import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";
import toast from "react-hot-toast";

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
  const [staffList, setStaffList] = useState([]);
  const [servicesList, setServicesList] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [showHoursModal, setShowHoursModal] = useState(false);
  const [modalHours, setModalHours] = useState(defaultWeeklyHours);
  const [modalStaff, setModalStaff] = useState(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    pin: "",
    permission: "Staff",
    weeklyHours: defaultWeeklyHours,
    services: [],
  });

  useEffect(() => {
    fetchData();
  }, []);

  function normalizeWeeklyHours(input) {
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
    const { data: servicesData } = await supabase
      .from("services")
      .select("id, name, category");

    setStaffList(
      staffData.map((s) => ({
        ...s,
        weeklyHours: normalizeWeeklyHours(s.weekly_hours),
      }))
    );
    setServicesList(servicesData);
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const toggleDayOff = (day) => {
    setForm((prev) => ({
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
    }));
  };

  const updateHours = (day, field, value) => {
    setForm((prev) => ({
      ...prev,
      weeklyHours: {
        ...prev.weeklyHours,
        [day]: {
          ...prev.weeklyHours[day],
          [field]: value,
        },
      },
    }));
  };

  const toggleCategory = (category) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const handleServiceToggle = (service) => {
    const exists = form.services.find((s) => s.name === service.name);
    if (exists) {
      setForm((prev) => ({
        ...prev,
        services: prev.services.filter((s) => s.name !== service.name),
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        services: [
          ...prev.services,
          { name: service.name, price: 0, duration: { hours: 0, minutes: 0 } },
        ],
      }));
    }
  };

  const updateServiceValue = (serviceName, field, value) => {
    setForm((prev) => ({
      ...prev,
      services: prev.services.map((s) => {
        if (s.name !== serviceName) return s;
        if (field === "price") return { ...s, price: value };
        if (field === "duration") return { ...s, duration: value };
        return s;
      }),
    }));
  };

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.name) {
      toast.error("Name is required");
      return;
    }
    if (!editingId && form.pin.length !== 4) {
      toast.error("PIN must be 4 digits");
      return;
    }

    const payload = {
      name: form.name,
      email: form.email,
      pin: form.pin,
      permission: form.permission,
      weekly_hours: form.weeklyHours,
      services: form.services,
    };

    try {
      toast.loading(editingId ? "Updating staff..." : "Adding staff...");

      const res = await fetch(
        "https://YOUR_PROJECT.functions.supabase.co/addnewstaff",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_FUNCTION_SECRET}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const result = await res.json();
      toast.dismiss();

      if (!res.ok) {
        toast.error(result.error || "Error saving staff");
        return;
      }

      toast.success(editingId ? "Staff updated!" : "Staff added!");
      setForm({
        name: "",
        email: "",
        pin: "",
        permission: "Staff",
        weeklyHours: defaultWeeklyHours,
        services: [],
      });
      setEditingId(null);
      fetchData();
    } catch (err) {
      toast.dismiss();
      toast.error(err.message || "Unexpected error");
    }
  }

  const handleEdit = (member) => {
    setForm({
      name: member.name,
      email: member.email,
      pin: "",
      permission: member.permission,
      weeklyHours: normalizeWeeklyHours(member.weekly_hours),
      services: member.services || [],
    });
    setEditingId(member.id);
  };

  const handleDelete = async (id) => {
    const confirmed = confirm("Are you sure you want to delete this staff?");
    if (!confirmed) return;

    await supabase.from("staff").delete().eq("id", id);
    fetchData();
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-bronze mb-4">Staff Management</h2>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-4 rounded shadow">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Name"
            className="w-full p-2 border text-bronze border-bronze"
          />
          <input
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="Email (optional)"
            className="w-full p-2 border text-bronze border-bronze"
          />
          <input
            name="pin"
            value={form.pin}
            onChange={handleChange}
            placeholder="4-digit PIN"
            maxLength={4}
            className="w-full p-2 border text-bronze border-bronze"
          />
          <select
            name="permission"
            value={form.permission}
            onChange={handleChange}
            className="w-full p-2 border text-bronze border-bronze"
          >
            <option value="Staff">Staff</option>
            <option value="Manager">Manager</option>
            <option value="Admin">Admin</option>
          </select>
        </div>

        <div className="border p-3 rounded space-y-2">
          <h4 className="font-semibold text-bronze mb-2">Services</h4>
          {Array.from(new Set(servicesList.map((s) => s.category))).map((category) => (
            <div key={category}>
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="text-left w-full text-orange-500 font-semibold"
              >
                {expandedCategories[category] ? "▼" : "▶"} {category}
              </button>
              {expandedCategories[category] && (
                <table className="w-full text-sm border">
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Name</th>
                      <th>£</th>
                      <th>Hrs</th>
                      <th>Min</th>
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
                                className="w-16 border p-1"
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
                                    ...selected?.duration,
                                    hours: parseInt(e.target.value || "0", 10),
                                  })
                                }
                                className="w-16 border p-1"
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
                                    ...selected?.duration,
                                    minutes: parseInt(e.target.value || "0", 10),
                                  })
                                }
                                className="w-16 border p-1"
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

        <button className="bg-bronze text-white px-4 py-2 rounded">
          {editingId ? "Update Staff" : "Add Staff"}
        </button>
      </form>

      {/* Staff List */}
      <div className="mt-6">
        <h3 className="text-lg font-bold text-bronze mb-4">Current Staff</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {staffList.map((member) => (
            <div key={member.id} className="bg-white rounded-2xl shadow-md p-4 border border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-lg font-semibold text-gray-800">{member.name}</h4>
                  <p className="text-sm text-gray-500">{member.email}</p>
                  <p className="text-sm">Role: {member.permission}</p>
                </div>
                <div className="space-x-3">
                  <button onClick={() => handleEdit(member)} className="text-blue-600 hover:underline">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(member.id)} className="text-red-500 hover:underline">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
