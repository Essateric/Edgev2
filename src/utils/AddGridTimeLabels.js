import { useEffect } from "react";
import { GenerateTimeSlots } from "./GenerateTimeSlots";

// deps: optional array of values that should trigger a re-run
export default function useAddGridTimeLabels(
  startHour = 9,
  endHour = 20,
  interval = 15,
  deps = []
) {
  const extraDeps = Array.isArray(deps) ? deps : [deps];

  useEffect(() => {
    // Function to add the time labels
    const addTimeLabels = () => {
      const slots = GenerateTimeSlots(startHour, endHour, interval);
      const gridSlots = Array.from(document.querySelectorAll(".rbc-time-slot")).filter(
        (slot) => !slot.closest(".rbc-time-gutter")
      );

      if (!gridSlots.length) return;
      gridSlots.forEach((slot, index) => {
        // Prevent duplicate labels
        if (slot.querySelector(".custom-time-label")) return;

        // Cycle through slots using modulo for multi-column support
        const fullTime = slots[index % slots.length];
        const isOnTheHour = fullTime.includes(":00");

      const labelTime = isOnTheHour ? fullTime : fullTime; 

        const label = document.createElement("div");
        label.className = "custom-time-label";
        label.textContent = labelTime;

       label.style.fontSize = "0.55rem";
        label.style.color = "#6e6845ff";
        label.style.position = "absolute";
        label.style.top = "2px";
        label.style.right = "4px";
        label.style.fontFamily = "inherit";
        label.style.pointerEvents = "none";
        label.style.lineHeight = "1";
        label.style.zIndex = "5";


        slot.style.position = "relative";
        slot.appendChild(label);
      });
    };

    let observer = null;
    let pollId = null;

    // Use MutationObserver to detect when the time slots are updated (for example, when navigating)
      const attachObserver = () => {
      // Reapply the labels every time the DOM is updated
      addTimeLabels();

    // Use MutationObserver to detect when the time slots are updated (for example, when navigating)
      const calendarContent = document.querySelector(".rbc-time-content");
      if (!calendarContent) return false;

      observer = new MutationObserver(() => {
        // Reapply the labels every time the DOM is updated
        addTimeLabels();
      });

      observer.observe(calendarContent, {
        childList: true,  // Observe additions/removals of child nodes
        subtree: true,    // Observe all descendants
      });
      
      return true;
    };

    // Try immediately, then keep checking until the calendar mounts
    if (!attachObserver()) {
      pollId = window.setInterval(() => {
        if (attachObserver()) {
          window.clearInterval(pollId);
          pollId = null;
        }
      }, 200);
    }

    // Cleanup the observer when the component is unmounted or the dependencies change
    return () => {
      if (pollId) window.clearInterval(pollId);
      if (observer) observer.disconnect();
    };
}, [startHour, endHour, interval, ...extraDeps]); // Dependencies for recalculating when these values change
}
