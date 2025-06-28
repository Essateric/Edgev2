// components/RightDrawer.jsx
import React from "react";

export default function RightDrawer({ isOpen, onClose, children }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-40"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="relative bg-white w-full sm:w-[550px] h-full shadow-xl overflow-y-auto z-50">
        {/* Optional close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-600 hover:text-bronze"
        >
          ✕
        </button>

        

        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
