import { useEffect } from "react";
import { GenerateTimeSlots } from "./GenerateTimeSlots";

export default function AddGridTimeLabels(startHour = 9, endHour = 20, interval = 15) {
  useEffect(() => {
    // Function to add the time labels
    const addTimeLabels = () => {
      const slots = GenerateTimeSlots(startHour, endHour, interval);
      const gridSlots = Array.from(document.querySelectorAll(".rbc-time-slot"))
        .filter(slot => !slot.closest(".rbc-time-gutter"));

      gridSlots.forEach((slot, index) => {
        // Prevent duplicate labels
        if (slot.querySelector(".custom-time-label")) return;

        // Cycle through slots using modulo for multi-column support
        const fullTime = slots[index % slots.length];
        const isOnTheHour = fullTime.includes(":00");

        const labelTime = isOnTheHour
          ? fullTime
          : fullTime.replace(/ (AM|PM)/i, "");  // Remove AM/PM for non-hour times

        const label = document.createElement("div");
        label.className = "custom-time-label";
        label.textContent = labelTime;

        label.style.fontSize = "0.5rem";
        label.style.color = "#aaa";
        label.style.position = "absolute";
        label.style.top = "2px";
        label.style.right = "4px";
        label.style.fontFamily = "inherit";
        label.style.pointerEvents = "none";
        label.style.lineHeight = "1";

        slot.style.position = "relative";
        slot.appendChild(label);
      });
    };

    // Initial call to add the labels
    addTimeLabels();

    // Use MutationObserver to detect when the time slots are updated (for example, when navigating)
    const observer = new MutationObserver(() => {
      // Reapply the labels every time the DOM is updated
      addTimeLabels();
    });

    // Observe changes in the calendar content (the grid time slots)
    const calendarContent = document.querySelector(".rbc-time-content");
    if (calendarContent) {
      observer.observe(calendarContent, {
        childList: true,  // Observe additions/removals of child nodes
        subtree: true,    // Observe all descendants
      });
    }

    // Cleanup the observer when the component is unmounted or the dependencies change
    return () => {
      if (observer) observer.disconnect();
    };
  }, [startHour, endHour, interval]); // Dependencies for recalculating when these values change
}
