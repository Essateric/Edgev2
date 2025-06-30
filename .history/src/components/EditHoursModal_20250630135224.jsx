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

  const handleToggleOff = (day) => {
    setLocalHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], off: !prev[day].off },
    }));
  };

  const handleSave = () => {
    setHours(localHours);
    onSave();
  };

  const days = Object.keys(localHours);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-[500px] p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold mb-4 text-bronze">Edit Hours for {staff.name}</h3>

        {days.map((day) => (
          <div key={day} className="flex items-center gap-2 mb-3 text-[15px]">
            <label className="w-20">{day}:</label>
            <input
              type="time"
              disabled={localHours[day].off}
              value={localHours[day].start}
              onChange={(e) => handleHourChange(day, "start", e.target.value)}
              className="p-1 border rounded text-bronze border-bronze"
            />
            <span>to</span>
            <input
              type="time"
              disabled={localHours[day].off}
              value={localHours[day].end}
              onChange={(e) => handleHourChange(day, "end", e.target.value)}
              className="p-1 border rounded text-bronze border-bronze"
            />
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={localHours[day].off}
                onChange={() => handleToggleOff(day)}
              />
              Off
            </label>
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
            Save Hours
          </button>
        </div>
      </div>
    </div>
  );
}
