import React, { useEffect, useState } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import enUS from "date-fns/locale/en-US";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import CustomTimeGutterSlot from "../components/CustomTimeGutterSlot"; // NEW

import "react-big-calendar/lib/css/react-big-calendar.css";

const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek: () => startOfWeek(new Date()), getDay, locales });

export default function CalendarPage() {
  const [stylistList, setStylistList] = useState([]);
  const [events, setEvents] = useState([
    {
      title: "Haircut",
      start: new Date(2025, 3, 14, 9, 0),
      end: new Date(2025, 3, 14, 9, 30),
      resourceId: "1",
    },
    {
      title: "Color",
      start: new Date(2025, 3, 14, 9, 30),
      end: new Date(2025, 3, 14, 10, 30),
      resourceId: "2",
    },
  ]);

  useEffect(() => {
    async function fetchStylist() {
      const stylistCollection = collection(db, "stylist");
      const stylistSnapshot = await getDocs(stylistCollection);
      const stylistData = stylistSnapshot.docs.map(doc => ({
        id: doc.id,
        title: doc.data()?.title || "Unnamed Stylist",
      }));
      setStylistList(stylistData);
    }
    fetchStylist();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-bronze mb-4">The Edge HS Salon</h1>

      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        resources={stylistList}
        resourceIdAccessor="id"
        resourceTitleAccessor="title"
        resourceAccessor={(event) => event.resourceId}
        defaultView="day"
        views={["day"]}
        step={15}
        timeslots={4}
        min={new Date(2025, 0, 1, 9, 0)}
        max={new Date(2025, 0, 1, 20, 0)}
        scrollToTime={new Date(2025, 0, 1, 9, 0)}
        showNowIndicator={true}
        style={{ height: "90vh" }}
        components={{
          timeGutterSlot: CustomTimeGutterSlot,  // ✅ important
        }}
      />
    </div>
  );
}
