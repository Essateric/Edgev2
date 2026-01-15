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
  const [categorySelection, setCategorySelection] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingIsActive, setEditingIsActive] = useState(true);
  const [editingCategory, setEditingCategory] = useState("");

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

   const categoryOptions = useMemo(() => {
    const categories = (taskTypes || [])
      .map((type) => String(type?.category || "").trim())
      .filter(Boolean);
    return Array.from(new Set(categories)).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
  }, [taskTypes]);

  const isNewCategory = categorySelection === "__new__";
  const resolvedCategory = isNewCategory
    ? customCategory.trim()
    : categorySelection.trim();


  const sortedTypes = useMemo(() => {
    const list = [...taskTypes];
    return list.sort((a, b) => {
      const aName = String(a?.[nameField] || "").toLowerCase();
      const bName = String(b?.[nameField] || "").toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [taskTypes, nameField]);

  const refreshTaskTypes = async () => {
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

  useEffect(() => {
    refreshTaskTypes();
  }, [supabase]);

  const handleAddTaskType = async (event) => {
    event?.preventDefault();
    const trimmedName = newName.trim();
     const trimmedCategory = resolvedCategory;

    if (!trimmedName) {
      toast.error("Task type name is required");
      return;
    }
     if (!trimmedCategory) {
      toast.error("Category is required");
      return;
    }

    setAdding(true);
    const payload = { [nameField]: trimmedName, category: trimmedCategory };

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
      setCategorySelection("");
      setCustomCategory("");
      await refreshTaskTypes();
    }
    setAdding(false);
  };
const startEdit = (type) => {
    if (!type?.id) return;
    setEditingId(type.id);
    setEditingName(type?.[nameField] || "");
    setEditingIsActive(type.is_active !== false);
    setEditingCategory(type.category || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
    setEditingIsActive(true);
    setEditingCategory("");
  };

  const saveEdit = async (event) => {
    event?.preventDefault();
    if (!editingId) return;
    const trimmedName = editingName.trim();
    const trimmedCategory = editingCategory.trim();

    if (!trimmedName) {
      toast.error("Task type name is required");
      return;
    }

    if (!trimmedCategory) {
      toast.error("Category is required");
      return;
    }

    const payload = { [nameField]: trimmedName, category: trimmedCategory };
    if (hasIsActiveColumn) {
      payload.is_active = editingIsActive;
    }

    const { error } = await supabase
      .from("schedule_task_types")
      .update(payload)
      .eq("id", editingId);

    if (error) {
      console.error("Failed to update task type", error);
      toast.error("Could not update task type");
      return;
    }

    toast.success("Task type updated");
    cancelEdit();
    await refreshTaskTypes();
  };

  const deleteTaskType = async (type) => {
    if (!type?.id) return;
    const confirmed = window.confirm(
      `Delete scheduled task type "${type?.[nameField] || "this"}"?`
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from("schedule_task_types")
      .delete()
      .eq("id", type.id);

    if (error) {
      console.error("Failed to delete task type", error);
      toast.error("Could not delete task type");
      return;
    }

    toast.success("Task type removed");
    if (editingId === type.id) cancelEdit();
    await refreshTaskTypes();
  };


  return (
    <div className="bg-gray-100 p-4 rounded shadow-sm space-y-4">
      <div className="space-y-1">
          <h2 className="text-lg font-semibold text-bronze">Scheduled Tasks</h2>
        <p className="text-sm text-gray-600">
          Add, edit, or remove scheduled task types used to block out time on
          the calendar.
        </p>
      </div>

      <form
        onSubmit={handleAddTaskType}
        className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
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
          </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Category
          </label>
          <select
            value={isNewCategory ? "__new__" : categorySelection}
            onChange={(e) => {
              const value = e.target.value;
              setCategorySelection(value);
              if (value !== "__new__") {
                setCustomCategory("");
              }
            }}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze focus:border-transparent"
            disabled={adding}
          >
            <option value="">Select a category</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
            <option value="__new__">Add new category…</option>
          </select>
          {isNewCategory && (
            <input
              type="text"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze focus:border-transparent"
              placeholder="Enter new category"
              disabled={adding}
            />
          )}
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
        <h3 className="text-sm font-semibold text-gray-700">Existing tasks</h3>
        {loading ? (
          <p className="text-sm text-gray-600">Loading task types...</p>
        ) : sortedTypes.length ? (
          <ul className="divide-y divide-gray-200 bg-white rounded border border-gray-200">
            {sortedTypes.map((type) => (
              <li
                key={type.id || type[nameField]}
                className="flex flex-col gap-3 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  {editingId === type.id ? (
                    <form
                      onSubmit={saveEdit}
                      className="flex flex-col gap-2 sm:flex-row sm:items-center"
                    >
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze focus:border-transparent"
                      />
                      {hasIsActiveColumn && (
                        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={editingIsActive}
                            onChange={(e) =>
                              setEditingIsActive(e.target.checked)
                            }
                            className="h-4 w-4 rounded border-gray-300 text-bronze focus:ring-bronze"
                          />
                          Active
                        </label>
                      )}
                      <div className="flex gap-2">
                        <Button type="submit" className="!py-1 !px-3 text-sm">
                          Save
                        </Button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="text-sm text-gray-600 underline"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <span className="font-medium text-gray-900">
                        {type?.[nameField] || "Unnamed type"}
                      </span>
                      <span className="text-xs text-gray-500">
                        ID: {type?.id || "—"}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
                  {type?.id ? (
                    <>
                      <Button
                        type="button"
                        onClick={() => startEdit(type)}
                        className="!py-1 !px-3 text-sm"
                      >
                        Edit
                      </Button>
                      <button
                        type="button"
                        onClick={() => deleteTaskType(type)}
                        className="text-xs text-red-600 underline"
                      >
                        Remove
                      </button>
                    </>
                  ) : null}
                </div>
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