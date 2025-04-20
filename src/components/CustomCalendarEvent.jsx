export default function CustomCalendarEvent({ event }) {
  const duration =
    (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000;

  // Dynamically scale font
  const fontSize =
    duration <= 5 ? "9px" : duration <= 10 ? "10px" : "11px";

  return (
    <div
      className="rbc-event-content text-white text-center px-[2px] py-[1px] flex flex-col justify-center h-full leading-tight"
      style={{
        fontSize,
        lineHeight: "1.1",
        overflow: "hidden",
        whiteSpace: "normal", // ✅ allow wrapping
        textOverflow: "ellipsis",
        display: "flex",
      }}
    >
      <span className="font-semibold break-words">{event.title}</span>
      {event.clientName && (
        <span className="italic break-words">{event.clientName}</span>
      )}
    </div>
  );
}
