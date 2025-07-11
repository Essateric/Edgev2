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
    <div className="flex h-full w-full rounded overflow-hidden group relative">
      {/* 🟤 Drag handle (left strip, absolute for layering) */}
      <div
        className="absolute top-0 left-0 h-full w-[16%] bg-bronze cursor-move z-20 rounded-l"
        title="Drag to move"
      />

      {/* 🔲 Main content (behind drag handle) */}
      <div
        className="w-full h-full bg-bronze text-white px-[4px] py-[2px] flex flex-col justify-between leading-tight rounded"
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: "1.1",
          overflow: "hidden",
          whiteSpace: "normal",
          textOverflow: "ellipsis",
        }}
      >
        {/* ⏱ Duration (top-right) */}
        <div className="absolute top-[2px] right-[6px] text-[10px] font-semibold">
          {durationLabel}
        </div>

        {/* 🔥 Title + Client */}
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <span className="font-semibold break-words">{event.title}</span>
          {event.client_name && (
            <span className="italic break-words">{event.client_name}</span>
          )}
        </div>

        {/* 👤 Stylist */}
        <div className="text-center text-[10px]">
          {event.stylistName || "Stylist"}
        </div>
      </div>
    </div>
  );
}
