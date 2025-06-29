import React from "react";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TextField } from "@mui/material";

export default function DateNavigator({ visibleDate, setVisibleDate }) {
  return (
    <div className="mb-4">
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <DatePicker
          label="Select Date"
          value={visibleDate}
          onChange={(newValue) => {
            if (newValue) setVisibleDate(newValue);
            className="bg-white"
          }}
          disableToolbar // ✅ Removes Today/Back/Next
          showDaysOutsideCurrentMonth // ✅ Shows full month
          reduceAnimations // ✅ Smoother opening
          views={["year", "month", "day"]} // ✅ Allows Year + Month + Day pick
          renderInput={(params) => (
            <TextField
              {...params}
              size="small"
              sx={{
                backgroundColor: "white",
                borderRadius: "6px",
                input: { padding: "8px" },
                width: "170px",
              }}
            />
          )}
        />
      </LocalizationProvider>
    </div>
  );
}
