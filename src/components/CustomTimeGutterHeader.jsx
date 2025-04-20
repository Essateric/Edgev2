// src/components/CustomTimeGutterHeader.jsx
import React from "react";

export default function CustomTimeGutterHeader({ date }) {
  if (!date) return null;
  console.log("Gutter slot time:", date);

  const minutes = date.getMinutes();
  const hours = date.getHours();

  const formattedHour = hours % 12 === 0 ? 12 : hours % 12;
  const ampm = hours < 12 ? "AM" : "PM";

  return (
    <div
      className={`text-center ${
        minutes === 0
          ? "text-[0.85rem] font-bold text-[#9b611e]"
          : "text-[0.65rem] text-[#9b611e]"
      }`}
    >
      {formattedHour}:{minutes.toString().padStart(2, "0")} {ampm}
    </div>
  );
}
