import React from "react";

export default function WeeklyHours({ weeklyHours, updateHours, toggleDayOff }) {
  return (
    <div className="border p-3 rounded text-bronze border-bronze">
      <h4 className="font-semibold text-left text-bronze mb-2">Weekly Hours</h4>
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
            onClick={() => toggleDayOff(day)}
            className={`ml-2 px-2 py-1 text-sm rounded ${
              times.off ? "bg-red-200 text-red-700" : "bg-gray-200 text-gray-700"
            }`}
          >
            {times.off ? "Off" : "Set Off"}
          </button>
        </div>
      ))}
    </div>
  );
}
