import React, { useEffect, useState } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import enGB from "date-fns/locale/en-GB";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import Modal from "../components/Modal";
import "react-big-calendar/lib/css/react-big-calendar.css";

const locales = { "en-GB": enGB };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date()),
  getDay,
  locales,
});

const mockClients = [
  { id: "1", name: "Valjeta Jashanica", phone: "07464620517" },
  { id: "2", name: "Lauren Smith", phone: "07345678910" },
];

export default function CalendarPage() {
  const [stylistList, setStylistList] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedClient, setSelectedClient] = useState("");
  const [step, setStep] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  useEffect(() => {
    setTimeout(() => {
      const slots = document.querySelectorAll(".rbc-time-gutter .rbc-time-slot");
      const startHour = 9;
      let current = new Date();
      current.setHours(startHour, 0, 0, 0);

      slots.forEach((slot) => {
        const mins = current.getMinutes();
        const hrs = current.getHours();
        const formattedHour = hrs % 12 === 0 ? 12 : hrs % 12;
        const ampm = hrs < 12 ? "AM" : "PM";

        slot.innerHTML = "";
        const label = document.createElement("div");
        label.style.fontSize = "0.7rem";
        label.style.textAlign = "center";
        label.style.width = "100%";
        label.style.color = mins === 0 ? "#cd7f32" : "#999";
        label.innerText = mins === 0 ? `${formattedHour}:00 ${ampm}` : `:${String(mins).padStart(2, "0")}`;

        slot.appendChild(label);
        current.setMinutes(current.getMinutes() + 15);
      });
    }, 300);
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold metallic-text mb-4">The Edge HD Salon</h1>

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
        selectable={true}
        onSelectSlot={(slotInfo) => {
          setSelectedSlot(slotInfo);
          setStep(1);
          setIsModalOpen(true);
        }}
        style={{ height: "90vh" }}
        components={{
          timeGutterSlot: ({ value }) => {
            const minutes = value.getMinutes();
            const hours = value.getHours();
            const formattedHour = hours % 12 === 0 ? 12 : hours % 12;
            const ampm = hours < 12 ? "AM" : "PM";
            const paddedMinutes = minutes.toString().padStart(2, "0");

            return minutes === 0 ? (
              <div style={{ color: "#cd7f32", fontWeight: "bold", textAlign: "center" }}>
                {formattedHour}:00 {ampm}
              </div>
            ) : (
              <div style={{ color: "#999", textAlign: "center", fontSize: "0.8rem" }}>
                :{paddedMinutes}
              </div>
            );
          },
        }}
      />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        {step === 1 && (
          <>
            <h3 className="text-lg font-bold mb-4 text-bronze">Step 1: Select Client</h3>

            {selectedSlot?.start && selectedSlot?.end && (
  <p className="text-sm mb-2 text-bronze">
    Time: {format(new Date(selectedSlot.start), "dd/MM/yyyy HH:mm")} – {format(new Date(selectedSlot.end), "HH:mm")}
  </p>
)}

            <select
              className="border border-gray-300 rounded px-3 py-2 w-full text-bronze"
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
            >
              <option value="">-- Select --</option>
              {mockClients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500">Cancel</button>
              <button
                onClick={() => setStep(2)}
                className="bg-bronze text-white px-4 py-2 rounded"
                disabled={!selectedClient}
              >
                Next
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h3 className="text-lg font-bold mb-4 text-bronze">Step 2: Review Details</h3>
            <p className="text-sm text-gray-700 mb-1">
              Client: {mockClients.find(c => c.id === selectedClient)?.name}
            </p>
            <p className="text-sm text-gray-700 mb-1">
              Phone: {mockClients.find(c => c.id === selectedClient)?.phone}
            </p>
            <p className="text-sm text-gray-700 mb-1">
              Time: {format(selectedSlot?.start, "dd/MM/yyyy HH:mm")} – {format(selectedSlot?.end, "HH:mm")}
            </p>
            <p className="text-sm text-gray-700 mb-3">
              Stylist: {stylistList.find(s => s.id === selectedSlot?.resourceId)?.title || "N/A"}
            </p>

            <div className="flex justify-between mt-4">
              <button onClick={() => setStep(1)} className="text-gray-500">Back</button>
              <button onClick={() => setStep(3)} className="bg-bronze text-white px-4 py-2 rounded">Next</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}