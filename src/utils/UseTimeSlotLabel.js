import { useEffect } from "react";
import { GenerateTimeSlots } from "./GenerateTimeSlots";

export default function UseTimeSlotLabel(startHour = 9, endHour = 20, interval = 15) {
  useEffect(() => {
    const slots = GenerateTimeSlots(startHour, endHour, interval);
    const allTimeSlots = document.querySelectorAll(".rbc-time-slot");

    allTimeSlots.forEach((slot, index) => {
      if (index >= slots.length) return;

      const time = slots[index];
      const minutePart = time.match(/:(\d{2})/);
      const isHour = time.includes(":00");
      const isQuarter = [":15", ":30", ":45"].some((m) => time.includes(m));

      // Only show for quarter increments or hours
      if (!isHour && !isQuarter) return;

      const label = document.createElement("div");
      label.textContent = isHour ? "" : minutePart[0]; // Skip showing full hour text
      label.style.fontSize = "0.6rem";
      label.style.color = "#aaa"; // Light grey
      label.style.position = "absolute";
      label.style.top = "2px";
      label.style.right = "4px";
      label.style.fontFamily = "inherit";
      label.style.pointerEvents = "none";

      slot.style.position = "relative"; // Make sure parent is positioned
      slot.appendChild(label);
    });
  }, [startHour, endHour, interval]);
  
}
