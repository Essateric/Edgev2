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
      <DatePicker
        selected={selectedDate}
        onChange={handleDateChange}
        dateFormat="dd MMM yyyy"
        className="border border-gray-300 rounded px-2 py-1 text-bronze"
        popperPlacement="bottom-start"
      />
    </div>
  );
}
