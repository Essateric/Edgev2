import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import Button from "./Button.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { supabase as defaultSupabase } from "../supabaseClient.js";

export default function BookingTagManager() {
  const { supabaseClient } = useAuth();
  const supabase = supabaseClient || defaultSupabase;

  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    code: "",
    label: "",
    description: "",
    is_active: true,
  });

  const sortedTags = useMemo(() => {
    const list = [...tags];
    return list.sort((a, b) => {
      const aLabel = String(a?.label || "").toLowerCase();
      const bLabel = String(b?.label || "").toLowerCase();
      return aLabel.localeCompare(bLabel);
    });
  }, [tags]);

  useEffect(() => {
    const fetchTags = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("booking_tags")
        .select("*")
        .order("label", { ascending: true });

      if (error) {
        console.error("Failed to fetch booking tags", error);
        toast.error("Could not load booking tags");
      } else {
        setTags(data || []);
      }
      setLoading(false);
    };

    fetchTags();
  }, [supabase]);

  const resetForm = () => {
    setForm({
      code: "",
      label: "",
      description: "",
      is_active: true,
    });
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event?.preventDefault();
    const trimmedCode = form.code.trim().toUpperCase();
    const trimmedLabel = form.label.trim();

    if (!trimmedCode || !trimmedLabel) {
      toast.error("Code and label are required");
      return;
    }

    setAdding(true);
    const payload = {
      code: trimmedCode,
      label: trimmedLabel,
      description: form.description.trim() || null,
      is_active: !!form.is_active,
    };

    const query = editingId
      ? supabase.from("booking_tags").update(payload).eq("id", editingId)
      : supabase.from("booking_tags").insert([payload]);

    const { error } = await query;

    if (error) {
      console.error("Failed to save booking tag", error);
      toast.error("Could not save booking tag");
    } else {
      toast.success(editingId ? "Tag updated" : "Tag added");
      resetForm();
      const { data: refreshed, error: refreshError } = await supabase
        .from("booking_tags")
        .select("*")
        .order("label", { ascending: true });

      if (refreshError) {
        console.error("Failed to refresh booking tags", refreshError);
      } else {
        setTags(refreshed || []);
      }
    }

    setAdding(false);
  };

  const startEdit = (tag) => {
    setEditingId(tag.id);
    setForm({
      code: tag.code || "",
      label: tag.label || "",
      description: tag.description || "",
      is_active: tag.is_active !== false,
    });
  };

  const toggleActive = async (tag) => {
    const nextActive = !tag.is_active;
    const { error } = await supabase
      .from("booking_tags")
      .update({ is_active: nextActive })
      .eq("id", tag.id);

    if (error) {
      console.error("Failed to update tag", error);
      toast.error("Could not update tag");
      return;
    }

    setTags((prev) =>
      prev.map((t) => (t.id === tag.id ? { ...t, is_active: nextActive } : t))
    );
    toast.success(nextActive ? "Tag activated" : "Tag deactivated");
  };

  return (
    <div className="bg-gray-100 p-4 rounded shadow-sm space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-bronze">Booking Tags</h2>
        <p className="text-sm text-gray-600">
          Manage labels like No Show or Requested. These appear in booking
          details as an optional dropdown.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
      >
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Code
          </label>
          <input
            type="text"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bronze focus:border-transparent uppercase"
            placeholder="NOS"
            maxLength={6}
            disabled={adding}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Label
          </label>
          <input
            type="text"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bronze focus:border-transparent"
            placeholder="No Show"
            disabled={adding}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Description (optional)
          </label>
          <input
            type="text"
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bronze focus:border-transparent"
            placeholder="Notes about this tag"
            disabled={adding}
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) =>
                setForm((f) => ({ ...f, is_active: e.target.checked }))
              }
              className="h-4 w-4 rounded border-gray-300 text-bronze focus:ring-bronze"
              disabled={adding}
            />
            Active
          </label>
          <Button type="submit" disabled={adding} className="ml-auto">
            {adding ? "Saving..." : editingId ? "Update tag" : "Add tag"}
          </Button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-sm text-gray-600 underline"
              disabled={adding}
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Existing tags</h3>
        {loading ? (
          <p className="text-sm text-gray-600">Loading booking tags...</p>
        ) : sortedTags.length ? (
          <ul className="divide-y divide-gray-200 bg-white rounded border border-gray-200">
            {sortedTags.map((tag) => (
              <li
                key={tag.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2"
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {tag.label}
                    </span>
                    <span className="text-xs font-mono text-gray-600">
                      ({tag.code})
                    </span>
                  </div>
                  {tag.description ? (
                    <span className="text-xs text-gray-600">
                      {tag.description}
                    </span>
                  ) : null}
                  <span className="text-[11px] text-gray-500">
                    ID: {tag.id || "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded ${
                      tag.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {tag.is_active ? "Active" : "Inactive"}
                  </span>
                  <Button
                    type="button"
                    onClick={() => startEdit(tag)}
                    className="!py-1 !px-3 text-sm"
                  >
                    Edit
                  </Button>
                  <button
                    type="button"
                    onClick={() => toggleActive(tag)}
                    className="text-xs text-blue-700 underline"
                  >
                    {tag.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">No booking tags added yet.</p>
        )}
      </div>
    </div>
  );
}