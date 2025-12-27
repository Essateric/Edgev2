import React, { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { addWeeks, addMonths, startOfDay, endOfDay } from "date-fns";
import Select from "react-select";
import { v4 as uuidv4 } from "uuid";
import baseSupabase from "../supabaseClient"; // ✅ adjust if your path differs

const recurrenceOptions = [
  { value: "none", label: "No repeat" },
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
];

const CUSTOM_TYPE = "__custom__";

const safeId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return uuidv4();
};

export default function ScheduleTaskModal({
  isOpen,
  onClose,
  slot,
  stylists,
  editingTask,
  onSave,
  supabaseClient,
}) {
  const supabase = supabaseClient || baseSupabase;

  // --- Task types ---
  const [taskTypes, setTaskTypes] = useState([]);
  const [taskTypeId, setTaskTypeId] = useState(""); // schedule_task_types.id or CUSTOM_TYPE
  const [typesLoading, setTypesLoading] = useState(false);
  const [typesError, setTypesError] = useState("");

  // --- Form ---
  const [title, setTitle] = useState("Scheduled task"); // used only when Custom
  const [details, setDetails] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [lock, setLock] = useState(false);
  const [recurrence, setRecurrence] = useState("none");
  const [occurrences, setOccurrences] = useState(1);
  const [applySeries, setApplySeries] = useState(true);
  const [selectedStylistIds, setSelectedStylistIds] = useState([]);
  const [start, setStart] = useState(slot?.start || new Date());
  const [end, setEnd] = useState(slot?.end || new Date());

  // -------- load task types on open --------
  useEffect(() => {
    let alive = true;
    if (!isOpen) return;

    setTypesError("");
    setTypesLoading(true);

    (async () => {
      try {
        const { data, error } = await supabase
          .from("schedule_task_types")
          .select("id, name, category, description, color, sort_order, is_active")
          .eq("is_active", true)
          .order("category", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });

        if (!alive) return;

        if (error) {
          console.error("[ScheduleTaskModal] schedule_task_types error:", error);
          setTaskTypes([]);
          setTypesError(error.message || "Failed to load task types");
          setTypesLoading(false);
          return;
        }

        setTaskTypes(data || []);
        setTypesLoading(false);
      } catch (e) {
        console.error("[ScheduleTaskModal] schedule_task_types crash:", e);
        if (!alive) return;
        setTaskTypes([]);
        setTypesError(e?.message || "Failed to load task types");
        setTypesLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isOpen, supabase]);

  const taskTypeMap = useMemo(() => {
    const m = new Map();
    (taskTypes || []).forEach((t) => m.set(t.id, t));
    return m;
  }, [taskTypes]);

  const taskTypeOptions = useMemo(() => {
    const byCat = new Map();

    for (const t of taskTypes || []) {
      const cat = t.category || "Other";
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push({ value: t.id, label: t.name });
    }

    const groups = Array.from(byCat.entries()).map(([label, options]) => ({
      label,
      options,
    }));

    groups.push({
      label: "Custom",
      options: [{ value: CUSTOM_TYPE, label: "Custom title…" }],
    });

    return groups;
  }, [taskTypes]);

  // -------- reset form on open --------
  useEffect(() => {
    if (!isOpen) return;

    if (editingTask) {
      setDetails(editingTask.details || "");
      setAllDay(!!editingTask.allDay);
      setLock(!!editingTask.is_locked);
      setRecurrence(editingTask.recurrence || "none");
      setOccurrences(editingTask.repeatCount || 1);
      setApplySeries(true);
      setSelectedStylistIds([editingTask.resourceId].filter(Boolean));
      setStart(new Date(editingTask.start));
      setEnd(new Date(editingTask.end));

      const existingTypeId =
        editingTask.task_type_id ||
        editingTask.taskTypeId ||
        editingTask.schedule_task_type_id ||
        "";

      if (existingTypeId && taskTypeMap.has(existingTypeId)) {
        setTaskTypeId(existingTypeId);
        setTitle(taskTypeMap.get(existingTypeId)?.name || editingTask.title || "Scheduled task");
      } else {
        // fallback: match by title
        const byName = (taskTypes || []).find(
          (t) =>
            String(t.name || "").toLowerCase() ===
            String(editingTask.title || "").toLowerCase()
        );
        if (byName?.id) {
          setTaskTypeId(byName.id);
          setTitle(byName.name);
        } else {
          setTaskTypeId(CUSTOM_TYPE);
          setTitle(editingTask.title || "Scheduled task");
        }
      }
      return;
    }

    // new
    setDetails("");
    setAllDay(false);
    setLock(false);
    setRecurrence("none");
    setOccurrences(1);
    setApplySeries(true);
    setSelectedStylistIds([slot?.resourceId].filter(Boolean));
    setStart(slot?.start || new Date());
    setEnd(slot?.end || new Date());

    // default select first type if available (once loaded)
    const first = (taskTypes || [])[0];
    if (first?.id) {
      setTaskTypeId(first.id);
      setTitle(first.name || "Scheduled task");
    } else {
      setTaskTypeId(CUSTOM_TYPE);
      setTitle("Scheduled task");
    }
  }, [isOpen, editingTask, slot, taskTypes, taskTypeMap]);

  // sync title to selected type (unless custom)
  useEffect(() => {
    if (!isOpen) return;
    if (!taskTypeId || taskTypeId === CUSTOM_TYPE) return;
    const t = taskTypeMap.get(taskTypeId);
    if (t?.name) setTitle(t.name);
  }, [taskTypeId, taskTypeMap, isOpen]);

  const stylistOptions = useMemo(
    () => (stylists || []).map((s) => ({ value: s.id, label: s.title || s.name || "Unknown" })),
    [stylists]
  );

  const selectedTypeOption = useMemo(() => {
    if (!taskTypeId) return null;
    if (taskTypeId === CUSTOM_TYPE) return { value: CUSTOM_TYPE, label: "Custom title…" };
    const t = taskTypeMap.get(taskTypeId);
    return t ? { value: t.id, label: t.name } : null;
  }, [taskTypeId, taskTypeMap]);

  const clampEnd = (s, e) => {
    if (!e || e <= s) return new Date(s.getTime() + 30 * 60000);
    return e;
  };

  const buildOccurrences = () => {
    const baseStart = allDay ? startOfDay(start) : start;
    const baseEnd = allDay ? endOfDay(end) : clampEnd(baseStart, end);

    const seriesId = editingTask?.seriesId || safeId();
    const count = Math.max(1, Number(occurrences) || 1);
    const resources = selectedStylistIds.length ? selectedStylistIds : [null];

    const typeRow = taskTypeId && taskTypeId !== CUSTOM_TYPE ? taskTypeMap.get(taskTypeId) : null;

    const resolvedTitle =
      taskTypeId === CUSTOM_TYPE
        ? (title || "Scheduled task")
        : (typeRow?.name || title || "Scheduled task");

    const instances = [];

    resources.forEach((rid) => {
      for (let i = 0; i < count; i++) {
        let s = new Date(baseStart);
        let e = new Date(baseEnd);

        if (recurrence === "weekly") {
          s = addWeeks(baseStart, i);
          e = addWeeks(baseEnd, i);
        } else if (recurrence === "fortnightly") {
          s = addWeeks(baseStart, i * 2);
          e = addWeeks(baseEnd, i * 2);
        } else if (recurrence === "monthly") {
          s = addMonths(baseStart, i);
          e = addMonths(baseEnd, i);
        }

        instances.push({
          id: safeId(),
          seriesId,
          title: resolvedTitle,
          details,
          start: s,
          end: e,
          resourceId: rid,
          isScheduledTask: true,
          allDay,
          recurrence,
          repeatCount: count,
          is_locked: lock,

          // ✅ store task type data
          task_type_id: taskTypeId !== CUSTOM_TYPE ? taskTypeId : null,
          task_type_name: typeRow?.name || (taskTypeId === CUSTOM_TYPE ? resolvedTitle : null),
          task_type_category: typeRow?.category || null,
          task_type_color: typeRow?.color || null,
        });
      }
    });

    return { seriesId, instances };
  };

  const canSave = selectedStylistIds.length > 0 && (!!taskTypeId || !!title);

  const handleSave = () => {
    const { seriesId, instances } = buildOccurrences();
    onSave?.({
      seriesId,
      replaceSeriesId: applySeries ? editingTask?.seriesId : null,
      replaceSingleId: !applySeries ? editingTask?.id : null,
      instances,
    });
    onClose?.();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingTask ? "Edit scheduled task" : "New scheduled task"}>
      <div className="space-y-3">
        {/* ✅ visible marker so you KNOW this file is being used */}
        <div className="text-[11px] text-gray-400">
          task types loaded: {typesLoading ? "loading…" : String(taskTypes?.length || 0)}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Task type</label>
          <Select
            options={taskTypeOptions}
            value={selectedTypeOption}
            onChange={(opt) => setTaskTypeId(opt?.value || CUSTOM_TYPE)}
            placeholder={typesLoading ? "Loading task types…" : "Choose a task type…"}
            styles={{ control: (base) => ({ ...base, minHeight: "38px" }) }}
          />
          {!!typesError && <p className="text-xs text-red-600 mt-1">{typesError}</p>}
        </div>

        {taskTypeId === CUSTOM_TYPE && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Title</label>
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bank holiday, training, maintenance…"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Details (optional)</label>
          <textarea
            className="w-full border rounded px-2 py-1 text-sm"
            rows={2}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Notes, impact, who is involved…"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Start</label>
            <input
              type="datetime-local"
              className="w-full border rounded px-2 py-1 text-sm"
              value={toInputValue(start)}
              onChange={(e) => setStart(new Date(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">End</label>
            <input
              type="datetime-local"
              className="w-full border rounded px-2 py-1 text-sm"
              value={toInputValue(end)}
              onChange={(e) => setEnd(new Date(e.target.value))}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            All day (blocks online bookings)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
            Lock task
          </label>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Columns / staff</label>
          <Select
            isMulti
            options={stylistOptions}
            value={stylistOptions.filter((o) => selectedStylistIds.includes(o.value))}
            onChange={(opts) => setSelectedStylistIds((opts || []).map((o) => o.value))}
            placeholder="Choose columns to block"
            styles={{ control: (base) => ({ ...base, minHeight: "38px" }) }}
          />
          {!selectedStylistIds.length && (
            <p className="text-xs text-amber-700 mt-1">Select at least one column to place the task.</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Repeat</label>
            <Select
              options={recurrenceOptions}
              value={recurrenceOptions.find((o) => o.value === recurrence)}
              onChange={(opt) => setRecurrence(opt?.value || "none")}
              styles={{ control: (base) => ({ ...base, minHeight: "38px" }) }}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Occurrences</label>
            <input
              type="number"
              min={1}
              max={52}
              className="w-full border rounded px-2 py-1 text-sm"
              value={occurrences}
              onChange={(e) => setOccurrences(Number(e.target.value) || 1)}
            />
          </div>
        </div>

        {editingTask?.seriesId && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={applySeries}
              onChange={(e) => setApplySeries(e.target.checked)}
            />
            Apply changes to entire series
          </label>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-600 hover:text-black">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded disabled:bg-indigo-300 disabled:cursor-not-allowed text-sm"
            disabled={!canSave}
          >
            {editingTask ? "Update task" : "Create task"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const toInputValue = (d) => {
  if (!d) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const dt = new Date(d);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(
    dt.getHours()
  )}:${pad(dt.getMinutes())}`;
};
