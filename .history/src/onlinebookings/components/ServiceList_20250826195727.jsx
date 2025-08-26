// src/onlinebookings/components/ServiceList.jsx
import React, { useMemo } from "react";
import { money } from "../lib/bookingUtils";

/**
 * Props:
 * - services: Array<{ id, name, category, base_price, base_duration }>
 * - selectedService: service object or null
 * - onSelect(service): function
 * - categoryOrder?: string[] (optional explicit ordering of categories)
 */
export default function ServiceList({
  services = [],
  selectedService = null,
  onSelect,
  categoryOrder = [
    "Cut and Finish",
    "Gents",
    "Highlights",
    "Tints",
    "Treatments",
    "Waves",
    "Consultation",
    "Initial Consultation",
  ],
}) {
  // Group services by category (fallback to "Other")
  const grouped = useMemo(() => {
    const g = {};
    for (const s of services) {
      const cat = s.category?.trim() || "Other";
      if (!g[cat]) g[cat] = [];
      g[cat].push(s);
    }
    // sort services within each category by name
    Object.keys(g).forEach((k) => {
      g[k].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    });
    return g;
  }, [services]);

  // Build a sorted list of category names
  const categories = useMemo(() => {
    const found = Object.keys(grouped);
    const prioritized = [];
    const lowerFound = found.map((c) => c.toLowerCase());
    // push in explicit order if present
    for (const wanted of categoryOrder) {
      const i = lowerFound.indexOf(wanted.toLowerCase());
      if (i !== -1) prioritized.push(found[i]);
    }
    // append remaining categories alphabetically
    const remaining = found
      .filter((c) => !prioritized.includes(c))
      .sort((a, b) => a.localeCompare(b));
    return [...prioritized, ...remaining];
  }, [grouped, categoryOrder]);

  return (
    <section className="bg-neutral-900/80 rounded-2xl shadow p-5 border border-neutral-800">
      <h2 className="font-semibold mb-4 text-xl text-white">Select a service</h2>

      {!services.length && (
        <p className="text-base text-gray-300">No services found.</p>
      )}

      {categories.map((cat) => (
        <div key={cat} className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-amber-300">
              {cat} <span className="text-xs text-gray-400">({grouped[cat].length})</span>
            </h3>
            {/* optional: anchor id for in-page links */}
            <a href={`#cat-${encodeURIComponent(cat)}`} id={`cat-${encodeURIComponent(cat)}`} className="sr-only">
              {cat}
            </a>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {grouped[cat].map((svc) => {
              const isSelected = selectedService?.id === svc.id;
              const duration = Number(svc.base_duration);
              const hasDuration = Number.isFinite(duration) && duration > 0;
              const price = svc.base_price;

              return (
                <button
                  key={svc.id || `${cat}:${svc.name}`}
                  onClick={() => onSelect && onSelect(svc)}
                  className={`text-left p-4 rounded-xl border transition hover:shadow focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                    isSelected ? "border-amber-400 bg-neutral-800" : "border-neutral-700"
                  }`}
                  aria-pressed={isSelected}
                >
                  <p className="font-medium text-white">{svc.name}</p>

                  <p className="mt-1 text-sm text-gray-300 flex items-center gap-3">
                    <span>{hasDuration ? `${duration >= 60 ? `${Math.floor(duration / 60)}h ` : ""}${duration % 60 || (duration < 60 ? duration : 0)}m` : "—"}</span>
                    {price != null ? <span>{money(price)}</span> : null}
                  </p>

                  {/* show category label small, in case some services are reused across cats */}
                  {svc.category && (
                    <p className="text-xs text-gray-400 mt-1">{svc.category}</p>
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
