// src/components/calendar/CustomCalendarEvent.jsx
import React from "react";

export default function CustomCalendarEvent({
  event,
  title,
  isAllDay,
  // strip non-DOM props so React stops warning
  continuesPrior: _a,
  continuesAfter: _b,
  slotStart: _c,
  slotEnd: _d,
  ...rest
}) {
  const isBlocked = event?.isUnavailable || event?.isSalonClosed;
  const isTask = !!event?.isTask;

  // ✅ booking tag code (NOS / REQ etc) – must be added onto the event in CalendarPage mapping
  const code = event?.booking_tag_code;

  // KEEP RBC’s computed positioning (top/height/left/width)
  const { className: rbcClassName, style: rbcStyle, ...domHandlers } = rest;

  // chain RBC's drag handlers so we can add our class without breaking DnD
  const handleDragStart = (e) => {
    domHandlers.onDragStart?.(e);
    // hide this event while dragging so only the ghost follows the cursor
    e.currentTarget.classList.add("hide-drag-source");
  };

  const handleDragEnd = (e) => {
    domHandlers.onDragEnd?.(e);
    e.currentTarget.classList.remove("hide-drag-source");
  };

  // ---------- BLOCKED / SALON CLOSED ----------
  if (isBlocked) {
    return (
      <div
        {...domHandlers}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className={`${rbcClassName ?? ""} rbc-event-content text-white text-center flex items-center justify-center h-full relative`}
        style={rbcStyle}
        title={
          event?.confirmed_via_reminder
            ? "Client confirmed via reminder"
            : undefined
        }
      >
        {/* ✅ Tag code badge */}
        {code ? (
          <div className="absolute top-1 right-1 text-[10px] font-bold bg-black/30 text-white px-1.5 py-0.5 rounded">
            {String(code).toUpperCase()}
          </div>
        ) : null}

        <span className="font-semibold">
          {event?.title ||
            (event?.isUnavailable ? "Unavailable" : "Salon Closed")}
        </span>
      </div>
    );
  }

  // ---------- NORMAL BOOKINGS / TASKS ----------
  const mins = (new Date(event?.end) - new Date(event?.start)) / 60000;
  const safeMins = Number.isFinite(mins) ? mins : 0;

  const fontSize = Math.min(18, Math.max(10, safeMins * 0.4));

  const durationLabel =
    safeMins >= 60
      ? `${Math.floor(safeMins / 60)}h ${
          safeMins % 60 ? `${safeMins % 60}m` : ""
        }`
      : `${Math.round(safeMins)}m`;

  const reminderConfirmed = !!event?.confirmed_via_reminder;
  const subtitle = isTask ? event?.description : event?.client_name;

  const footerText = isTask
    ? event?.resourceName || event?.stylistName || "Task"
    : event?.stylistName || "Stylist";

  // ---------- TASK ----------
  if (isTask) {
    return (
      <div
        {...domHandlers}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className={`${rbcClassName ?? ""} rbc-event-content text-white px-[4px] py-[2px] flex flex-col justify-between h-full leading-tight relative`}
        style={{
          ...rbcStyle,
          fontSize: `${fontSize}px`,
          lineHeight: "1.1",
          overflow: "hidden",
          whiteSpace: "normal",
          textOverflow: "ellipsis",
          border: event?.is_locked ? "2px solid #312e81" : "1px solid #4338ca",
        }}
        title={event?.title || "Scheduled task"}
      >
        {/* ✅ Tag code badge (rare for tasks, but harmless if present) */}
        {code ? (
          <div className="absolute top-1 right-1 text-[10px] font-bold bg-black/30 text-white px-1.5 py-0.5 rounded">
            {String(code).toUpperCase()}
          </div>
        ) : null}

        <div className="flex items-center justify-between text-[11px] font-semibold">
          <span className="flex items-center gap-1">
            {event?.is_locked ? "🔒" : "🔓"} Task
          </span>
          <span>{durationLabel}</span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center px-1">
          <span className="font-semibold break-words">
            {title || "Scheduled task"}
          </span>
          {event?.details && (
            <span className="text-[10px] break-words opacity-80">
              {event.details}
            </span>
          )}
        </div>

        <div className="text-center text-[10px]">
          {event?.stylistName || "Column"}
        </div>
      </div>
    );
  }

  // ---------- NORMAL BOOKING ----------
  return (
    <div
      {...domHandlers}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`${rbcClassName ?? ""} rbc-event-content text-white px-[2px] py-[1px] flex flex-col justify-between h-full leading-tight relative`}
      style={{
        ...rbcStyle, // keep RBC placement
        fontSize: `${fontSize}px`,
        lineHeight: "1.1",
        overflow: "hidden",
        whiteSpace: "normal",
        textOverflow: "ellipsis",
        borderLeft: reminderConfirmed ? "3px solid #14b8a6" : rbcStyle?.borderLeft,
      }}
      title={reminderConfirmed ? "Client confirmed via reminder" : undefined}
    >
      {/* ✅ Reminder tick */}
      {reminderConfirmed && (
        <div className="absolute left-[2px] top-[2px] text-[11px] leading-none text-teal-100 font-semibold">
          ✓
        </div>
      )}

      {/* ✅ Duration label */}
      <div className="absolute top-[2px] right-[4px] text-[10px] font-semibold">
        {durationLabel}
      </div>

      {/* ✅ Tag code badge (NOS / REQ) */}
      {code ? (
        <div className="absolute top-[16px] right-[4px] text-[10px] font-bold bg-black/30 text-white px-1.5 py-0.5 rounded">
          {String(code).toUpperCase()}
        </div>
      ) : null}

      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <span className="font-semibold break-words">{title}</span>
        {subtitle && <span className="italic break-words">{subtitle}</span>}
      </div>

      <div className="text-center text-[10px]">{footerText}</div>
    </div>
  );
}
