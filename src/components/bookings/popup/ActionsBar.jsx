// ActionsBar.jsx
export default function ActionsBar({
  onOpenRepeat,
  onEditBooking,
  onCancelBooking,
  onClose,
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
        onClick={onClose}
        className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded"
      >
        Close
      </button>
    </div>
  );
}
