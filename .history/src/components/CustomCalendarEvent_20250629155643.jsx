export default function CustomCalendarEvent({ event }) {
  const duration =
    (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000;

  const displayDuration = `${Math.round(duration)}m`;

  const fontSize =
    duration <= 15 ? "9px" :
    duration <= 30 ? "10px" :
    duration <= 60 ? "11px" : "12px";

  // Get stylist name if it's passed in event (optional)
  const stylistName = event.stylist || event.resourceTitle || "";

  return (
    <div
      className="relative w-full h-full text-white px-1 py-[2px] flex flex-col justify-between leading-tight"
      style={{
        fontSize,
        lineHeight: "1.1",
        overflow: "hidden",
        whiteSpace: "normal",
        textOverflow: "ellipsis",
      }}
    >
      {/* 🔸 Duration Top Right */}
      <div className="absolute top-[2px] right-[4px] text-[10px] font-semibold">
        {displayDuration}
      </div>

      {/* 🔸 Center Content */}
      <div className="flex flex-col justify-center items-center flex-1 text-center">
        <div className="font-semibold break-words">{event.title}</div>
        {event.clientName && (
          <div className="italic text-[90%] break-words">{event.clientName}</div>
        )}
      </div>

      {/* 🔸 Stylist Bottom */}
      {stylistName && (
        <div className="text-[10px] text-center mt-[2px]">{stylistName}</div>
      )}
    </div>
  );
}
