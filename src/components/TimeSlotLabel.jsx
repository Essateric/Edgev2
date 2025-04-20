import React from "react";

export default function TimeSlotLabel({ value }) {
  if (!value) return null;

  const minutes = value.getMinutes();
  const hours = value.getHours();
  const formattedHour = hours % 12 === 0 ? 12 : hours % 12;
  const ampm = hours < 12 ? "AM" : "PM";
  const paddedMinutes = String(minutes).padStart(2, "0");

  return (
    <div className="text-center text-[10px] leading-3 text-gray-500">
      {minutes === 0 ? (
        <span className="text-bronze font-semibold">
          {/* Keep blank because .rbc-label shows the full hour */}
          &nbsp;
        </span>
      ) : (
        <span className="text-xs text-gray-400">:{paddedMinutes}</span>
      )}
    </div>
  );
}
