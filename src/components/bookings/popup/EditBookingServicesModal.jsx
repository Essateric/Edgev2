import React, { useEffect, useMemo, useState } from "react";
import ModalLarge from "../../ModalLarge";

const norm = (v) => String(v ?? "").trim().toLowerCase();

export default function EditBookingServicesModal({
  isOpen,
  onClose,
  supabaseClient,
  rows = [],
  bookingGroupId = null,
  onUpdated,
}) {
  const [options, setOptions] = useState([]); // staff_services + joined services
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const safeRows = useMemo(() => {
    const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
    const map = new Map();
    for (const r of list) if (r?.id) map.set(r.id, r);
    return Array.from(map.values());
  }, [rows]);

  // ✅ staff id (stylist) from the booking rows you already pass in
  const staffId = useMemo(() => {
    const r0 = safeRows?.[0];
    return r0?.resource_id || r0?.staff_id || null;
  }, [safeRows]);

  // Build a clean list: { service_id, name, category, price, duration }
  const serviceOptions = useMemo(() => {
    return (options || [])
      .map((ss) => {
        const svc = ss?.services;
        const service_id = ss?.service_id || svc?.id || null;
        if (!service_id) return null;

        return {
          service_id: String(service_id),
          name: svc?.name ?? "",
          category: svc?.category ?? "",
          price: Number.isFinite(+ss?.price) ? Number(ss.price) : 0,
          duration: Number.isFinite(+ss?.duration) ? Number(ss.duration) : 0,
        };
      })
      .filter(Boolean);
  }, [options]);

  const optionByServiceId = useMemo(() => {
    const m = new Map();
    serviceOptions.forEach((o) => m.set(String(o.service_id), o));
    return m;
  }, [serviceOptions]);

  const optionByName = useMemo(() => {
    const m = new Map();
    serviceOptions.forEach((o) => {
      const k = norm(o.name);
      if (k) m.set(k, o);
    });
    return m;
  }, [serviceOptions]);

  const grouped = useMemo(() => {
    const groups = new Map();
    serviceOptions.forEach((o) => {
      const cat = String(o.category || "Other").trim() || "Other";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(o);
    });

    const cats = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
    return cats.map((cat) => ({
      category: cat,
      items: (groups.get(cat) || [])
        .slice()
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    }));
  }, [serviceOptions]);

  // ✅ Load available services for this staff member
  useEffect(() => {
    let on = true;

    (async () => {
      if (!isOpen || !supabaseClient) return;

      setLoading(true);
      setLoadError("");

      try {
        // Prefer staff_services because it holds active/price/duration
        // and links to services(id,name,category).
        let q = supabaseClient
          .from("staff_services")
          .select(
            `
            service_id,
            price,
            duration,
            active,
            services ( id, name, category )
          `
          )
          .eq("active", true);

        if (staffId) q = q.eq("staff_id", staffId);

        const { data, error } = await q;

        if (error) throw error;

        if (on) setOptions(data || []);
      } catch (e) {
        console.warn("[EditBookingServicesModal] failed to load services", e);
        if (on) {
          setOptions([]);
          setLoadError(e?.message || "Failed to load services");
        }
      } finally {
        if (on) setLoading(false);
      }
    })();

    return () => {
      on = false;
    };
  }, [isOpen, supabaseClient, staffId]);

  // ✅ initialise draft with current booking service as default (match by title)
  useEffect(() => {
    if (!isOpen) return;

    const init = {};
    safeRows.forEach((r) => {
      const existingTitle = norm(r.title);
      const match = existingTitle ? optionByName.get(existingTitle) : null;

      init[r.id] = {
        selectedServiceId: match?.service_id || "",
        title: match?.name ?? (r.title ?? ""),
        category: match?.category ?? (r.category ?? ""),
        duration: Number.isFinite(+match?.duration)
          ? Number(match.duration)
          : Number(r.duration ?? 0),
        price: Number.isFinite(+match?.price)
          ? Number(match.price)
          : Number(r.price ?? 0),
      };
    });

    setDraft(init);
    setError("");
  }, [isOpen, safeRows, optionByName]);

  const setRowDraft = (rowId, patch) => {
    setDraft((prev) => ({
      ...(prev || {}),
      [rowId]: { ...(prev?.[rowId] || {}), ...(patch || {}) },
    }));
  };

  const validate = () => {
    for (const r of safeRows) {
      const d = draft?.[r.id];
      if (!d) continue;
      if (!String(d.title || "").trim()) return "Please choose a service.";
    }
    return "";
  };

  const handleSave = async () => {
    if (!supabaseClient) return;

    setError("");
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }

    setSaving(true);
    try {
      // Update each bookings row in this booking group (one row per service)
      const updates = safeRows.map((r) => {
        const d = draft?.[r.id] || {};
        const patch = {
          title: String(d.title || "").trim() || null,
          category: String(d.category || "").trim() || null,

          // ✅ we still update these in DB even though you removed them from the UI
          duration: Number(d.duration || 0),
          price: Number(d.price || 0),
        };

        return supabaseClient.from("bookings").update(patch).eq("id", r.id);
      });

      const results = await Promise.all(updates);
      const firstErr = results.find((x) => x?.error)?.error;
      if (firstErr) throw firstErr;

      onUpdated?.({
        type: "services-updated",
        booking_id: bookingGroupId || null,
        rowsUpdated: safeRows.map((r) => r.id),
      });

      window.dispatchEvent(
        new CustomEvent("bookings:changed", {
          detail: {
            type: "booking-services-updated",
            booking_id: bookingGroupId || null,
          },
        })
      );

      onClose?.();
    } catch (e) {
      setError(e?.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalLarge
      isOpen={isOpen}
      onClose={() => {
        if (saving) return;
        onClose?.();
      }}
      contentClassName="w-full max-w-2xl p-6 text-gray-900"
    >
      <div className="flex flex-col gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Edit services</h2>
          <p className="text-sm text-gray-700">
            Choose a service from the database and save.
          </p>
          {staffId && (
            <p className="text-xs text-gray-500">
              Filtering services for staff_id: {staffId}
            </p>
          )}
        </div>

        {!!loadError && (
          <div className="text-sm text-red-600">
            Failed to load services: {loadError}
          </div>
        )}

        {!!error && <div className="text-sm text-red-600">{error}</div>}

        {loading ? (
          <div className="text-sm text-gray-600">Loading services…</div>
        ) : safeRows.length === 0 ? (
          <div className="text-sm text-gray-700 border rounded p-3 bg-gray-50">
            No service rows found for this booking.
          </div>
        ) : (
          <div className="space-y-3">
            {safeRows.map((r, idx) => {
              const d = draft?.[r.id] || {};
              const selected = d.selectedServiceId || "";

              return (
                <div key={r.id} className="rounded border bg-gray-50 p-3">
                  <div className="text-sm font-medium text-gray-900 mb-2">
                    Service {idx + 1}
                  </div>

                  <label className="text-sm block">
                    <span className="block text-xs text-gray-600 mb-1">
                      Service
                    </span>
                    <select
                      className="w-full rounded border px-3 py-2 text-sm bg-white"
                      value={selected}
                      onChange={(e) => {
                        const nextId = e.target.value || "";
                        const opt = nextId
                          ? optionByServiceId.get(String(nextId))
                          : null;

                        setRowDraft(r.id, {
                          selectedServiceId: nextId,
                          title: opt?.name ?? "",
                          category: opt?.category ?? "",
                          duration: Number(opt?.duration ?? 0),
                          price: Number(opt?.price ?? 0),
                        });
                      }}
                      disabled={saving || serviceOptions.length === 0}
                    >
                      <option value="">Select a service…</option>

                      {grouped.map((g) => (
                        <optgroup key={g.category} label={g.category}>
                          {g.items.map((o) => (
                            <option key={o.service_id} value={o.service_id}>
                              {o.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end items-center pt-2 gap-3">
          <button
            type="button"
            className="px-4 py-2 rounded border text-sm bg-white hover:bg-gray-50"
            onClick={onClose}
            disabled={saving}
          >
            Close
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
            onClick={handleSave}
            disabled={saving || loading || serviceOptions.length === 0}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </ModalLarge>
  );
}
