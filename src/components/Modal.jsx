import React from "react";

export default function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 relative max-w-md w-full mx-4">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-black hover:text-bronze"
        >
          ✖
        </button>
        {children}
      </div>
    </div>
  );
}
