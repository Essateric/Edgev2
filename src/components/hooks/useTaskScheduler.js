import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildScheduledTask,
  mapTaskToEvents,
  persistTask,
  taskRowToModel,
} from "../../lib/taskModel";

/**
 * Lightweight task manager for calendar tasks.
 * - Keeps task list in local state.
 * - Provides optimistic create/update with Supabase placeholder.
 */
export default function useTaskScheduler({ supabase, stylistList }) {
  const [tasks, setTasks] = useState([]);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState("");

  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const upsertTask = useCallback(
    async (taskInput = {}) => {
      const previous = tasksRef.current;
      const model = buildScheduledTask(taskInput);

      setTaskError("");
      setTaskSaving(true);

      setTasks((prev) => {
        const idx = prev.findIndex((t) => t.id === model.id);
        if (idx === -1) return [...prev, model];
        const copy = prev.slice();
        copy[idx] = { ...copy[idx], ...model };
        return copy;
      });

      try {
        const { data, error } = await persistTask({ supabase, task: model });
        if (error) throw error;

        if (data) {
          const normalized = taskRowToModel(data) || model;
          setTasks((prev) =>
            prev.map((t) => (t.id === model.id ? normalized : t))
          );
          return { ok: true, task: normalized };
        }

        return { ok: true, task: model };
      } catch (err) {
        setTaskError(err?.message || "Failed to save task");
        setTasks([...previous]);
        return { ok: false, error: err };
      } finally {
        setTaskSaving(false);
      }
    },
    [supabase]
  );

  const taskEvents = useMemo(
    () => tasks.flatMap((task) => mapTaskToEvents(task, stylistList)),
    [tasks, stylistList]
  );

  return {
    tasks,
    taskEvents,
    taskSaving,
    taskError,
    upsertTask,
  };
}