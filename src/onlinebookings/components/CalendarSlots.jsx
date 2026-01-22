// src/onlinebookings/components/CalendarSlots.jsx
import React, { useMemo } from "react";
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
  // Always work with a real Date for rendering
  const safeViewDate =
    viewDate instanceof Date
      ? viewDate
      : viewDate
      ? new Date(viewDate)
      : new Date();

  // Days in the visible month
  const monthDaysMemo = useMemo(
    () => monthDays(safeViewDate),
    [safeViewDate]
  );

  // How many blanks before the 1st (Sun-first header)
  const leadingBlankCount = useMemo(() => {
    const firstOfMonth = new Date(
      safeViewDate.getFullYear(),
      safeViewDate.getMonth(),
      1
    );
    return firstOfMonth.getDay(); // 0..6
  }, [safeViewDate]);

  // Effective display figures for the selected service/provider
  const { price, duration } = useMemo(
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
                const d = new Date(prev || safeViewDate);
                d.setMonth(d.getMonth() - 1);
                return d;
              })
            }
            className="p-2 rounded-lg border border-neutral-700 hover:bg-neutral-800"
          >
            ←
          </button>
          <div className="text-base font-medium">
            {safeViewDate.toLocaleString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </div>
          <button
            onClick={() =>
              setViewDate((prev) => {
                const d = new Date(prev || safeViewDate);
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

        {/* Leading blanks so the 1st aligns to weekday */}
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
            selectedDate &&
            new Date(selectedDate).toDateString() === d.toDateString();

          return (
            <button
              key={d.toISOString()}
              disabled={!selectable}
              onClick={() => setSelectedDate(new Date(d))}
              className={`py-2 rounded-lg border text-sm ${
                selected
                  ? "border-amber-400 bg-neutral-800"
                  : "border-neutral-700"
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
                const tDate = t instanceof Date ? t : new Date(t);
                const active =
                  selectedTime && tDate.getTime() === new Date(selectedTime).getTime();

                return (
                  <button
                    key={tDate.toISOString()}
                    onClick={() => {
                      setSelectedTime(new Date(tDate));
                      onPickTime?.();
                    }}
                     className={`px-3 py-2 rounded-xl border text-sm shadow-sm ${
                      active
                        ? "border-amber-400 bg-neutral-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
                        : "border-purple-300/60 bg-gradient-to-b from-purple-200/30 to-purple-400/20 text-purple-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] hover:from-purple-200/40 hover:to-purple-400/30 hover:shadow-md"
                    }`}
                  >
                    {fmtTime(tDate)}{" "}
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
              <p className="text-base text-gray-300">No free slots for this day.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
