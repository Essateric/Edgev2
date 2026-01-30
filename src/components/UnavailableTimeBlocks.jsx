// useUnavailableTimeBlocks.jsx
import { useEffect, useState } from "react";

export default function useUnavailableTimeBlocks(stylistList, visibleDate = new Date(), calendarMinHour = 0, calendarMaxHour = 24) {
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
              calendarMinHour,
            });
          } else {
            const [startHour, startMinute] = workingHours.start.split(":").map(Number);
            const [endHour, endMinute] = workingHours.end.split(":").map(Number);
               const workingStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startHour, startMinute);
            const workingEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), endHour, endMinute);
           
            
            const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0);
            const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

            const calendarStart = new Date(
              date.getFullYear(),
              date.getMonth(),
              date.getDate(),
              calendarMinHour,
              0
            );
            const calendarEnd = new Date(
              date.getFullYear(),
              date.getMonth(),
              date.getDate(),
              calendarMaxHour,
              0
            );

            // Before staff starts working - unavailable block
                        if (workingStart > dayStart && workingStart > calendarStart) {

              result.push({
               start: dayStart,
                end: workingStart,
                resourceId: stylist.id,
                title: "Unavailable",
                isUnavailable: true,
              });
            }

            // After staff finishes working - unavailable block
           if (workingEnd < dayEnd && workingEnd < calendarEnd) {
              result.push({
                start: workingEnd,
                end: dayEnd,
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
