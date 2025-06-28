// CalendarPage.jsx
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

  UseTimeSlotLabel(9, 20, 15);
  AddGridTimeLabels(9, 20, 15);

  const { currentUser } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: clients }, { data: stylists }, { data: bookings }] =
        await Promise.all([
          supabase.from("clients").select("*"),
          supabase.from("staff").select("*"),
          supabase.from("bookings").select("*"),
        ]);

      setClients(clients || []);
      setStylistList(
        (stylists || []).map((s) => ({
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

  const unavailableBlocks = useUnavailableTimeBlocks(stylistList, visibleDate);
  const salonClosedBlocks = UseSalonClosedBlocks(stylistList, visibleDate);

  const moveEvent = useCallback(async ({ event, start, end, resourceId }) => {
    const updated = { ...event, start, end, resourceId };

    await supabase
      .from("bookings")
      .update({ start, end, resourceId })
      .eq("id", event.id);

    setEvents((prev) =>
      prev.map((e) => (e.id === event.id ? updated : e))
    );
  }, []);

  const handleCancel = () => {
    setIsModalOpen(false);
    setStep(1);
    setSelectedClient("");
    setSelectedSlot(null);
  };

  const clientOptions = clients.map((client) => ({
    value: client.id,
    label: `${client.first_name} ${client.last_name} - ${client.mobile}`,
  }));

  const customFormats = {
    dayHeaderFormat: (date) => format(date, "eeee do MMMM", { locale: enGB }),
    slotLabelFormat: (date) => format(date, "HH:mm"),
  };

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
        formats={customFormats}
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
        showNowIndicator
        selectable
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
              className: "non-working-block",
            };
          }
          if (event.isSalonClosed) {
            return {
              style: {
                backgroundColor: "#333333",
                opacity: 0.7,
                zIndex: 1,
              },
              className: "salon-closed-block",
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

      {/* Step 1 - Select Client Modal */}
      <Modal isOpen={isModalOpen && step === 1} onClose={handleCancel}>
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
          <button onClick={handleCancel} className="text-gray-500">
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

      {/* Step 2 - Service Selection in Right Drawer */}
      <RightDrawer isOpen={isModalOpen && step === 2} onClose={handleCancel}>
        <NewBooking
          stylistName={
            stylistList.find((s) => s.id === selectedSlot?.resourceId)?.title
          }
          stylistId={selectedSlot?.resourceId}
          selectedSlot={selectedSlot}
          clients={clients}
          selectedClient={selectedClient}
          onBack={() => setStep(1)}
          onCancel={handleCancel}
          onConfirm={(newEvents) => {
            setEvents((prev) => [...prev, ...newEvents]);
            setStep(3);
          }}
        />
      </RightDrawer>

      {/* Step 3 - Review Details Modal */}
      <Modal isOpen={isModalOpen && step === 3} onClose={handleCancel}>
        {(() => {
          const client = clients.find((c) => c.id === selectedClient);
          const stylist = stylistList.find((s) => s.id === selectedSlot?.resourceId);
          return (
            <>
              <h3 className="text-lg font-bold mb-4 text-bronze">Review Details</h3>
              <p className="text-sm text-gray-700 mb-1">
                Client: {client ? `${client.first_name} ${client.last_name}` : "N/A"}
              </p>
              <p className="text-sm text-gray-700 mb-1">
                Phone: {client?.mobile || "N/A"}
              </p>
              <p className="text-sm text-gray-700 mb-1">
                Time: {format(selectedSlot?.start, "dd/MM/yyyy HH:mm")} –{" "}
                {format(selectedSlot?.end, "HH:mm")}
              </p>
              <p className="text-sm text-gray-700 mb-3">
                Stylist: {stylist?.title || "N/A"}
              </p>
              <div className="flex justify-between mt-4">
                <button
                  onClick={() => setStep(2)}
                  className="text-gray-500"
                >
                  Back
                </button>
                <button
                  onClick={handleCancel}
                  className="bg-green-600 text-white px-4 py-2 rounded"
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
