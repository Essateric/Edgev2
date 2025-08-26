// src/onlinebookings/components/ServiceList.jsx
import React, { useMemo } from "react";
import { moneyOrTBA, getEffectivePriceAndDuration } from "../lib/bookingUtils";

/**
 * Props:
 * - services
 * - selectedService
 * - onSelect(service)
 * - selectedProvider   ← NEW (object or null)
 * - staffServiceOverrides ← NEW (array from `staff_services`)
 * - categoryOrder? (optional)
 */
export default function ServiceList({
  services = [],
  selectedService = null,
  onSelect,
  selectedProvider = null,
  staffServiceOverrides = [],
  categoryOrder = [
    "Cut and Finish",
    "Gents",
    "Highlights",
    "Tints",
    "Treatments",
    "Waves",
    "Consultation",
    "Initial Consultation",
    "Other",
  ],
}) {
  const grouped = useMemo(() => {
    const g = {};
    for (const s of services) {
      const cat = s.category?.trim() || "Other";
      if (!g[cat]) g[cat] = [];
      g[cat].push(s);
    }
    Object.keys(g).forEach((k) => {
      g[k].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    });
    return g;
  }, [services]);

  const categories = useMemo(() => {
    const found = Object.keys(grouped);
    const out = [];
    const foundLower = found.map((c) => c.toLowerCase());
    for (const want of categoryOrder) {
      const i = foundLower.indexOf(want.toLowerCase());
      if (i !== -1) out.push(found[i]);
    }
    const remaining = found
      .filter((c) => !out.includes(c))
      .sort((a, b) => a.localeCompare(b));
    return [...out, ...remaining];
  }, [grouped, categoryOrder]);

  return (
    <section className="bg-neutral-900/80 rounded-2xl shadow p-5 border border-neutral-800">
      <h2 className="font-semibold mb-4 text-xl text-white">Select a service</h2>

      {!services.length && (
        <p className="text-base text-gray-300">No services found.</p>
      )}

      {categories.map((cat) => (
        <div key={cat} className="mb-6">
          <h3 className="text-lg font-semibold text-amber-300 mb-3">
            {cat} <span className="text-xs text-gray-400">({grouped[cat].length})</span>
          </h3>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {grouped[cat].map((svc) => {
              const { price, duration } = getEffectivePriceAndDuration(
                svc,
                staffServiceOverrides,
                selectedProvider?.id
              );
              const isSelected = selectedService?.id === svc.id;

              // Duration label like "1h 15m" or "30m" or "—"
              const d = Number(duration) || 0;
              const durationLabel =
                d > 0
                  ? `${Math.floor(d / 60) ? `${Math.floor(d / 60)}h ` : ""}${
                      d % 60 || (!Math.floor(d / 60) ? d : 0)
                    }m`
                  : "—";

              return (
                <button
                  key={svc.id}
                  onClick={() => onSelect && onSelect(svc)}
                  className={`text-left p-4 rounded-xl border transition hover:shadow focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                    isSelected ? "border-amber-400 bg-neutral-800" : "border-neutral-700"
                  }`}
                >
                  <p className="font-medium text-white">{svc.name}</p>
                  <p className="mt-1 text-sm text-gray-300 flex items-center gap-3">
                    <span>{durationLabel}</span>
                    <span>{moneyOrTBA(price)}</span>
                  </p>
                  {svc.category && (
                    <p className="text-xs text-gray-400 mt-1">{svc.category}</p>
                  )}
                  {selectedProvider ? (
                    <p className="text-[11px] text-gray-400 mt-1">
                      With <b className="text-gray-200">{selectedProvider.name}</b>
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-400 mt-1">
                      Select a stylist to see their price & time.
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
