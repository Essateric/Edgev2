export const generateTimeSlots = (startHour = 9, endHour = 20, interval = 15) => {
    const slots = [];
    const date = new Date(2025, 0, 1, startHour, 0);
  
    while (date.getHours() < endHour) {
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const formatted = date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      slots.push(formatted);
      date.setMinutes(date.getMinutes() + interval);
    }
  
    return slots;
  };
  