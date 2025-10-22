// src/onlinebookings/components/ServiceList.jsx
import React, { useMemo, useRef, useState } from "react";
import { moneyOrTBA, getEffectivePriceAndDuration } from "../lib/bookingUtils";

/**
 * Props:
 * - services
 * - selectedService              (for highlighting last picked)
 * - onSelect(service)            (toggle handler from parent)
 * - selectedProvider             (object or null)
 * - staffServiceOverrides        (array from `staff_services`)
 * - categoryOrder?               (optional)
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
  // group services by category
  const grouped = useMemo(() => {
    const g = new Map();
    for (const s of services) {
      const cat = (s.category || "Other").trim();
      if (!g.has(cat)) g.set(cat, []);
      g.get(cat).push(s);
    }
    // sort services by name within each category
    for (const [cat, list] of g) {
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      g.set(cat, list);
    }
    return g;
  }, [services]);

  // order categories: preferred order first, then alphabetical rest
  const categories = useMemo(() => {
    const found = Array.from(grouped.keys());
    const out = [];
    const foundLower = found.map((c) => c.toLowerCase());
    for (const want of categoryOrder) {
      const i = foundLower.indexOf(want.toLowerCase());
      if (i !== -1) out.push(found[i]);
    }
    const remaining = found.filter((c) => !out.includes(c)).sort((a, b) => a.localeCompare(b));
    return [...out, ...remaining];
  }, [grouped, categoryOrder]);

  // accordion state
  const [openCat, setOpenCat] = useState(() => (categories.length ? categories[0] : null));
  const catRefs = useRef({});

  const toggleCat = (cat) => {
    setOpenCat((curr) => {
      const next = curr === cat ? null : cat;
      requestAnimationFrame(() => {
        const el = catRefs.current[cat];
        if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      return next;
    });
  };

  return (
    <section className="bg-neutral-900/80 rounded-2xl shadow p-5 border border-neutral-800">
      <h2 className="font-semibold mb-4 text-xl text-white">Select services</h2>

      {!services.length && <p className="text-base text-gray-300">No services found.</p>}

      <div className="space-y-3">
        {categories.map((cat) => {
          const list = grouped.get(cat) || [];
          return (
            <div
              key={cat}
              ref={(el) => (catRefs.current[cat] = el)}
              className="rounded-xl border border-neutral-800"
            >
              <button
                type="button"
                onClick={() => toggleCat(cat)}
                className="w-full flex items-center justify-between px-4 py-3 bg-neutral-900/70 hover:bg-neutral-900 text-left"
              >
                <span className="font-medium">
                  {cat}
                  {cat.toLowerCase().includes("treat") && (
                    <span className="ml-2 text-[11px] px-2 py-0.5 rounded bg-amber-600/30 text-amber-300 align-middle">
                      chemical
                    </span>
                  )}
                </span>
                <span className="text-sm text-gray-400">
                  {openCat === cat ? "Hide" : "Show"} <span className="opacity-60">({list.length})</span>
                </span>
              </button>

              {openCat === cat && (
                <div className="relative z-10 px-3 pb-3 bg-neutral-950/40">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 w-full">
                    {list.map((svc) => {
                      const { price, duration } = getEffectivePriceAndDuration(
                        svc,
                        staffServiceOverrides,
                        selectedProvider?.id
                      );

                      const isSelected = selectedService?.id === svc.id;

                      // "1h 15m" / "30m" / "—"
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
                          className={`text-left rounded-xl border px-4 py-3 transition w-full hover:bg-neutral-800/60 ${
                            isSelected
                              ? "border-amber-500 bg-neutral-800/70"
                              : "border-neutral-800 bg-neutral-900/40"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="font-medium break-words">
                              {svc.name}
                              {svc.is_chemical && (
                                <span className="ml-2 text-[11px] px-2 py-0.5 rounded bg-amber-600/30 text-amber-300">
                                  chemical
                                </span>
                              )}
                            </p>

                            {/* Just duration + price (no extra helper text) */}
                            <p className="text-xs text-gray-400">
                              {durationLabel} • {moneyOrTBA(price)}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
