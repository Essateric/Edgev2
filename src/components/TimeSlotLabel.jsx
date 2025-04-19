// src/components/TimeSlotLabel.jsx
import { useEffect } from "react";

export default function TimeSlotLabel() {
  useEffect(() => {
    const interval = setInterval(() => {
      const slots = document.querySelectorAll(".rbc-time-gutter .rbc-time-slot");
      if (!slots.length) return;

      // Dynamically detect how many per hour
      const totalSlots = slots.length;
      const startHour = 9; // 🔁 Adjust if your calendar starts earlier
      const endHour = 20; // 🔁 Match your max time
      const hoursDisplayed = endHour - startHour;
      const slotsPerHour = totalSlots / hoursDisplayed;

      slots.forEach((slot, i) => {
        if (slot.querySelector("._slot-label")) return;

        const mins = Math.round((i % slotsPerHour) * (60 / slotsPerHour));
        const hr = startHour + Math.floor(i / slotsPerHour);

        const formattedHour = hr % 12 === 0 ? 12 : hr % 12;
        const ampm = hr < 12 ? "AM" : "PM";
        const padded = String(mins).padStart(2, "0");

        const div = document.createElement("div");
        div.className = "_slot-label";
        div.style.textAlign = "center";
        div.style.fontSize = "0.7rem";
        div.style.color = mins === 0 ? "#cd7f32" : "#999";
        div.innerText = mins === 0 ? `${formattedHour}:00 ${ampm}` : `:${padded}`;

        slot.innerHTML = ""; // Clear existing
        slot.appendChild(div);
      });
    }, 300);

    return () => clearInterval(interval);
  }, []);

  return null;
}
