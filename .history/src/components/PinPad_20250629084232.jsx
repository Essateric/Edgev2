import React, { useEffect } from "react";
import logo from "../assets/EdgeLogo.png";

export default function PinPad({ onChange, value = "", onEnter, disabled }) {
  useEffect(() => {
    if (disabled) return;
    const handleKeyDown = (e) => {
      if (e.key >= "0" && e.key <= "9" && value.length < 4) {
        onChange(value + e.key);
      }
      if (e.key === "Enter" && value.length === 4) {
        onEnter?.();
      }
      if (e.key === "Backspace") {
        onChange("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [value, onChange, onEnter, disabled]);

  const handlePress = (digit) => {
    if (!disabled && value.length < 4) onChange(value + digit);
  };
  const handleClear = () => !disabled && onChange("");
  const handleEnter = () => {
    if (!disabled && value.length === 4) onEnter?.();
  };

  const renderButton = (label, onClick, extraClass = "") => (
    <button
      key={label}
      onClick={onClick}
      disabled={disabled}
      className={`w-full aspect-square text-white font-bold rounded-lg shadow-xl transition transform active:scale-95
        ${extraClass} hover:brightness-125 active:shadow-[0_0_15px_white] border border-white`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-black via-zinc-900 to-[#cd7f32] relative">
      <div className="absolute inset-0 bg-black bg-opacity-60 z-0" />

      <img
        src={logo}
        alt="The Edge HD Salon Logo"
        className="w-40 z-10 mb-8 animate-pulse"
      />

      {/* ✅ PIN PAD CONTAINER */}
      <div
        className="z-10 bg-black bg-opacity-60 rounded-xl shadow-2xl border border-gray-400 backdrop-blur-md
        w-[400px] h-[400px] flex flex-col justify-between p-6"
      >
        {/* PIN DOTS */}
        <div className="flex justify-center space-x-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`w-5 h-5 rounded-full border-2 duration-150 ${
                i < value.length
                  ? "bg-bronze border-white"
                  : "bg-white border-bronze"
              }`}
            />
          ))}
        </div>

        {/* KEYPAD */}
        <div className="flex-1 flex items-center justify-center">
          <div className="grid grid-cols-3 gap-4 w-full">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) =>
              renderButton(num, () => handlePress(String(num)), "bg-bronze")
            )}
            {renderButton("Clear", handleClear, "bg-orange-500")}
            {renderButton("0", () => handlePress("0"), "bg-bronze")}
            {renderButton("Enter", handleEnter, "bg-green-600")}
          </div>
        </div>
      </div>
    </div>
  );
}
