import React from "react";

export default function ServiceSelector({ servicesList, selectedServices, onToggle, onUpdate }) {
  const isSelected = (name) => selectedServices.find((s) => s.name === name);

  return (
    <div className="border p-3 rounded space-y-2">
      <h4 className="font-semibold text-bronze mb-2">Services</h4>
      {Array.from(new Set(servicesList.map((s) => s.category))).map((category) => (
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
                .filter((s) => s.category === category)
                .map((service) => {
                  const selected = isSelected(service.name);
                  return (
                    <tr key={service.id} className="border-t">
                      <td>
                        <input
                          type="checkbox"
                          checked={!!selected}
                          onChange={() => onToggle(service)}
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
                            onUpdate(service.name, "price", parseFloat(e.target.value))
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
                            onUpdate(service.name, "duration", {
                              ...selected?.duration,
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
                            onUpdate(service.name, "duration", {
                              ...selected?.duration,
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
  );
}
