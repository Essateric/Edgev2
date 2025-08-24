import { useState, useCallback } from "react";
import { supabase } from "../../supabaseClient";

/**
 * Save a client's DOB.
 * - Accepts YYYY-MM-DD and writes to the `dob` DATE column.
 * - No `dob_day` / `dob_month` updates (since your table doesn't have them).
 *
 * Usage:
 *   const { dobInput, setDobInput, savingDOB, dobError, saveDOB } = useSaveClientDOB();
 *   await saveDOB({ clientId, dob: dobInput });
 */
export function useSaveClientDOB() {
  const [dobInput, setDobInput] = useState("");
  const [savingDOB, setSavingDOB] = useState(false);
  const [dobError, setDobError] = useState(null);

  const isValidISODate = (iso) => {
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

      const value = (dob ?? dobInput)?.trim();
      if (!value) throw new Error("Please pick a date.");
      if (!isValidISODate(value)) {
        throw new Error("Date must be in YYYY-MM-DD format.");
      }

      const { error } = await supabase
        .from("clients")
        .update({ dob: value }) // ✅ only update the DATE column that exists
        .eq("id", clientId)
        .select()
        .single();

      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.error("Save DOB failed:", e.message);
      setDobError(e.message);
      return { ok: false, error: e };
    } finally {
      setSavingDOB(false);
    }
  }, [dobInput]);

  return {
    dobInput,
    setDobInput,
    savingDOB,
    dobError,
    saveDOB,
  };
}
