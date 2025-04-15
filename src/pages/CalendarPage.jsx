import React, { useEffect, useState } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import enGB from "date-fns/locale/en-GB";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

import "react-big-calendar/lib/css/react-big-calendar.css";

const locales = { "en-GB": enGB };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date()),
  getDay,
  locales,
});

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
      const stylistData = stylistSnapshot.docs.map((doc) => ({
        id: doc.id,
        title: doc.data()?.title || "Unnamed Stylist",
      }));
      setStylistList(stylistData);
    }
    fetchStylist();
  }, []);

  // ✅ Patch for showing custom time labels in the DOM
  useEffect(() => {
    setTimeout(() => {
      const slots = document.querySelectorAll(".rbc-time-gutter .rbc-time-slot");
      const startHour = 9; // your min time: 9 AM
      const totalSlots = slots.length;
      let current = new Date();
      current.setHours(startHour, 0, 0, 0); // set to 09:00
  
      slots.forEach((slot, index) => {
        const mins = current.getMinutes();
        const hrs = current.getHours();
        const formattedHour = hrs % 12 === 0 ? 12 : hrs % 12;
        const ampm = hrs < 12 ? "AM" : "PM";
  
        // Clear content
        slot.innerHTML = "";
  
        // Build label
        const label = document.createElement("div");
        label.style.fontSize = "0.7rem";
        label.style.textAlign = "center";
        label.style.width = "100%";
        label.style.color = mins === 0 ? "#cd7f32" : "#999";
        label.innerText = mins === 0
          ? `${formattedHour}:00 ${ampm}`
          : `:${String(mins).padStart(2, "0")}`;
  
        slot.appendChild(label);
  
        // Increment time by 15 min
        current.setMinutes(current.getMinutes() + 15);
      });
    }, 300);
  }, []);
  
  
  

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-bronze mb-4">The Edge HD Salon</h1>

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
          timeGutterSlot: ({ value }) => {
            const minutes = value.getMinutes();
            const hours = value.getHours();
            const formattedHour = hours % 12 === 0 ? 12 : hours % 12;
            const ampm = hours < 12 ? "AM" : "PM";
            const paddedMinutes = minutes.toString().padStart(2, "0");
        
            // ✅ Full hour shows AM/PM
            if (minutes === 0) {
              return (
                <div style={{ color: "#cd7f32", fontWeight: "bold", textAlign: "center" }}>
                  {formattedHour}:00 {ampm}
                </div>
              );
            }
        
            // ✅ Hide AM/PM for 15, 30, 45
            return (
              <div style={{ color: "#999", textAlign: "center", fontSize: "0.8rem" }}>
                :{paddedMinutes}
              </div>
            );
          }
        }}
        
        
      />
    </div>
    
  );
}
