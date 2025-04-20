const EventWithClientName = ({ event }) => {
    return (
      <div className="w-full h-full flex flex-col justify-center  items-center px-1 text-white text-center leading-tight overflow-hidden">
        <div className="w-full font-semibold italic break-words text-[clamp(10px,1.8vh,14px)]">
          {event.title}
        </div>
        {event.clientName && (
          <div className="w-full italic text-gray-100 break-words text-[clamp(9px,1.4vh,13px)]">
            {event.clientName}
          </div>
        )}
      </div>
    );
  };
  