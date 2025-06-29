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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-zinc-900 to-[#cd7f32]">
      <div className="relative bg-neutral-100 border border-gray-400 rounded-xl shadow-2xl 
        w-[90vw] max-w-[450px] h-[520px] flex flex-col items-center justify-between p-6">
        {/* Overlay */}
        <div className="absolute inset-0 bg-black bg-opacity-60 rounded-xl z-0" />

        {/* Content */}
        <div className="relative z-10 flex flex-col w-full h-full justify-between">
          {/* Logo */}
          <div className="flex flex-col items-center">
            <img src={logo} alt="The Edge HD Salon Logo" className="w-20 mb-2" />
            <h1 className="text-center text-lg font-semibold text-white">PIN Login</h1>
            <p className="text-center text-xs text-gray-300 mb-2">Enter your 4-digit staff PIN</p>
          </div>

          {/* PIN Dots */}
          <div className="flex justify-center space-x-4 mb-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border-2 ${
                  i < value.length
                    ? "bg-bronze border-white"
                    : "bg-white border-bronze"
                }`}
              />
            ))}
          </div>

          {/* Keypad */}
          <div className="bg-black bg-opacity-50 rounded-xl border border-gray-500 backdrop-blur-md w-full">
            <div className="grid grid-cols-3 gap-3 p-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) =>
                renderButton(num, () => handlePress(String(num)), "bg-bronze")
              )}
              {renderButton("Clear", handleClear, "bg-orange-500 text-sm")}
              {renderButton("0", () => handlePress("0"), "bg-bronze")}
              {renderButton("Enter", handleEnter, "bg-green-600 text-sm")}
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col items-center gap-1 text-[10px] text-gray-300 mt-2">
            <p className="underline cursor-pointer">Forgot PIN?</p>
            <p className="underline cursor-pointer">Switch to Email Login</p>
            <p className="mt-1">© 2025 Essateric Solutions</p>
          </div>
        </div>
      </div>
    </div>
  );
}
