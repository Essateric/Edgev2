import React, { useEffect, useMemo, useState } from "react";
import Modal from "../Modal";
import Select from "react-select";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { v4 as uuidv4 } from "uuid";
import { supabase as defaultSupabase } from "../../supabaseClient";
import { findOrCreateClient } from "../../onlinebookings/lib/findOrCreateClient.js";

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

  const clientOptions = useMemo(
    () =>
      (clients || []).map((c) => ({
        value: c.id,
        label: `${c.first_name ?? ""} ${c.last_name ?? ""} — ${c.mobile ?? ""}`.trim(),
      })),
    [clients]
  );

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
    // Keep existing logic, but only load task types if mode ever becomes "task"
    // (Right now it won’t, because we removed the toggle buttons.)
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

  const handleCreateOrSelect = async () => {
    const fn = newClient.first_name.trim();
    const ln = newClient.last_name.trim();
    const em = newClient.email.trim();
    const mo = newClient.mobile;

    if (!fn || !ln) {
      toast.error("Enter first and last name.");
      return;
    }

    setCreating(true);
    try {
      const clientRow = await findOrCreateClient({
        first_name: fn,
        last_name: ln,
        email: em,
        mobile: mo,
        requireEmail: false,
      });

      setSelectedClient(clientRow.id);
      onClientCreated?.(clientRow);
      toast.success("Client selected");
    } catch (e) {
      console.error("Create/select client failed:", e?.message || e);
      toast.error(e?.message || "Couldn't create/select client.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div>
        {/* ✅ Title stays, but top Booking/Task buttons removed */}
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

        {/* ---------------- BOOKING MODE (always shown) ---------------- */}
        {mode === "booking" && (
          <>
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

            {/* ✅ Bottom buttons kept exactly like your screenshot */}
            <div className="flex justify-between items-center mt-4">
              <button type="button" onClick={onClose} className="text-gray-500">
                Cancel
              </button>

<button
  type="button"
  onClick={() => {
    console.log("[SelectClientModal] Schedule task clicked", {
      hasOnScheduleTask: typeof onScheduleTask === "function",
      selectedSlot,
    });

    // IMPORTANT: pass Dates (ScheduleTaskModal expects Dates)
    const slotToSend = selectedSlot
      ? {
          ...selectedSlot,
          start: new Date(selectedSlot.start),
          end: new Date(selectedSlot.end),
        }
      : null;

    if (!slotToSend?.start || !slotToSend?.end || isNaN(slotToSend.start) || isNaN(slotToSend.end)) {
      toast.error("Slot time is missing/invalid");
      return;
    }

    // Let parent handle closing + opening modal (best)
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
                  {creating ? "Saving..." : "Use this client"}
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

        {/* ---------------- TASK MODE (logic kept, UI hidden because mode is locked) ---------------- */}
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
