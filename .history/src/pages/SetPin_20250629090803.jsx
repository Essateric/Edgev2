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
  <div className="flex flex-col justify-center items-center min-h-screen gap-8
    bg-gradient-to-br from-black via-zinc-900 to-[#cd7f32] relative">
    
    <div className="absolute inset-0 bg-black/60 z-0" />

    {/* Logo */}
    <img
      src={logo}
      alt="Essateric Solutions Logo"
      className="w-24 drop-shadow-xl z-10"
      style={{ filter: "brightness(1.2)" }}
    />

    {/* Heading */}
    <div className="flex flex-col items-center gap-1 z-10">
      <h2 className="text-3xl font-bold metallic-text drop-shadow">
        {mode === "pin" ? "PIN Login"
          : mode === "email" ? "Email Login"
          : mode === "forgotPin" ? "Forgot PIN"
          : ""}
      </h2>
      <p className="text-sm text-gray-300">
        {mode === "pin"
          ? "Enter your 4-digit staff PIN"
          : mode === "email"
            ? "Login with your Essateric Solutions account"
            : mode === "forgotPin"
              ? "Enter your email for a magic login link"
              : ""}
      </p>
    </div>

    {/* PIN dots */}
    {mode === "pin" && (
      <div className="flex gap-4 z-10">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`w-5 h-5 rounded-full border-2 transition-all duration-150 ${
              i < pin.length
                ? "bg-bronze border-white shadow-md"
                : "bg-white border-bronze"
            }`}
          />
        ))}
      </div>
    )}

    {/* Main Content */}
    <div className="flex flex-col items-center gap-4 w-full max-w-[360px] z-10">

      {/* PIN Mode */}
      {mode === "pin" && (
        <>
          <PinPad
            value={pin}
            onChange={setPin}
            onEnter={handlePinLogin}
            disabled={isDisabled}
          />
          <button
            onClick={() => {
              setMode("forgotPin");
              setError("");
              setMagicEmail("");
            }}
            className="text-xs text-blue-400 hover:underline"
            disabled={isDisabled}
          >
            Forgot PIN?
          </button>
        </>
      )}

      {/* Email Mode */}
      {mode === "email" && (
        <form
          onSubmit={handleEmailLogin}
          className="flex flex-col gap-4 w-full"
        >
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border p-2 rounded text-black"
            disabled={isDisabled}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border p-2 rounded text-black"
            disabled={isDisabled}
            required
          />
          <Button type="submit" disabled={isDisabled}>
            {authLoading ? "Logging in..." : "Login"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setMode("forgotPin");
              setError("");
              setMagicEmail("");
            }}
            className="text-xs text-blue-400 hover:underline"
            disabled={isDisabled}
          >
            Forgot PIN?
          </button>
        </form>
      )}

      {/* Forgot PIN Mode */}
      {mode === "forgotPin" && (
        <form
          onSubmit={handleMagicLink}
          className="flex flex-col gap-4 w-full"
        >
          <input
            type="email"
            placeholder="Enter your email"
            value={magicEmail}
            onChange={(e) => setMagicEmail(e.target.value)}
            className="border p-2 rounded text-black"
            disabled={sending}
            required
          />
          <Button type="submit" disabled={sending || !magicEmail}>
            {sending ? "Sending..." : "Send Magic Link"}
          </Button>
          <button
            type="button"
            onClick={() => setMode("pin")}
            className="text-xs text-gray-400 hover:underline"
            disabled={sending}
          >
            Back to PIN Login
          </button>
        </form>
      )}

      {/* Mode Switch */}
      <button
        onClick={() => {
          if (mode === "pin") {
            setMode("email");
            setError("");
            setPin("");
          } else if (mode === "email") {
            setMode("pin");
            setError("");
            setEmail("");
            setPassword("");
          } else if (mode === "forgotPin") {
            setMode("pin");
            setError("");
            setMagicEmail("");
          }
        }}
        className="text-xs text-gray-400 hover:underline"
        disabled={isDisabled}
      >
        {mode === "pin"
          ? "Switch to Email Login"
          : mode === "email"
            ? "Switch to PIN Login"
            : ""}
      </button>

      {/* Footer */}
      <div className="text-xs text-gray-500 text-center">
        &copy; {new Date().getFullYear()} Essateric Solutions
      </div>
    </div>
  </div>
);

}
