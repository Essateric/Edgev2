import React, { useEffect, useState, useCallback } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  Views,
} from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay } from "date-fns";
import enGB from "date-fns/locale/en-GB";
import { collection, getDocs, getDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import Modal from "../components/Modal";
import NewBooking from "../components/NewBooking";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "../styles/calendarStyles.css";
import Select from "react-select";
import useUnavailableTimeBlocks from "../components/UnavailableTimeBlocks";
import UseSalonClosedBlocks from "../components/UseSalonClosedBlocks";
import BookingDetailModal from "../components/BookingDetailModal";
import BookingPopUp from "../components/BookingPopUp";
import CustomCalendarEvent from "../components/CustomCalendarEvent";
import UseTimeSlotLabel from "../utils/UseTimeSlotLabel";
import AddGridTimeLabels from "../utils/AddGridTimeLabels";

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
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [viewBookingModalOpen, setViewBookingModalOpen] = useState(false);
  const [visibleDate, setVisibleDate] = useState(new Date());
  const [calendarSettings, setCalendarSettings] = useState(null);

  UseTimeSlotLabel(9, 20, 15);
  AddGridTimeLabels(9, 20, 15);

  useEffect(() => {
    const fetchCalendarSettings = async () => {
      const snap = await getDoc(doc(db, "config", "calendarSettings"));
      if (snap.exists()) setCalendarSettings(snap.data());
    };
    fetchCalendarSettings();
  }, [])

  const unavailableBlocks = useUnavailableTimeBlocks(stylistList, visibleDate);
  const salonClosedBlocks = UseSalonClosedBlocks(stylistList, visibleDate);
  const customFormats = {
    dayHeaderFormat: (date, culture, localizer) =>
      format(date, "eeee do MMMM", { locale: enGB }),
    slotLabelFormat: (date) => format(date, "HH:mm"),
  };

  useEffect(() => {
    const fetchClients = async () => {
      const snapshot = await getDocs(collection(db, "clients"));
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClients(data);
    };

    const fetchStylists = async () => {
      const snapshot = await getDocs(collection(db, "staff"));
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return { id: doc.id, title: d.name || "Unnamed Stylist", weeklyHours: d.weeklyHours || {} };
      });
      setStylistList(data);
    };

    const fetchEvents = async () => {
      const snapshot = await getDocs(collection(db, "bookings"));
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        start: doc.data().start?.toDate?.() || new Date(),
        end: doc.data().end?.toDate?.() || new Date(),
      }));
      setEvents(data);
    };

    fetchClients();
    fetchStylists();
    fetchEvents();
  }, []);

  const moveEvent = useCallback(async ({ event, start, end, resourceId }) => {
    const updated = { ...event, start, end, resourceId };

    try {
      const bookingRef = doc(db, "bookings", event.id);
      await updateDoc(bookingRef, {
        start: start,
        end: end,
        resourceId: resourceId
      });
      setEvents(prev => prev.map(e => (e.id === event.id ? updated : e)));
    } catch (error) {
      console.error("Failed to move booking:", error);
    }
  }, []);

  const handleModalCancel = () => {
    setIsModalOpen(false);
    setSelectedSlot(null);
    setStep(1);
    setSelectedClient("");
  };

  const clientOptions = clients.map(client => ({
    value: client.id,
    label: `${client.firstName} ${client.lastName} - ${client.mobile}`,
  }));

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold metallic-text mb-4">The Edge HD Salon</h1>
      <DnDCalendar
        localizer={localizer}
        events={[...events, ...unavailableBlocks, ]}//...salonClosedBlocks]}
        startAccessor="start"
        endAccessor="end"
        formats={customFormats}
        resources={stylistList}
        resourceIdAccessor="id"
        resourceTitleAccessor="title"
        resourceAccessor={e => e.resourceId}
        defaultView={Views.DAY}
        views={[Views.DAY]}
        step={15}
        timeslots={4}
        min={new Date(2025, 0, 1, 9, 0)}
        max={new Date(2025, 0, 1, 20, 0)}
        scrollToTime={new Date(2025, 0, 1, 9, 0)}
        showNowIndicator
        selectable
        onSelectSlot={(slotInfo) => {
          const stylist = stylistList.find(s => s.id === slotInfo.resourceId);
          if (!stylist) return;
          setSelectedSlot(slotInfo);
          setStep(1);
          setIsModalOpen(true);
        }}
        onSelectEvent={(event) => {
          if (event.isUnavailable || event.isSalonClosed) return;
          setSelectedBooking(event);
          setViewBookingModalOpen(true);
        }}
        onRangeChange={(range) => {
          if (Array.isArray(range)) {
            setVisibleDate(range[0]); // day/week views
          } else {
            setVisibleDate(range.start); // month view
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
            width: "100%",
            margin: 0,
            zIndex: 1,
          };
          if (event.isUnavailable) return { style: { backgroundColor: "#36454F", opacity: 0.7, ...baseStyle,  pointerEvents: "none", zIndex:1,}, className: "non-working-block", };
          if (event.isSalonClosed) return { style: { backgroundColor: "#333333", opacity: 0.7, ...baseStyle }, className: "salon-closed-block", };
          return {     style: {
            zIndex: 2, // 👈 Always on top
          },};
        }}
        style={{ height: "90vh" }}
        components={{
          event: CustomCalendarEvent,
        }}
      />

      <BookingPopUp
        isOpen={!!selectedBooking}
        booking={selectedBooking}
        onClose={() => setSelectedBooking(null)}
        onEdit={() => {
          setSelectedSlot({
            start: selectedBooking.start,
            end: selectedBooking.end,
            resourceId: selectedBooking.resourceId,
          });
          setStep(1);
          setIsModalOpen(true);
          setSelectedClient(selectedBooking.clientId);
          setSelectedBooking(null);
        }}
        onDeleteSuccess={(deletedId) => {
          setEvents(prev => prev.filter(e => e.id !== deletedId));
          setSelectedBooking(null);
        }}
      />

      <Modal isOpen={isModalOpen} onClose={handleModalCancel}>
        {step === 1 && (
          <>
            <h3 className="text-lg font-bold mb-4 text-bronze">Select Client</h3>
            <Select
              options={clientOptions}
              value={clientOptions.find(opt => opt.value === selectedClient) || null}
              onChange={(selected) => setSelectedClient(selected?.value)}
              placeholder="-- Select Client --"
              className="react-select-container"
              classNamePrefix="react-select"
              styles={{
                control: (base) => ({
                  ...base,
                  backgroundColor: "white",
                  color: "black",
                }),
                menu: (base) => ({
                  ...base,
                  backgroundColor: "white",
                  color: "black",
                }),
                singleValue: (base) => ({
                  ...base,
                  color: "black",
                }),
                option: (base, { isFocused, isSelected }) => ({
                  ...base,
                  backgroundColor: isSelected
                    ? "#9b611e"
                    : isFocused
                    ? "#f1e0c5"
                    : "white",
                  color: "black",
                }),
              }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={handleModalCancel} className="text-gray-500">Cancel</button>
              <button
                onClick={() => setStep(2)}
                className="bg-bronze text-white px-4 py-2 rounded"
                disabled={!selectedClient}
              >Next</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h3 className="text-lg font-bold mb-4 text-bronze">Review Details</h3>
            {(() => {
              const selectedClientObj = clients.find(c => c.id === selectedClient);
              return selectedClientObj && (
                <>
                  <p className="text-sm text-gray-700 mb-1">Client: {`${selectedClientObj.firstName} ${selectedClientObj.lastName}`}</p>
                  <p className="text-sm text-gray-700 mb-1">Phone: {selectedClientObj.mobile}</p>
                </>
              );
            })()}
            <p className="text-sm text-gray-700 mb-1">Time: {format(selectedSlot?.start, "dd/MM/yyyy HH:mm")} – {format(selectedSlot?.end, "HH:mm")}</p>
            <p className="text-sm text-gray-700 mb-3">Stylist: {stylistList.find(s => s.id === selectedSlot?.resourceId)?.title || "N/A"}</p>
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
          clients={clients}
          selectedClient={selectedClient}
          onBack={() => setStep(2)}
          onCancel={handleModalCancel}
          onConfirm={(newEvents) => {
            setEvents(prev => [...prev, ...newEvents]);
            setIsModalOpen(false);
            setStep(1);
          }}
        />
      )}

      <BookingDetailModal
        isOpen={viewBookingModalOpen}
        onClose={() => setViewBookingModalOpen(false)}
        booking={selectedBooking}
        stylistList={stylistList}
        onEdit={() => {
          setSelectedSlot({
            start: new Date(selectedBooking.start),
            end: new Date(selectedBooking.end),
            resourceId: selectedBooking.resourceId,
          });
          setStep(3);
          setIsModalOpen(true);
          setViewBookingModalOpen(false);
        }}
        onCancelBooking={() => {
          alert("Cancel logic goes here");
          setViewBookingModalOpen(false);
        }}
      />
    </div>
  );
}
