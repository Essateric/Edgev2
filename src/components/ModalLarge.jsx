// src/components/ModalLarge.jsx
import React from "react";

export default function ModalLarge({
  isOpen,
  onClose,
  hideCloseIcon = false,
  children,
  zIndex = 50,
  contentClassName = "",
}) {
  if (!isOpen) return null;

  return (
     <div
      className="fixed inset-0 flex items-center justify-center bg-black/40"
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
    >
      <div className={`relative modal-panel modal-panel--xl ${contentClassName}`}>
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
  );
}
