export default function ActionsPopover({
  open,
  onClose,
  onEdit,
  onCancelBooking
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-4 w-full max-w-xs shadow-md space-y-2">
        <button className="block w-full text-left hover:bg-gray-100 p-2 rounded">No show</button>
        <button className="block w-full text-left hover:bg-gray-100 p-2 rounded">
          Awaiting review
        </button>
        <button className="block w-full text-left hover:bg-gray-100 p-2 rounded">Rebook</button>
        <button onClick={onEdit} className="block w-full text-left hover:bg-gray-100 p-2 rounded">
          Edit
        </button>
        <button
          onClick={onCancelBooking}
          className="block w-full text-left text-red-600 hover:bg-red-100 p-2 rounded"
        >
          Cancel
        </button>
        <button
          onClick={onClose}
          className="mt-2 w-full bg-gray-200 text-gray-700 py-1 rounded"
        >
          Close
        </button>
      </div>
    </div>
  );
}
