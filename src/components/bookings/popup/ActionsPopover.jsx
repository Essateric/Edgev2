import React, { useEffect } from "react";
import { createPortal } from "react-dom";

export default function ActionsPopover({
  open,
  onClose,
  onEdit,
  onCancelBooking,
  zIndex = 3000,
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex }}>
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* panel */}
      <div className="absolute inset-0 flex items-end sm:items-center justify-center p-4">
        <div
          className="w-full max-w-sm bg-white text-gray-800 rounded-xl shadow-xl border overflow-visible"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-3 border-b font-semibold">Actions</div>

          <div className="p-3 flex flex-col gap-2">
            <button
              type="button"
              className="w-full bg-bronze text-white px-3 py-2 rounded hover:bg-bronze/90"
              onClick={() => {
                onEdit?.();
                onClose?.();
              }}
            >
              Edit booking
            </button>

            <button
              type="button"
              className="w-full bg-red-600 text-white px-3 py-2 rounded hover:bg-red-700"
              onClick={async () => {
                await onCancelBooking?.();
                onClose?.();
              }}
            >
              Cancel booking
            </button>

            <button
              type="button"
              className="w-full bg-gray-200 text-gray-800 px-3 py-2 rounded hover:bg-gray-300"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
