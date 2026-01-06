// src/components/clients/SelectClientModalStaff.jsx
import React, { useMemo, useState, useEffect, useCallback } from "react";
import Modal from "../Modal";
import AsyncSelect from "react-select/async";
import { format } from "date-fns";

const escapeLike = (str = "") =>
  String(str)
    .replace(/[%_]/g, "\\$&") // escape LIKE wildcards
    .replace(/,/g, " ") // commas can break PostgREST logic strings
    .trim();

    const normalizePhoneDigits = (s = "") => String(s || "").replace(/\D/g, "");

const makePhoneTokens = (digits = "") => {
  const d = String(digits || "");
  const tokens = [d, d.slice(-6), d.slice(0, 6)]
    .map((t) => (t || "").trim())
    .filter((t) => t.length >= 4);
  return [...new Set(tokens)];
};

const namesEqualCI = (a = "", b = "") =>
  String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();


export default function SelectClientModalStaff({
  supabaseClient,
  isOpen,
  onClose,
  clients, // optional initial cache
  selectedSlot,
  selectedClient,
  setSelectedClient,
  onNext,
  onScheduleTask,
  onClientCreated,
  bookingTagId,
  setBookingTagId,
}) {
  const [selectedOption, setSelectedOption] = useState(null);

  const [creating, setCreating] = useState(false);
  const [newClient, setNewClient] = useState({
    first_name: "",
    last_name: "",
    email: "",
    mobile: "",
  });

     const [tagOptions, setTagOptions] = useState([]);
    const [tagsLoading, setTagsLoading] = useState(false);
  

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

      // try local cache first
      const local = (clients || []).find((c) => c.id === selectedClient);
      if (local) {
        const name = `${local.first_name ?? ""} ${local.last_name ?? ""}`.trim();
        const label = local.mobile ? `${name} — ${local.mobile}` : name;
        setSelectedOption({ value: local.id, label, client: local });
        return;
      }

      if (!supabaseClient) return;

      const { data, error } = await supabaseClient
        .from("clients")
        .select("id, first_name, last_name, mobile, email")
        .eq("id", selectedClient)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        console.error("[SelectClientModalStaff] hydrate error:", error);
        return;
      }
      if (!data?.id) return;

      const name = `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim();
      const label = data.mobile ? `${name} — ${data.mobile}` : name;
      setSelectedOption({ value: data.id, label, client: data });
    }

    hydrateSelected();
    return () => {
      alive = false;
    };
  }, [isOpen, selectedClient, selectedOption, supabaseClient, clients]);

  useEffect(() => {
    if (!isOpen || !supabaseClient) return;

    const fetchTags = async () => {
      setTagsLoading(true);
      const { data, error } = await supabaseClient
        .from("booking_tags")
        .select("*")
        .eq("is_active", true)
        .order("label", { ascending: true });

      if (error) {
        console.warn("[SelectClientModalStaff] failed to load booking tags", error);
        setTagOptions([]);
      } else {
        setTagOptions(data || []);
      }
      setTagsLoading(false);
    };

    fetchTags();
  }, [isOpen, supabaseClient]);

  useEffect(() => {
    if (!isOpen) return;
    setBookingTagId?.(bookingTagId || null);
  }, [isOpen, bookingTagId, setBookingTagId]);

  // ✅ Google-like server search (contains anywhere, narrows as you type)
const loadClientOptions = useCallback(
  async (inputValue) => {
    if (!supabaseClient) return [];

    const s = String(inputValue || "").trim();
    const digits = s.replace(/\D/g, "");
    const safe = s.replace(/[%_]/g, "\\$&").replace(/,/g, " ");
    const like = `%${safe}%`;

    try {
      let q = supabaseClient
        .from("clients")
        .select("id, first_name, last_name, mobile, email, created_at")
        .limit(200);

      if (s) {
        const ors = [
          `first_name.ilike.${like}`,
          `last_name.ilike.${like}`,
          `email.ilike.${like}`,
          `mobile.ilike.%${s}%`,
        ];
        if (digits && digits !== s) ors.push(`mobile.ilike.%${digits}%`);

        q = q
          .or(ors.join(","))
          .order("first_name", { ascending: true, nullsFirst: true })
          .order("last_name", { ascending: true, nullsFirst: true });
      } else {
        q = q.order("created_at", { ascending: false, nullsFirst: true });
      }

      const { data, error } = await q;
      if (error) throw error;

      return (data || []).map((c) => {
        const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
        const label = c.mobile ? `${name} — ${c.mobile}` : name;
        return { value: c.id, label, client: c };
      });
    } catch (err) {
      console.error("[SelectClientModalStaff] client search error:", err);
      return [];
    }
  },
  [supabaseClient]
);


const handleCreateOrSelect = async () => {
  const fn = newClient.first_name.trim();
  const ln = newClient.last_name.trim();
  const em = newClient.email.trim();
  const rawMobile = newClient.mobile.trim();

  if (!fn || !ln) return alert("Enter first and last name.");
  if (!em && !rawMobile) return alert("Enter at least a mobile number or email.");
  if (!supabaseClient) return alert("Missing staff session. Please log in again.");

  const mobileDigits = normalizePhoneDigits(rawMobile);

  setCreating(true);
  try {
    // 1) Find same-name clients (case-insensitive exact)
    const { data: sameName, error: sameNameErr } = await supabaseClient
      .from("clients")
      .select("id, first_name, last_name, mobile, email")
      .ilike("first_name", fn)
      .ilike("last_name", ln)
      .limit(200);

    if (sameNameErr) throw sameNameErr;

    const sameNameList = sameName ?? [];
    const nameAlreadyExists = sameNameList.length > 0;

    // If name exists, require mobile (same as ManageClients)
    if (nameAlreadyExists && !mobileDigits) {
      alert(
        "That first + last name already exists. Please add a mobile number so we can confirm this is a different client."
      );
      return;
    }

    // 2) If mobile entered, stop duplicates
    if (mobileDigits) {
      // 2a) Same name + same mobile -> select existing
      const dupSameName = sameNameList.find((r) => {
        const rDigits = normalizePhoneDigits(r.mobile || "");
        return rDigits && rDigits === mobileDigits;
      });

      if (dupSameName) {
        const name = `${dupSameName.first_name ?? ""} ${dupSameName.last_name ?? ""}`.trim();
        const label = dupSameName.mobile ? `${name} — ${dupSameName.mobile}` : name;

        setSelectedClient(dupSameName.id);
        setSelectedOption({ value: dupSameName.id, label, client: dupSameName });
        alert("This client already exists and has been selected.");
        onClientCreated?.(dupSameName);
        return;
      }

      // 2b) Mobile used by ANY other client -> select that client (don’t create)
      const tokens = makePhoneTokens(mobileDigits);
      if (tokens.length) {
        const orClause = tokens.map((t) => `mobile.ilike.%${t}%`).join(",");

        const { data: phoneCandidates, error: phoneErr } = await supabaseClient
          .from("clients")
          .select("id, first_name, last_name, mobile, email")
          .or(orClause)
          .limit(200);

        if (phoneErr) throw phoneErr;

        const exactPhoneMatch = (phoneCandidates ?? []).find((r) => {
          const rDigits = normalizePhoneDigits(r.mobile || "");
          return rDigits && rDigits === mobileDigits;
        });

        if (exactPhoneMatch) {
          const sameNameAsMatch =
            namesEqualCI(exactPhoneMatch.first_name, fn) &&
            namesEqualCI(exactPhoneMatch.last_name, ln);

          const name = `${exactPhoneMatch.first_name ?? ""} ${exactPhoneMatch.last_name ?? ""}`.trim();
          const label = exactPhoneMatch.mobile ? `${name} — ${exactPhoneMatch.mobile}` : name;

          setSelectedClient(exactPhoneMatch.id);
          setSelectedOption({ value: exactPhoneMatch.id, label, client: exactPhoneMatch });

          alert(
            sameNameAsMatch
              ? "This client already exists and has been selected."
              : `That mobile number is already used by ${name}. The existing client has been selected.`
          );

          onClientCreated?.(exactPhoneMatch);
          return;
        }
      }
    }

    // 3) Insert new client (same as ManageClients)
    const { data: inserted, error: insErr } = await supabaseClient
      .from("clients")
      .insert([
        {
          first_name: fn,
          last_name: ln || null,
          mobile: rawMobile || null,
          email: em || null,
        },
      ])
      .select("id, first_name, last_name, mobile, email")
      .single();

    if (insErr) throw insErr;

    const name = `${inserted.first_name ?? ""} ${inserted.last_name ?? ""}`.trim();
    const label = inserted.mobile ? `${name} — ${inserted.mobile}` : name;

    setSelectedClient(inserted.id);
    setSelectedOption({ value: inserted.id, label, client: inserted });

    // optional: clear form after successful add
    setNewClient({ first_name: "", last_name: "", email: "", mobile: "" });

    onClientCreated?.(inserted);
    alert("Client added and selected.");
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

        <div className="mb-3">
          <label className="block text-sm mb-1 text-gray-700">Booking tag (optional)</label>
          <select
            className="w-full border rounded px-2 py-2 text-sm bg-white"
            value={bookingTagId || ""}
            onChange={(e) => setBookingTagId?.(e.target.value || null)}
            disabled={tagsLoading}
          >
            <option value="">No tag</option>
            {(tagOptions || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} ({t.code})
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-600 mt-1">
            Choose a label to attach to this booking when it’s created.
          </p>
        </div>

        <label className="block text-sm mb-1 text-gray-700">Search existing</label>

        <AsyncSelect
          defaultOptions // ✅ always load from server when menu opens
          cacheOptions={false} // ✅ avoid caching empty results during auth/RLS hiccups
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
              onClick={() => {
                onClose?.();
                onScheduleTask?.(selectedSlot);
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded transition-colors disabled:bg-indigo-300 disabled:cursor-not-allowed"
            >
              Schedule task
            </button>

            <button
              onClick={handleCreateOrSelect}
              className="bg-black text-white px-4 py-2 rounded"
              disabled={creating}
            >
              {creating ? "Saving..." : "Add client"}
            </button>

            <button
              onClick={() => onNext?.(selectedOption?.client || null)}
              className="bg-bronze text-white px-4 py-2 rounded"
              disabled={!selectedOption?.value}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
