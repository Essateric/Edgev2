// src/components/PinPad.jsx
import React, { useEffect } from "react";
import logo from "../assets/EdgeLogo.png";
import { tryOfflineLogin } from '../utils/offlineLogin';

export default function PinPad({ onChange, value = "", onEnter }) {

  const handleLogin = async () => {
  const isOffline = !navigator.onLine;

  if (isOffline) {
    const result = await tryOfflineLogin(enteredPin);
    if (result.success) {
      // set your local auth context/session
      // e.g. loginUser(result.user)
    } else {
      // show error toast or message
    }
  } else {
    // use Supabase login logic
  }
};

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key >= "0" && e.key <= "9" && value.length < 4) {
        onChange(value + e.key);
      }
      if (e.key === "Enter" && value.length === 4) {
        onEnter?.();
      }
      if (e.key === "Backspace") {
        onChange(""); // Clear all
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [value, onChange, onEnter]);

  const handlePress = (digit) => {
    if (value.length < 4) {
      onChange(value + digit);
    }
  };

  const handleClear = () => {
    onChange(""); // Clear all
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
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-black via-zinc-900 to-[#cd7f32] relative">
      <div className="absolute inset-0 bg-black bg-opacity-60 z-0" />

      <img
        src={logo}
        alt="The Edge HD Salon Logo"
        className="w-40 z-10 mb-8 animate-pulse"
      />

      <div className="z-10 bg-black bg-opacity-60 p-6 rounded-xl shadow-2xl border border-bronze backdrop-blur-md">
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

        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) =>
            renderButton(num, () => handlePress(String(num)), "bg-bronze")
          )}
          {renderButton("Clear", handleClear, "bg-orange-500")}
          {renderButton("0", () => handlePress("0"), "bg-bronze")}
          {renderButton("Enter", handleEnter, "bg-green-600")}
        </div>
      </div>
    </div>
  );
}
