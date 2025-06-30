import React from "react";

const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function EditHoursModal({
  staff,
  hours,
  setHours,
  onClose,
  onSave,
}) {
  const handleChange = (day, field, value) => {
    setHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
      },
    }));
  };

  const toggleOff = (day) => {
    setHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        off: !prev[day].off,
        start: "",
        end: "",
      },
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-[400px] max-h-[80vh] overflow-y-auto">
        <h3 className="text-xl font-bold mb-4">
          Edit Weekly Hours for {staff?.name}
        </h3>
        {days.map((day) => (
          <div key={day} className="flex items-center mb-2 gap-2">
            <label className="w-24 capitalize">{day}:</label>
            <input
              type="time"
              value={hours[day]?.start}
              disabled={hours[day]?.off}
              onChange={(e) => handleChange(day, "start", e.target.value)}
              className="border p-1 text-bronze border-bronze"
            />
            <span>to</span>
            <input
              type="time"
              value={hours[day]?.end}
              disabled={hours[day]?.off}
              onChange={(e) => handleChange(day, "end", e.target.value)}
              className="border p-1 text-bronze border-bronze"
            />
            <button
              type="button"
              onClick={() => toggleOff(day)}
              className={`ml-2 px-2 py-1 text-sm rounded ${
                hours[day]?.off
                  ? "bg-red-200 text-red-700"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              {hours[day]?.off ? "Off" : "Set Off"}
            </button>
          </div>
        ))}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="bg-gray-300 px-4 py-2 rounded"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="bg-bronze text-white px-4 py-2 rounded"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
