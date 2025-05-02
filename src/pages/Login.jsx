// src/pages/Login.jsx
import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import PinPad from "../components/PinPad.jsx";
import { toast } from "react-hot-toast";


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
    <div className="flex justify-center items-center h-screen bg-black">
      <Card className="w-full max-w-md">
        <h2 className="text-2xl font-bold text-center mb-4 text-bronze">
          {mode === "pin" ? "PIN Login" : "Email Login"}
        </h2>

        {error && <div className="text-red-500 mb-3 text-center">{error}</div>}

        {mode === "pin" ? (
          <div className="flex flex-col space-y-4">
            <PinPad value={pin} onChange={setPin} onEnter={handlePinLogin} />
            <input type="hidden" name="pin" value={pin} />
          </div>
        ) : (
          <form onSubmit={handleEmailLogin} className="flex flex-col space-y-4">
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
      </Card>
    </div>
  );
}

