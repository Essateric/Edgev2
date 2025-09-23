// src/onlinebookings/components/ProviderList.jsx
import React, { useMemo } from "react";

export default function ProviderList({
  providers = [],
  selectedServices = [],
  selectedProvider,
  onSelect,
  // onNext, // not used anymore
}) {
  const selectedIds = useMemo(() => {
    const ids = (selectedServices ?? []).map((s) =>
      String(s?.id ?? s?.service_id ?? s)
    );
    return new Set(ids);
  }, [selectedServices]);

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
    const base = (providers ?? []).map((p) => ({
      ...p,
      is_active: p?.is_active ?? true,
      online_bookings: p?.online_bookings ?? true,
    }));
    const candidates = base.filter(
      (p) => p.is_active !== false && p.online_bookings !== false
    );

    if (!selectedIds.size) return sortByName(candidates);

    const allSkillsEmpty = candidates.every((p) => toSkillSet(p).size === 0);
    if (allSkillsEmpty) return sortByName(candidates);

    let filtered = candidates.filter((p) => {
      const skills = toSkillSet(p);
      if (skills.size === 0) return true;
      for (const id of selectedIds) if (skills.has(id)) return true;
      return false;
    });

    if (filtered.length === 0) filtered = candidates;
    return sortByName(filtered);
  }, [providers, selectedIds]);

  const noneAvailable = visibleProviders.length === 0;

  return (
    <section className="bg-neutral-900/80 rounded-2xl shadow p-5 border border-neutral-800">
      <h2 className="font-semibold text-xl">Select a stylist</h2>

      {noneAvailable ? (
        <div className="mt-4 p-4 rounded-lg border border-neutral-700 bg-neutral-900 text-sm text-gray-300">
          No stylists match the selected services right now. Please try a
          different service combination or date.
        </div>
      ) : (
        <div
          role="radiogroup"
          aria-label="Select a stylist"
          className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]"
        >
          {visibleProviders.map((p) => {
            const checked = selectedProvider?.id === p.id;
            return (
              <label
                key={p.id}
                role="radio"
                aria-checked={checked}
                tabIndex={0}
                onClick={() => onSelect?.(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect?.(p);
                  }
                }}
                className={`p-4 rounded-xl border flex items-start gap-3 hover:shadow cursor-pointer transition
                  ${checked ? "border-amber-400 bg-neutral-800" : "border-neutral-700 bg-neutral-900/40"}`}
              >
                <input
                  type="radio"
                  name="provider"
                  className="sr-only"
                  checked={checked}
                  onChange={() => onSelect?.(p)}
                />
                <div className="h-10 w-10 rounded-full bg-neutral-700 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-white whitespace-normal break-words leading-snug" title={p.name || ""}>
                    {p.name || "Team Member"}
                  </p>
                  <p className="text-sm text-gray-300 whitespace-normal break-words leading-snug">
                    {p.title || p.permission || p.email || "Stylist"}
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
