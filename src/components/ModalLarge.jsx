// src/components/ModalLarge.jsx
import React from "react";

export default function ModalLarge({
  isOpen,
  onClose,
  hideCloseIcon = false,
  children,
  contentClassName = "",
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className={`modal-panel modal-panel--xl ${contentClassName}`}>
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
