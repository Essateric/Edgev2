import React, { useEffect, useMemo, useState, useCallback } from "react";
import Modal from "../Modal";
import AsyncSelect from "react-select/async";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { v4 as uuidv4 } from "uuid";
import { supabase as defaultSupabase } from "../../supabaseClient";

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



export default function SelectClientModal({
  isOpen,
  onClose,
  clients,
  selectedSlot,
  selectedClient,
  setSelectedClient,
  onNext,
  onScheduleTask,
  onClientCreated,
  supabaseClient,
  onBlockCreated,
}) {
  const supabase = supabaseClient || defaultSupabase;

  // Local options only used as a fast initial cache (AsyncSelect still queries DB)
  const defaultClientOptions = useMemo(() => {
    return (clients || []).map((c) => {
      const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
      const label = c.mobile ? `${name} — ${c.mobile}` : name;
      return { value: c.id, label, client: c };
    });
  }, [clients]);

  // Keep selected option visible even if it’s not in the default list
  const [selectedOption, setSelectedOption] = useState(null);

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

      if (!supabase) return;

      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, mobile, email")
        .eq("id", selectedClient)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        console.error("[SelectClientModal] hydrate error:", error);
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
  }, [isOpen, selectedClient, selectedOption, supabase, clients]);

  // ---- MODE kept for existing logic, but UI toggle removed.
  // We keep it locked to "booking" so the top Booking/Task buttons are gone.
  const [mode, setMode] = useState("booking"); // "booking" | "task"
  useEffect(() => {
    if (!isOpen) return;
    setMode("booking");
  }, [isOpen]);

  // --- New client mini-form state ---
  const [creating, setCreating] = useState(false);
  const [newClient, setNewClient] = useState({
    first_name: "",
    last_name: "",
    email: "",
    mobile: "",
  });

  // --- Task blocks (existing logic kept, but no longer shown since mode is locked) ---
  const [taskTypes, setTaskTypes] = useState([]);
  const [selectedTaskType, setSelectedTaskType] = useState("");
  const [blockStart, setBlockStart] = useState(null);
  const [blockEnd, setBlockEnd] = useState(null);
  const [savingBlock, setSavingBlock] = useState(false);

  useEffect(() => {
    if (!isOpen || !supabase) return;
    if (mode !== "task") return;

    const fetchTaskTypes = async () => {
      const { data, error } = await supabase.from("schedule_task_types").select("*");
      if (error) {
        console.error("Failed to load task types", error);
        toast.error("Could not load task types");
        return;
      }
      setTaskTypes(data || []);
      if (!selectedTaskType && data?.length) {
        const active = data.find((t) => t.is_active !== false);
        setSelectedTaskType((active || data[0])?.id || "");
      }
    };

    fetchTaskTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, supabase, mode]);

  useEffect(() => {
    if (!selectedSlot?.start || !selectedSlot?.end) return;
    setBlockStart(new Date(selectedSlot.start));
    setBlockEnd(new Date(selectedSlot.end));
  }, [selectedSlot?.start, selectedSlot?.end]);

  const findTaskLabel = (id) => {
    const row = taskTypes.find((t) => t.id === id) || {};
    return row.name || row.title || row.label || row.task_type || row.type || "Blocked";
  };

  const toLocalDateTimeValue = (d) => {
    if (!d) return "";
    const pad = (v) => `${v}`.padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  };

  const handleBlockCreate = async () => {
    if (!supabase) {
      toast.error("No Supabase client available");
      return;
    }
    if (!selectedSlot?.resourceId) {
      toast.error("Select a staff member to block out time.");
      return;
    }
    if (!selectedTaskType) {
      toast.error("Pick a task type");
      return;
    }

    const start = blockStart ? new Date(blockStart) : null;
    const end = blockEnd ? new Date(blockEnd) : null;

    if (!start || !end || !(end > start)) {
      toast.error("End time must be after start time.");
      return;
    }

    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
    if (durationMinutes > 12 * 60) {
      toast.error("Blocks can’t be longer than 12 hours.");
      return;
    }

    setSavingBlock(true);
    const booking_id = uuidv4();
    const title = findTaskLabel(selectedTaskType);

    try {
      const { data, error } = await supabase
        .from("bookings")
        .insert([
          {
            booking_id,
            client_id: null,
            resource_id: selectedSlot.resourceId,
            start: start.toISOString(),
            end: end.toISOString(),
            title,
            status: "blocked",
            source: "staff",
            duration: durationMinutes,
          },
        ])
        .select("*")
        .single();

      if (error) throw error;

      toast.success("Task scheduled (blocked)");
      try {
        onBlockCreated?.(data);
      } catch (e) {
        console.warn("onBlockCreated callback failed:", e);
      }
      onClose?.();
    } catch (err) {
      console.error("Failed to create block", err);
      toast.error(err?.message || "Could not create block");
    } finally {
      setSavingBlock(false);
    }
  };

  // ✅ SAME search style as ManageClients (contains anywhere)
  const loadClientOptions = useCallback(
    async (inputValue) => {
      if (!supabase) return [];

      const s = String(inputValue || "").trim();
      const safe = escapeLike(s);
      const digits = s.replace(/\D/g, "");
      const like = `%${safe}%`;

      try {
        let q = supabase
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
        console.error("[SelectClientModal] client search error:", err);
        return [];
      }
    },
    [supabase]
  );

const handleCreateOrSelect = async () => {
  const fn = newClient.first_name.trim();
  const ln = newClient.last_name.trim();
  const em = newClient.email.trim();
  const rawMobile = newClient.mobile.trim();

  if (!fn || !ln) {
    toast.error("Enter first and last name.");
    return;
  }
  if (!em && !rawMobile) {
    toast.error("Enter at least a mobile number or email.");
    return;
  }
  if (!supabase) {
    toast.error("No Supabase client available.");
    return;
  }

  const mobileDigits = normalizePhoneDigits(rawMobile);

  setCreating(true);
  try {
    // 1) same-name clients (case-insensitive exact)
    const { data: sameName, error: sameNameErr } = await supabase
      .from("clients")
      .select("id, first_name, last_name, mobile, email")
      .ilike("first_name", fn)
      .ilike("last_name", ln)
      .limit(200);

    if (sameNameErr) throw sameNameErr;

    const sameNameList = sameName ?? [];
    const nameAlreadyExists = sameNameList.length > 0;

    // If name exists, require mobile (ManageClients rule)
    if (nameAlreadyExists && !mobileDigits) {
      toast.error(
        "That first + last name already exists. Please add a mobile number so we can confirm this is a different client."
      );
      return;
    }

    // 2) if mobile entered, stop duplicates
    if (mobileDigits) {
      // 2a) same name + same mobile -> select existing
      const dupSameName = sameNameList.find((r) => {
        const rDigits = normalizePhoneDigits(r.mobile || "");
        return rDigits && rDigits === mobileDigits;
      });

      if (dupSameName) {
        const name = `${dupSameName.first_name ?? ""} ${dupSameName.last_name ?? ""}`.trim();
        const label = dupSameName.mobile ? `${name} — ${dupSameName.mobile}` : name;

        setSelectedClient(dupSameName.id);
        setSelectedOption({ value: dupSameName.id, label, client: dupSameName });

        onClientCreated?.(dupSameName);
        toast.success("Client already existed — selected.");
        return;
      }

      // 2b) mobile used by ANY client -> select that client
      const tokens = makePhoneTokens(mobileDigits);
      if (tokens.length) {
        const orClause = tokens.map((t) => `mobile.ilike.%${t}%`).join(",");

        const { data: phoneCandidates, error: phoneErr } = await supabase
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

          onClientCreated?.(exactPhoneMatch);

          toast.success(
            sameNameAsMatch
              ? "Client already existed — selected."
              : `That phone number is already used by ${name} — selected existing client.`
          );
          return;
        }
      }
    }

    // 3) insert new client
    const { data: inserted, error: insErr } = await supabase
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

    setNewClient({ first_name: "", last_name: "", email: "", mobile: "" });

    onClientCreated?.(inserted);
    toast.success("Client added and selected.");
  } catch (e) {
    console.error("[SelectClientModal] create/select failed:", e);
    toast.error(e?.message || "Couldn't create/select client.");
  } finally {
    setCreating(false);
  }
};

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-bronze">Select Client</h3>
        </div>

        {selectedSlot && (
          <>
            <p className="text-sm text-gray-700 mb-1">
              Date: {format(new Date(selectedSlot.start), "eeee dd MMMM yyyy")}
            </p>
            <p className="text-sm text-gray-700 mb-3">
              Time: {format(new Date(selectedSlot.start), "HH:mm")} –{" "}
              {format(new Date(selectedSlot.end), "HH:mm")}
            </p>
          </>
        )}

        {mode === "booking" && (
          <>
            <label className="block text-sm mb-1 text-gray-700">Search existing</label>

            <AsyncSelect
              defaultOptions={defaultClientOptions.length ? defaultClientOptions : true}
              cacheOptions={false}
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
              <button type="button" onClick={onClose} className="text-gray-500">
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  const slotToSend = selectedSlot
                    ? {
                        ...selectedSlot,
                        start: new Date(selectedSlot.start),
                        end: new Date(selectedSlot.end),
                      }
                    : null;

                  if (
                    !slotToSend?.start ||
                    !slotToSend?.end ||
                    isNaN(slotToSend.start) ||
                    isNaN(slotToSend.end)
                  ) {
                    toast.error("Slot time is missing/invalid");
                    return;
                  }

                  onScheduleTask?.(slotToSend);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded transition-colors disabled:bg-indigo-300 disabled:cursor-not-allowed"
              >
                Schedule task
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCreateOrSelect}
                  className="bg-black text-white px-4 py-2 rounded"
                  disabled={creating}
                >
                  {creating ? "Saving..." : "Add client"}
                </button>

                <button
                  type="button"
                  onClick={onNext}
                  className="bg-bronze text-white px-4 py-2 rounded disabled:bg-bronze/40 disabled:cursor-not-allowed"
                  disabled={!selectedClient}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}

        {mode === "task" && (
          <>
            <div className="my-3 h-px bg-gray-300" />

            <div className="space-y-3">
              <p className="text-xs text-gray-600">
                This creates a <b>blocked</b> hold (no client). Online bookings won’t be made from here.
                Max 12 hours.
              </p>

              <div className="space-y-2">
                <label className="text-sm text-gray-700">Task type</label>
                <select
                  className="w-full border rounded px-2 py-2 text-sm"
                  value={selectedTaskType}
                  onChange={(e) => setSelectedTaskType(e.target.value)}
                  disabled={savingBlock || !taskTypes.length}
                >
                  {!taskTypes.length && <option value="">Loading...</option>}
                  {taskTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {findTaskLabel(t.id)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm text-gray-700">Start</label>
                  <input
                    type="datetime-local"
                    className="w-full border rounded px-2 py-2 text-sm"
                    value={toLocalDateTimeValue(blockStart)}
                    onChange={(e) => setBlockStart(new Date(e.target.value))}
                    disabled={savingBlock}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-gray-700">End</label>
                  <input
                    type="datetime-local"
                    className="w-full border rounded px-2 py-2 text-sm"
                    value={toLocalDateTimeValue(blockEnd)}
                    onChange={(e) => setBlockEnd(new Date(e.target.value))}
                    disabled={savingBlock}
                  />
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setMode("booking")}
                  className="text-gray-500"
                  disabled={savingBlock}
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={handleBlockCreate}
                  className="bg-gray-900 text-white px-4 py-2 rounded disabled:opacity-60"
                  disabled={savingBlock || !selectedTaskType}
                >
                  {savingBlock ? "Saving..." : "Create Task"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
