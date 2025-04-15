import React from "react";

export default function CustomTimeGutterSlot({ value }) {
  if (!value) return null;

  const minutes = value.getMinutes();
  const hours = value.getHours();
  const formattedHour = hours % 12 === 0 ? 12 : hours % 12;
  const ampm = hours < 12 ? "AM" : "PM";

  if (minutes === 0) {
    return (
      <div className="text-[0.85rem] font-bold text-[#9b611e] text-center leading-[32px]">
        {formattedHour}:00 {ampm}
      </div>
    );
  }

  return (
    <div className="text-[0.65rem] text-gray-400 text-center leading-[32px]">
      :{minutes.toString().padStart(2, "0")}
    </div>
  );
}
