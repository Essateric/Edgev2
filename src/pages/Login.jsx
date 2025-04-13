import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await login(email, password);
    } catch (err) {
      console.error(err);
      setError("Failed to log in");
    }
  }

  return (
    <div className="flex justify-center items-center h-screen bg-black">
      <Card className="w-full max-w-md">
        <h2 className="text-2xl font-bold text-center mb-4 text-bronze">Login</h2>

        {error && <div className="text-red-500 mb-2">{error}</div>}

        <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border p-2 rounded text-black"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border p-2 rounded text-black"
          />
          <Button type="submit">Login</Button>
        </form>
      </Card>
    </div>
  );
}