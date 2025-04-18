import React, { useEffect, useState, useCallback } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  Views,
} from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay } from "date-fns";
import enGB from "date-fns/locale/en-GB";
import { collection, getDocs, addDoc } from "firebase/firestore";
import { db } from "../firebase";
import Modal from "../components/Modal";
import NewBooking from "../components/NewBooking";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import Select from "react-select";

const DnDCalendar = withDragAndDrop(Calendar);

const locales = { "en-GB": enGB };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date()),
  getDay,
  locales,
});

export default function CalendarPage() {
  const [clients, setClients] = useState([]);
  const [stylistList, setStylistList] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedClient, setSelectedClient] = useState("");
  const [step, setStep] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const fetchClients = async () => {
      const clientSnapshot = await getDocs(collection(db, "clients"));
      const clientList = clientSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClients(clientList);
    };

    const fetchStylists = async () => {
      const stylistCollection = collection(db, "stylist");
      const stylistSnapshot = await getDocs(stylistCollection);
      const stylistData = stylistSnapshot.docs.map((doc) => ({
        id: doc.id,
        title: doc.data()?.title || "Unnamed Stylist",
      }));
      setStylistList(stylistData);
    };

    fetchClients();
    fetchStylists();
  }, []);

  const moveEvent = useCallback(({ event, start, end, resourceId }) => {
    const updatedEvent = {
      ...event,
      start,
      end,
      resourceId,
    };
    setEvents((prev) => prev.map((evt) => (evt === event ? updatedEvent : evt)));
  }, []);

  
const clientOptions = clients.map((client) => ({
  value: client.id,
  label: `${client.firstName || ""} ${client.lastName || ""} - ${client.mobile || ""}`,
}));

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold metallic-text mb-4">The Edge HD Salon</h1>

      <DnDCalendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        resources={stylistList}
        resourceIdAccessor="id"
        resourceTitleAccessor="title"
        resourceAccessor={(event) => event.resourceId}
        defaultView={Views.DAY}
        views={[Views.DAY]}
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
        onEventDrop={moveEvent}
        resizable
        onEventResize={moveEvent}
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
            <h3 className="text-lg font-bold mb-4 text-bronze">Select Client</h3>
            {selectedSlot?.start && selectedSlot?.end && (
              <p className="text-sm mb-2 text-bronze">
                Time: {format(new Date(selectedSlot.start), "dd/MM/yyyy HH:mm")} – {format(new Date(selectedSlot.end), "HH:mm")}
              </p>
            )}
<Select
  options={clientOptions}
  value={clientOptions.find((opt) => opt.value === selectedClient) || null}
  onChange={(selected) => setSelectedClient(selected?.value)}
  placeholder="-- Select Client --"
  className="react-select-container"
  classNamePrefix="react-select"
  styles={{
    control: (base, state) => ({
      ...base,
      backgroundColor: "#fff",
      borderColor: "#cd7f32",
      boxShadow: state.isFocused ? "0 0 0 1px #cd7f32" : "none",
      "&:hover": {
        borderColor: "#cd7f32",
      },
    }),
    singleValue: (base) => ({
      ...base,
      color: "#cd7f32", // 🟠 MAIN fix: visible selected text
    }),
    placeholder: (base) => ({
      ...base,
      color: "#cd7f32",
    }),
    input: (base) => ({
      ...base,
      color: "#cd7f32", // for typed values if searchable
      opacity: 1,        // ensure it’s visible
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected ? "#cd7f32" : "#fff",
      color: state.isSelected ? "#fff" : "#cd7f32",
      "&:hover": {
        backgroundColor: "#f5f5f5",
        color: "#cd7f32",
      },
    }),
    menu: (base) => ({
      ...base,
      zIndex: 9999,
    }),
  }}
/>




            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500">Cancel</button>
              <button onClick={() => setStep(2)} className="bg-bronze text-white px-4 py-2 rounded" disabled={!selectedClient}>Next</button>
            </div>
          </>
        )}

{step === 2 && (
  <>
    <h3 className="text-lg font-bold mb-4 text-bronze">Review Details</h3>

    {/** 👉 Add this line here */}
    {(() => {
      const selectedClientObj = clients.find(c => c.id === selectedClient);
      return (
        <>
          <p className="text-sm text-gray-700 mb-1">
            Client: {`${selectedClientObj?.firstName ?? ""} ${selectedClientObj?.lastName ?? ""}`}
          </p>
          <p className="text-sm text-gray-700 mb-1">
            Phone: {selectedClientObj?.mobile ?? "N/A"}
          </p>
        </>
      );
    })()}

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

      {step === 3 && (
        <NewBooking
          stylistName={stylistList.find(s => s.id === selectedSlot?.resourceId)?.title}
          stylistId={selectedSlot?.resourceId}
          selectedSlot={selectedSlot}
          onBack={() => setStep(2)}
          onCancel={() => setIsModalOpen(false)}
          onConfirm={(newEvents) => {
            setEvents(prev => [...prev, ...newEvents]);
            setIsModalOpen(false);
            setStep(1);
          }}
        />
      )}
    </div>
  );
}