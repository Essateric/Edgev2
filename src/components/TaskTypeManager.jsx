import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import Button from "./Button.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { supabase as defaultSupabase } from "../supabaseClient.js";

export default function TaskTypeManager() {
  const { supabaseClient } = useAuth();
  const supabase = supabaseClient || defaultSupabase;

  const [taskTypes, setTaskTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [isActive, setIsActive] = useState(true);

  const hasIsActiveColumn = useMemo(
    () =>
      taskTypes.some((t) =>
        Object.prototype.hasOwnProperty.call(t, "is_active")
      ),
    [taskTypes]
  );

  const nameField = useMemo(() => {
    const sample = taskTypes[0] || {};
    return (
      ["name", "title", "label", "task_type", "type"].find(
        (key) => sample[key] !== undefined
      ) || "name"
    );
  }, [taskTypes]);

  const sortedTypes = useMemo(() => {
    const list = [...taskTypes];
    return list.sort((a, b) => {
      const aName = String(a?.[nameField] || "").toLowerCase();
      const bName = String(b?.[nameField] || "").toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [taskTypes, nameField]);

  useEffect(() => {
    const fetchTaskTypes = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("schedule_task_types")
        .select("*");
      if (error) {
        console.error("Failed to fetch task types", error);
        toast.error("Could not load task types");
      } else {
        setTaskTypes(data || []);
      }
      setLoading(false);
    };

    fetchTaskTypes();
  }, [supabase]);

  const handleAddTaskType = async (event) => {
    event?.preventDefault();
    const trimmedName = newName.trim();

    if (!trimmedName) {
      toast.error("Task type name is required");
      return;
    }

    setAdding(true);
    const payload = { [nameField]: trimmedName };

    if (hasIsActiveColumn) {
      payload.is_active = isActive;
    }

    const { error } = await supabase
      .from("schedule_task_types")
      .insert([payload]);

    if (error) {
      console.error("Failed to add task type", error);
      toast.error("Could not add task type");
    } else {
      toast.success("Task type added");
      setNewName("");
      setIsActive(true);
      const { data, error: refreshError } = await supabase
        .from("schedule_task_types")
        .select("*");
      if (refreshError) {
        console.error("Failed to refresh task types", refreshError);
      } else {
        setTaskTypes(data || []);
      }
    }
    setAdding(false);
  };

  return (
    <div className="bg-gray-100 p-4 rounded shadow-sm space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-bronze">Task Types</h2>
        <p className="text-sm text-gray-600">
          Add reasons that can be used to book holidays, training, or block out
          time on the calendar.
        </p>
      </div>

      <form
        onSubmit={handleAddTaskType}
        className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
      >
        <div className="md:col-span-2 space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Task type name
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bronze focus:border-transparent"
            placeholder="e.g. Holiday, Training, Blocked"
            disabled={adding}
          />
          {hasIsActiveColumn && (
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-bronze focus:ring-bronze"
                disabled={adding}
              />
              Active immediately
            </label>
          )}
        </div>
        <div className="flex md:justify-end">
          <Button
            type="submit"
            onClick={handleAddTaskType}
            disabled={adding}
            className="w-full md:w-auto"
          >
            {adding ? "Adding..." : "Add Task Type"}
          </Button>
        </div>
      </form>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Existing types</h3>
        {loading ? (
          <p className="text-sm text-gray-600">Loading task types...</p>
        ) : sortedTypes.length ? (
          <ul className="divide-y divide-gray-200 bg-white rounded border border-gray-200">
            {sortedTypes.map((type) => (
              <li
                key={type.id || type[nameField]}
                className="flex items-center justify-between px-3 py-2"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-gray-900">
                    {type?.[nameField] || "Unnamed type"}
                  </span>
                  <span className="text-xs text-gray-500">
                    ID: {type?.id || "—"}
                  </span>
                </div>
                {hasIsActiveColumn && (
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded ${
                      type.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {type.is_active ? "Active" : "Inactive"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">No task types added yet.</p>
        )}
      </div>
    </div>
  );
}