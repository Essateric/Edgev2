import React from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import enGB from "date-fns/locale/en-GB";
import "react-big-calendar/lib/css/react-big-calendar.css";
import CustomTimeGutterSlot from "../components/CustomTimeGutterSlot";

const locales = { "en-GB": enGB };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date()),
  getDay,
  locales,
});

export default function CalendarTest() {
  const now = new Date();
  const min = new Date(now.setHours(9, 0));
  const max = new Date(now.setHours(20, 0));

  return (
    <div style={{ height: "100vh", padding: "1rem" }}>
      <Calendar
        localizer={localizer}
        defaultView="day"
        views={["day"]} // ✅ must include "day"
        step={15}
        timeslots={4}
        min={min}
        max={max}
        events={[]}
        components={{
          timeGutterSlot: CustomTimeGutterSlot
        }}
      />
    </div>
  );
}
