// src/components/UseSalonClosedBlocks.jsx
import { useEffect, useState } from "react";

export default function UseSalonClosedBlocks(stylistList, open = "09:00", close = "20:00") {
  const [closedBlocks, setClosedBlocks] = useState([]);

  useEffect(() => {
    if (!stylistList.length) return;

    const result = [];
    const today = new Date();

    // Parse open/close times once
    const [openHour, openMinute] = open.split(":").map(Number);
    const [closeHour, closeMinute] = close.split(":").map(Number);

    // Loop through each day in the week (Sunday to Saturday)
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - today.getDay() + i);

      stylistList.forEach((stylist) => {
        // Morning block: Midnight to salon opening
        const morningStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0);
        const morningEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), openHour, openMinute);

        // Evening block: Salon closing to 11:59 PM
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

    setClosedBlocks(result);
  }, [stylistList, open, close]);

  return closedBlocks;
}
