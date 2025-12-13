// src/onlinebookings/hooks/useServicesAndProviders.js
import { useEffect, useState } from "react";
import supabase from "../../supabaseClient"; // ✅ default import, not { supabase }

export default function useServicesAndProviders() {
  const [services, setServices] = useState([]);
  const [providers, setProviders] = useState([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1) Services
        console.log("[OB] fetching services via public_get_services");
        const { data: s, error: sErr } = await supabase.rpc("public_get_services");
        if (sErr) {
          console.error("[OB] public_get_services error:", sErr);
        }
        if (!cancelled) {
          setServices(s || []);
        }

        // 2) Staff (RPC may not include weekly_hours)
        console.log("[OB] fetching staff via public_get_staff");
        const { data: staff = [], error: staffErr } = await supabase.rpc("public_get_staff");
        if (staffErr) {
          console.error("[OB] public_get_staff error:", staffErr);
        }

        if (cancelled) return;

        // 2a) If any staff rows are missing weekly_hours, fetch them from the table and merge.
        const missingIds = staff
          .filter((p) => p.weekly_hours == null)
          .map((p) => p.id);

        if (missingIds.length) {
          console.log("[OB] fetching weekly_hours for missing staff ids:", missingIds);
          const { data: hoursRows = [], error: hoursErr } = await supabase
            .from("staff")
            .select("id, weekly_hours")
            .in("id", missingIds);

          if (hoursErr) {
            console.error("[OB] staff weekly_hours fetch error:", hoursErr);
          } else {
            const byId = new Map(hoursRows.map((r) => [r.id, r.weekly_hours]));
            for (const p of staff) {
              if (p.weekly_hours == null && byId.has(p.id)) {
                p.weekly_hours = byId.get(p.id);
              }
            }
          }
        }

        if (cancelled) return;

        // 3) staff_services links
        console.log("[OB] fetching staff_services via public_get_staff_services");
        const { data: links, error: linksErr } = await supabase.rpc(
          "public_get_staff_services"
        );

        if (linksErr) {
          console.error("[OB] public_get_staff_services error:", linksErr);
        }

        const map = new Map();
        for (const r of links || []) {
          if (!map.has(r.staff_id)) map.set(r.staff_id, new Set());
          map.get(r.staff_id).add(r.service_id);
        }

        // 4) Normalise providers (keep all existing logic)
        const normalised = (staff || []).map((p) => {
          const baseServiceIds = Array.from(map.get(p.id) || []);

          const isMartinByName = String(p.name || p.title || "")
            .trim()
            .toLowerCase() === "martin";
          const isMartinById = p.id === "9cf991b3-2ea5-44c1-b915-615fdd9f993c";
          const isMartin = isMartinById || isMartinByName;

          // Ensure weekly_hours is at least an object so useSlots reads it
          const weekly_hours =
            p.weekly_hours && typeof p.weekly_hours === "object"
              ? p.weekly_hours
              : null;

          return {
            ...p,
            weekly_hours, // <-- crucial for Sunday to be blocked
            service_ids:
              baseServiceIds.length > 0
                ? baseServiceIds
                : isMartin
                ? (s || []).map((x) => x.id)
                : baseServiceIds,
            online_bookings: p.online_bookings ?? true,
            is_active: p.is_active ?? true,
            title: isMartin ? "Senior Stylist" : p.title || null,
            role: isMartin ? "stylist" : p.role,
          };
        });

        if (!cancelled) {
          setProviders(normalised);
        }
      } catch (err) {
        console.error("[OB] useServicesAndProviders fatal error:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { services, providers };
}
