import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import EditHoursModal from "../components/EditHoursModal";
import EditServicesModal from "../components/EditServicesModal";

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
  const [modalStaff, setModalStaff] = useState(null);
  const [modalHours, setModalHours] = useState(defaultWeeklyHours);

  const [editServicesModalOpen, setEditServicesModalOpen] = useState(false);
  const [editServicesStaff, setEditServicesStaff] = useState(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    permission: "Staff",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const normaliseWeeklyHours = (input) =>
    Object.fromEntries(
      Object.entries(defaultWeeklyHours).map(([day]) => {
        const dayData = input?.[day] || {};
        return [
          day,
          {
            start: dayData.start || "",
            end: dayData.end || "",
            off: !!dayData.off,
          },
        ];
      })
    );

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
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { name, email, permission } = form;
    if (!name) {
      alert("Name is required");
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
        await supabase.from("staff").update(payload).eq("id", editingId);
      } else {
        let authId = null;
        if (email) {
          const { data, error: authError } =
            await supabase.auth.admin.createUser({
              email,
              email_confirm: true,
            });
          if (authError) {
            alert(authError.message);
            return;
          }
          authId = data.user.id;
        }
        await supabase
          .from("staff")
          .insert({ ...payload, auth_id: authId });
      }
      setForm({ name: "", email: "", permission: "Staff" });
      setEditingId(null);
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEdit = (member) => {
    setForm({
      name: member.name,
      email: member.email || "",
      permission: member.permission || "Staff",
    });
    setEditingId(member.id);
  };

  const openHoursModal = (member) => {
    setModalStaff(member);
    setModalHours(normaliseWeeklyHours(member.weekly_hours));
    setShowHoursModal(true);
  };

  const openEditServicesModal = (member) => {
    setEditServicesStaff(member);
    setEditServicesModalOpen(true);
  };

  const categories = Array.from(
    new Set(servicesList.map((s) => s.category))
  );

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-chrome mb-4">
        Staff Management
      </h2>

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
          className="w-full p-2 border border-bronze"
        />
        <input
          name="email"
          value={form.email}
          onChange={handleChange}
          placeholder="Email"
          className="w-full p-2 border border-bronze"
        />
        <select
          name="permission"
          value={form.permission}
          onChange={handleChange}
          className="w-full p-2 border border-bronze"
        >
          <option value="Senior">Senior Stylist</option>
          <option value="Mid">Stylist</option>
          <option value="Junior">Junior Stylist</option>
        </select>

        <button className="bg-bronze text-white px-4 py-2 rounded">
          {editingId ? "Update Staff" : "Add Staff"}
        </button>
      </form>

      {/* Staff Cards */}
      <div className="mt-6">
        <h3 className="text-lg font-bold text-chrome mb-4">
          Current Staff
        </h3>
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
                  <p className="text-sm text-bronze">
                    {member.permission}
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
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      {showHoursModal && (
        <EditHoursModal
          staff={modalStaff}
          hours={modalHours}
          setHours={setModalHours}
          onClose={() => setShowHoursModal(false)}
          onSave={async () => {
            await supabase
              .from("staff")
              .update({ weekly_hours: modalHours })
              .eq("id", modalStaff.id);
            setShowHoursModal(false);
            fetchData();
          }}
        />
      )}

      {editServicesModalOpen && (
        <EditServicesModal
          staff={editServicesStaff}
          servicesList={servicesList}
          onClose={() => setEditServicesModalOpen(false)}
        />
      )}
    </div>
  );
}
