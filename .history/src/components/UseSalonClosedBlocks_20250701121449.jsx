// UseSalonClosedBlocks.jsx
import { useEffect, useState } from "react";

export default function UseSalonClosedBlocks(stylistList, visibleDate, open = "09:00", close = "20:00") {
  const [closedBlocks, setClosedBlocks] = useState([]);

  useEffect(() => {
    if (!stylistList.length || !visibleDate) return;

    const result = [];

    const today = new Date(visibleDate);
    today.setHours(0, 0, 0, 0);

    const [openHour, openMinute] = open.split(":").map(Number);
    const [closeHour, closeMinute] = close.split(":").map(Number);

    for (let weekOffset = 0; weekOffset < 4; weekOffset++) {
      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - today.getDay() + i + weekOffset * 7);

        stylistList.forEach((stylist) => {
          // Salon closed before open
          const morningStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0);
          const morningEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), openHour, openMinute);

          // Salon closed after close
          const eveningStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), closeHour, closeMinute);
          const eveningEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59);

          result.push({
            start: morningStart,
            end: morningEnd,
            resourceId: stylist.id,
            title: "Salon Closed",
            isSalonClosed: true,
          });

          result.push({
            start: eveningStart,
            end: eveningEnd,
            resourceId: stylist.id,
            title: "Salon Closed",
            isSalonClosed: true,
          });
        });
      }
    }

    setClosedBlocks(result);
  }, [stylistList, visibleDate, open, close]);

  return closedBlocks;
}
