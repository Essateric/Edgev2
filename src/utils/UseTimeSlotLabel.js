import { useEffect } from "react";
import { GenerateTimeSlots } from "./GenerateTimeSlots"; // Make sure this is PascalCase

export default function UseTimeSlotLabel(startHour = 9, endHour = 20, interval = 15) {
  useEffect(() => {
    const slots = GenerateTimeSlots(startHour, endHour, interval);
    const gutterSlots = document.querySelectorAll(".rbc-time-gutter .rbc-time-slot");

    gutterSlots.forEach((slot, index) => {
      if (index >= slots.length) return;

      const time = slots[index]; // e.g. "09:15 AM"
      const minutePart = time.match(/:(\d{2})/); // Extract just the :15, :30, :45

      const isHour = time.includes(":00");
      const isQuarter = [":15", ":30", ":45"].some((m) => time.includes(m));

      if (!isHour && isQuarter && minutePart) {
        slot.innerHTML = "";
        const label = document.createElement("div");
        label.textContent = minutePart[0]; // ":15", ":30", ":45"
        label.style.fontSize = "0.65rem";
        label.style.textAlign = "center";
        label.style.color = "#999";
        label.style.fontFamily = "inherit";
        slot.appendChild(label);
      }

      if (!isHour && !isQuarter) {
        slot.innerHTML = ""; // Hide anything that’s not 15/30/45
      }
    });
  }, [startHour, endHour, interval]);
}
