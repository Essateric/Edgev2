import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import Button from "./Button.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { supabase as defaultSupabase } from "../supabaseClient.js";

export default function BookingTagManager() {
  const { supabaseClient } = useAuth();
  const supabase = supabaseClient || defaultSupabase;

  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({
    code: "",
    label: "",
    description: "",
    is_active: true,
  });

  // Inline edit
  const [editingId, setEditingId] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    code: "",
    label: "",
    description: "",
    is_active: true,
  });

  const refreshTags = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("booking_tags")
      .select("id, code, label, description, is_active")
      .order("label", { ascending: true });

    if (error) {
      console.error("Failed to fetch booking tags", error);
      toast.error("Could not load booking tags");
      setTags([]);
    } else {
      setTags(data || []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    refreshTags();
  }, [refreshTags]);

  const sortedTags = useMemo(() => {
    const list = Array.isArray(tags) ? [...tags] : [];
    return list.sort((a, b) =>
      String(a?.label || "").toLowerCase().localeCompare(String(b?.label || "").toLowerCase())
    );
  }, [tags]);

  const resetAddForm = () => {
    setAddForm({
      code: "",
      label: "",
      description: "",
      is_active: true,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({
      code: "",
      label: "",
      description: "",
      is_active: true,
    });
  };

  const startEdit = (tag) => {
    setEditingId(tag.id);
    setEditForm({
      code: tag.code || "",
      label: tag.label || "",
      description: tag.description || "",
      is_active: tag.is_active !== false,
    });
  };

  const normalizeCode = (value) => String(value || "").trim().toUpperCase();
  const normalizeLabel = (value) => String(value || "").trim();

  const handleAdd = async (event) => {
    event?.preventDefault();

    const code = normalizeCode(addForm.code);
    const label = normalizeLabel(addForm.label);

    if (!code || !label) {
      toast.error("Code and label are required");
      return;
    }

    setAdding(true);

    const payload = {
      code,
      label,
      description: addForm.description.trim() || null,
      is_active: !!addForm.is_active,
    };

    const { error } = await supabase.from("booking_tags").insert([payload]);

    if (error) {
      console.error("Failed to add booking tag", error);
      // Friendly message for common unique constraint cases
      const msg =
        String(error?.message || "").toLowerCase().includes("duplicate") ||
        String(error?.message || "").toLowerCase().includes("unique")
          ? "That code or label already exists"
          : "Could not add tag";
      toast.error(msg);
    } else {
      toast.success("Tag added");
      resetAddForm();
      await refreshTags();
    }

    setAdding(false);
  };

  const handleSaveEdit = async (event) => {
    event?.preventDefault();
    if (!editingId) return;

    const code = normalizeCode(editForm.code);
    const label = normalizeLabel(editForm.label);

    if (!code || !label) {
      toast.error("Code and label are required");
      return;
    }

    setSavingEdit(true);

    const payload = {
      code,
      label,
      description: editForm.description.trim() || null,
      is_active: !!editForm.is_active,
    };

    const { error } = await supabase.from("booking_tags").update(payload).eq("id", editingId);

    if (error) {
      console.error("Failed to update booking tag", error);
      const msg =
        String(error?.message || "").toLowerCase().includes("duplicate") ||
        String(error?.message || "").toLowerCase().includes("unique")
          ? "That code or label already exists"
          : "Could not update tag";
      toast.error(msg);
    } else {
      toast.success("Tag updated");
      cancelEdit();
      await refreshTags();
    }

    setSavingEdit(false);
  };

  const toggleActive = async (tag) => {
    if (!tag?.id) return;

    const nextActive = !tag.is_active;

    // Optimistic UI
    setTags((prev) => prev.map((t) => (t.id === tag.id ? { ...t, is_active: nextActive } : t)));

    const { error } = await supabase
      .from("booking_tags")
      .update({ is_active: nextActive })
      .eq("id", tag.id);

    if (error) {
      console.error("Failed to toggle active", error);
      // revert on failure
      setTags((prev) => prev.map((t) => (t.id === tag.id ? { ...t, is_active: !nextActive } : t)));
      toast.error("Could not update active state");
      return;
    }

    toast.success(nextActive ? "Tag activated" : "Tag deactivated");
  };

  const deleteTag = async (tag) => {
    if (!tag?.id) return;

    const confirmed = window.confirm(`Delete booking tag "${tag.label || "this"}"?`);
    if (!confirmed) return;

    const { error } = await supabase.from("booking_tags").delete().eq("id", tag.id);

    if (error) {
      console.error("Failed to delete booking tag", error);
      toast.error("Could not delete tag");
      return;
    }

    toast.success("Tag removed");
    if (editingId === tag.id) cancelEdit();
    await refreshTags();
  };

  return (
    <div className="bg-gray-100 p-4 rounded shadow-sm space-y-4 max-w-5xl">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-bronze">Booking Tags</h2>
        <p className="text-sm text-gray-600">
          Add, edit, activate/deactivate, or remove booking tags available in the booking tag dropdown.
          No colour palette required.
        </p>
      </div>

      {/* Add tag */}
      <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded p-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
          <div className="md:col-span-3 space-y-2">
            <label className="block text-sm font-medium text-gray-700">Code</label>
            <input
              type="text"
              value={addForm.code}
              onChange={(e) => setAddForm((f) => ({ ...f, code: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze focus:border-transparent uppercase"
              placeholder="NOS"
              maxLength={6}
              disabled={adding}
            />
          </div>

          <div className="md:col-span-4 space-y-2">
            <label className="block text-sm font-medium text-gray-700">Label</label>
            <input
              type="text"
              value={addForm.label}
              onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze focus:border-transparent"
              placeholder="No Show"
              disabled={adding}
            />
          </div>

          <div className="md:col-span-4 space-y-2">
            <label className="block text-sm font-medium text-gray-700">Description (optional)</label>
            <input
              type="text"
              value={addForm.description}
              onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze focus:border-transparent"
              placeholder="Notes about this tag"
              disabled={adding}
            />
          </div>

          <div className="md:col-span-1 flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={addForm.is_active}
                onChange={(e) => setAddForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-bronze focus:ring-bronze"
                disabled={adding}
              />
              Active
            </label>

            <Button type="submit" disabled={adding} className="w-full !text-sm !py-2 !px-3">
              {adding ? "Saving..." : "Add"}
            </Button>
          </div>
        </div>
      </form>

      {/* Existing tags */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Existing tags</h3>
          <span className="text-xs text-gray-500">{sortedTags.length} total</span>
        </div>

        {loading ? (
          <p className="text-sm text-gray-600">Loading booking tags...</p>
        ) : sortedTags.length ? (
          <div className="bg-white rounded border border-gray-200 overflow-hidden">
            {sortedTags.map((tag) => {
              const isEditing = editingId === tag.id;

              return (
                <div
                  key={tag.id}
                  className="px-4 py-3 border-b border-gray-200 last:border-b-0"
                >
                  {isEditing ? (
                    <form
                      onSubmit={handleSaveEdit}
                      className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
                    >
                      <div className="md:col-span-2">
                        <input
                          type="text"
                          value={editForm.code}
                          onChange={(e) => setEditForm((f) => ({ ...f, code: e.target.value }))}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze focus:border-transparent uppercase"
                          maxLength={6}
                          disabled={savingEdit}
                        />
                      </div>

                      <div className="md:col-span-3">
                        <input
                          type="text"
                          value={editForm.label}
                          onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze focus:border-transparent"
                          disabled={savingEdit}
                        />
                      </div>

                      <div className="md:col-span-4">
                        <input
                          type="text"
                          value={editForm.description}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, description: e.target.value }))
                          }
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bronze focus:border-transparent"
                          placeholder="Description"
                          disabled={savingEdit}
                        />
                      </div>

                      <div className="md:col-span-1">
                        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={editForm.is_active}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, is_active: e.target.checked }))
                            }
                            className="h-4 w-4 rounded border-gray-300 text-bronze focus:ring-bronze"
                            disabled={savingEdit}
                          />
                          Active
                        </label>
                      </div>

                      <div className="md:col-span-2 flex gap-2 md:justify-end">
                        <Button type="submit" disabled={savingEdit} className="!py-1.5 !px-3 !text-sm">
                          {savingEdit ? "Saving..." : "Save"}
                        </Button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="text-sm text-gray-600 underline"
                          disabled={savingEdit}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                      <div className="sm:col-span-5">
                        <div className="font-medium text-gray-900">{tag.label}</div>
                        <div className="text-xs text-gray-500">
                          {tag.code ? `(${tag.code})` : "—"}
                          {tag.description ? ` • ${tag.description}` : ""}
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded ${
                            tag.is_active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {tag.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>

                      <div className="sm:col-span-5 flex items-center gap-3 sm:justify-end">
                        <button
                          type="button"
                          onClick={() => toggleActive(tag)}
                          className="text-xs text-blue-700 underline"
                        >
                          {tag.is_active ? "Deactivate" : "Activate"}
                        </button>

                        <Button
                          type="button"
                          onClick={() => startEdit(tag)}
                          className="!py-1.5 !px-3 !text-sm"
                        >
                          Edit
                        </Button>

                        <button
                          type="button"
                          onClick={() => deleteTag(tag)}
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
          <p className="text-sm text-gray-600">No booking tags added yet.</p>
        )}
      </div>
    </div>
  );
}
