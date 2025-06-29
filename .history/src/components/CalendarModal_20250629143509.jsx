import React, { useState } from "react";
import { X } from "lucide-react";

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarModal({ isOpen, onClose, onDateSelect }) {
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today);
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  const getDaysInMonth = (month, year) =>
    new Date(year, month + 1, 0).getDate();

  const getFirstDayOfMonth = (month, year) =>
    new Date(year, month, 1).getDay();

  const handleDateClick = (day) => {
    const date = new Date(currentYear, currentMonth, day);
    setSelectedDate(date);
  };

  const handleConfirm = () => {
    onDateSelect(selectedDate);
    onClose();
  };

  if (!isOpen) return null;

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
  const emptyDays = Array.from({ length: firstDay });
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6">
        {/* 🔥 Header */}
<div className="flex justify-center items-center mb-4">
  <h2 className="text-xl font-semibold">Select Date</h2>
</div>

<div className="flex justify-center gap-4 mb-4">
  {/* Month Dropdown */}
  <select
    value={currentMonth}
    onChange={(e) => setCurrentMonth(Number(e.target.value))}
    className="border border-black rounded px-2 py-1"
  >
    {months.map((month, idx) => (
      <option key={month} value={idx}>
        {month}
      </option>
    ))}
  </select>

  {/* Year Dropdown */}
  <select
    value={currentYear}
    onChange={(e) => setCurrentYear(Number(e.target.value))}
    className="border border-black rounded px-2 py-1"
  >
    {Array.from({ length: 6 }, (_, i) => currentYear - i).map((year) => (
      <option key={year} value={year}>
        {year}
      </option>
    ))}
  </select>
</div>


        {/* 🔥 Calendar Grid */}
        <div className="grid grid-cols-7 gap-1 text-center">
          {daysOfWeek.map((day) => (
            <div key={day} className="text-sm text-gray-500">
              {day}
            </div>
          ))}
          {emptyDays.map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {days.map((day) => {
            const isSelected =
              selectedDate.getDate() === day &&
              selectedDate.getMonth() === currentMonth &&
              selectedDate.getFullYear() === currentYear;
            const isToday =
              today.getDate() === day &&
              today.getMonth() === currentMonth &&
              today.getFullYear() === currentYear;

            return (
              <button
                key={day}
                onClick={() => handleDateClick(day)}
                className={`p-2 rounded-lg text-sm ${
                  isSelected
                    ? "bg-bronze text-white"
                    : isToday
                    ? "bg-blue-100 text-bronze"
                    : "hover:bg-gray-100 text-gray-700"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>

        {/* 🔥 Footer Buttons */}
        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-500 text-black hover:text-white"
          >
            Close
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 border bg-bronze text-white px-4 py-2 hover:text-white hover:border-gray-800 hover:bg-orange-700 	rounded-2xl"
          >
            Go to Date
          </button>
        </div>
      </div>
    </div>
  );
}
