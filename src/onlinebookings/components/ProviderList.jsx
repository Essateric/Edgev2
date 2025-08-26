import React from "react";

export default function ProviderList({ providers, selectedProvider, onSelect, onNext }) {
  return (
    <section className="bg-neutral-900/80 rounded-2xl shadow p-5 border border-neutral-800">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-xl">Select a stylist</h2>
        <button onClick={onNext} disabled={!selectedProvider} className="text-sm text-white/80 hover:text-white disabled:opacity-40">
          Next →
        </button>
      </div>
      <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {providers.map((p) => (
          <label
            key={p.id}
            className={`p-4 rounded-xl border flex gap-3 items-center hover:shadow cursor-pointer ${selectedProvider?.id === p.id ? "border-amber-400 bg-neutral-800" : "border-neutral-700"}`}
          >
            <input
              type="radio"
              name="provider"
              className="sr-only"
              checked={selectedProvider?.id === p.id}
              onChange={() => onSelect(p)}
            />
            <div className="w-10 h-10 rounded-full bg-neutral-700" />
            <div>
              <p className="font-medium text-white">{p.name}</p>
              <p className="text-sm text-gray-300">{p.permission || p.email || "Staff"}</p>
            </div>
          </label>
        ))}
      </div>
    </section>
  );
}
