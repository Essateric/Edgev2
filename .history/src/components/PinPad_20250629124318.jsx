import React, { useEffect, useState } from 'react';
import { Delete, Check } from 'lucide-react';

export default function PinPad({ value = '', onChange, onEnter, disabled = false }) {
  const [isShaking, setIsShaking] = useState(false);

  const handleNumberClick = (number) => {
    if (disabled) return;
    if (value.length < 6) {
      onChange(value + number);
    }
  };

  const handleClear = () => {
    if (!disabled) onChange('');
  };

  const handleDelete = () => {
    if (!disabled) onChange(value.slice(0, -1));
  };

  const handleEnter = () => {
    if (disabled) return;
    if (value.length >= 4) {
      onEnter?.();
    } else {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
    }
  };

  // Keyboard Support
  useEffect(() => {
    if (disabled) return;
    const handleKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9' && value.length < 6) {
        onChange(value + e.key);
      }
      if (e.key === 'Enter') {
        handleEnter();
      }
      if (e.key === 'Backspace') {
        handleDelete();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [value, disabled]);

  const PinButton = ({ children, onClick }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        relative h-24 w-30 rounded-xl
        bg-gradient-to-br from-amber-600 via-amber-700 to-amber-900
        border border-amber-500/30
        shadow-lg hover:shadow-xl
        transform hover:scale-105 active:scale-95
        transition-all duration-200 ease-out
        disabled:opacity-50 disabled:cursor-not-allowed
        before:absolute before:inset-0 before:rounded-xl
        before:bg-gradient-to-br before:from-white/20 before:to-transparent
        before:opacity-0 hover:before:opacity-100 before:transition-opacity
      `}
    >
      <span className="relative z-10 text-5xl font-bold bg-gradient-to-b from-gray-100 via-gray-300 to-gray-600 bg-clip-text text-transparent drop-shadow-sm">
        {children}
      </span>
    </button>
  );

  const ActionButton = ({ children, onClick, variant = 'secondary' }) => {
    const styles = {
      primary: 'from-emerald-600 via-emerald-700 to-emerald-900 border-emerald-500/30',
      danger: 'from-red-600 via-red-700 to-red-900 border-red-500/30',
      secondary: 'from-gray-600 via-gray-700 to-gray-900 border-gray-500/30',
    }[variant];

    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`
          relative h-16 rounded-xl
          bg-gradient-to-br ${styles}
          border shadow-lg hover:shadow-xl
          transform hover:scale-105 active:scale-95
          transition-all duration-200 ease-out
          before:absolute before:inset-0 before:rounded-xl
          before:bg-gradient-to-br before:from-white/20 before:to-transparent
          before:opacity-0 hover:before:opacity-100 before:transition-opacity
          w-full flex items-center justify-center
        `}
      >
        <span className="relative z-10 flex items-center justify-center text-5x1 font-bold bg-gradient-to-b from-gray-100 via-gray-300 to-gray-600 bg-clip-text text-transparent drop-shadow-sm">
          {children}
        </span>
      </button>
    );
  };

  return (
    <div className="w-full max-w-[420px]">
      <div className={`mb-6 ${isShaking ? 'animate-pulse' : ''}`}>
        <div className="flex justify-center space-x-3 mb-3">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className={`
                w-4 h-4 rounded-full border-2 transition-all duration-300
                ${i < value.length 
                  ? 'bg-gradient-to-r from-amber-400 to-amber-600 border-amber-400 shadow-lg shadow-amber-400/50' 
                  : 'border-gray-600 bg-gray-800'
                }
              `}
            />
          ))}
        </div>
      </div>

      {/* Number Pad */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => (
          <PinButton key={number} onClick={() => handleNumberClick(number.toString())}>
            {number}
          </PinButton>
        ))}
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-3 gap-4">
        <ActionButton onClick={handleClear} variant="danger" className="text-5x1">
          CLEAR
        </ActionButton>
        <PinButton onClick={() => handleNumberClick('0')}>
          0
        </PinButton>
        <ActionButton onClick={handleEnter} variant="primary">
          <Check size={18} className="mr-1" /> ENTER
        </ActionButton>
      </div>

      <div className="mt-3">
        <ActionButton onClick={handleDelete}>
          <Delete size={18} className="mr-2" /> DELETE
        </ActionButton>
      </div>
    </div>
  );
}
