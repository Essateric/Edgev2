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
import RightDrawer from "../components/RightDrawer";
import NewBooking from "../components/NewBooking";
import BookingPopUp from "../components/BookingPopUp";
import CustomCalendarEvent from "../components/CustomCalendarEvent";
import Select from "react-select";
import useUnavailableTimeBlocks from "../components/UnavailableTimeBlocks";
import UseSalonClosedBlocks from "../components/UseSalonClosedBlocks";
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
      const { data: clientsData } = await supabase.from("clients").select("*");
      const { data: staffData } = await supabase.from("staff").select("*");
      const { data: bookingsData } = await supabase.from("bookings").select("*");

      setClients(clientsData || []);
      setStylistList(
        (staffData || []).map((s) => ({
          id: s.id,
          title: s.name,
          weeklyHours: s.weekly_hours || {},
        }))
      );
      setEvents(
        (bookingsData || []).map((b) => ({
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
    try {
      await supabase
        .from("bookings")
        .update({ start, end, resourceId })
        .eq("id", event.id);
      setEvents((prev) =>
        prev.map((e) => (e.id === event.id ? updated : e))
      );
    } catch (error) {
      console.error("Failed to move booking:", error);
    }
  }, []);

  const handleModalCancel = () => {
    setIsModalOpen(false);
    setSelectedSlot(null);
    setSelectedClient("");
    setStep(1);
  };

  const { currentUser } = useAuth();
  if (!currentUser) return <div>Loading...</div>;

  const clientOptions = clients.map((c) => ({
    value: c.id,
    label: `${c.first_name} ${c.last_name} - ${c.mobile}`,
  }));

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold metallic-text mb-4">
        The Edge HD Salon
      </h1>
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
        onSelectSlot={(slot) => {
          setSelectedSlot(slot);
          setIsModalOpen(true);
          setStep(1);
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
                border: "none",
              },
            };
          }
          if (event.isSalonClosed) {
            return {
              style: {
                backgroundColor: "#333333",
                opacity: 0.7,
                border: "none",
              },
            };
          }
          return { style: { zIndex: 2 } };
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
          setSelectedClient(selectedBooking.clientId);
          setIsModalOpen(true);
          setStep(1);
          setSelectedBooking(null);
        }}
        onDeleteSuccess={(deletedId) => {
          setEvents((prev) => prev.filter((e) => e.id !== deletedId));
          setSelectedBooking(null);
        }}
        stylistList={stylistList}
        clients={clients}
      />

      <Modal isOpen={isModalOpen} onClose={handleModalCancel}>
        {step === 1 && (
          <div>
            <h3 className="text-lg font-bold mb-4 text-bronze">
              Select Client
            </h3>
            <Select
              options={clientOptions}
              value={
                clientOptions.find((opt) => opt.value === selectedClient) ||
                null
              }
              onChange={(selected) => setSelectedClient(selected?.value)}
              placeholder="-- Select Client --"
              styles={{
                control: (base) => ({
                  ...base,
                  backgroundColor: "white",
                  color: "black",
                }),
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
              <button
                onClick={handleModalCancel}
                className="text-gray-500"
              >
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
          </div>
        )}
      </Modal>

<RightDrawer isOpen={step === 2} onClose={handleModalCancel}>
  <NewBooking
    stylistName={stylistList.find(s => s.id === selectedSlot?.resourceId)?.title}
    stylistId={selectedSlot?.resourceId}
    selectedSlot={selectedSlot}
    clients={clients}
    selectedClient={selectedClient}
    onBack={() => setStep(1)}
    onCancel={handleModalCancel}
    onConfirm={(newEvents) => {
      setEvents(prev => [...prev, ...newEvents]);
      setStep(3);
    }}
  />
</RightDrawer>


      {step === 3 && (
        <Modal isOpen={true} onClose={handleModalCancel}>
          <h3 className="text-lg font-bold mb-4 text-bronze">
            Review Details
          </h3>
          {(() => {
            const clientObj = clients.find((c) => c.id === selectedClient);
            const stylist = stylistList.find(
              (s) => s.id === selectedSlot?.resourceId
            );
            return (
              <>
                <p className="text-sm text-gray-700 mb-1">
                  Client: {clientObj?.first_name} {clientObj?.last_name}
                </p>
                <p className="text-sm text-gray-700 mb-1">
                  Phone: {clientObj?.mobile}
                </p>
                <p className="text-sm text-gray-700 mb-1">
                  Time: {format(selectedSlot?.start, "dd/MM/yyyy HH:mm")} -{" "}
                  {format(selectedSlot?.end, "HH:mm")}
                </p>
                <p className="text-sm text-gray-700 mb-3">
                  Stylist: {stylist?.title}
                </p>
              </>
            );
          })()}

          <div className="flex justify-between mt-4">
            <button
              onClick={() => setStep(2)}
              className="text-gray-500"
            >
              Back
            </button>
            <button
              onClick={handleModalCancel}
              className="bg-green-600 text-white px-4 py-2 rounded"
            >
              Confirm
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
