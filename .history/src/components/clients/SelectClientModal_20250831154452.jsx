import React, { useMemo, useState } from "react";
import Modal from "../Modal";
import Select from "react-select";
import { format } from "date-fns";
import { supabase } from "../../supabaseClient"; // ✅ add supabase

export default function SelectClientModal({
  isOpen,
  onClose,
  clients,
  selectedSlot,
  selectedClient,
  setSelectedClient,
  onNext,
  onClientCreated, // ✅ NEW (optional) – parent can update its clients state
}) {
  const clientOptions = useMemo(
    () =>
      (clients || []).map((c) => ({
        value: c.id,
        label: `${c.first_name ?? ""} ${c.last_name ?? ""} — ${c.mobile ?? ""}`.trim(),
      })),
    [clients]
  );

  // --- New client mini-form state ---
  const [creating, setCreating] = useState(false);
  const [newClient, setNewClient] = useState({
    first_name: "",
    last_name: "",
    email: "",
    mobile: "",
  });

  const normPhone = (s = "") => s.replace(/[^\d+]/g, "");
  const isEmail = (s = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());

  // ⚙️ Find existing by email/mobile; else create; then select
  const handleCreateOrSelect = async () => {
    const fn = newClient.first_name.trim();
    const ln = newClient.last_name.trim();
    const em = newClient.email.trim();
    const mo = normPhone(newClient.mobile);

    if (!fn || !ln) {
      alert("Enter first and last name.");
      return;
    }
    if (em && !isEmail(em)) {
      alert("Enter a valid email (or leave blank).");
      return;
    }

    setCreating(true);
    try {
      // 1) Look up by email/mobile to avoid duplicates
      let q = supabase.from("clients").select("id,first_name,last_name,email,mobile").limit(1);
      if (em && mo) q = q.or(`email.eq.${em},mobile.eq.${mo}`);
      else if (em) q = q.eq("email", em);
      else if (mo) q = q.eq("mobile", mo);
      const { data: found, error: findErr } = await q;

      if (findErr) {
        console.error("Find client failed:", findErr.message);
      }

      if (found?.length) {
        // ✅ Use the existing one
        const existing = found[0];
        setSelectedClient(existing.id);
        onClientCreated?.(existing); // let parent refresh local list if it wants
        return;
      }

      // 2) Create a new client
      const { data: created, error: insErr } = await supabase
        .from("clients")
        .insert([{
          first_name: fn,
          last_name: ln,
          email: em || null,
          mobile: mo || null,
        }])
        .select("*")
        .single();

      if (insErr) {
        console.error("Create client failed:", insErr.message);
        alert("Couldn't create client. Please try again.");
        return;
      }

      // ✅ Select new client and inform parent
      setSelectedClient(created.id);
      onClientCreated?.(created);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div>
        <h3 className="text-lg font-bold mb-2 text-bronze">Select Client</h3>

        {selectedSlot && (
          <>
            <p className="text-sm text-gray-700 mb-2">
              Date: {format(selectedSlot.start, "eeee dd MMMM yyyy")}
            </p>
            <p className="text-sm text-gray-700 mb-3">
              Time: {format(selectedSlot.start, "HH:mm")} – {format(selectedSlot.end, "HH:mm")}
            </p>
          </>
        )}

        {/* Existing clients */}
        <label className="block text-sm mb-1 text-gray-700">Search existing</label>
        <Select
          options={clientOptions}
          value={clientOptions.find((opt) => opt.value === selectedClient) || null}
          onChange={(selected) => setSelectedClient(selected?.value)}
          placeholder="-- Select Client --"
          styles={{
            control: (base) => ({ ...base, backgroundColor: "white", color: "black" }),
            singleValue: (base) => ({ ...base, color: "black" }),
            option: (base, { isFocused, isSelected }) => ({
              ...base,
              backgroundColor: isSelected ? "#9b611e" : isFocused ? "#f1e0c5" : "white",
              color: "black",
            }),
          }}
        />

        {/* Divider */}
        <div className="my-3 h-px bg-gray-300" />

        {/* New client quick add */}
        <p className="text-sm font-semibold text-gray-800 mb-2">Or add a new client</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="First name"
            value={newClient.first_name}
            onChange={(e) => setNewClient({ ...newClient, first_name: e.target.value })}
          />
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="Last name"
            value={newClient.last_name}
            onChange={(e) => setNewClient({ ...newClient, last_name: e.target.value })}
          />
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="Email (optional)"
            type="email"
            value={newClient.email}
            onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
          />
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="Mobile (optional)"
            value={newClient.mobile}
            onChange={(e) => setNewClient({ ...newClient, mobile: e.target.value })}
          />
        </div>

        <div className="flex justify-between items-center mt-4">
          <button onClick={onClose} className="text-gray-500">Cancel</button>

          <div className="flex gap-2">
            {/* Create/select client first, then you can click Next */}
            <button
              onClick={handleCreateOrSelect}
              className="bg-black text-white px-4 py-2 rounded"
              disabled={creating}
            >
              {creating ? "Saving..." : "Use this client"}
            </button>

            <button
              onClick={onNext}
              className="bg-bronze text-white px-4 py-2 rounded"
              disabled={!selectedClient}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
