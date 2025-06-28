import React, { useEffect, useState, useCallback } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  Views,
} from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay } from "date-fns";
import enGB from "date-fns/locale/en-GB";
import Modal from "../components/Modal";
import NewBooking from "../components/NewBooking";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "../styles/CalendarStyles.css";
import Select from "react-select";
import useUnavailableTimeBlocks from "../components/UnavailableTimeBlocks";
import UseSalonClosedBlocks from "../components/UseSalonClosedBlocks";
import BookingPopUp from "../components/BookingPopUp";
import CustomCalendarEvent from "../components/CustomCalendarEvent";
import UseTimeSlotLabel from "../utils/UseTimeSlotLabel";
import AddGridTimeLabels from "../utils/AddGridTimeLabels";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";

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
  const [visibleDate, setVisibleDate] = useState(new Date());

  // Helpers
  UseTimeSlotLabel(9, 20, 15);
  AddGridTimeLabels(9, 20, 15);

  // Fetch clients, stylists, and events
  useEffect(() => {
    const fetchData = async () => {
      const [{ data: clients }, { data: staff }, { data: bookings }] = await Promise.all([
        supabase.from("clients").select("*"),
        supabase.from("staff").select("*"),
        supabase.from("bookings").select("*"),
      ]);

      setClients(clients || []);
      setStylistList(
        (staff || []).map((s) => ({
          id: s.id,
          title: s.name,
          weeklyHours: s.weekly_hours || {},
        }))
      );

      setEvents(
        (bookings || []).map((b) => ({
          ...b,
          start: new Date(b.start),
          end: new Date(b.end),
        }))
      );
    };

    fetchData();
  }, []);

  // Generate unavailable and closed time blocks
  const unavailableBlocks = useUnavailableTimeBlocks(stylistList, visibleDate);
  const salonClosedBlocks = UseSalonClosedBlocks(stylistList, visibleDate);

  // Handle event move
  const moveEvent = useCallback(async ({ event, start, end, resourceId }) => {
    const updated = { ...event, start, end, resourceId };

    try {
      await supabase.from("bookings").update({ start, end, resourceId }).eq("id", event.id);
      setEvents((prev) => prev.map((e) => (e.id === event.id ? updated : e)));
    } catch (error) {
      console.error("Failed to move booking:", error);
    }
  }, []);

  // Cancel modal handler
  const handleModalCancel = () => {
    setIsModalOpen(false);
    setSelectedSlot(null);
    setStep(1);
    setSelectedClient("");
  };

  const clientOptions = clients.map((c) => ({
    value: c.id,
    label: `${c.first_name || "No First Name"} ${c.last_name || ""} - ${c.mobile || "No number"}`,
  }));

  const { currentUser } = useAuth();
  if (!currentUser) {
    return <div className="text-center p-4 text-gray-700">Loading...</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold metallic-text mb-4">The Edge HD Salon</h1>
      <DnDCalendar
        localizer={localizer}
        events={[...events, ...unavailableBlocks, ...salonClosedBlocks]}
        startAccessor="start"
        endAccessor="end"
        resources={stylistList}
        resourceIdAccessor="id"
        resourceTitleAccessor="title"
        resourceAccessor={(e) => e.resourceId}
        defaultView={Views.DAY}
        views={[Views.DAY]}
        step={15}
        timeslots={4}
        min={new Date(2025, 0, 1, 9, 0)}
        max={new Date(2025, 0, 1, 20, 0)}
        scrollToTime={new Date(2025, 0, 1, 9, 0)}
        selectable
        showNowIndicator
        onSelectSlot={(slotInfo) => {
          const stylist = stylistList.find((s) => s.id === slotInfo.resourceId);
          if (!stylist) return;
          setSelectedSlot(slotInfo);
          setStep(1);
          setIsModalOpen(true);
        }}
        onSelectEvent={(event) => {
          if (event.isUnavailable || event.isSalonClosed) return;
          setSelectedBooking(event);
        }}
        onRangeChange={(range) => {
          if (Array.isArray(range)) {
            setVisibleDate(range[0]);
          } else {
            setVisibleDate(range.start);
          }
        }}
        onEventDrop={moveEvent}
        resizable
        onEventResize={moveEvent}
        eventPropGetter={(event) => {
          if (event.isUnavailable) {
            return {
              style: {
                backgroundColor: "#36454F",
                opacity: 0.7,
                zIndex: 1,
              },
            };
          }
          if (event.isSalonClosed) {
            return {
              style: {
                backgroundColor: "#333333",
                opacity: 0.7,
                zIndex: 1,
              },
            };
          }
          return { style: { zIndex: 2 } };
        }}
        components={{
          event: CustomCalendarEvent,
        }}
        formats={{
          dayHeaderFormat: (date) => format(date, "eeee do MMMM", { locale: enGB }),
          slotLabelFormat: (date) => format(date, "HH:mm"),
        }}
        style={{ height: "90vh" }}
      />

      {/* Popup to view/edit booking */}
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
          setEvents((prev) => prev.filter((e) => e.id !== deletedId));
          setSelectedBooking(null);
        }}
        stylistList={stylistList}
        clients={clients}
      />

      {/* Step 1: Select Client */}
      <Modal isOpen={isModalOpen && step === 1} onClose={handleModalCancel}>
        <h3 className="text-lg font-bold mb-4 text-bronze">Select Client</h3>
        <Select
          options={clientOptions}
          value={clientOptions.find((opt) => opt.value === selectedClient) || null}
          onChange={(selected) => setSelectedClient(selected?.value)}
          placeholder="-- Select Client --"
          className="react-select-container"
          classNamePrefix="react-select"
          styles={{
            control: (base) => ({ ...base, backgroundColor: "white", color: "black" }),
            menu: (base) => ({ ...base, backgroundColor: "white", color: "black" }),
            singleValue: (base) => ({ ...base, color: "black" }),
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
          <button onClick={handleModalCancel} className="text-gray-500">
            Cancel
          </button>
          <button
            onClick={() => setStep(2)}
            className="bg-bronze text-white px-4 py-2 rounded"
            disabled={!selectedClient}
          >
            Next
          </button>
        </div>
      </Modal>

      {/* Step 2: New Booking with services + review inside */}
      {step === 2 && (
        <NewBooking
          stylistName={stylistList.find((s) => s.id === selectedSlot?.resourceId)?.title}
          stylistId={selectedSlot?.resourceId}
          selectedSlot={selectedSlot}
          clients={clients}
          selectedClient={selectedClient}
          onBack={() => setStep(1)}
          onCancel={handleModalCancel}
          onConfirm={(newEvents) => {
            setEvents((prev) => [...prev, ...newEvents]);
            setIsModalOpen(false);
            setStep(1);
          }}
        />
      )}
    </div>
  );
}
