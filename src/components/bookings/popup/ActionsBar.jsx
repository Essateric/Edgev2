// ActionsBar.jsx
export default function ActionsBar({
  onOpenRepeat,
  onCancelBooking,
  onArrived,
  onReschedule,
  onEdit,
  onClose,
  arrivedDisabled = false,
  arrivedLabel = "Arrived",
}) {
  return (
    <div className="mt-4 p-2 flex flex-wrap gap-2 items-center border-t">
      <button
        type="button"
        onClick={onOpenRepeat}
        className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded"
      >
        Repeat bookings
      </button>
      <button
        type="button"
        onClick={onCancelBooking}
        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
      >
        Cancel booking
      </button>
       <button
        type="button"
        onClick={onArrived}
        disabled={!onArrived || arrivedDisabled}
        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {arrivedLabel}
      </button>
      <button
        type="button"
        onClick={onReschedule}
        disabled={!onReschedule}
        className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded disabled:opacity-60 disabled:cursor-not-allowed"
      >
        Reschedule
      </button>
      <button
        type="button"
        onClick={onEdit}
        disabled={!onEdit}
        className="bg-bronze hover:bg-bronze/90 text-white px-3 py-1 rounded disabled:opacity-60 disabled:cursor-not-allowed"
      >
        Edit
      </button>

      <button
        type="button"
        onClick={onClose}
        className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded"
      >
        Close
      </button>
    </div>
  );
}
