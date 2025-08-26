export default function Modal({
  isOpen,
  onClose,
  children,
  title,
  className = "",
  hideCloseIcon = false,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="min-h-full flex items-center justify-center p-4">
        {/* ⬇️ add text-gray-800 here */}
        <div className={`relative bg-white text-gray-800 rounded shadow-lg w-full max-w-[440px] ${className}`}>
          {!hideCloseIcon && (
            <button
              onClick={onClose}
              className="absolute top-2 right-2 text-gray-500 hover:text-black"
              aria-label="Close"
            >
              ❌
            </button>
          )}
          {title && <div className="px-4 pt-4 pb-2 text-lg font-bold">{title}</div>}
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
