import React, { useEffect } from "react";
import { createPortal } from "react-dom";

export default function ModalLarge({
  isOpen,
  onClose,
  hideCloseIcon = false,
  children,
  zIndex = 1200,
  contentClassName = "",
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0"
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className={`relative modal-panel modal-panel--xl overflow-visible ${contentClassName}`}
          onClick={(e) => e.stopPropagation()}
        >
          {!hideCloseIcon && (
            <button
              type="button"
              className="modal-close"
              aria-label="Close"
              onClick={onClose}
            >
              ×
            </button>
          )}
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
