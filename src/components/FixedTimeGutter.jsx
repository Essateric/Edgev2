import React from "react";
import { generateTimeSlots } from "../utils/getTimeSlots";

export default function FixedTimeGutter() {
  const slots = generateTimeSlots();

  return (
    <div className="fixed-gutter flex flex-col items-end pr-2 text-xs text-[#555] font-mono pt-10">
      {slots.map((slot, i) => (
        <div
          key={i}
          className={`h-[24px] ${slot.includes(":00") ? "text-[#9b611e] font-bold" : ""}`}
        >
          {slot}
        </div>
      ))}
    </div>
  );
}
