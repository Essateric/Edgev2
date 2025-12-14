// src/components/clients/SelectClientModalStaff.jsx
import React, { useMemo, useState, useEffect } from "react";
import Modal from "../Modal";
import AsyncSelect from "react-select/async";
import { format } from "date-fns";
import { findOrCreateClientStaff } from "../../lib/findOrCreateClientStaff.js";

export default function SelectClientModalStaff({
  supabaseClient, // ✅ REQUIRED (pass auth.supabaseClient from CalendarPage)
  isOpen,
  onClose,
  clients, // optional initial cache
  selectedSlot,
  selectedClient,
  setSelectedClient,
  onNext,
  onClientCreated,
}) {
  const defaultClientOptions = useMemo(() => {
    return (clients || []).map((c) => {
      const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
      const label = c.mobile ? `${name} — ${c.mobile}` : name;
      return { value: c.id, label, client: c };
    });
  }, [clients]);

  const [selectedOption, setSelectedOption] = useState(null);

  const [creating, setCreating] = useState(false);
  const [newClient, setNewClient] = useState({
    first_name: "",
    last_name: "",
    email: "",
    mobile: "",
  });

  // Keep selected option visible even if it wasn’t in the default list
  useEffect(() => {
    let alive = true;

    async function hydrateSelected() {
      if (!isOpen) return;

      if (!selectedClient) {
        setSelectedOption(null);
        return;
      }

      if (selectedOption?.value === selectedClient) return;

      const fromDefaults = defaultClientOptions.find((o) => o.value === selectedClient);
      if (fromDefaults) {
        setSelectedOption(fromDefaults);
        return;
      }

      if (!supabaseClient) return;

      const { data, error } = await supabaseClient
        .from("clients")
        .select("id, first_name, last_name, mobile, email")
        .eq("id", selectedClient)
        .single();

      if (!alive) return;

      if (error) {
        console.error("[SelectClientModalStaff] hydrate error:", error);
        return;
      }

      const name = `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim();
      const label = data.mobile ? `${name} — ${data.mobile}` : name;
      setSelectedOption({ value: data.id, label, client: data });
    }

    hydrateSelected();
    return () => {
      alive = false;
    };
  }, [isOpen, selectedClient, selectedOption, defaultClientOptions, supabaseClient]);

  // ✅ Server-side search from public.clients
  const loadClientOptions = async (inputValue) => {
    if (!supabaseClient) return [];

    const raw = (inputValue || "").trim();
    const s = raw.replace(/,/g, " ").trim(); // prevent breaking .or() string

    let q = supabaseClient
      .from("clients")
      .select("id, first_name, last_name, mobile, email")
      .order("first_name", { ascending: true })
      .limit(100);

    if (s) {
      q = q.or(
        `first_name.ilike.%${s}%,last_name.ilike.%${s}%,mobile.ilike.%${s}%,email.ilike.%${s}%`
      );
    }

    const { data, error } = await q;

    if (error) {
      console.error("[SelectClientModalStaff] client search error:", error);
      return [];
    }

    return (data || []).map((c) => {
      const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
      const label = c.mobile ? `${name} — ${c.mobile}` : name;
      return { value: c.id, label, client: c };
    });
  };

  const handleCreateOrSelect = async () => {
    const fn = newClient.first_name.trim();
    const ln = newClient.last_name.trim();
    const em = newClient.email.trim();
    const mo = newClient.mobile;

    if (!fn || !ln) {
      alert("Enter first and last name.");
      return;
    }
    if (!supabaseClient) {
      alert("Missing staff session. Please log in again.");
      return;
    }

    setCreating(true);
    try {
      const clientRow = await findOrCreateClientStaff(supabaseClient, {
        first_name: fn,
        last_name: ln,
        email: em,
        mobile: mo,
      });

      const name = `${clientRow.first_name ?? ""} ${clientRow.last_name ?? ""}`.trim();
      const label = clientRow.mobile ? `${name} — ${clientRow.mobile}` : name;

      setSelectedClient(clientRow.id);
      setSelectedOption({ value: clientRow.id, label, client: clientRow });

      onClientCreated?.(clientRow);
    } catch (e) {
      console.error("[SelectClientModalStaff] create/select failed:", e);
      alert(e?.message || "Couldn't create/select client.");
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

        <label className="block text-sm mb-1 text-gray-700">Search existing</label>

        <AsyncSelect
          cacheOptions
          defaultOptions={defaultClientOptions.length ? defaultClientOptions : true}
          loadOptions={loadClientOptions}
          value={selectedOption}
          onChange={(opt) => {
            setSelectedOption(opt || null);
            setSelectedClient(opt?.value || null);
          }}
          placeholder="-- Select Client --"
          filterOption={null}
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

        <div className="my-3 h-px bg-gray-300" />

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
          <button onClick={onClose} className="text-gray-500">
            Cancel
          </button>

          <div className="flex gap-2">
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
