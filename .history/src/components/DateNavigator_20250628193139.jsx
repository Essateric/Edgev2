import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

function DateNavigator({ visibleDate, setVisibleDate }) {
  return (
    <div className="bg-white p-2 rounded shadow">
      <label className="block text-sm text-gray-600 mb-1">
        Select Date
      </label>
      <DatePicker
        selected={visibleDate}
        onChange={(date) => setVisibleDate(date)}
        dateFormat="dd/MM/yyyy"
        className="border px-2 py-1 rounded w-full"
        showMonthDropdown
        showYearDropdown
        dropdownMode="select"
      />
    </div>
  );
}

export default DateNavigator;
