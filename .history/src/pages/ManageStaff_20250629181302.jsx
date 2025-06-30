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
  const [expandedCategories, setExpandedCategories] = useState({});
  const [showHoursModal, setShowHoursModal] = useState(false);
  const [modalHours, setModalHours] = useState(defaultWeeklyHours);
  const [modalStaff, setModalStaff] = useState(null);

  const [editServicesStaff, setEditServicesStaff] = useState(null);
  const [editServicesModalOpen, setEditServicesModalOpen] = useState(false);
  const [staffServices, setStaffServices] = useState([]);
  const [serviceCategoryCollapse, setServiceCategoryCollapse] = useState({});

  const [form, setForm] = useState({
    name: "",
    email: "",
    permission: "Staff",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const normaliseWeeklyHours = (input) => {
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
  };

  const fetchData = async () => {
    const { data: staffData } = await supabase.from("staff").select("*");
    setStaff(
      (staffData || []).map((doc) => ({
        ...doc,
        weekly_hours: normaliseWeeklyHours(doc.weekly_hours),
      }))
    );

    const { data: servicesData } = await supabase
      .from("services")
      .select("id, name, category");
    setServicesList(servicesData || []);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value || "" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { name, email, permission } = form;

    if (!name) {
      alert("Name is required.");
      return;
    }

    const payload = {
      name,
      email: email || null,
      permission: permission || "Staff",
      weekly_hours: defaultWeeklyHours,
    };

    try {
      if (editingId) {
        const { error } = await supabase
          .from("staff")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        let authId = null;
        if (email) {
          const { data, error: authError } =
            await supabase.auth.admin.createUser({
              email,
              email_confirm: true,
            });

          if (authError) {
            console.error("Auth Error:", authError.message);
            alert(authError.message);
            return;
          }

          authId = data.user.id;
        }

        const { error } = await supabase.from("staff").insert({
          ...payload,
          auth_id: authId,
        });

        if (error) throw error;
      }

      setForm({ name: "", email: "", permission: "Staff" });
      setEditingId(null);
      fetchData();
    } catch (err) {
      console.error("Submit Error:", err.message);
      alert(err.message);
    }
  };

  const handleEdit = (member) => {
    setForm({
      name: member.name || "",
      email: member.email || "",
      permission: member.permission || "Staff",
    });
    setEditingId(member.id);
  };

  const handleDelete = async (id) => {
    if (confirm("Are you sure you want to delete this staff member?")) {
      const { error } = await supabase.from("staff").delete().eq("id", id);
      if (error) {
        alert("Delete failed: " + error.message);
      } else {
        fetchData();
      }
    }
  };

  const openHoursModal = (member) => {
    setModalStaff(member);
    setModalHours(normaliseWeeklyHours(member.weekly_hours));
    setShowHoursModal(true);
  };

  const updateModalHours = (day, field, value) => {
    setModalHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
      },
    }));
  };

  const saveModalHours = async () => {
    await supabase
      .from("staff")
      .update({ weekly_hours: modalHours })
      .eq("id", modalStaff.id);
    setShowHoursModal(false);
    fetchData();
  };

  const openEditServicesModal = async (staffMember) => {
    setEditServicesStaff(staffMember);
    setEditServicesModalOpen(true);
    const { data: staffServ } = await supabase
      .from("staff_services")
      .select("*")
      .eq("staff_id", staffMember.id);
    setStaffServices(staffServ || []);
    setServiceCategoryCollapse({});
  };

  const closeEditServicesModal = () => {
    setEditServicesModalOpen(false);
    setEditServicesStaff(null);
    setStaffServices([]);
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
            { staff_id: editServicesStaff.id, service_id: serviceId, [field]: value },
          ]
    );
  };

  const saveStaffServices = async () => {
    const toUpsert = staffServices
      .filter((s) => s.price && s.duration)
      .map((s) => ({
        ...s,
        staff_id: editServicesStaff.id,
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
      alert("Save failed: " + error.message);
    } else {
      closeEditServicesModal();
    }
  };

  const categories = Array.from(new Set(servicesList.map((s) => s.category)));

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-chrome mb-4">Staff Management</h2>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="space-y-4 bg-white p-4 rounded shadow"
      >
        <input
          name="name"
          value={form.name}
          onChange={handleChange}
          placeholder="Name"
          className="w-full p-2 text-bronze border border-bronze rounded"
          required
        />
        <input
          name="email"
          value={form.email}
          onChange={handleChange}
          placeholder="Email (optional)"
          className="w-full p-2 text-bronze border border-bronze rounded"
        />
        <select
          name="permission"
          value={form.permission}
          onChange={handleChange}
          className="w-full p-2 text-bronze border border-bronze rounded"
        >
          <option value="Senior">Senior Stylist</option>
          <option value="Mid">Stylist</option>
          <option value="Junior">Junior Stylist</option>
          <option value="Staff">Staff</option>
        </select>
        <button className="bg-bronze text-white px-4 py-2 rounded">
          {editingId ? "Update Staff" : "Add Staff"}
        </button>
      </form>

      {/* Staff Cards */}
      <div className="mt-6">
        <h3 className="text-lg font-bold text-chrome mb-4">Current Staff</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {staff.map((member) => (
            <div
              key={member.id}
              className="bg-white rounded-2xl shadow-md p-4 border border-gray-200"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="text-lg font-semibold text-gray-800">
                    {member.name}
                  </h4>
                  <p className="text-sm text-gray-500">{member.email}</p>
                  <p className="text-xs text-gray-400">
                    Role: {member.permission}
                  </p>
                </div>
                <div className="text-sm space-x-4">
                  <button
                    onClick={() => handleEdit(member)}
                    className="text-blue-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => openHoursModal(member)}
                    className="text-orange-500 hover:underline"
                  >
                    View Hours
                  </button>
                  <button
                    onClick={() => openEditServicesModal(member)}
                    className="text-bronze font-semibold hover:underline"
                  >
                    Edit Services
                  </button>
                  <button
                    onClick={() => handleDelete(member.id)}
                    className="text-red-500 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>


      {/* Modal: Edit Services */}
      {editServicesModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8">
            <h3 className="text-xl font-bold mb-4">
              Edit Services for {editServicesStaff?.name}
            </h3>
            {categories.map(cat => (
              <div key={cat} className="mb-4">
                <button
                  onClick={() =>
                    setServiceCategoryCollapse(prev => ({
                      ...prev,
                      [cat]: !prev[cat],
                    }))
                  }
                  className="w-full text-left text-lg font-semibold text-bronze mb-2"
                >
                  {serviceCategoryCollapse[cat] ? "▼" : "▶"} {cat}
                </button>
                {!serviceCategoryCollapse[cat] && (
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
                      {servicesList.filter(s => s.category === cat).map(service => {
                        const sServ = getStaffService(service.id);
                        const mins = sServ.duration ? Number(sServ.duration) % 60 : "";
                        const hrs = sServ.duration ? Math.floor(Number(sServ.duration) / 60) : "";
                        return (
                          <tr key={service.id}>
                            <td className="px-2">{service.name}</td>
                            <td>
                              <input
                                className="w-20 border px-2 py-1 rounded"
                                type="number"
                                value={sServ.price || ""}
                                onChange={e =>
                                  handleServiceChange(service.id, "price", e.target.value)
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
                                onChange={e => {
                                  const hours = Number(e.target.value) || 0;
                                  const minutes = mins ? Number(mins) : 0;
                                  const total = hours * 60 + minutes;
                                  handleServiceChange(service.id, "duration", total);
                                }}
                                min="0"
                              />
                            </td>
                            <td>
                              <input
                                className="w-14 border px-2 py-1 rounded"
                                type="number"
                                value={mins}
                                onChange={e => {
                                  const minutes = Number(e.target.value) || 0;
                                  const hours = hrs ? Number(hrs) : 0;
                                  const total = hours * 60 + minutes;
                                  handleServiceChange(service.id, "duration", total);
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
                onClick={closeEditServicesModal}
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
      )}
    </div>
  );
}
