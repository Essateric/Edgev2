import { useState, useCallback } from "react";
import { supabase } from "../../supabaseClient";

/**
 * Save a client's DOB.
 * - Accepts YYYY-MM-DD.
 * - If you store day+month only, it fills dob_day and dob_month.
 * - If you also have a full `dob` DATE column, pass { storeFullDate: true }.
 */
export function useSaveClientDOB({ storeFullDate = false } = {}) {
  const [dobInput, setDobInput] = useState("");     // controlled input value
  const [savingDOB, setSavingDOB] = useState(false);
  const [dobError, setDobError] = useState(null);

  const isValidISODate = (iso) => {
    // Basic YYYY-MM-DD check + real date verification
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(iso + "T00:00:00Z");
    return (
      dt instanceof Date &&
      !isNaN(dt) &&
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() + 1 === m &&
      dt.getUTCDate() === d
    );
  };

  const saveDOB = useCallback(async ({ clientId, dob }) => {
    try {
      setSavingDOB(true);
      setDobError(null);

      const value = dob?.trim() || dobInput?.trim();
      if (!isValidISODate(value)) {
        throw new Error("Date must be in YYYY-MM-DD format.");
      }

      const [yyyy, mm, dd] = value.split("-");
      const update = {
        dob_day: parseInt(dd, 10),
        dob_month: parseInt(mm, 10),
      };

      if (storeFullDate) {
        // Only if you also keep a full `dob` column (DATE)
        update.dob = value;
      }

      const { error } = await supabase
        .from("clients")
        .update(update)
        .eq("id", clientId)
        .select()
        .single();

      if (error) throw error;
      // Optionally: toast or any success UI here
      return { ok: true };
    } catch (e) {
      console.error("Save DOB failed:", e.message);
      setDobError(e.message);
      return { ok: false, error: e };
    } finally {
      setSavingDOB(false);
    }
  }, [dobInput, storeFullDate]);

  return {
    dobInput,
    setDobInput,   // bind this to your input
    savingDOB,
    dobError,
    saveDOB,       // call this in your button handler
  };
}
