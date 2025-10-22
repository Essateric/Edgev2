// src/onlinebookings/hooks/useServicesAndProviders.js
import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";

export default function useServicesAndProviders() {
  const [services, setServices] = useState([]);
  const [providers, setProviders] = useState([]);

  useEffect(() => {
    (async () => {
      // 1) Services
      const { data: s } = await supabase.rpc("public_get_services");
      setServices(s || []);

      // 2) Staff (RPC may not include weekly_hours)
      const { data: staff = [] } = await supabase.rpc("public_get_staff");

      // 2a) If any staff rows are missing weekly_hours, fetch them from the table and merge.
      const missingIds = staff
        .filter((p) => p.weekly_hours == null)
        .map((p) => p.id);

      if (missingIds.length) {
        const { data: hoursRows = [] } = await supabase
          .from("staff")
          .select("id, weekly_hours")
          .in("id", missingIds);

        const byId = new Map(hoursRows.map((r) => [r.id, r.weekly_hours]));
        for (const p of staff) {
          if (p.weekly_hours == null && byId.has(p.id)) {
            p.weekly_hours = byId.get(p.id);
          }
        }
      }

      // 3) staff_services links
      const { data: links } = await supabase.rpc("public_get_staff_services");

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

      setProviders(normalised);
    })();
  }, []);

  return { services, providers };
}
