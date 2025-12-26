// src/utils/GenerateTimeSlots.js
export function GenerateTimeSlots(startHour = 9, endHour = 20, interval = 15) {
  const slots = [];
  const date = new Date(2025, 0, 1, startHour, 0);

  while (date.getHours() < endHour) {
    const mins = date.getMinutes();

    const label =
      mins === 0
        ? date
            .toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase() // "AM" -> "am"
        : String(mins); // "15", "30", "45"

    slots.push(label);
    date.setMinutes(date.getMinutes() + interval);
  }

  return slots;
}
