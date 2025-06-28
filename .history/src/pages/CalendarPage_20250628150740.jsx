import React, { useEffect, useState, useCallback } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  Views,
} from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay } from "date-fns";
import enGB from "date-fns/locale/en-GB";
import Select from "react-select";
import Modal from "../components/Modal";
import NewBooking from "../components/NewBooking";
import BookingPopUp from "../components/BookingPopUp";
import useUnavailableTimeBlocks from "../components/UnavailableTimeBlocks";
import UseSalonClosedBlocks from "../components/UseSalonClosedBlocks";
import CustomCalendarEvent from "../components/CustomCalendarEvent";
import UseTimeSlotLabel from "../utils/UseTimeSlotLabel";
import AddGridTimeLabels from "../utils/AddGridTimeLabels";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";

import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "../styles/CalendarStyles.css";

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

  UseTimeSlotLabel(9, 20, 15);
  AddGridTimeLabels(9, 20, 15);

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: clients = [] }, { data: staff = [] }, { data: bookings = [] }] = await Promise.all([
        supabase.from("clients").select("*"),
        supabase.from("staff").select("*"),
        supabase.from("bookings").select("*"),
      ]);

      setClients(clients);
      setStylistList(
        staff.map((s) => ({
          id: s.id,
          title: s.name,
          weeklyHours: s.weekly_hours || {},
        }))
      );
      setEvents(
        bookings.map((b) => ({
          ...b,
          start: new Date(b.start),
          end: new Date(b.end),
        }))
      );
    };
    fetchData();
  }, []);

  const unavailableBlocks = useUnavailableTimeBlocks(stylistList, visibleDate);
  const salonClosedBlocks = UseSalonClosedBlocks(stylistList, visibleDate);

  const moveEvent = useCallback(async ({ event, start, end, resourceId }) => {
    const updated = { ...event, start, end, resourceId };
    await supabase.from("bookings").update({ start, end, resourceId }).eq("id", event.id);
    setEvents((prev) => prev.map((e) => (e.id === event.id ? updated : e)));
  }, []);

  const handleModalCancel = () => {
    setIsModalOpen(false);
    setSelectedSlot(null);
    setStep(1);
    setSelectedClient("");
  };

  const clientOptions = clients.map((c) => ({
    value: c.id,
    label: `${c.first_name} ${c.last_name} - ${c.mobile}`,
  }));

  const { currentUser } = useAuth();
  if (!currentUser) return <div className="p-4 text-center">Loading...</div>;

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
        onSelectSlot={(slot) => {
          setSelectedSlot(slot);
          setStep(1);
          setIsModalOpen(true);
        }}
        onSelectEvent={(e) => {
          if (e.isUnavailable || e.isSalonClosed) return;
          setSelectedBooking(e);
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
        eventPropGetter={(e) => {
          if (e.isUnavailable) return { className: "non-working-block" };
          if (e.isSalonClosed) return { className: "salon-closed-block" };
          return {};
        }}
        style={{ height: "90vh" }}
        components={{
          event: CustomCalendarEvent,
        }}
      />

      {/* View Booking Popup */}
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
          setSelectedClient(selectedBooking.clientId);
          setStep(1);
          setIsModalOpen(true);
          setSelectedBooking(null);
        }}
        onDeleteSuccess={(id) => {
          setEvents((prev) => prev.filter((e) => e.id !== id));
          setSelectedBooking(null);
        }}
        stylistList={stylistList}
        clients={clients}
      />

      {/* Step 1 - Select Client */}
      <Modal isOpen={isModalOpen && step === 1} onClose={handleModalCancel}>
        <h3 className="text-lg font-bold mb-4 text-bronze">Select Client</h3>
        <Select
          options={clientOptions}
          value={clientOptions.find((o) => o.value === selectedClient) || null}
          onChange={(selected) => setSelectedClient(selected?.value)}
          placeholder="-- Select Client --"
          className="react-select-container"
          classNamePrefix="react-select"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={handleModalCancel} className="text-gray-500">Cancel</button>
          <button
            onClick={() => setStep(2)}
            className="bg-bronze text-white px-4 py-2 rounded"
            disabled={!selectedClient}
          >
            Next
          </button>
        </div>
      </Modal>

      {/* Step 2 - Service Selection */}
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
            setStep(3);
          }}
        />
      )}

      {/* Step 3 - Review */}
      <Modal isOpen={step === 3} onClose={handleModalCancel}>
        {(() => {
          const client = clients.find((c) => c.id === selectedClient);
          return (
            <>
              <h3 className="text-lg font-bold mb-4 text-bronze">Review Booking</h3>
              <p>Client: {client ? `${client.first_name} ${client.last_name}` : "Unknown"}</p>
              <p>Phone: {client?.mobile || "N/A"}</p>
              <p>
                Time: {format(selectedSlot?.start, "dd/MM/yyyy HH:mm")} -{" "}
                {format(selectedSlot?.end, "HH:mm")}
              </p>
              <p>
                Stylist: {stylistList.find((s) => s.id === selectedSlot?.resourceId)?.title || "N/A"}
              </p>

              <div className="flex justify-between mt-4">
                <button onClick={() => setStep(2)} className="text-gray-500">Back</button>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    setSelectedSlot(null);
                    setSelectedClient("");
                    setStep(1);
                  }}
                  className="bg-green-600 text-white hover:bg-green-700 px-4 py-2 rounded"
                >
                  Confirm
                </button>
              </div>
            </>
          );
        })()}
      </Modal>
    </div>
  );
}
