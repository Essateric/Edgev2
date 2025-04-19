import { useEffect, useState } from "react";

export default function useUnavailableTimeBlocks(stylistList) {
  const [unavailableBlocks, setUnavailableBlocks] = useState([]);

  useEffect(() => {
    if (!stylistList.length) return;

    const result = [];
    const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const today = new Date();

    stylistList.forEach((stylist) => {
      for (let i = 0; i < 7; i++) {
        const day = daysOfWeek[i];
        const date = new Date(today);
        date.setDate(today.getDate() - today.getDay() + i); // Start of current week + i

        const workingHours = stylist.weeklyHours?.[day];

        if (!workingHours || workingHours.off) {
          // OFF full day
          result.push({
            start: new Date(date.setHours(0, 0, 0, 0)),
            end: new Date(date.setHours(23, 59, 59, 999)),
            resourceId: stylist.id,
            title: "Non-working",
            isUnavailable: true,
          });
        } else {
          const [startHour, startMinute] = workingHours.start.split(":").map(Number);
          const [endHour, endMinute] = workingHours.end.split(":").map(Number);

          // Before working hours
          result.push({
            start: new Date(new Date(date).setHours(0, 0, 0, 0)),
            end: new Date(new Date(date).setHours(startHour, startMinute)),
            resourceId: stylist.id,
            title: "Unavailable",
            isUnavailable: true,
          });

          // After working hours
          result.push({
            start: new Date(new Date(date).setHours(endHour, endMinute)),
            end: new Date(new Date(date).setHours(23, 59, 59, 999)),
            resourceId: stylist.id,
            title: "Unavailable",
            isUnavailable: true,
          });
        }
      }
    });

    setUnavailableBlocks(result);
  }, [stylistList]);

  return unavailableBlocks;
}
