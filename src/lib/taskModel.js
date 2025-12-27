import { v4 as uuidv4 } from "uuid";

export const DEFAULT_TASK_COLOR = "#0ea5e9";

/**
 * @typedef {Object} ScheduledTask
 * @property {string} id - Stable identifier for the task (uuid by default).
 * @property {string[]} resourceIds - Staff/resource ids that should see this task on the calendar.
 * @property {Date} start - Start time (local Date object).
 * @property {Date} end - End time (local Date object, defaults to start if missing).
 * @property {boolean} allDay - Whether this should span the whole day.
 * @property {string} title - Short label, e.g. "Bank Holiday".
 * @property {string} [description] - Optional extra context.
 * @property {string|null} [color] - Optional hex/rgb/css color.
 * @property {string|null} [status] - Optional status badge (e.g. planned/completed).
 */

const ensureDate = (value, fallback = new Date()) => {
  const d = value instanceof Date ? value : new Date(value ?? fallback);
  return isNaN(d.getTime()) ? new Date(fallback) : d;
};

const clampEnd = (start, end, isAllDay) => {
  const safeStart = ensureDate(start);

  if (isAllDay) {
    const allDayStart = new Date(safeStart);
    allDayStart.setHours(0, 0, 0, 0);

    const allDayEnd = end ? ensureDate(end) : new Date(allDayStart);
    allDayEnd.setHours(23, 59, 59, 999);
    return { start: allDayStart, end: allDayEnd };
  }

  const safeEnd = end ? ensureDate(end) : null;
  if (!safeEnd || !(safeEnd > safeStart)) {
    return {
      start: safeStart,
      end: new Date(safeStart.getTime() + 60 * 1000), // ≥ 1 minute
    };
  }

  return { start: safeStart, end: safeEnd };
};

export function buildScheduledTask(input = {}) {
  const id = input.id || input.taskId || uuidv4();
  const allDay = !!input.allDay;
  const resourceIds = Array.isArray(input.resourceIds)
    ? input.resourceIds.filter(Boolean)
    : [];

  const { start, end } = clampEnd(input.start, input.end, allDay);

  return {
    id,
    resourceIds,
    start,
    end,
    allDay,
    title: (input.title || "Task").trim(),
    description: input.description || "",
    color: input.color || null,
    status: input.status || null,
  };
}

export function mapTaskToEvents(task, stylistList = []) {
  if (!task) return [];
  const base = buildScheduledTask(task);

  const resources =
    base.resourceIds && base.resourceIds.length ? base.resourceIds : [null];

  return resources.map((rid) => {
    const stylist = stylistList.find((s) => s.id === rid);
    return {
      ...base,
      id: rid ? `${base.id}:${rid}` : base.id,
      taskId: base.id,
      resourceId: rid,
      resourceName: stylist?.title || stylist?.name || null,
      isTask: true,
    };
  });
}

export function taskRowToModel(row) {
  if (!row) return null;

  return buildScheduledTask({
    id: row.id,
    resourceIds: row.resource_ids || row.resourceIds || [],
    start: row.start,
    end: row.end,
    allDay: row.all_day ?? row.allDay ?? false,
    title: row.title,
    description: row.description,
    color: row.color,
    status: row.status,
  });
}

export async function persistTask({ supabase, task }) {
  if (!supabase) {
    console.warn("[tasks] Supabase client missing — storing task locally only.");
    return { data: task, error: null, localOnly: true };
  }

  try {
    const payload = {
      id: task.id,
      resource_ids: task.resourceIds || [],
      start: task.start?.toISOString?.() || null,
      end: task.end?.toISOString?.() || null,
      all_day: !!task.allDay,
      title: task.title,
      description: task.description || null,
      color: task.color || null,
      status: task.status || null,
    };

    const { data, error } = await supabase
      .from("tasks")
      .upsert([payload])
      .select("*")
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}