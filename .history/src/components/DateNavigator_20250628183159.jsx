import React, { useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

export default function DateNavigator({ visibleDate, setVisibleDate }) {
  const [selectedDate, setSelectedDate] = useState(visibleDate);

  const handleDateChange = (date) => {
    setSelectedDate(date);
    setVisibleDate(date);
  };

  const goToToday = () => {
    const today = new Date();
    setSelectedDate(today);
    setVisibleDate(today);
  };

  const goBack = () => {
    const newDate = new Date(visibleDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
    setVisibleDate(newDate);
  };

  const goNext = () => {
    const newDate = new Date(visibleDate);
    newDate.setDate(newDate.getDate() + 1);
    setSelectedDate(newDate);
    setVisibleDate(newDate);
  };

  return (
    <div className="flex gap-2 items-center mb-4">
      <button
        onClick={goToToday}
        className="bg-bronze text-white px-3 py-1 rounded hover:bg-bronze/90"
      >
        Today
      </button>
      <button
        onClick={goBack}
        className="bg-gray-300 px-3 py-1 rounded hover:bg-gray-400"
      >
        Back
      </button>
      <button
        onClick={goNext}
        className="bg-gray-300 px-3 py-1 rounded hover:bg-gray-400"
      >
        Next
      </button>

      <DatePicker
        selected={selectedDate}
        onChange={handleDateChange}
        dateFormat="dd MMM yyyy"
        className="border border-gray-300 rounded px-2 py-1"
        popperPlacement="bottom-start"
      />
    </div>
  );
}
