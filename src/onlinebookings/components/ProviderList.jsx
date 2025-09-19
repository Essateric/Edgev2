// src/onlinebookings/components/ProviderList.jsx
import React, { useMemo } from "react";

export default function ProviderList({
  providers = [],
  selectedServices = [],
  selectedProvider,
  onSelect,
  onNext,
}) {
  // Selected service ids (stringified)
  const selectedIds = useMemo(() => {
    const ids = (selectedServices ?? []).map((s) =>
      String(s?.id ?? s?.service_id ?? s)
    );
    return new Set(ids);
  }, [selectedServices]);

  // Normalize provider skills into a Set<string>
  function toSkillSet(p) {
    const raw = p?.service_ids;
    const arr = Array.isArray(raw)
      ? raw
      : typeof raw === "string"
      ? normalizeFromString(raw)
      : raw == null
      ? []
      : [raw];
    return new Set(arr.map((x) => String(x?.id ?? x?.service_id ?? x)));
    function normalizeFromString(s) {
      const t = s.trim();
      if (t.startsWith("[") && t.endsWith("]")) {
        try {
          const parsed = JSON.parse(t);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      if (t.includes(",")) return t.split(",").map((x) => x.trim()).filter(Boolean);
      return t ? [t] : [];
    }
  }

  const visibleProviders = useMemo(() => {
    // Base candidate list (active + online)
    const base = (providers ?? []).map((p) => ({
      ...p,
      is_active: p?.is_active ?? true,
      online_bookings: p?.online_bookings ?? true,
    }));
    const candidates = base.filter(
      (p) => p.is_active !== false && p.online_bookings !== false
    );

    // If no services chosen -> show everyone (good first-load UX)
    if (!selectedIds.size) {
      return sortByName(candidates);
    }

    // Detect the "mapping empty" situation (RLS/empty staff_services)
    const allSkillsEmpty = candidates.every((p) => toSkillSet(p).size === 0);
    if (allSkillsEmpty) {
      // Mapping unavailable → don't hide anyone
      return sortByName(candidates);
    }

    // Normal filter: include stylist if ANY selected service matches
    let filtered = candidates.filter((p) => {
      const skills = toSkillSet(p);
      if (skills.size === 0) return true; // permissive fallback for partially missing data
      for (const id of selectedIds) if (skills.has(id)) return true;
      return false;
    });

    // Absolute fallback: if filtering produced nothing, show everyone
    if (filtered.length === 0) filtered = candidates;

    return sortByName(filtered);
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

function sortByName(arr) {
  return [...arr].sort((a, b) =>
    String(a?.name || "").localeCompare(String(b?.name || ""))
  );
}
