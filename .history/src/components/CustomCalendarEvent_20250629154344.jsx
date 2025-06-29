export default function CustomCalendarEvent({ event }) {
  const isBlocked = event.isUnavailable || event.isSalonClosed;

  if (isBlocked) {
    return (
      <div className="rbc-event-content text-white text-center flex items-center justify-center h-full">
        <span className="font-semibold">
          {event.title || (event.isUnavailable ? "Unavailable" : "Salon Closed")}
        </span>
      </div>
    );
  }

  const duration =
    event.duration ||
    (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000;

  const fontSize =
    duration <= 5 ? "9px" : duration <= 10 ? "10px" : "11px";

  const durationLabel =
    duration >= 60
      ? `${Math.floor(duration / 60)}h ${duration % 60 > 0 ? `${duration % 60}m` : ""}`
      : `${Math.round(duration)}m`;

  return (
    <div
      className="rbc-event-content text-white px-[2px] py-[1px] flex flex-col justify-between h-full leading-tight"
      style={{
        fontSize,
        lineHeight: "1.1",
        overflow: "hidden",
        whiteSpace: "normal",
        textOverflow: "ellipsis",
      }}
    >
      {/* Top Row: Duration */}
      <div className="flex justify-between">
        <div></div>
        <div className="text-[10px] text-right">{durationLabel}</div>
      </div>

      {/* Center: Service and Client */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <span className="font-semibold break-words">{event.title}</span>
        {event.client_name && (
          <span className="italic break-words">{event.client_name}</span>
        )}
      </div>

      {/* Bottom: Stylist Name */}
      <div className="text-[10px] text-center">
        {event.stylistName || "Stylist"}
      </div>
    </div>
  );
}
