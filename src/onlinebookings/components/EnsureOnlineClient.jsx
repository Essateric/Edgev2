// src/onlinebookings/components/EnsureOnlineClient.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import Button from "../../components/Button";

/**
 * Props:
 *  - defaultValues: { first_name?, last_name?, email?, mobile? }
 *  - onDone: (clientRow) => void   // called with {id, first_name, last_name, email, mobile}
 */
export default function EnsureOnlineClient({ defaultValues = {}, onDone }) {
  const [step, setStep] = useState("askEmail"); // 'askEmail' | 'found' | 'create'
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [email, setEmail] = useState(defaultValues.email || "");
  const [first, setFirst] = useState(defaultValues.first_name || "");
  const [last, setLast] = useState(defaultValues.last_name || "");
  const [mobile, setMobile] = useState(defaultValues.mobile || "");

  const emailClean = useMemo(() => (email || "").trim().toLowerCase(), [email]);
  const validEmail = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean),
    [emailClean]
  );

  // If the online flow already has an email, auto-check once.
  useEffect(() => {
    if (!emailClean || !validEmail) return;
    // only auto-check when we came in with a prefilled email
    if (defaultValues.email) checkEmail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkEmail = async () => {
    setError("");
    if (!validEmail) return setError("Please enter a valid email.");
    setChecking(true);
    try {
      const { data, error: qErr } = await supabase
        .from("clients")
        .select("id, first_name, last_name, email, mobile")
        .eq("email", emailClean)
        .maybeSingle();

      if (qErr) throw qErr;

      if (data?.id) {
        // Found existing client — patch any missing bits and finish.
        let needsPatch = false;
        const patch = {};
        if (!data.first_name && first.trim()) { patch.first_name = first.trim(); needsPatch = true; }
        if (!data.last_name && last.trim())   { patch.last_name = last.trim();  needsPatch = true; }
        if (!data.mobile && mobile.trim())    { patch.mobile = mobile.trim();   needsPatch = true; }

        if (needsPatch) {
          const { error: updErr } = await supabase
            .from("clients")
            .update(patch)
            .eq("id", data.id);
          if (updErr) console.warn("Client exists but patch failed:", updErr.message);
        }

        onDone({ ...data, ...patch });
      } else {
        // Not found → go to create form
        setStep("create");
      }
    } catch (e) {
      console.error(e);
      setError(e.message || "Could not verify email.");
    } finally {
      setChecking(false);
    }
  };

  const createClient = async () => {
    setError("");
    if (!validEmail) return setError("Please enter a valid email.");
    if (!first.trim()) return setError("Please enter your first name.");

    setSaving(true);
    try {
      // Create the client (email required; last & mobile optional)
      const { data, error: insErr } = await supabase
        .from("clients")
        .insert([{
          first_name: first.trim(),
          last_name: last.trim() || null,
          email: emailClean,
          mobile: mobile.trim() || null,
        }])
        .select("id, first_name, last_name, email, mobile")
        .single();

      if (insErr) throw insErr;
      onDone(data);
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to create your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white text-gray-800 rounded-md p-4 border">
      <h3 className="text-lg font-semibold mb-2">Your details</h3>

      {/* Step: ask for email */}
      {step === "askEmail" && (
        <>
          <p className="text-sm text-gray-600 mb-2">
            Enter your email so we can find your profile. If you’re new, we’ll create one for you.
          </p>
          <div className="flex flex-col gap-2 max-w-md">
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border rounded p-2"
            />
            {/* Optional: capture names now to backfill if we find a match with missing info */}
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="First name"
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                className="border rounded p-2"
              />
              <input
                type="text"
                placeholder="Last name"
                value={last}
                onChange={(e) => setLast(e.target.value)}
                className="border rounded p-2"
              />
            </div>
            <input
              type="text"
              placeholder="Mobile (optional)"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className="border rounded p-2"
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div>
              <Button onClick={checkEmail} disabled={checking}>
                {checking ? "Checking..." : "Continue"}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Step: create new */}
      {step === "create" && (
        <>
          <p className="text-sm text-gray-600 mb-2">
            We couldn’t find an account for <strong>{emailClean}</strong>. Please confirm your details to continue.
          </p>
          <div className="flex flex-col gap-2 max-w-md">
            <input
              type="email"
              value={emailClean}
              readOnly
              className="border rounded p-2 bg-gray-100"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="First name *"
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                className="border rounded p-2"
              />
              <input
                type="text"
                placeholder="Last name"
                value={last}
                onChange={(e) => setLast(e.target.value)}
                className="border rounded p-2"
              />
            </div>
            <input
              type="text"
              placeholder="Mobile (optional)"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className="border rounded p-2"
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={() => setStep("askEmail")} className="bg-gray-200 text-gray-800">
                Back
              </Button>
              <Button onClick={createClient} disabled={saving}>
                {saving ? "Creating..." : "Create profile"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
