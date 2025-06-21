// src/pages/Login.jsx
import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import PinPad from "../components/PinPad.jsx";
import { toast } from "react-hot-toast";
import logo from "../assets/EdgeLogo.png"; // Change this to your Essateric Solutions logo if you have one!

export default function Login() {
  const { login, loginWithPin } = useAuth();
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("pin");

  const handlePinLogin = async () => {
    try {
      if (pin.length !== 4) {
        toast.error("Enter 4-digit PIN");
        return;
      }
      await loginWithPin(pin);
      // Redirect or show success message
    } catch (error) {
      toast.error(error.message || "Login failed");
    }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      window.location.href = "/";
    } catch (err) {
      console.error(err);
      setError("Email login failed");
    }
  };

  return (
    <div className="flex justify-center items-center h-screen bg-gradient-to-br from-black via-zinc-900 to-bronze relative">
      <div className="absolute inset-0 bg-black bg-opacity-60 z-0" />
      <Card className="w-full max-w-md z-10 bg-black bg-opacity-80 border-2 border-bronze shadow-2xl flex flex-col items-center p-8 relative">
        {/* Logo */}
        <img
          src={logo}
          alt="Essateric Solutions Logo"
          className="w-24 mb-4 mt-2 drop-shadow-lg"
          style={{ filter: "brightness(1.2)" }}
        />
        {/* Heading */}
        <h2 className="text-2xl font-bold text-center mb-4 metallic-text drop-shadow">
          {mode === "pin" ? "PIN Login" : "Email Login"}
        </h2>
        <div className="text-center text-gray-400 mb-6 text-sm">
          {mode === "pin"
            ? "Enter your 4-digit staff PIN"
            : "Login with your Essateric Solutions account"}
        </div>
        {/* Error */}
        {error && <div className="text-red-500 mb-3 text-center">{error}</div>}

        {/* PIN or Email Login */}
        {mode === "pin" ? (
          <div className="flex flex-col space-y-4 w-full">
            <PinPad value={pin} onChange={setPin} onEnter={handlePinLogin} />
            <input type="hidden" name="pin" value={pin} />
          </div>
        ) : (
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
            />
            <Button type="submit">Login</Button>
          </form>
        )}

        <button
          onClick={() => {
            setMode(mode === "pin" ? "email" : "pin");
            setError("");
            setPin("");
          }}
          className="mt-4 text-xs text-gray-400 hover:underline"
        >
          {mode === "pin" ? "Switch to Email Login" : "Switch to PIN Login"}
        </button>
        <div className="mt-8 text-xs text-gray-500 text-center w-full">
          &copy; {new Date().getFullYear()} Essateric Solutions
        </div>
      </Card>
    </div>
  );
}
