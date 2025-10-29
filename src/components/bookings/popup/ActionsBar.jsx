export default function ActionsBar({
  onOpenRepeat,
  onOpenActions,
  onClose
}) {
  return (
    <div className="mt-4 p-2 flex flex-wrap gap-2 items-center border-t">
      <span className="text-sm text-green-700 font-semibold">Confirmed</span>

      <button className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded">
        Arrived
      </button>
      <button className="bg-gray-500 text-white px-3 py-1 rounded">
        Checkout
      </button>

      <button
        onClick={onOpenRepeat}
        className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded"
      >
        Repeat bookings
      </button>

      <button
        onClick={onOpenActions}
        className="bg-gray-200 text-gray-800 px-3 py-1 rounded"
      >
        &#x2022;&#x2022;&#x2022;
      </button>
      <button
        onClick={onClose}
        className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded"
      >
        Close
      </button>
    </div>
  );
}
