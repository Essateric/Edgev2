import React, { useEffect, useState, useCallback } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  Views,
} from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay } from "date-fns";
import enGB from "date-fns/locale/en-GB";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import Modal from "../components/Modal";
import NewBooking from "../components/NewBooking";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import Select from "react-select";
import useUnavailableTimeBlocks from "../components/UnavailableTimeBlocks";
import UseSalonClosedBlocks from "../components/UseSalonClosedBlocks";
import TimeSlotLabel from "../components/TimeSlotLabel";

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
  const unavailableBlocks = useUnavailableTimeBlocks(stylistList);
  const salonClosedBlocks = UseSalonClosedBlocks(stylistList);


  useEffect(() => {
    const fetchClients = async () => {
      const clientSnapshot = await getDocs(collection(db, "clients"));
      const clientList = clientSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClients(clientList);
    };

    const fetchStylists = async () => {
      const stylistSnapshot = await getDocs(collection(db, "staff"));
      const stylistData = stylistSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.name || "Unnamed Stylist",
          weeklyHours: data.weeklyHours || {},
        };
      });
      setStylistList(stylistData);
    };

    fetchClients();
    fetchStylists();
  }, []);

  useEffect(() => {
    setTimeout(() => {
      document.querySelectorAll(".rbc-time-slot").forEach((slot) => {
        const raw = slot.getAttribute("data-time");
        if (!raw) return;
  
        const time = new Date(raw);
        const mins = time.getMinutes();
        const hrs = time.getHours();
        const formattedHour = hrs % 12 === 0 ? 12 : hrs % 12;
        const ampm = hrs < 12 ? "AM" : "PM";
  
        slot.innerHTML = "";
  
        const label = document.createElement("div");
        label.style.fontSize = "0.7rem";
        label.style.textAlign = "center";
        label.style.width = "100%";
        label.style.color = mins === 0 ? "#cd7f32" : "#999";
  
        label.innerText =
          mins === 0
            ? `${formattedHour}:00 ${ampm}`
            : `:${String(mins).padStart(2, "0")}`;
  
        slot.appendChild(label);
      });
    }, 200);
  });
  
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

  function isWithinWorkingHours(slotStart, slotEnd, workingHours) {
    const formatTime = (date) => format(date, "HH:mm");
    return (
      formatTime(slotStart) >= workingHours.start &&
      formatTime(slotEnd) <= workingHours.end
    );
  }

  const handleModalCancel = () => {
    setIsModalOpen(false);
    setSelectedSlot(null);
    setStep(1);
    setSelectedClient("");
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold metallic-text mb-4">The Edge HD Salon</h1>
      <TimeSlotLabel />
      <DnDCalendar
        localizer={localizer}
        events={[...events, ...unavailableBlocks, ...salonClosedBlocks]}
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
          const stylist = stylistList.find(s => s.id === slotInfo.resourceId);
          if (!stylist) return;
        
          const day = format(slotInfo.start, "EEEE");
          const workingHours = stylist.weeklyHours?.[day];
        
          // 💥 New check: If this slot overlaps with any unavailable block, skip
          const overlapsUnavailable = unavailableBlocks.some(block =>
            block.resourceId === slotInfo.resourceId &&
            slotInfo.start < block.end &&
            slotInfo.end > block.start
          );
          if (overlapsUnavailable) return; // Do nothing if it's a greyed-out time
        
          if (!workingHours || workingHours.off) {
            alert(`${stylist.title} is off on ${day}`);
            return;
          }
        
          if (
            format(slotInfo.start, "HH:mm") >= workingHours.start &&
            format(slotInfo.end, "HH:mm") <= workingHours.end
          ) {
            setSelectedSlot(slotInfo);
            setStep(1);
            setIsModalOpen(true);
          } else {
            alert(`${stylist.title} works on ${day} from ${workingHours.start} to ${workingHours.end}`);
          }    
        }}
        onEventDrop={moveEvent}
        resizable
        onEventResize={moveEvent}
        eventPropGetter={(event) => {
          const baseStyle = {
            border: "none",
            boxShadow: "none",
            padding: 0,
            fontSize: 0,
            pointerEvents: "none",
            width: "100%", // ✅ Fill full column width
            margin: 0, 
            zIndex: 1, // optional, just to layer correctly
          };

          if (event.isUnavailable) {
            return {
              style: {
                backgroundColor: "#36454F",
                opacity: 0.7,
          ...baseStyle,
              },
            };
          }
          if (event.isSalonClosed) {
            return {
              style: {
                backgroundColor: "#333333", // beige
                opacity: .7,
                ...baseStyle,
              },
            };
          }
          return {};
        }}
        style={{ height: "90vh" }}
        components={{
          timeGutterSlot: ({ value }) => {
            const minutes = value.getMinutes();
            const hours = value.getHours();
            const formattedHour = hours % 12 === 0 ? 12 : hours % 12;
            const ampm = hours < 12 ? "AM" : "PM";
            const paddedMinutes = minutes.toString().padStart(2, "0");
          
            return (
              <div style={{ textAlign: "center", fontSize: "0.75rem", lineHeight: "32px" }}>
                {minutes === 0 ? (
                  <span style={{ fontWeight: "bold", color: "#cd7f32" }}>
                    {formattedHour}:00 {ampm}
                  </span>
                ) : (
                  <span style={{ color: "#999" }}>:{paddedMinutes}</span>
                )}
              </div>
            );
          },
          
       }}
      />

      <Modal isOpen={isModalOpen} onClose={handleModalCancel}>
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
                singleValue: (base) => ({ ...base, color: "#cd7f32" }),
                placeholder: (base) => ({ ...base, color: "#cd7f32" }),
                input: (base) => ({ ...base, color: "#cd7f32", opacity: 1 }),
                option: (base, state) => ({
                  ...base,
                  backgroundColor: state.isSelected ? "#cd7f32" : "#fff",
                  color: state.isSelected ? "#fff" : "#cd7f32",
                  "&:hover": {
                    backgroundColor: "#f5f5f5",
                    color: "#cd7f32",
                  },
                }),
                menu: (base) => ({ ...base, zIndex: 9999 }),
              }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={handleModalCancel} className="text-gray-500">Cancel</button>
              <button onClick={() => setStep(2)} className="bg-bronze text-white px-4 py-2 rounded" disabled={!selectedClient}>Next</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h3 className="text-lg font-bold mb-4 text-bronze">Review Details</h3>
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
          onCancel={handleModalCancel}
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
