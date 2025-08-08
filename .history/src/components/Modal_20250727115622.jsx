export default function Modal({ isOpen, onClose, children, title, className = "", hideCloseIcon = false }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className={`relative bg-white rounded shadow-lg w-full max-w-lg ${className}`}>
        {!hideCloseIcon && (
          <button
            onClick={onClose}
            className="absolute top-2 right-2 text-gray-500 hover:text-black"
          >
            ❌
          </button>
        )}
        {title && <div className="px-4 pt-4 pb-2 text-lg font-bold">{title}</div>}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
