// useUnavailableTimeBlocks.jsx
import { useEffect, useState } from "react";

export default function useUnavailableTimeBlocks(stylistList, visibleDate = new Date()) {
  const [unavailableBlocks, setUnavailableBlocks] = useState([]);
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  useEffect(() => {
    if (!stylistList.length) return;

    const result = [];
    const baseDate = new Date(visibleDate);
    baseDate.setHours(0, 0, 0, 0);

    for (let weekOffset = 0; weekOffset < 4; weekOffset++) {
      for (let i = 0; i < 7; i++) {
        const date = new Date(baseDate);
        date.setDate(baseDate.getDate() + weekOffset * 7 + i);
        const day = daysOfWeek[date.getDay()];

        stylistList.forEach((stylist) => {
          const workingHours = stylist.weeklyHours?.[day];

          if (!workingHours || workingHours.off) {
            // FULL DAY OFF = Non-working block
            result.push({
              start: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0),
              end: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999),
              resourceId: stylist.id,
              title: "Non-working",
              isUnavailable: true,
            });
          } else {
            const [startHour, startMinute] = workingHours.start.split(":").map(Number);
            const [endHour, endMinute] = workingHours.end.split(":").map(Number);

            // Before staff starts working - unavailable block
            if (startHour !== 0 || startMinute !== 0) {
              result.push({
                start: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0),
                end: new Date(date.getFullYear(), date.getMonth(), date.getDate(), startHour, startMinute),
                resourceId: stylist.id,
                title: "Unavailable",
                isUnavailable: true,
              });
            }

            // After staff finishes working - unavailable block
            if (endHour !== 23 || endMinute !== 59) {
              result.push({
                start: new Date(date.getFullYear(), date.getMonth(), date.getDate(), endHour, endMinute),
                end: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999),
                resourceId: stylist.id,
                title: "Unavailable",
                isUnavailable: true,
              });
            }
          }
        });
      }
    }

    setUnavailableBlocks(result);
  }, [stylistList, visibleDate]);

  return unavailableBlocks;
}
