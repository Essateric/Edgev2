// src/onlinebookings/components/CalendarSlots.jsx
import React from "react";
import {
  monthDays,
  startOfDay,
  fmtTime,
  moneyOrTBA,
  getEffectivePriceAndDuration,
} from "../lib/bookingUtils";

/**
 * Props
 * - viewDate, setViewDate
 * - selectedService, selectedProvider
 * - selectedDate, setSelectedDate
 * - availableSlots (Date[])
 * - selectedTime, setSelectedTime
 * - slotsLoading
 * - onPickTime?: () => void
 * - staffServiceOverrides?: [{staff_id, service_id, price, duration}, ...]
 */
export default function CalendarSlots({
  viewDate,
  setViewDate,
  selectedService,
  selectedProvider,
  selectedDate,
  setSelectedDate,
  availableSlots,
  selectedTime,
  setSelectedTime,
  slotsLoading,
  onPickTime,
  staffServiceOverrides = [],
}) {
  // All days in the current month
  const monthDaysMemo = React.useMemo(() => monthDays(viewDate), [viewDate]);

  // --- NEW: compute leading blanks so the 1st lands on the correct weekday (Sunday-first header) ---
  const leadingBlankCount = React.useMemo(() => {
    const firstOfMonth = new Date(
      viewDate.getFullYear(),
      viewDate.getMonth(),
      1
    );
    // Native JS: 0=Sun,1=Mon,...6=Sat. Our header is Sun..Sat, so we can use getDay() directly.
    return firstOfMonth.getDay(); // number of empty cells before day 1
  }, [viewDate]);

  // Effective (per-stylist) figures purely for display beside each slot.
  const { price, duration } = React.useMemo(
    () =>
      getEffectivePriceAndDuration(
        selectedService,
        staffServiceOverrides,
        selectedProvider?.id
      ),
    [selectedService, selectedProvider?.id, staffServiceOverrides]
  );

  return (
    <section className="bg-neutral-900/80 rounded-2xl shadow p-5 border border-neutral-800">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-xl">Choose a time</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              setViewDate((prev) => {
                const d = new Date(prev);
                d.setMonth(d.getMonth() - 1);
                return d;
              })
            }
            className="p-2 rounded-lg border border-neutral-700 hover:bg-neutral-800"
          >
            ←
          </button>
          <div className="text-base font-medium">
            {new Date(viewDate).toLocaleString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </div>
          <button
            onClick={() =>
              setViewDate((prev) => {
                const d = new Date(prev);
                d.setMonth(d.getMonth() + 1);
                return d;
              })
            }
            className="p-2 rounded-lg border border-neutral-700 hover:bg-neutral-800"
          >
            →
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-sm">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1 text-gray-400">
            {d}
          </div>
        ))}

        {/* --- NEW: render leading blanks so the grid lines up correctly --- */}
        {Array.from({ length: leadingBlankCount }).map((_, i) => (
          <div key={`pad-${i}`} className="py-2 rounded-lg text-sm opacity-0">
            0
          </div>
        ))}

        {/* Actual month days */}
        {monthDaysMemo.map((d) => {
          const today = startOfDay(new Date());
          const selectable = d >= today && selectedProvider && selectedService;
          const selected =
            selectedDate && d.toDateString() === selectedDate.toDateString();
          return (
            <button
              key={d.toISOString()}
              disabled={!selectable}
              onClick={() => {
                setSelectedDate(new Date(d));
              }}
              className={`py-2 rounded-lg border text-sm ${
                selected ? "border-amber-400 bg-neutral-800" : "border-neutral-700"
              } ${selectable ? "hover:shadow" : "opacity-30 cursor-not-allowed"}`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {!selectedDate ? (
          <p className="text-base text-gray-300">Pick a date to see available times.</p>
        ) : slotsLoading ? (
          <p className="text-base text-gray-300">Loading available times…</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {availableSlots.length ? (
              availableSlots.map((t) => {
                const active =
                  selectedTime && t.getTime() === selectedTime.getTime();
                return (
                  <button
                    key={t.toISOString()}
                    onClick={() => {
                      setSelectedTime(new Date(t));
                      onPickTime?.();
                    }}
                    className={`px-3 py-2 rounded-lg border text-sm ${
                      active
                        ? "border-amber-400 bg-neutral-800"
                        : "border-neutral-700 hover:shadow"
                    }`}
                  >
                    {fmtTime(t)}{" "}
                    <span className="text-gray-400">
                      (
                      {(Number(duration) || 0) > 0 ? `${duration}m` : "—"} •{" "}
                      {moneyOrTBA(price)}
                      )
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="text-base text-gray-300">
                No free slots for this day.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
