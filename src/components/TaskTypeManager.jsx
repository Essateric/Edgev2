import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import Button from "./Button.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { supabase as defaultSupabase } from "../supabaseClient.js";

const DEFAULT_COLOR = "#b0702e";
const COLOR_PALETTE = [
  "#1f2937",
  "#7c3aed",
  "#2563eb",
  "#0ea5e9",
  "#14b8a6",
  "#16a34a",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#ec4899",
];

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
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);

  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingIsActive, setEditingIsActive] = useState(true);
  const [editingCategory, setEditingCategory] = useState("");
  const [editingColor, setEditingColor] = useState(DEFAULT_COLOR);

  // Your schema DOES have is_active, so we can safely show it
  const hasIsActiveColumn = true;

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
      .map((t) => String(t?.category || "").trim())
      .filter(Boolean);
    return Array.from(new Set(categories)).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
  }, [taskTypes]);

  const isNewCategory = categorySelection === "__new__";
  const resolvedCategory = (isNewCategory ? customCategory : categorySelection).trim();

  const sortedTypes = useMemo(() => {
    const list = [...taskTypes];
    return list.sort((a, b) => {
      const aName = String(a?.[nameField] || "").toLowerCase();
      const bName = String(b?.[nameField] || "").toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [taskTypes, nameField]);

  const refreshTaskTypes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("schedule_task_types").select("*");
    if (error) {
      console.error("Failed to fetch task types", error);
      toast.error("Could not load task types");
    } else {
      setTaskTypes(data || []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    refreshTaskTypes();
  }, [refreshTaskTypes]);

  const handleAddTaskType = async (event) => {
    event?.preventDefault();

    const trimmedName = newName.trim();
    const trimmedCategory = resolvedCategory;
    const trimmedColor = String(newColor || "").trim();

    if (!trimmedName) return toast.error("Task type name is required");
    if (!trimmedCategory) return toast.error("Category is required");

    setAdding(true);

    const payload = {
      [nameField]: trimmedName,
      category: trimmedCategory,
      color: trimmedColor || null,
      ...(hasIsActiveColumn ? { is_active: isActive } : {}),
    };

    const { error } = await supabase.from("schedule_task_types").insert([payload]);

    if (error) {
      console.error("Failed to add task type", error);
      toast.error(error?.message || "Could not add task type");
    } else {
      toast.success("Task type added");
      setNewName("");
      setIsActive(true);
      setCategorySelection("");
      setCustomCategory("");
      setNewColor(DEFAULT_COLOR);
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
    setEditingColor(type.color || DEFAULT_COLOR);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
    setEditingIsActive(true);
    setEditingCategory("");
    setEditingColor(DEFAULT_COLOR);
  };

  const saveEdit = async (event) => {
    event?.preventDefault();
    if (!editingId) return;

    const trimmedName = editingName.trim();
    const trimmedCategory = editingCategory.trim();
    const trimmedColor = String(editingColor || "").trim();
    const normalizedColor = trimmedColor ? trimmedColor.toLowerCase() : null;

    if (!trimmedName) return toast.error("Task type name is required");
    if (!trimmedCategory) return toast.error("Category is required");

    const payload = {
      [nameField]: trimmedName,
      category: trimmedCategory,
      color: normalizedColor,
      ...(hasIsActiveColumn ? { is_active: editingIsActive } : {}),
    };

     const { data: updated, error } = await supabase
      .from("schedule_task_types")
      .update(payload)
      .eq("id", editingId)
      .select("*");

    if (error) {
      console.error("Failed to update task type", error);
      toast.error(error?.message || "Could not update task type");
      return;
    }

    toast.success("Task type updated");
     if (updated?.length) {
      setTaskTypes((prev) =>
        prev.map((type) => (type.id === editingId ? updated[0] : type))
      );
    } else {
      await refreshTaskTypes();
      cancelEdit();
    }
    
    
  };

  const deleteTaskType = async (type) => {
    if (!type?.id) return;

    const confirmed = window.confirm(
      `Delete scheduled task type "${type?.[nameField] || "this"}"?`
    );
    if (!confirmed) return;

    const { error } = await supabase.from("schedule_task_types").delete().eq("id", type.id);

    if (error) {
      console.error("Failed to delete task type", error);
      toast.error(error?.message || "Could not delete task type");
      return;
    }

    toast.success("Task type removed");
    if (editingId === type.id) cancelEdit();
    await refreshTaskTypes();
  };

  return (
    <div className="bg-gray-100 p-4 rounded shadow-sm space-y-4 max-w-5xl">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-bronze">Scheduled Tasks</h2>
        <p className="text-sm text-gray-600">
          Add, edit, or remove scheduled task types used to block out time on the calendar.
        </p>
      </div>

      {/* Add form */}
<form
  onSubmit={handleAddTaskType}
  className="bg-white border border-gray-200 rounded p-4"
>
  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
    {/* Name */}
    <div className="md:col-span-5 space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Task type name
      </label>
      <input
        type="text"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze focus:border-transparent"
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

    {/* Category */}
    <div className="md:col-span-5 space-y-2">
      <label className="block text-sm font-medium text-gray-700">Category</label>
      <select
        value={isNewCategory ? "__new__" : categorySelection}
        onChange={(e) => {
          const v = e.target.value;
          setCategorySelection(v);
          if (v !== "__new__") setCustomCategory("");
        }}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze focus:border-transparent"
        disabled={adding}
      >
        <option value="">Select a category</option>
        {categoryOptions.map((c) => (
          <option key={c} value={c}>
            {c}
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
    </div>

    {/* Color + Add */}
 {/* Color + Add */}
<div className="md:col-span-4 space-y-2">
  <label className="block text-sm font-medium text-gray-700">Color</label>

  {/* Preview row (always visible) */}
  <div className="flex items-center justify-between gap-2">
    <div className="flex items-center gap-2 min-w-0">
      <span
        className="h-4 w-4 rounded-full border border-gray-300 shrink-0"
        style={{ backgroundColor: newColor || "#e5e7eb" }}
        title={newColor || "No color"}
      />
      <span className="text-xs text-gray-500 truncate">
        {newColor ? newColor : "No color"}
      </span>
    </div>

    <button
      type="button"
      onClick={() => setNewColor("")}
      className="h-7 px-2 text-[11px] rounded border border-gray-200 text-gray-600 shrink-0"
      disabled={adding}
      title="No color"
    >
      None
    </button>
  </div>

  {/* Palette (grid, not flex-wrap) */}
  <div className="grid grid-cols-5 gap-2">
    {COLOR_PALETTE.map((color) => (
      <button
        key={color}
        type="button"
        onClick={() => setNewColor(color)}
        className={`h-6 w-6 rounded-full border border-gray-200 ${
          newColor === color ? "ring-2 ring-bronze ring-offset-1" : ""
        }`}
        style={{ backgroundColor: color }}
        aria-label={`Select color ${color}`}
        disabled={adding}
      />
    ))}
  </div>

  <Button
    type="submit"
    disabled={adding}
    className="w-full !text-sm !py-2 !px-3"
  >
    {adding ? "Adding..." : "Add"}
  </Button>
</div>

  </div>
</form>


      {/* Existing */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Existing tasks</h3>
          <span className="text-xs text-gray-500">{sortedTypes.length} total</span>
        </div>

        {loading ? (
          <p className="text-sm text-gray-600">Loading task types...</p>
        ) : sortedTypes.length ? (
          <div className="bg-white rounded border border-gray-200 overflow-hidden">
            {sortedTypes.map((type) => {
              const active = type.is_active !== false;
              const hex = type.color || "#e5e7eb";

              return (
                <div
                  key={type.id || type[nameField]}
                  className="px-4 py-3 border-b border-gray-200 last:border-b-0"
                >
                  {editingId === type.id ? (
                    <form
                      onSubmit={saveEdit}
                      className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
                    >
                      <div className="md:col-span-4">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze focus:border-transparent"
                        />
                      </div>

                      <div className="md:col-span-4">
                        <input
                          type="text"
                          value={editingCategory}
                          onChange={(e) => setEditingCategory(e.target.value)}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze focus:border-transparent"
                          placeholder="Category"
                        />
                      </div>

                      <div className="md:col-span-2 flex items-center gap-2">
                        <input
                          type="color"
                          value={editingColor}
                          onChange={(e) => setEditingColor(e.target.value)}
                          className="h-9 w-12 rounded border border-gray-300"
                          aria-label="Edit task color"
                        />
                        <span
                          className="h-4 w-4 rounded-full border border-gray-200"
                          style={{ backgroundColor: editingColor }}
                          aria-hidden="true"
                        />
                      </div>

                      <div className="md:col-span-1">
                        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={editingIsActive}
                            onChange={(e) => setEditingIsActive(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-bronze focus:ring-bronze"
                          />
                          Active
                        </label>
                      </div>

                      <div className="md:col-span-1 flex gap-2 md:justify-end">
                        <Button type="submit" className="!py-1.5 !px-3 !text-sm">
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
   <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
  <div className="sm:col-span-5">
    <div className="font-medium text-gray-900">
      {type?.[nameField] || "Unnamed type"}
    </div>
    <div className="text-xs text-gray-500">{type.category || "—"}</div>
  </div>

  <div className="sm:col-span-2 flex items-center gap-2">
    <span
      className="h-3 w-3 rounded-full border border-gray-300"
      style={{ backgroundColor: type?.color || "#e5e7eb" }}
      title={type?.color || "No color"}
    />
    <span className="text-xs text-gray-500">
      {type?.color ? type.color : "No color"}
    </span>
  </div>

  <div className="sm:col-span-2">
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
  </div>

  <div className="sm:col-span-3 flex items-center gap-2 sm:justify-end">
    <Button
      type="button"
      onClick={() => startEdit(type)}
      className="!py-1.5 !px-3 !text-sm"
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
  </div>
</div>

                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-600">No task types added yet.</p>
        )}
      </div>
    </div>
  );
}
