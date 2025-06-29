import React, { useEffect } from "react";

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
      className={`w-full aspect-square text-white font-semibold rounded-xl shadow-md
        ${extraClass} hover:brightness-110 active:scale-95 active:shadow-[0_0_10px_white]
        border border-white/20`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* PIN Dots */}
      <div className="flex justify-center gap-4">
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

      {/* Keypad */}
      <div className="w-full">
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) =>
            renderButton(num, () => handlePress(String(num)), "bg-bronze")
          )}
          {renderButton("Clear", handleClear, "bg-orange-500 text-sm")}
          {renderButton("0", () => handlePress("0"), "bg-bronze")}
          {renderButton("Enter", handleEnter, "bg-green-600 text-sm")}
        </div>
      </div>
    </div>
  );
}
