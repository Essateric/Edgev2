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

  const durationMinutes =
    (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000;

  const baseFontSize = 10;
  const fontSize = Math.min(18, Math.max(baseFontSize, durationMinutes * 0.4));

  const durationLabel =
    durationMinutes >= 60
      ? `${Math.floor(durationMinutes / 60)}h ${
          durationMinutes % 60 > 0 ? `${durationMinutes % 60}m` : ""
        }`
      : `${Math.round(durationMinutes)}m`;

  return (
    <div className="flex h-full w-full rounded overflow-hidden group cursor-pointer">
      {/* 🟤 Left = Drag area */}
      <div
        className="w-[20%] bg-bronze h-full cursor-move rounded-l"
        title="Drag to move"
        style={{ borderRight: "1px solid white" }}
      />

      {/* ⚪️ Right = Display + Resize area */}
      <div
        className="w-[80%] bg-white text-black px-[2px] py-[1px] flex flex-col justify-between h-full relative rounded-r leading-tight"
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: "1.1",
          overflow: "hidden",
          whiteSpace: "normal",
          textOverflow: "ellipsis",
        }}
      >
        {/* ⏱ Duration (top-right) */}
        <div className="absolute top-[2px] right-[4px] text-[10px] font-semibold text-gray-500">
          {durationLabel}
        </div>

        {/* 🔥 Service and Client */}
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <span className="font-semibold break-words">{event.title}</span>
          {event.client_name && (
            <span className="italic break-words">{event.client_name}</span>
          )}
        </div>

        {/* 💇 Stylist */}
        <div className="text-center text-[10px] text-gray-600">
          {event.stylistName || "Stylist"}
        </div>
      </div>
    </div>
  );
}
