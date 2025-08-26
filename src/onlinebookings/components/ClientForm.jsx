import React from "react";

export default function ClientForm({ business, client, setClient, saving, disabled, onSave, saved }) {
  return (
    <section className="bg-neutral-900/80 rounded-2xl shadow p-5 border border-neutral-800">
      <h2 className="font-semibold text-xl">Your details</h2>

      <div className="mt-3 grid sm:grid-cols-2 gap-3">
        {["first_name","last_name","email","mobile"].map((key, idx) => (
          <label key={key} className="text-sm">
            <span className="text-gray-300">{key === "first_name" ? "First name" : key === "last_name" ? "Last name" : key === "email" ? "Email" : "Mobile"}</span>
            <input
              type={key === "email" ? "email" : "text"}
              value={client[key]}
              onChange={(e) => setClient({ ...client, [key]: e.target.value })}
              className="mt-1 w-full p-2 border rounded-lg bg-neutral-800 border-neutral-700 text-white placeholder-gray-400"
              placeholder={key === "first_name" ? "e.g. John" : key === "last_name" ? "e.g. Smith" : key === "email" ? "you@email.com" : "07..."}
            />
          </label>
        ))}
      </div>

      <label className="text-sm block mt-3">
        <span className="text-gray-300">Notes (optional)</span>
        <textarea
          value={client.notes}
          onChange={(e) => setClient({ ...client, notes: e.target.value })}
          className="mt-1 w-full p-2 border rounded-lg bg-neutral-800 border-neutral-700 text-white placeholder-gray-400"
          placeholder="Anything we should know?"
        />
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button
          disabled={disabled}
          onClick={onSave}
          className="px-4 py-2 rounded-xl bg-amber-500 text-black hover:bg-amber-600 disabled:opacity-50"
        >
          {saving ? "Booking..." : "Book appointment"}
        </button>
        <p className="text-sm text-gray-300">Confirmation appears below.</p>
      </div>

      {saved && (
        <div className="mt-6 p-4 border rounded-xl border-neutral-700 bg-neutral-900">
          <h3 className="font-semibold text-white">🎉 Booking confirmed</h3>
          <p className="text-base text-gray-300 mt-1">
            Thanks, {saved.client.first_name}. Your {saved.service.name.toLowerCase()} is booked with {saved.provider.name}.
          </p>
          <div className="mt-3 grid sm:grid-cols-2 gap-3 text-sm">
            <div className="p-3 rounded-xl border border-neutral-700">
              <p className="text-gray-400">When</p>
              <p className="font-medium text-white">
                {new Date(saved.booking.start).toLocaleString(undefined, { weekday:"short", year:"numeric", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })} ({business.timezone})
              </p>
            </div>
            <div className="p-3 rounded-xl border border-neutral-700">
              <p className="text-gray-400">Where</p>
              <p className="font-medium text-white">{business.address}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
