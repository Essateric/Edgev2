import React from "react";

export default function CustomTimeGutterHeader({ date }) {
  if (!date) return null;

  const minutes = date.getMinutes();
  const hours = date.getHours();
  
  const formattedHour = hours % 12 === 0 ? 12 : hours % 12;
  const ampm = hours < 12 ? "AM" : "PM";

  // Full hour: 9:00 AM, 10:00 AM, etc
  if (minutes === 0) {
    return (
      <div className="text-[0.85rem] font-bold text-[#9b611e] text-center">
        {formattedHour}:00 {ampm}
      </div>
    );
  }

  // 15min, 30min, 45min slots
  return (
    <div className="text-[0.65rem] text-[#9b611e] text-center">
      {formattedHour}:{minutes.toString().padStart(2, '0')} {ampm}
    </div>
  );
}
