// src/components/calendar/CustomCalendarEvent.jsx
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
  const isBlocked = event.isUnavailable || event.isSalonClosed;

  // KEEP RBC’s computed positioning (top/height/left/width)
  const { className: rbcClassName, style: rbcStyle, ...domHandlers } = rest;

  if (isBlocked) {
    return (
      <div
        className={`${rbcClassName ?? ""} rbc-event-content text-white text-center flex items-center justify-center h-full`}
        style={rbcStyle}
        {...domHandlers}
      >
        <span className="font-semibold">
          {event.title || (event.isUnavailable ? "Unavailable" : "Salon Closed")}
        </span>
      </div>
    );
  }

  const mins = (new Date(event.end) - new Date(event.start)) / 60000;
  const fontSize = Math.min(18, Math.max(10, mins * 0.4));
  const durationLabel =
    mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60 ? `${mins % 60}m` : ""}` : `${Math.round(mins)}m`;

  return (
    <div
      className={`${rbcClassName ?? ""} rbc-event-content text-white px-[2px] py-[1px] flex flex-col justify-between h-full leading-tight relative`}
      style={{
        ...rbcStyle,               // << don’t overwrite placement
        fontSize: `${fontSize}px`,
        lineHeight: "1.1",
        overflow: "hidden",
        whiteSpace: "normal",
        textOverflow: "ellipsis",
      }}
      {...domHandlers}            // drag/resize/click
    >
      <div className="absolute top-[2px] right-[4px] text-[10px] font-semibold">{durationLabel}</div>
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <span className="font-semibold break-words">{title}</span>
        {event.client_name && <span className="italic break-words">{event.client_name}</span>}
      </div>
      <div className="text-center text-[10px]">{event.stylistName || "Stylist"}</div>
    </div>
  );
}
