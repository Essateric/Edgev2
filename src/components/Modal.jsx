import React, { useEffect } from "react";
import { createPortal } from "react-dom";

export default function Modal({
  isOpen,
  onClose,
  children,
  title,
  className = "",
  hideCloseIcon = false,
  zIndex = 1000,
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
      role="dialog"
      aria-modal="true"
      style={{ zIndex }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Center */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className={`relative bg-white text-gray-800 rounded shadow-lg w-full max-w-[440px] overflow-visible ${className}`}
          onClick={(e) => e.stopPropagation()}
        >
          {!hideCloseIcon && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-2 right-2 text-gray-500 hover:text-black"
              aria-label="Close"
            >
              ❌
            </button>
          )}

          {title && (
            <div className="px-4 pt-4 pb-2 text-lg font-bold">{title}</div>
          )}

          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>,
    document.body
  );
}
