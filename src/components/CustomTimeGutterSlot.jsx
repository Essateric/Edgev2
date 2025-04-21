import React from "react";

export default function CustomTimeGutterSlot({ date }) {
  if (!date) return null;

  const minutes = date.getMinutes();
  const hours = date.getHours();
  const formattedHour = hours % 12 === 0 ? 12 : hours % 12;
  const ampm = hours < 12 ? "AM" : "PM";

  // Full hour like 9:00 AM
  if (minutes === 0) {
    return (
      <div className="text-[0.85rem] font-bold text-[#9b611e] text-center leading-[32px]">
        {formattedHour}:00 {ampm}
      </div>
    );
  }

  // 15, 30, 45 minute marks
  return (
    <div className="text-[0.65rem] text-[#9b611e] text-center leading-[32px]">
      {formattedHour}:{minutes.toString().padStart(2, "0")} {ampm}
    </div>
  );
}
