import React from "react";

export default function Button({ children, onClick, type = "button", className = "" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`bg-bronze text-white py-2 px-4 rounded hover:opacity-90 ${className}`}
    >
      {children}
    </button>
  );
}
