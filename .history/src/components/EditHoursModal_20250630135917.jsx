import React, { useState, useEffect } from "react";

export default function EditHoursModal({ staff, hours, setHours, onClose, onSave }) {
  const [localHours, setLocalHours] = useState(hours);

  useEffect(() => {
    setLocalHours(hours);
  }, [hours]);

  const handleHourChange = (day, field, value) => {
    setLocalHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  const setOff = (day) => {
    setLocalHours((prev) => ({
      ...prev,
      [day]: { start: "", end: "", off: true },
    }));
  };

  const setOn = (day) => {
    setLocalHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], off: false },
    }));
  };

  // On save, pass back the localHours to parent
  const handleSave = () => {
    setHours(localHours); // update parent's state
    onSave();             // call parent's save handler (API + refresh)
  };

  const days = Object.keys(localHours);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-[450px] p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold mb-4 text-bronze">
          Edit Weekly Hours for {staff.name}
        </h3>

        {days.map((day) => (
          <div key={day} className="flex items-center gap-3 mb-3 text-[15px]">
            <label className="w-24">{day}:</label>

            <input
              type="time"
              disabled={localHours[day].off}
              value={localHours[day].start || ""}
              onChange={(e) => handleHourChange(day, "start", e.target.value)}
              className="p-1 border rounded text-bronze border-bronze w-20"
            />

            <span>to</span>

            <input
              type="time"
              disabled={localHours[day].off}
              value={localHours[day].end || ""}
              onChange={(e) => handleHourChange(day, "end", e.target.value)}
              className="p-1 border rounded text-bronze border-bronze w-20"
            />

            {localHours[day].off ? (
              <button
                onClick={() => setOn(day)}
                className="bg-orange-300 text-orange-800 px-2 py-1 rounded text-sm"
              >
                Set On
              </button>
            ) : (
              <button
                onClick={() => setOff(day)}
                className="bg-red-200 text-red-700 px-2 py-1 rounded text-sm"
              >
                Set Off
              </button>
            )}
          </div>
        ))}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="bg-gray-300 px-4 py-2 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="bg-bronze text-white px-4 py-2 rounded"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
