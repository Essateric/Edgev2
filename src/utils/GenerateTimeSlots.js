// src/utils/GenerateTimeSlots.js
export function GenerateTimeSlots(startHour = 9, endHour = 20, interval = 15) {
    const slots = [];
    const date = new Date(2025, 0, 1, startHour, 0);
  
    while (date.getHours() < endHour) {
      const formatted = date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      slots.push(formatted);
      date.setMinutes(date.getMinutes() + interval);
    }
  
    return slots;
  }
  