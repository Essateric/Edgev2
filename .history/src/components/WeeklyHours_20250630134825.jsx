// WeeklyHoursInput.jsx
import React from "react";

const daysOrder = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function WeeklyHoursInput({ weeklyHours, setWeeklyHours }) {
  const handleHourChange = (day, field, value) => {
    setWeeklyHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  const handleToggleOff = (day) => {
    setWeeklyHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], off: !prev[day].off },
    }));
  };

  return (
    <div className="border-t border-bronze pt-4">
      <h4 className="font-semibold mb-2 text-bronze">Working Hours</h4>
      {daysOrder.map((day) => (
        <div key={day} className="flex items-center gap-2 mb-2 text-[15px]">
          <label className="w-20">{day}:</label>
          <input
            type="time"
            disabled={weeklyHours[day]?.off}
            value={weeklyHours[day]?.start || ""}
            onChange={(e) => handleHourChange(day, "start", e.target.value)}
            className="p-1 border rounded text-bronze border-bronze"
          />
          <span>to</span>
          <input
            type="time"
            disabled={weeklyHours[day]?.off}
            value={weeklyHours[day]?.end || ""}
            onChange={(e) => handleHourChange(day, "end", e.target.value)}
            className="p-1 border rounded text-bronze border-bronze"
          />
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={weeklyHours[day]?.off || false}
              onChange={() => handleToggleOff(day)}
            />
            Off
          </label>
        </div>
      ))}
    </div>
  );
}
