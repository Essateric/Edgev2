import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

function DateNavigator({ visibleDate, setVisibleDate }) {
  return (
    <div className="bg-white p-2 rounded shadow w-fit">
      <label className="block text-sm text-gray-600 mb-1">Select Date</label>
      <DatePicker
        selected={visibleDate}
        onChange={(date) => setVisibleDate(date)}
        dateFormat="dd/MM/yyyy"
        className="border px-2 py-1 rounded w-full"
        showMonthDropdown
        showYearDropdown
        dropdownMode="select"
        popperPlacement="bottom-start"
        popperModifiers={[
          {
            name: "offset",
            options: {
              offset: [0, 10],
            },
          },
        ]}
        portalId="root" // ✅ Renders in a portal outside parent div
      />
    </div>
  );
}

export default DateNavigator;
