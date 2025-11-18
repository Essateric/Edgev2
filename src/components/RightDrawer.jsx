export default function RightDrawer({
  isOpen,
  onClose,
  children,
  widthClass = "w-[50%]", // default fallback
}) {
  return (
    <div
      className={`fixed top-0 right-0 h-full bg-white shadow-lg z-30 transition-transform transform ${
        isOpen ? "translate-x-0" : "translate-x-full"
      } ${widthClass} overflow-y-auto`}
    >
      <div className="flex justify-between items-center p-4 border-b">
        <h1 className="text-lg font-semibold text-bronze">
          {/* Booking for: {children?.props?.clientName || "Unknown Client"} */}
          Service Selection
        </h1>
        <button onClick={onClose} className="text-gray-600 hover:text-black">
          ✕
        </button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
