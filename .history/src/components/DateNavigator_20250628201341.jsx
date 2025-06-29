import React from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

export default function DateNavigator({ visibleDate, setVisibleDate }) {
  return (
    <div className="bg-white p-2 rounded shadow w-fit">
      <label className="block text-sm text-gray-700 mb-1">Select Date</label>
      <DatePicker
        selected={visibleDate}
        onChange={(date) => setVisibleDate(date)}
        dateFormat="dd/MM/yyyy"
        className="border border-gray-300 px-2 py-1 rounded w-[150px]"
        popperPlacement="bottom-start"
        popperModifiers={[
          {
            name: "offset",
            options: {
              offset: [0, 10],
            },
          },
        ]}
        calendarClassName="z-[9999]"
      />
    </div>
  );
}
