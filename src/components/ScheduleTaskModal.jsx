import React, { useEffect, useMemo, useRef, useState } from "react";
import Select from "react-select";
import toast from "react-hot-toast";
import { format } from "date-fns";
import Modal from "./Modal";
import { useAuth } from "../contexts/AuthContext.jsx";

const clampInt = (n, min, max) => Math.max(min, Math.min(max, n));

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

const parseLocalDateTime = (s) => {
  if (!s || typeof s !== "string" || !s.includes("T")) return null;
  const [datePart, timePart] = s.split("T");
  const [y, m, d] = datePart.split("-").map((x) => Number(x));
  const [hh, mm] = timePart.split(":").map((x) => Number(x));
  if (!y || !m || !d) return null;
  return new Date(y, (m || 1) - 1, d, hh || 0, mm || 0, 0, 0);
};

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const isSameDay = (a, b) => {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

const addHours = (date, hours) =>
  new Date(date.getTime() + hours * 60 * 60 * 1000);

const DEFAULT_END_HOURS = 1;

const getStaffWorkingBounds = (baseDate, staffId, stylists) => {
  if (!baseDate || !staffId) return null;
  const staff = (stylists || []).find((s) => s.id === staffId);
  if (!staff) return null;

  const dayName = DAY_LABELS[new Date(baseDate).getDay()];
  const hours = staff?.weeklyHours?.[dayName];
  if (!hours || hours.off) return null;

  const [startHour, startMinute] = String(hours.start || "")
    .split(":")
    .map(Number);
  const [endHour, endMinute] = String(hours.end || "")
    .split(":")
    .map(Number);
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return null;

  const start = new Date(baseDate);
  start.setHours(startHour || 0, startMinute || 0, 0, 0);

  const end = new Date(baseDate);
  end.setHours(endHour || 0, endMinute || 0, 0, 0);

  if (!(end > start)) return null;
  return { start, end };
};

const resolveAllDayBounds = (baseDate, staffId, stylists) =>
  getStaffWorkingBounds(baseDate, staffId, stylists);

const matchesAllDayBounds = (startDate, endDate, staffId, stylists) => {
  if (!startDate || !endDate || !staffId) return false;
  const bounds = resolveAllDayBounds(startDate, staffId, stylists);
  if (!bounds) return false;
  return (
    bounds.start.getTime() === startDate.getTime() &&
    bounds.end.getTime() === endDate.getTime()
  );
};

export default function ScheduleTaskModal({
  isOpen,
  onClose,
  slot,
  stylists = [],
  editingTask = null,
  onSave,
  supabaseClient: supabaseClientProp, // ✅ ACCEPT THE PROP
}) {
  const auth = useAuth();

  // ✅ Use prop first, then auth fallback
  const supabase = supabaseClientProp || auth?.supabaseClient || null;

  const isEditing = !!editingTask?.id;
  const editingSeriesId = editingTask?.repeat_series_id || null;

  // --- task types ---
  const [taskTypes, setTaskTypes] = useState([]);
  const [taskTypeId, setTaskTypeId] = useState("");

  useEffect(() => {
    if (!isOpen || !supabase) return;

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("schedule_task_types")
        .select("*")
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.warn(
          "[ScheduleTaskModal] failed to load schedule_task_types",
          error
        );
        toast.error("Couldn’t load task types (check table name / RLS).");
        setTaskTypes([]);
        return;
      }

      const rows = (data || []).filter(
        (t) => (t?.is_active ?? t?.active ?? true) !== false
      );

      setTaskTypes(rows);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, supabase]);

  const selectedTaskType = useMemo(
    () => taskTypes.find((t) => t.id === taskTypeId) || null,
    [taskTypes, taskTypeId]
  );

  const taskTypeOptions = useMemo(() => {
    return (taskTypes || []).map((t) => ({
      value: t.id,
      label: `${t.category ? `${t.category} — ` : ""}${t.name}`,
    }));
  }, [taskTypes]);

  const taskTitle = useMemo(() => {
    if (!selectedTaskType) return "Scheduled task";
    return selectedTaskType.name || "Scheduled task";
  }, [selectedTaskType]);

  // --- fields ---
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [allDay, setAllDay] = useState(false);
  const [lockTask, setLockTask] = useState(false);

  // ✅ tracks if user manually edited End (so we stop auto-changing it)
  const endTouchedRef = useRef(false);

  const getDefaultEnd = (s) => (s ? addHours(s, DEFAULT_END_HOURS) : null);

  const ensureEndValidForStart = (nextStart) => {
    if (!nextStart) return;
    const minEnd = getDefaultEnd(nextStart);

    setEnd((cur) => {
      if (!endTouchedRef.current) return minEnd; // default behavior
      if (!cur || !(cur > nextStart)) return minEnd; // repair invalid end
      return cur;
    });
  };

  // --- staff multi select ---
  const staffOptions = useMemo(() => {
    return (stylists || []).map((s) => ({
      value: s.id,
      label: s.title || s.name || "Staff",
    }));
  }, [stylists]);

  const [staffIds, setStaffIds] = useState([]);

  const selectedStaffValue = useMemo(() => {
    const set = new Set(staffIds);
    return staffOptions.filter((o) => set.has(o.value));
  }, [staffIds, staffOptions]);

  // --- repeat ---
  const [repeatRule, setRepeatRule] = useState("none"); // none | weekly | fortnightly | monthly
  const repeatEnabled = repeatRule !== "none";

  const [occurrences, setOccurrences] = useState(1);
  const [occurrencesText, setOccurrencesText] = useState("1");
  useEffect(() => {
    setOccurrencesText(String(occurrences || 1));
  }, [occurrences]);

  const [applyToSeries, setApplyToSeries] = useState(false);
  const [deleteScope, setDeleteScope] = useState("occurrence"); // single | occurrence | series

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!allDay) return;
    const baseDate = start || end || slot?.start || new Date();
    const primaryStaffId = staffIds[0] || slot?.resourceId || null;
    const bounds = resolveAllDayBounds(baseDate, primaryStaffId, stylists);
    if (!bounds) return;

    // when all-day, the system controls end/start
    endTouchedRef.current = true;

    if (!start || bounds.start.getTime() !== start.getTime()) {
      setStart(bounds.start);
    }
    if (!end || bounds.end.getTime() !== end.getTime()) {
      setEnd(bounds.end);
    }
  }, [allDay, staffIds, slot?.start, slot?.resourceId, start, end, stylists]);

  // Init fields when opening
  useEffect(() => {
    if (!isOpen) return;

    setTaskTypeId(
      String(editingTask?.task_type_id || editingTask?.taskTypeId || "")
    );

    setSaving(false);

    // creating: auto default end; editing: preserve
    endTouchedRef.current = isEditing ? true : false;

    const s = editingTask?.start
      ? new Date(editingTask.start)
      : slot?.start
      ? new Date(slot.start)
      : null;

    const eRaw = editingTask?.end
      ? new Date(editingTask.end)
      : slot?.end
      ? new Date(slot.end)
      : null;

    let e = eRaw;
    if (s) {
      const minEnd = getDefaultEnd(s);

      if (isEditing) {
        if (!e || !(e > s)) e = minEnd;
      } else {
        if (!e || !(e > s)) e = minEnd;
        else if (e.getTime() < minEnd.getTime()) e = minEnd;
      }
    }

    setStart(s);
    setEnd(e);

    const hasAllDayFlag = typeof editingTask?.allDay === "boolean";
    const primaryStaffId =
      editingTask?.staff_id ||
      editingTask?.resourceId ||
      (Array.isArray(editingTask?.staffIds) ? editingTask.staffIds[0] : null) ||
      slot?.resourceId ||
      null;

    const initialAllDay =
      hasAllDayFlag
        ? !!editingTask?.allDay
        : matchesAllDayBounds(s, e, primaryStaffId, stylists);

    setAllDay(initialAllDay);
    setLockTask(!!editingTask?.is_locked);

    setRepeatRule("none");
    setOccurrences(1);
    setOccurrencesText("1");

    setApplyToSeries(false);
const multiStaff =
  Array.isArray(editingTask?.staffIds) && editingTask.staffIds.length > 1;

setDeleteScope(editingSeriesId || multiStaff ? "occurrence" : "single");


    if (isEditing) {
      const ids = Array.isArray(editingTask?.staffIds)
        ? editingTask.staffIds.filter(Boolean)
        : editingTask?.staff_id
        ? [editingTask.staff_id]
        : editingTask?.resourceId
        ? [editingTask.resourceId]
        : [];
      const fallbackRid = slot?.resourceId || null;
      setStaffIds(ids.length ? ids : fallbackRid ? [fallbackRid] : []);
    } else {
      const rid = slot?.resourceId || null;
      setStaffIds(rid ? [rid] : []);
    }
  }, [isOpen, isEditing, editingTask, slot, stylists, editingSeriesId]);

  // ✅ FIX: do NOT include is_locked in the normal update/create payload.
  // Lock/unlock must be a separate action (handled in CalendarPage via RPC),
  // otherwise your update path can be blocked by RLS and "delete → insert" flows.
  const onPrimarySave = async () => {
    if (!supabase) return toast.error("No Supabase client available");

    const baseDate = start || end || slot?.start || new Date();
    const primaryStaffId = staffIds[0] || slot?.resourceId || null;

    const bounds = allDay
      ? resolveAllDayBounds(baseDate, primaryStaffId, stylists)
      : { start, end };

    const dayStart = bounds?.start;
    const dayEnd = bounds?.end;

    if (allDay && !resolveAllDayBounds(baseDate, primaryStaffId, stylists)) {
      return toast.error("All-day tasks must match staff working hours.");
    }

    if (!dayStart || !dayEnd || !(dayEnd > dayStart)) {
      return toast.error("End must be after start");
    }
    if (!taskTypeId) return toast.error("Pick a task type");
    if (!staffIds.length) return toast.error("Pick at least one staff member");

    if (!allDay) {
      const durMin = Math.round((dayEnd.getTime() - dayStart.getTime()) / 60000);
      if (durMin > 12 * 60) return toast.error("Tasks can’t be longer than 12 hours.");
    }

    setSaving(true);
    try {
      // Track lock change for edits (so we can call set_lock separately)
      const prevLocked = !!editingTask?.is_locked;
      const lockChanged = isEditing && lockTask !== prevLocked;

      await onSave?.({
        action: isEditing ? "update" : "create",
        payload: {
          taskTypeId,
          title: taskTitle,
          start: dayStart,
          end: dayEnd,
          allDay,

          // ❌ IMPORTANT: do NOT send is_locked here
          // is_locked: lockTask,

          staffIds,
          repeatRule,
          occurrences: repeatEnabled
            ? clampInt(Number(occurrences) || 1, 1, 52)
            : 1,
          applyToSeries: !!applyToSeries,
          editingMeta: isEditing
            ? {
                id: editingTask?.id,
                repeat_series_id: editingSeriesId,
                oldStart: editingTask?.start ? new Date(editingTask.start) : null,
                oldEnd: editingTask?.end ? new Date(editingTask.end) : null,
                task_type_id:
                  editingTask?.task_type_id || editingTask?.taskTypeId || null,
                staff_id: editingTask?.staff_id || editingTask?.resourceId || null,
                start: editingTask?.start || null,
                end: editingTask?.end || null,
                created_by: editingTask?.created_by || null,
                occurrenceIds: Array.isArray(editingTask?.occurrenceIds)
  ? editingTask.occurrenceIds.filter(Boolean)
  : null,

              }
            : null,
        },
      });

      // ✅ Lock/unlock as a separate audited action
      // (CalendarPage should implement action === "set_lock" using your RPC)
      if (lockChanged) {
        await onSave?.({
          action: "set_lock",
          payload: {
            id: editingTask?.id,
            is_locked: lockTask,
            reason: null,
          },
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!isEditing) return;

    const scopeLabel =
      deleteScope === "series"
        ? "Delete ALL occurrences in this series?"
        : deleteScope === "single"
        ? "Delete ONLY this staff slot?"
        : "Delete this entire occurrence (all staff)?";

    const ok = window.confirm(scopeLabel);
    if (!ok) return;

    setSaving(true);
    try {
      await onSave?.({
        action: "delete",
        payload: {
          applyToSeries: !!applyToSeries,
          deleteScope,
          editingMeta: {
            id: editingTask?.id,
            repeat_series_id: editingSeriesId,
            task_type_id: editingTask?.task_type_id || editingTask?.taskTypeId || null,
            staff_id: editingTask?.staff_id || editingTask?.resourceId || null,
            start: editingTask?.start || null,
            end: editingTask?.end || null,
            created_by: editingTask?.created_by || null,
             occurrenceIds: Array.isArray(editingTask?.occurrenceIds)
           ? editingTask.occurrenceIds.filter(Boolean)
           : null,
          },
        },
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <style>{`
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] { appearance: textfield; -moz-appearance: textfield; }
      `}</style>

      <div className="w-full max-w-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-bronze">
            {isEditing ? "Edit scheduled task" : "New scheduled task"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-red-500 text-xl leading-none"
            disabled={saving}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {start && end && (
          <div className="text-xs text-gray-600 mb-3">
            Date: {format(start, "eeee dd MMMM yyyy")} • Time:{" "}
            {format(start, "HH:mm")} – {format(end, "HH:mm")}
          </div>
        )}

        <div className="mb-3">
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Task type
          </label>
          <Select
            options={taskTypeOptions}
            value={taskTypeOptions.find((o) => o.value === taskTypeId) || null}
            onChange={(opt) => setTaskTypeId(opt?.value || "")}
            isDisabled={saving}
            placeholder="Select task type…"
            styles={{
              control: (base) => ({ ...base, backgroundColor: "white" }),
              option: (base, st) => ({
                ...base,
                backgroundColor: st.isSelected
                  ? "#9b611e"
                  : st.isFocused
                  ? "#f1e0c5"
                  : "white",
                color: "black",
              }),
            }}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Start
            </label>
            <input
              type="datetime-local"
              className="w-full border rounded px-2 py-1 text-sm"
              value={toLocalDateTimeValue(start)}
              onChange={(e) => {
                const d = parseLocalDateTime(e.target.value);
                if (!d) return;
                setStart(d);
                ensureEndValidForStart(d); // ✅ keep end valid
              }}
              disabled={saving}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              End
            </label>
            <input
              type="datetime-local"
              className="w-full border rounded px-2 py-1 text-sm"
              value={toLocalDateTimeValue(end)}
              onChange={(e) => {
                const d = parseLocalDateTime(e.target.value);
                if (!d) return;
                endTouchedRef.current = true; // ✅ mark manual edit
                setEnd(d);
              }}
              disabled={saving}
            />
          </div>
        </div>

        <div className="flex items-center gap-4 mb-3 text-sm text-gray-700">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => {
                const checked = !!e.target.checked;

                if (checked) {
                  const baseDate = start || end || slot?.start || new Date();
                  const primaryStaffId = staffIds[0] || slot?.resourceId || null;
                  const bounds = resolveAllDayBounds(
                    baseDate,
                    primaryStaffId,
                    stylists
                  );
                  if (!bounds) {
                    toast.error("No working hours found for this staff member.");
                    setAllDay(false);
                    return;
                  }
                  setAllDay(true);
                  setStart(bounds.start);
                  setEnd(bounds.end);
                  return;
                }

                setAllDay(false);
              }}
              disabled={saving}
            />
            All day (blocks online bookings)
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={lockTask}
              onChange={(e) => setLockTask(!!e.target.checked)}
              disabled={saving}
            />
            Lock task
          </label>
        </div>

        <div className="mb-3">
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Columns / staff
          </label>

          <Select
            isMulti
            options={staffOptions}
            value={selectedStaffValue}
            onChange={(vals) => {
              const ids = (vals || []).map((v) => v.value).filter(Boolean);
              setStaffIds(ids);
            }}
            isDisabled={saving}
            placeholder="Select staff…"
            styles={{
              control: (base) => ({ ...base, backgroundColor: "white" }),
              option: (base, st) => ({
                ...base,
                backgroundColor: st.isSelected
                  ? "#9b611e"
                  : st.isFocused
                  ? "#f1e0c5"
                  : "white",
                color: "black",
              }),
            }}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end mb-3">
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Repeat
            </label>
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={repeatRule}
              onChange={(e) => {
                const v = e.target.value;
                setRepeatRule(v);
                if (v === "none") {
                  setOccurrences(1);
                  setOccurrencesText("1");
                }
              }}
              disabled={saving}
            >
              <option value="none">No repeat</option>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Occurrences
            </label>

            <input
              type="number"
              min={1}
              max={52}
              step={1}
              className={`w-full border rounded px-2 py-1 text-sm ${
                !repeatEnabled ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""
              }`}
              value={repeatEnabled ? occurrencesText : "1"}
              onChange={(e) => setOccurrencesText(e.target.value)}
              onBlur={() => {
                const n = Number(occurrencesText);
                const safe = Math.max(1, Math.min(52, Number.isFinite(n) ? n : 1));
                setOccurrences(safe);
                setOccurrencesText(String(safe));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              disabled={saving || !repeatEnabled}
            />
          </div>
        </div>

        {isEditing && !!editingSeriesId && (
          <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
            <input
              type="checkbox"
              checked={applyToSeries}
              onChange={(e) => setApplyToSeries(!!e.target.checked)}
              disabled={saving}
            />
            Apply changes to entire series
          </label>
        )}

        {isEditing && (
          <div className="mb-3">
            <p className="text-sm font-semibold text-gray-700 mb-1">
              Delete scope
            </p>
            <div className="flex flex-col gap-1 text-sm text-gray-700">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="delete-scope"
                  value="single"
                  checked={deleteScope === "single"}
                  onChange={() => setDeleteScope("single")}
                  disabled={saving}
                />
                Delete only this staff column
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="delete-scope"
                  value="occurrence"
                  checked={deleteScope === "occurrence"}
                  onChange={() => setDeleteScope("occurrence")}
                  disabled={saving}
                />
                Delete this occurrence (all selected staff)
              </label>

              {editingSeriesId && (
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="delete-scope"
                    value="series"
                    checked={deleteScope === "series"}
                    onChange={() => setDeleteScope("series")}
                    disabled={saving}
                  />
                  Delete every occurrence in this series
                </label>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={onClose}
            className="text-gray-600"
            disabled={saving}
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {isEditing && (
              <button
                type="button"
                onClick={onDelete}
                className="px-4 py-2 rounded bg-red-600 text-white text-sm font-semibold disabled:opacity-60"
                disabled={saving}
              >
                Delete task
              </button>
            )}

            <button
              type="button"
              onClick={onPrimarySave}
              className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-60"
              disabled={
                saving ||
                !taskTypeId ||
                !start ||
                !end ||
                !(end > start) ||
                !staffIds.length
              }
            >
              {saving ? "Saving…" : isEditing ? "Update task" : "Create task"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
