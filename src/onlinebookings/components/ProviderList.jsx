// src/onlinebookings/components/ProviderList.jsx
import React, { useMemo } from "react";

export default function ProviderList({
  providers = [],
  selectedServices = [],
  selectedProvider,
  onSelect,
  onNext,
}) {
  // ---- Normalize & filter providers safely (works on mobile cold loads) ----
  const selectedIds = useMemo(() => {
    const ids = (selectedServices ?? []).map((s) =>
      String(s?.id ?? s?.service_id ?? s)
    );
    return new Set(ids);
  }, [selectedServices]);

  const visibleProviders = useMemo(() => {
    // Defensive normalize so missing fields don't nuke the list on mobile
    const base = (providers ?? []).map((p) => ({
      ...p,
      is_active: p?.is_active ?? true,
      online_bookings: p?.online_bookings ?? true,
      service_ids: Array.isArray(p?.service_ids) ? p.service_ids : [],
    }));

    // Show only active, online-bookable stylists
    const filtered = base.filter(
      (p) => p.is_active !== false && p.online_bookings !== false
    );

    // If no services chosen, show everyone (better UX on first visit)
    if (!selectedIds.size) return filtered;

    // Otherwise require ANY of the selected services to match stylist skills
    return filtered.filter((p) => {
      const skills = new Set(
        p.service_ids.map((x) => String(x?.id ?? x?.service_id ?? x))
      );
      for (const id of selectedIds) if (skills.has(id)) return true;
      return false;
    });
  }, [providers, selectedIds]);

  const noneAvailable = visibleProviders.length === 0;

  return (
    <section className="bg-neutral-900/80 rounded-2xl shadow p-5 border border-neutral-800">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-xl">Select a stylist</h2>
        <button
          onClick={onNext}
          disabled={!selectedProvider}
          className="text-sm text-white/80 hover:text-white disabled:opacity-40"
        >
          Next →
        </button>
      </div>

      {noneAvailable ? (
        <div className="mt-4 p-4 rounded-lg border border-neutral-700 bg-neutral-900 text-sm text-gray-300">
          No stylists match the selected services right now. Please try a
          different service combination or date.
        </div>
      ) : (
        <div
          className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-3"
          role="radiogroup"
          aria-label="Select a stylist"
        >
          {visibleProviders.map((p) => {
            const checked = selectedProvider?.id === p.id;
            return (
              <label
                key={p.id}
                className={`p-4 rounded-xl border flex gap-3 items-center hover:shadow cursor-pointer ${
                  checked
                    ? "border-amber-400 bg-neutral-800"
                    : "border-neutral-700"
                }`}
              >
                {/* Keep the input in the label for best iOS tap behavior */}
                <input
                  type="radio"
                  name="provider"
                  className="sr-only"
                  checked={checked}
                  onChange={() => onSelect?.(p)}
                />
                <div className="w-10 h-10 rounded-full bg-neutral-700" />
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">{p.name}</p>
                  <p className="text-sm text-gray-300 truncate">
                    {p.permission || p.email || "Staff"}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
