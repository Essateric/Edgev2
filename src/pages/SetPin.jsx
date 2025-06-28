import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { toast } from "react-hot-toast";

export default function SetPin() {
  const [searchParams] = useSearchParams();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const accessToken = searchParams.get("access_token");

  useEffect(() => {
    if (accessToken) {
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: accessToken,
      });
    }
  }, [accessToken]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (pin.length !== 4 || pin !== confirmPin) {
      setError("Pins must match and be 4 digits.");
      return;
    }

    setLoading(true);

    try {
      const user = (await supabase.auth.getUser()).data.user;

      if (!user) {
        setError("User not authenticated.");
        setLoading(false);
        return;
      }

      // ✅ Find the staff record matching the user email
      const { data: staff, error: staffError } = await supabase
        .from("staff")
        .select("*")
        .eq("email", user.email)
        .single();

      if (staffError || !staff) {
        setError("Staff record not found.");
        setLoading(false);
        return;
      }

      // ✅ Call Edge function to securely hash and save the PIN
      const res = await fetch(
        "https://vmtcofezozrblfxudauk.functions.supabase.co/hash-pin",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ staff_id: staff.id, pin }),
        }
      );

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || "Failed to update PIN.");
        setLoading(false);
        return;
      }

      toast.success("PIN set successfully!");
      window.location.href = "/login";
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center h-screen bg-black text-white">
      <form
        onSubmit={handleSubmit}
        className="bg-zinc-900 p-6 rounded shadow-lg"
      >
        <h1 className="text-xl mb-4">Set Your PIN</h1>

        {error && <div className="text-red-500 mb-2">{error}</div>}

        <input
          type="password"
          placeholder="Enter new 4-digit PIN"
          maxLength={4}
          pattern="\d*"
          className="block w-full mb-3 p-2 text-black"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Confirm new PIN"
          maxLength={4}
          pattern="\d*"
          className="block w-full mb-3 p-2 text-black"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          required
        />

        <button
          type="submit"
          className="bg-bronze px-4 py-2 rounded w-full"
          disabled={loading}
        >
          {loading ? "Saving..." : "Set PIN"}
        </button>
      </form>
    </div>
  );
}
