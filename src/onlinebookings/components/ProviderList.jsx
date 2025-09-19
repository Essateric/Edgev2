// src/onlinebookings/components/ProviderList.jsx
import React, { useMemo } from "react";

export default function ProviderList({
  providers = [],
  selectedServices = [],
  selectedProvider,
  onSelect,
  onNext,
}) {
  // ---- Selected service ids (stringified) ----
  const selectedIds = useMemo(() => {
    const ids = (selectedServices ?? []).map((s) =>
      String(s?.id ?? s?.service_id ?? s)
    );
    return new Set(ids);
  }, [selectedServices]);

  // ---- Helpers to normalize provider skills ----
  function normalizeServiceIds(raw) {
    if (!raw) return [];
    // Already an array (numbers/strings/objects)
    if (Array.isArray(raw)) return raw;

    // JSON-encoded array?
    if (typeof raw === "string") {
      const str = raw.trim();
      // CSV "1,2,3"
      if (str.includes(",") && !str.startsWith("["))
        return str.split(",").map((x) => x.trim()).filter(Boolean);

      // JSON: '["1","2"]' or '[1,2]' or '[{"id":1}]'
      if (str.startsWith("[") && str.endsWith("]")) {
        try {
          const parsed = JSON.parse(str);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      // Single value string
      return [str];
    }

    // Anything else (number, object)
    return [raw];
  }

  function toSkillSet(p) {
    const list = normalizeServiceIds(p?.service_ids);
    return new Set(
      list.map((x) => String(x?.id ?? x?.service_id ?? x))
    );
  }

  const visibleProviders = useMemo(() => {
    const base = (providers ?? []).map((p) => ({
      ...p,
      is_active: p?.is_active ?? true,
      online_bookings: p?.online_bookings ?? true,
    }));

    // Show only active, online-bookable stylists
    const candidates = base.filter(
      (p) => p.is_active !== false && p.online_bookings !== false
    );

    // If no services chosen, show everyone
    if (!selectedIds.size) {
      return candidates.sort((a, b) =>
        String(a?.name || "").localeCompare(String(b?.name || ""))
      );
    }

    // Otherwise: match ANY selected service.
    // IMPORTANT: If a stylist has no visible skills (null/empty/masked by RLS),
    // we INCLUDE them rather than hide them—prevents false "no stylists" cases.
    const filtered = candidates.filter((p) => {
      const skills = toSkillSet(p);
      if (skills.size === 0) return true; // permissive fallback
      for (const id of selectedIds) if (skills.has(id)) return true;
      return false;
    });

    return filtered.sort((a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || ""))
    );
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
                {/* Keep input inside label for reliable iOS taps */}
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
