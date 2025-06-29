import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import PinPad from "../components/PinPad.jsx";
import { toast } from "react-hot-toast";
import logo from "../assets/EdgeLogo.png"; // or your Essateric Solutions logo

export default function Login() {
  const { login, loginWithPin, authLoading } = useAuth();
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("pin");
  const [magicEmail, setMagicEmail] = useState("");
  const [sending, setSending] = useState(false);

  // PIN login flow using new logic (works online & offline)
  const handlePinLogin = async () => {
    try {
      if (pin.length !== 4) {
        toast.error("Enter 4-digit PIN");
        return;
      }
      await loginWithPin(pin);
      // If you want a redirect here after success, you can add: window.location.href = "/";
    } catch (err) {
      toast.error(err.message || "PIN login failed");
      setError(err.message || "PIN login failed");
    }
  };

  // Email/password fallback login
  const handleEmailLogin = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      window.location.href = "/";
    } catch (err) {
      setError("Email login failed");
      toast.error("Email login failed");
    }
  };

  // Magic link request handler (forgot pin)
  const handleMagicLink = async (e) => {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      const res = await fetch('https://vmtcofezozrblfxudauk.functions.supabase.co/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: magicEmail }),
      });
      const result = await res.json();
      if (res.ok) {
        toast.success("Magic link sent! Check your email.");
        setMode("pin");
      } else {
        setError(result.error || "Error sending magic link.");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    }
    setSending(false);
  };

  // Optionally, disable the UI while loading
  const isDisabled = authLoading || sending;

  return (
    <div className="flex justify-center items-center h-screen bg-gradient-to-br from-black via-zinc-900 to-bronze relative">
      <div className="absolute inset-0 bg-black bg-opacity-60 z-0" />
      {/* <Card className="w-full max-w-md z-10 bg-black bg-opacity-80 border-2 border-bronze shadow-2xl flex flex-col items-center p-8 relative"> */}
        {/* Logo */}
        <img
          src={logo}
          alt="Essateric Solutions Logo"
          className="w-24 mb-4 mt-2 drop-shadow-lg"
          style={{ filter: "brightness(1.2)" }}
        />
        {/* Heading */}
        <h2 className="text-2xl font-bold text-center mb-4 metallic-text drop-shadow">
          {
            mode === "pin" ? "PIN Login" :
            mode === "email" ? "Email Login" :
            mode === "forgotPin" ? "Forgot PIN" :
            ""
          }
        </h2>
        <div className="text-center text-gray-400 mb-6 text-sm">
          {
            mode === "pin"
              ? "Enter your 4-digit staff PIN"
              : mode === "email"
                ? "Login with your Essateric Solutions account"
                : mode === "forgotPin"
                  ? "Enter your email and we'll send a magic login link"
                  : ""
          }
        </div>
        {/* Error */}
        {error && (
          <div className="text-red-500 mb-3 text-center">{error}</div>
        )}

        {/* PIN Login */}
        {mode === "pin" && (
          <div className="flex flex-col space-y-4 w-full">
            <PinPad
              value={pin}
              onChange={setPin}
              onEnter={handlePinLogin}
              disabled={isDisabled}
            />
            <input type="hidden" name="pin" value={pin} />
            <button
              onClick={() => {
                setMode("forgotPin");
                setError("");
                setMagicEmail("");
              }}
              className="mt-2 text-xs text-blue-400 hover:underline"
              disabled={isDisabled}
            >
              Forgot PIN?
            </button>
          </div>
        )}

        {/* Email Login */}
        {mode === "email" && (
          <form
            onSubmit={handleEmailLogin}
            className="flex flex-col space-y-4 w-full"
          >
            <input
              type="email"
              name="email"
              placeholder="Email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border p-2 rounded text-black"
              required
              disabled={isDisabled}
            />
            <input
              type="password"
              name="password"
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border p-2 rounded text-black"
              required
              disabled={isDisabled}
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
              className="mt-2 text-xs text-blue-400 hover:underline"
              disabled={isDisabled}
            >
              Forgot PIN?
            </button>
          </form>
        )}

        {/* Magic Link Form */}
        {mode === "forgotPin" && (
          <form
            onSubmit={handleMagicLink}
            className="flex flex-col space-y-4 w-full"
          >
            <input
              type="email"
              placeholder="Enter your email"
              value={magicEmail}
              onChange={e => setMagicEmail(e.target.value)}
              className="border p-2 rounded text-black"
              required
              disabled={sending}
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
          className="mt-4 text-xs text-gray-400 hover:underline"
          disabled={isDisabled}
        >
          {mode === "pin"
            ? "Switch to Email Login"
            : mode === "email"
              ? "Switch to PIN Login"
              : ""}
        </button>
        <div className="mt-8 text-xs text-gray-500 text-center w-full">
          &copy; {new Date().getFullYear()} Essateric Solutions
        </div>
      {/* </Card> */}
    </div>
  );
}
