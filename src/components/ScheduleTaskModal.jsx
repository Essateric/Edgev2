import React, { useEffect, useMemo, useState } from "react";
import Modal from "../Modal";
import { addWeeks, addMonths, startOfDay, endOfDay } from "date-fns";
import Select from "react-select";
import { v4 as uuidv4 } from "uuid";

const recurrenceOptions = [
  { value: "none", label: "No repeat" },
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
];

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
}) {
  const [title, setTitle] = useState("Scheduled task");
  const [details, setDetails] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [lock, setLock] = useState(false);
  const [recurrence, setRecurrence] = useState("none");
  const [occurrences, setOccurrences] = useState(1);
  const [applySeries, setApplySeries] = useState(true);
  const [selectedStylistIds, setSelectedStylistIds] = useState([]);
  const [start, setStart] = useState(slot?.start || new Date());
  const [end, setEnd] = useState(slot?.end || new Date());

  useEffect(() => {
    if (!isOpen) return;

    if (editingTask) {
      setTitle(editingTask.title || "Scheduled task");
      setDetails(editingTask.details || "");
      setAllDay(!!editingTask.allDay);
      setLock(!!editingTask.is_locked);
      setRecurrence(editingTask.recurrence || "none");
      setOccurrences(editingTask.repeatCount || 1);
      setApplySeries(true);
      setSelectedStylistIds([editingTask.resourceId].filter(Boolean));
      setStart(new Date(editingTask.start));
      setEnd(new Date(editingTask.end));
      return;
    }

    setTitle("Scheduled task");
    setDetails("");
    setAllDay(false);
    setLock(false);
    setRecurrence("none");
    setOccurrences(1);
    setApplySeries(true);
    setSelectedStylistIds([slot?.resourceId].filter(Boolean));
    setStart(slot?.start || new Date());
    setEnd(slot?.end || new Date());
  }, [isOpen, editingTask, slot]);

  const stylistOptions = useMemo(
    () => (stylists || []).map((s) => ({ value: s.id, label: s.title || s.name || "Unknown" })),
    [stylists]
  );

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
          title: title || "Scheduled task",
          details,
          start: s,
          end: e,
          resourceId: rid,
          isScheduledTask: true,
          allDay,
          recurrence,
          repeatCount: count,
          is_locked: lock,
        });
      }
    });

    return { seriesId, instances };
  };

  const handleSave = () => {
    const { seriesId, instances } = buildOccurrences();
    const payload = {
      seriesId,
      replaceSeriesId: applySeries ? editingTask?.seriesId : null,
      replaceSingleId: !applySeries ? editingTask?.id : null,
      instances,
    };
    onSave?.(payload);
    onClose?.();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingTask ? "Edit scheduled task" : "New scheduled task"}>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Title</label>
          <input
            className="w-full border rounded px-2 py-1 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Bank holiday, team meeting, maintenance…"
          />
        </div>

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
            styles={{
              control: (base) => ({ ...base, minHeight: "38px" }),
            }}
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
              styles={{
                control: (base) => ({ ...base, minHeight: "38px" }),
              }}
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
            disabled={!selectedStylistIds.length}
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

