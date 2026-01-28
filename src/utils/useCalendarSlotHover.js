import { useEffect } from "react";

export default function useCalendarSlotHover(deps = []) {
  const extraDeps = Array.isArray(deps) ? deps : [deps];

  useEffect(() => {
    let currentContent = null;
    let hoveredSlots = new Set();
    let observer = null;
    let pollId = null;

    const clearHover = () => {
      hoveredSlots.forEach((slot) => slot.classList.remove("rbc-hover-slot"));
      hoveredSlots = new Set();
    };

    const updateHover = (event) => {
      if (!currentContent) return;

      const columns = Array.from(
        currentContent.querySelectorAll(".rbc-day-slot")
      );
      if (!columns.length) return;

      const y = event.clientY;
      const nextHovered = new Set();

      columns.forEach((column) => {
        const rect = column.getBoundingClientRect();
        if (y < rect.top || y > rect.bottom) return;

        const x = Math.min(rect.right - 2, rect.left + 8);
        const elements = document.elementsFromPoint(x, y);
        const slot = elements
          .map((el) => el.closest(".rbc-time-slot"))
          .find(
            (candidate) =>
              candidate &&
              column.contains(candidate) &&
              !candidate.closest(".rbc-time-gutter")
          );

        if (slot) nextHovered.add(slot);
      });

      hoveredSlots.forEach((slot) => {
        if (!nextHovered.has(slot)) {
          slot.classList.remove("rbc-hover-slot");
        }
      });

      nextHovered.forEach((slot) => {
        if (!hoveredSlots.has(slot)) {
          slot.classList.add("rbc-hover-slot");
        }
      });

      hoveredSlots = nextHovered;
    };

    const attachToContent = (content) => {
      if (!content || content === currentContent) return false;
      if (currentContent) {
        currentContent.removeEventListener("mousemove", updateHover);
        currentContent.removeEventListener("mouseleave", clearHover);
      }
      clearHover();
      currentContent = content;
      currentContent.addEventListener("mousemove", updateHover);
      currentContent.addEventListener("mouseleave", clearHover);
      return true;
    };

    const ensureAttached = () => {
      const content = document.querySelector(".rbc-time-content");
      if (!content) return false;
      return attachToContent(content);
    };

    if (!ensureAttached()) {
      pollId = window.setInterval(() => {
        if (ensureAttached()) {
          window.clearInterval(pollId);
          pollId = null;
        }
      }, 200);
    }

    observer = new MutationObserver(() => {
      ensureAttached();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      if (pollId) window.clearInterval(pollId);
      if (observer) observer.disconnect();
      if (currentContent) {
        currentContent.removeEventListener("mousemove", updateHover);
        currentContent.removeEventListener("mouseleave", clearHover);
      }
      clearHover();
    };
  }, [...extraDeps]);
}