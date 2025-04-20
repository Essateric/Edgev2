// src/components/PinPad.jsx
import React from "react";
import logo from "../assets/EdgeLogo.png"; 

export default function PinPad({ onChange, value = "", onEnter }) {
  const handlePress = (digit) => {
    if (value.length < 4) {
      onChange(value + digit);
    }
  };

  const handleDelete = () => {
    onChange(value.slice(0, -1));
  };

  const handleEnter = () => {
    if (value.length === 4) {
      onEnter?.();
    }
  };

  const renderButton = (label, onClick, extraClass = "") => (
    <button
      key={label}
      onClick={onClick}
      className={`w-20 h-16 text-white font-bold rounded-lg shadow-xl transition transform active:scale-95
        ${extraClass} hover:brightness-125 active:shadow-[0_0_15px_white] border border-white`}
    >
      {label}
    </button>
  );

  return (
    <div
    className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-black via-zinc-900 to-[#cd7f32] relative"
  > 
      {/* Dimmed Overlay */}
      <div className="absolute inset-0 bg-black bg-opacity-60 z-0" />

      {/* Logo */}
      <img
        src={logo}
        alt="The Edge HD Salon Logo"
        className="w-40 z-10 mb-8 animate-pulse"
      />

      {/* Pin Pad Container */}
      <div className="z-10 bg-black bg-opacity-60 p-6 rounded-xl shadow-2xl border border-bronze backdrop-blur-md">
        {/* PIN Dots */}
        <div className="flex justify-center space-x-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`w-6 h-6 rounded-full border-2 duration-150 ${
                i < value.length
                  ? "bg-bronze border-white"
                  : "bg-white border-bronze"
              }`}
            />
          ))}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) =>
            renderButton(num, () => handlePress(String(num)), "bg-bronze")
          )}
          {renderButton("Del", handleDelete, "bg-orange-500")}
          {renderButton("0", () => handlePress("0"), "bg-bronze")}
          {renderButton("Enter", handleEnter, "bg-green-600")}
        </div>
      </div>
    </div>
  );
}
