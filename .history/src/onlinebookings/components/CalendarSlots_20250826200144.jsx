// src/onlinebookings/components/CalendarSlots.jsx
import React from "react";
import { monthDays, startOfDay, fmtTime, moneyOrTBA, getEffectivePriceAndDuration } from "../lib/bookingUtils";

export default function CalendarSlots({
  viewDate, setViewDate,
  selectedService, selectedProvider,
  selectedDate, setSelectedDate,
  availableSlots, selectedTime, setSelectedTime,
  slotsLoading, onPickTime,
  staffServiceOverrides = [], // ← NEW
}) {
  const monthDaysMemo = React.useMemo(() => monthDays(viewDate), [viewDate]);

  // Compute stylist-specific numbers once
  const effective = React.useMemo(() => {
    if (!selectedService) return { price: 0, duration: 0 };
    return getEffectivePriceAndDuration(
      selectedService,
      staffServiceOverrides,
      selectedProvider?.id
    );
  }, [selectedService, selectedProvider?.id, staffServiceOverrides]);

  const durationLabel = React.useMemo(() => {
    const d = Number(effective.duration) || 0;
    return d > 0
      ? `${Math.floor(d / 60) ? `${Math.floor(d / 60)}h ` : ""}${d % 60 || (!Math.floor(d / 60) ? d : 0)}m`
      : "—";
  }, [effective.duration]);

  const priceLabel = moneyOrTBA(effective.price);

  return (
    <section className="bg-neutral-900/80 rounded-2xl shadow p-5 border border-neutral-800">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-xl">Choose a time</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; })}
            className="p-2 rounded-lg border border-neutral-700 hover:bg-neutral-800"
          >
            ←
          </button>
          <div className="text-base font-medium">
            {new Date(viewDate).toLocaleString(undefined, { month: "long", year: "numeric" })}
          </div>
          <button
            onClick={() => setViewDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; })}
            className="p-2 rounded-lg border border-neutral-700 hover:bg-neutral-800"
          >
            →
          </button>
        </div>
      </div>

      {/* small helper line */}
      {selectedService && selectedProvider && (
        <p className="mt-2 text-sm text-gray-300">
          With <b className="text-gray-100">{selectedProvider.name}</b>: <b>{durationLabel}</b> • <b>{priceLabel}</b>
        </p>
      )}

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-sm">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
          <div key={d} className="py-1 text-gray-400">{d}</div>
        ))}
        {monthDaysMemo.map((d) => {
          const today = startOfDay(new Date());
          const selectable = d >= today && selectedProvider && selectedService;
          const selected = selectedDate && d.toDateString() === selectedDate.toDateString();
          return (
            <button
              key={d.toISOString()}
              disabled={!selectable}
              onClick={() => { setSelectedDate(new Date(d)); }}
              className={`py-2 rounded-lg border text-sm ${selected ? "border-amber-400 bg-neutral-800" : "border-neutral-700"} ${selectable ? "hover:shadow" : "opacity-30 cursor-not-allowed"}`}
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
              availableSlots.map((t) => (
                <button
                  key={t.toISOString()}
                  onClick={() => { setSelectedTime(new Date(t)); onPickTime?.(); }}
                  className={`px-3 py-2 rounded-lg border text-sm ${
                    selectedTime && t.getTime() === selectedTime.getTime()
                      ? "border-amber-400 bg-neutral-800"
                      : "border-neutral-700 hover:shadow"
                  }`}
                  title={`${durationLabel} • ${priceLabel}`} // tooltip
                >
                  {fmtTime(t)} <span className="text-gray-400">({durationLabel} • {priceLabel})</span>
                </button>
              ))
            ) : (
              <p className="text-base text-gray-300">No free slots for this day.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
