export default function CustomCalendarEvent({ event, title, ...props }) {
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

  const durationMinutes =
    (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000;

  const fontSize = Math.min(18, Math.max(10, durationMinutes * 0.4));
  const durationLabel =
    durationMinutes >= 60
      ? `${Math.floor(durationMinutes / 60)}h ${
          durationMinutes % 60 > 0 ? `${durationMinutes % 60}m` : ""
        }`
      : `${Math.round(durationMinutes)}m`;

  return (
    <div
      className="rbc-event-content relative text-white px-[2px] py-[1px] flex flex-col justify-between h-full leading-tight"
      style={{
        fontSize: `${fontSize}px`,
        lineHeight: "1.1",
        overflow: "hidden",
        whiteSpace: "normal",
        textOverflow: "ellipsis",
        position: "relative",
      }}
      {...props} // Required for drag + resize functionality
    >
      {/* Duration top-right */}
      <div className="absolute top-[2px] right-[4px] text-[10px] font-semibold">
        {durationLabel}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <span className="font-semibold break-words">{title}</span>
        {event.client_name && (
          <span className="italic break-words">{event.client_name}</span>
        )}
      </div>

      {/* Stylist name */}
      <div className="text-center text-[10px]">
        {event.stylistName || "Stylist"}
      </div>

      {/* Custom resize handle bottom-right */}
      <div
        className="absolute bottom-[2px] right-[2px] w-[12px] h-[12px] cursor-ns-resize z-10"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.7)",
          borderRadius: "2px",
        }}
      />
    </div>
  );
}
