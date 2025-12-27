// src/pages/Login.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import Button from "../components/Button.jsx";
import PinPad from "../components/PinPad.jsx";
import { toast } from "react-hot-toast";
import logo from "../assets/EdgeLogo.png";
import supabase from "../supabaseClient";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/";

  const { login, loginWithPin, currentUser, authLoading } = useAuth();

  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("pin"); // "pin" | "email" | "forgotPin"
  const [magicEmail, setMagicEmail] = useState("");

  const [sending, setSending] = useState(false);       // magic link
  const [submitting, setSubmitting] = useState(false); // doing a login attempt
  const showPinSubmitting = mode === "pin" && submitting;

  // Keep your existing gating
  const keypadDisabled = sending || submitting;
  const enterDisabled = sending || submitting || pin.length !== 4;


  // Belt & braces: if the auth state flips to an authenticated user,
  // route to the intended page.
  useEffect(() => {
    if (!authLoading && currentUser) {
      navigate(from, { replace: true });
    }
  }, [authLoading, currentUser, navigate, from]);

  // PIN login: keep your logic, but *await* loginWithPin and navigate immediately.
  const handlePinLogin = useCallback(async () => {
    if (enterDisabled || submitting) return;

    try {
      if (pin.length !== 4) {
        toast.error("Enter 4-digit PIN");
        return;
      }
      setSubmitting(true);

      await loginWithPin(pin);            // <- await the async auth
      toast.success("Welcome back!");
      navigate(from, { replace: true });  // <- deterministic navigation now

    } catch (err) {
      const msg = err?.message || "PIN login failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [enterDisabled, submitting, pin, loginWithPin, navigate, from]);

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (enterDisabled || submitting) return;

    try {
      setSubmitting(true);
      await login(email, password);
      toast.success("Welcome back!");
      // navigation handled by the effect above when currentUser becomes truthy
    } catch (err) {
      const msg = err?.message || "Email login failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMagicLink = async (e) => {
    e.preventDefault();
    if (sending) return;

    setSending(true);
    setError("");
    try {
      const res = await fetch(
        "https://vmtcofezozrblfxudauk.functions.supabase.co/send-magic-link",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: magicEmail }),
        }
      );
      const result = await res.json();
      if (res.ok) {
        toast.success("Magic link sent! Check your email.");
        setMode("pin");
      } else {
        const msg = result?.error || "Error sending magic link.";
        setError(msg);
        toast.error(msg);
      }
    } catch (err) {
      setError("Network error. Please try again.");
      toast.error("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex justify-center items-center h-screen bg-gradient-to-br from-black via-zinc-900 to-bronze relative">
      <div className="absolute inset-0 bg-black bg-opacity-60 z-0" />

      <div className="w-full max-w-md z-10 bg-black bg-opacity-80 shadow-xl rounded-3xl flex flex-col items-center p-8 relative">
        {showPinSubmitting && (
          <div className="absolute inset-0 z-20 rounded-3xl bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-3 text-amber-100">
            <div
              className="h-12 w-12 rounded-full border-4 border-amber-400 border-t-transparent animate-spin"
              aria-hidden="true"
            />
            <div className="text-lg font-semibold" role="status" aria-live="polite">
              Signing you in...
            </div>
            <p className="text-xs text-amber-100/80 text-center px-6">
              Hold tight while we load your calendar.
            </p>
          </div>
        )}
        <img
          src={logo}
          alt="Edge HD Logo"
          className="w-24 mb-4 mt-2 drop-shadow-lg"
          style={{ filter: "brightness(1.2)" }}
        />

        <h2 className="text-2xl font-bold text-center mb-4 metallic-text drop-shadow">
          {mode === "pin"
            ? "PIN Login"
            : mode === "email"
            ? "Email Login"
            : mode === "forgotPin"
            ? "Forgot PIN"
            : ""}
        </h2>

        <div className="text-center text-gray-400 mb-6 text-sm">
          {mode === "pin"
            ? "Enter your 4-digit staff PIN"
            : mode === "email"
            ? "Login with your Essateric Solutions account"
            : mode === "forgotPin"
            ? "Enter your email and we'll send a magic login link"
            : ""}
        </div>

        {error && <div className="text-red-500 mb-3 text-center">{error}</div>}

        {mode === "pin" && (
          <div className="flex flex-col space-y-4 w-full">
            <PinPad
              value={pin}
              onChange={setPin}
              onEnter={handlePinLogin}
              disabled={keypadDisabled}
              enterDisabled={enterDisabled}
            />
            <input type="hidden" name="pin" value={pin} />
            <button
              onClick={() => {
                setMode("forgotPin");
                setError("");
                setMagicEmail("");
              }}
              className="mt-2 text-xs text-blue-400 hover:underline"
              disabled={enterDisabled}
              type="button"
            >
              Forgot PIN?
            </button>
          </div>
        )}

        {mode === "email" && (
          <form onSubmit={handleEmailLogin} className="flex flex-col space-y-4 w-full">
            <input
              type="email"
              name="email"
              placeholder="Email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border p-2 rounded text-black"
              required
              disabled={enterDisabled}
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
              disabled={enterDisabled}
            />
            <Button type="submit" disabled={enterDisabled}>
              {submitting ? "Logging in..." : "Login"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setMode("forgotPin");
                setError("");
                setMagicEmail("");
              }}
              className="mt-2 text-xs text-blue-400 hover:underline"
              disabled={enterDisabled}
            >
              Forgot PIN?
            </button>
          </form>
        )}

        {mode === "forgotPin" && (
          <form onSubmit={handleMagicLink} className="flex flex-col space-y-4 w-full">
            <input
              type="email"
              placeholder="Enter your email"
              value={magicEmail}
              onChange={(e) => setMagicEmail(e.target.value)}
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
          disabled={enterDisabled}
          type="button"
        >
          {mode === "pin" ? "Switch to Email Login" : mode === "email" ? "Switch to PIN Login" : ""}
        </button>

        <div className="mt-8 text-xs text-gray-500 text-center w-full">
          &copy; {new Date().getFullYear()} Essateric Solutions
        </div>
      </div>
    </div>
  );
}
