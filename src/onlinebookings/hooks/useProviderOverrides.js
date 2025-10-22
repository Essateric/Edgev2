import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";

export default function useProviderOverrides(selectedProvider) {
  const [overrides, setOverrides] = useState([]);

  useEffect(() => {
    (async () => {
      if (!selectedProvider) return setOverrides([]);
      const { data, error } = await supabase
        .from("staff_services")
        .select("service_id, staff_id, price, duration")
        .eq("staff_id", selectedProvider.id);
      if (!error) setOverrides(data || []);
    })();
  }, [selectedProvider]);

  return overrides;
}
