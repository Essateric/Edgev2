import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";

export default function EditServicesModal({ staff, servicesList, onClose }) {
  const [rows, setRows] = useState({}); // { [service_id]: { checked, price, mins } }
  const categories = useMemo(
    () => Array.from(new Set(servicesList.map((s) => s.category || "Uncategorized"))),
    [servicesList]
  );
  const [collapsed, setCollapsed] = useState({});

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("staff_services")
        .select("service_id, price, duration")
        .eq("staff_id", staff.id);

      if (!active) return;
      if (error) {
        console.error("Load staff_services failed:", error.message);
        setRows({});
        return;
      }

      // Seed map from DB rows
      const map = {};
      for (const r of data || []) {
        const mins = Number(r.duration) || 0;
        map[r.service_id] = {
          checked: true,
          price: r.price ?? 0,
          mins,
        };
      }
      setRows(map);
    })();

    return () => { active = false; };
  }, [staff.id]);

  const onCheck = (service_id, checked) =>
    setRows(prev => ({ ...prev, [service_id]: { ...(prev[service_id] || {}), checked } }));

  const onPrice = (service_id, value) =>
    setRows(prev => ({ ...prev, [service_id]: { ...(prev[service_id] || { checked: true }), price: value } }));

  const onHrs = (service_id, hours) =>
    setRows(prev => {
      const cur = prev[service_id] || { checked: true, mins: 0 };
      const total = (Number(hours) || 0) * 60 + (Number(cur.mins) % 60 || 0);
      return { ...prev, [service_id]: { ...cur, mins: total } };
    });

  const onMins = (service_id, minutes) =>
    setRows(prev => {
      const cur = prev[service_id] || { checked: true, mins: 0 };
      const h = Math.floor((Number(cur.mins) || 0) / 60);
      const total = h * 60 + (Number(minutes) || 0);
      return { ...prev, [service_id]: { ...cur, mins: total } };
    });

  const save = async () => {
    // 1) What exists now?
    const { data: existing, error: loadErr } = await supabase
      .from("staff_services")
      .select("service_id")
      .eq("staff_id", staff.id);

    if (loadErr) {
      alert("Failed to load current assignments: " + loadErr.message);
      return;
    }

    const existingSet = new Set((existing || []).map(r => r.service_id));
    const wantUpsert = Object.entries(rows)
      .filter(([, v]) => v?.checked)
      .map(([service_id, v]) => ({
        staff_id: staff.id,
        service_id,
        price: Number(v.price) || 0,
        duration: Number(v.mins) || 0,
        active: true
      }));

    // 2) Upsert assigned
    if (wantUpsert.length) {
      const { error: upErr } = await supabase
        .from("staff_services")
        .upsert(wantUpsert, { onConflict: ["staff_id", "service_id"] });
      if (upErr) {
        alert("Save failed: " + upErr.message);
        return;
      }
    }

    // 3) Delete unassigned
    const uncheckedIds = Object.entries(rows)
      .filter(([, v]) => !v?.checked)
      .map(([service_id]) => service_id);
    const toDelete = [...existingSet].filter(id => uncheckedIds.includes(id));

    if (toDelete.length) {
      const { error: delErr } = await supabase
        .from("staff_services")
        .delete()
        .eq("staff_id", staff.id)
        .in("service_id", toDelete);
      if (delErr) {
        alert("Delete failed: " + delErr.message);
        return;
      }
    }

    alert("✅ Services saved for " + (staff?.name || "stylist"));
    onClose?.();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <h3 className="text-xl font-bold mb-4">Edit Services for {staff?.name}</h3>

        {categories.map((cat) => (
          <div key={cat} className="mb-4">
            <button
              onClick={() => setCollapsed((p) => ({ ...p, [cat]: !p[cat] }))}
              className="w-full text-left text-lg font-semibold text-bronze mb-2"
            >
              {collapsed[cat] ? "▼" : "▶"} {cat}
            </button>

            {!collapsed[cat] && (
              <table className="w-full text-sm border">
                <thead>
                  <tr>
                    <th className="text-left px-2 py-1">On</th>
                    <th className="text-left px-2 py-1">Service</th>
                    <th className="text-left px-2 py-1">Price (£)</th>
                    <th className="text-left px-2 py-1">Hrs</th>
                    <th className="text-left px-2 py-1">Mins</th>
                  </tr>
                </thead>
                <tbody>
                  {servicesList.filter(s => (s.category || "Uncategorized") === cat).map((svc) => {
                    const rec = rows[svc.id] || {};
                    const total = Number(rec.mins) || 0;
                    const hrs = Math.floor(total / 60);
                    const mins = total % 60;
                    return (
                      <tr key={svc.id}>
                        <td className="px-2">
                          <input
                            type="checkbox"
                            checked={!!rec.checked}
                            onChange={(e) => onCheck(svc.id, e.target.checked)}
                          />
                        </td>
                        <td className="px-2">{svc.name}</td>
                        <td className="px-2">
                          <input
                            type="number"
                            className="w-24 border px-2 py-1 rounded"
                            value={rec.price ?? ""}
                            onChange={(e) => onPrice(svc.id, e.target.value)}
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="px-2">
                          <input
                            type="number"
                            className="w-16 border px-2 py-1 rounded"
                            value={hrs || ""}
                            onChange={(e) => onHrs(svc.id, e.target.value)}
                            min="0"
                          />
                        </td>
                        <td className="px-2">
                          <input
                            type="number"
                            className="w-16 border px-2 py-1 rounded"
                            value={mins || ""}
                            onChange={(e) => onMins(svc.id, e.target.value)}
                            min="0"
                            max="59"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ))}

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="bg-gray-300 px-4 py-2 rounded">Cancel</button>
          <button onClick={save} className="bg-bronze text-white px-4 py-2 rounded">Save Services</button>
        </div>
      </div>
    </div>
  );
}
