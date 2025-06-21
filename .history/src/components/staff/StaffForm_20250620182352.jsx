import React from "react";

export default function StaffForm({ form, setForm, servicesList, editingId, onSubmit }) {
  const defaultWeeklyHours = {
    monday: { start: "", end: "", off: false },
    tuesday: { start: "", end: "", off: false },
    wednesday: { start: "", end: "", off: false },
    thursday: { start: "", end: "", off: false },
    friday: { start: "", end: "", off: false },
    saturday: { start: "", end: "", off: false },
    sunday: { start: "", end: "", off: false },
  };

  const weeklyHours = form.weeklyHours ?? defaultWeeklyHours;

  const updateHours = (day, field, value) => {
    setForm((prev) => ({
      ...prev,
      weeklyHours: {
        ...(prev.weeklyHours ?? defaultWeeklyHours),
        [day]: {
          ...((prev.weeklyHours ?? defaultWeeklyHours)[day]),
          [field]: value,
        },
      },
    }));
  };

  const handleServiceToggle = (service) => {
    const exists = form.services.find((s) => s.name === service.name);
    if (exists) {
      setForm({
        ...form,
        services: form.services.filter((s) => s.name !== service.name),
      });
    } else {
      setForm({
        ...form,
        services: [
          ...form.services,
          { ...service, price: 0, duration: { hours: 0, minutes: 0 } },
        ],
      });
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

  return (
    <form onSubmit={onSubmit} className="space-y-4 bg-white p-4 rounded shadow">
      <input
        name="name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="Name"
        className="w-full p-2 border text-bronze"
      />
      <input
        name="email"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        placeholder="Email"
        className="w-full p-2 border text-bronze"
      />

      {/* Weekly Hours */}
      <div className="border p-3 rounded text-bronze border-bronze">
        <h4 className="font-semibold mb-2">Weekly Hours</h4>
        {Object.entries(weeklyHours).map(([day, times]) => (
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
                updateHours(day, "off", !times.off)
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

      {/* Services Table */}
      <div className="border p-3 rounded space-y-2">
        <h4 className="font-semibold text-bronze mb-2">Services</h4>
        {Array.from(new Set(servicesList.map((s) => s.category))).map((category) => (
          <div key={category} className="mb-3">
            <h5 className="font-semibold text-gray-950 mb-1">{category}</h5>
            <table className="w-full text-sm border">
              <thead>
                <tr>
                  <th className="text-left px-2 py-1">Select</th>
                  <th className="text-left">Name</th>
                  <th className="text-left">Price (£)</th>
                  <th className="text-left">Hrs</th>
                  <th className="text-left">Min</th>
                </tr>
              </thead>
              <tbody>
                {servicesList
                  .filter((s) => s.category === category)
                  .map((service) => {
                    const selected = form.services.find((s) => s.name === service.name);
                    return (
                      <tr key={service.id} className="border-t">
                        <td>
                          <input
                            type="checkbox"
                            checked={!!selected}
                            onChange={() => handleServiceToggle(service)}
                          />
                        </td>
                        <td className="px-2">{service.name}</td>
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
                                ...selected.duration,
                                hours: parseInt(e.target.value || "0"),
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
                                ...selected.duration,
                                minutes: parseInt(e.target.value || "0"),
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
          </div>
        ))}
      </div>

      <button className="bg-bronze text-white px-4 py-2 rounded">
        {editingId ? "Update Staff" : "Add Staff"}
      </button>
    </form>
  );
}
