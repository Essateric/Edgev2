import React from "react";
import { money } from "../lib/bookingUtils";

export default function ServiceList({ services, selectedService, onSelect }) {
  return (
    <section className="bg-neutral-900/80 rounded-2xl shadow p-5 border border-neutral-800">
      <h2 className="font-semibold mb-4 text-xl">Select a service</h2>
      {!services.length && <p className="text-base text-gray-300">No services found.</p>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {services.map((svc) => (
          <button
            key={svc.id}
            onClick={() => onSelect(svc)}
            className={`text-left p-4 rounded-xl border transition hover:shadow ${selectedService?.id === svc.id ? "border-amber-400 bg-neutral-800" : "border-neutral-700"}`}
          >
            <p className="font-medium text-white">{svc.name}</p>
            <p className="mt-1 text-sm text-gray-300 flex items-center gap-3">
              <span>{svc.base_duration || 30} mins</span>
              {svc.base_price != null && <span>{money(svc.base_price)}</span>}
            </p>
            {svc.category && <p className="text-sm text-gray-400 mt-1">{svc.category}</p>}
          </button>
        ))}
      </div>
    </section>
  );
}
