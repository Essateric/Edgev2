import React, { useEffect } from "react";
import logo from "../assets/EdgeLogo.png";
import { tryOfflineLogin } from "../utils/OfflineLogin.jsx";
import { supabase } from "../supabaseClient";
import bcrypt from "bcryptjs";

export default function PinPad({ onChange, value = "", onEnter }) {
  // Main PIN login handler (offline or online)
  const handleLogin = async () => {
    const isOffline = !navigator.onLine;

    try {
      if (isOffline) {
        // OFFLINE: use your existing fallback
        console.log("🔌 Offline mode detected");
        const result = await tryOfflineLogin(value);
        if (result.success) {
          console.log("✅ Offline login successful", result.user);
          onEnter?.(result.user);
        } else {
          console.error("❌ Offline login failed");
        }
      } else {
        // ONLINE: check PIN, then login to Supabase Auth (by email/password)
        console.log("🌐 Online mode detected");
        const { data: staffList, error: staffErr } = await supabase
          .from("staff")
          .select("*");

        if (staffErr || !staffList) throw new Error("Could not fetch staff");

        // Check PIN using bcrypt compare
        const staff = staffList.find(s => bcrypt.compareSync(value, s.pin_hash));
        if (!staff) {
          console.error("❌ Online login failed: PIN not matched");
          return;
        }

        // --- SUPABASE AUTH SESSION ---
        if (!staff.password) {
          alert(
            "Staff record is missing password for Auth login. Please update in database."
          );
          return;
        }

        // Log in to Supabase Auth (to enable secure writes, RLS, etc)
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: staff.email,
          password: staff.password,
        });

        if (authError) {
          alert("Auth failed: " + authError.message);
          return;
        }

        console.log("✅ Online login successful", staff);
        onEnter?.(staff); // callback for your context, as before
      }
    } catch (err) {
      console.error("❌ Login error:", err.message || err);
    }
  };

  // Keypad, keyboard support, no change
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key >= "0" && e.key <= "9" && value.length < 4) {
        onChange(value + e.key);
      }
      if (e.key === "Enter" && value.length === 4) {
        handleLogin();
      }
      if (e.key === "Backspace") {
        onChange(""); // Clear all
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line
  }, [value]);

  const handlePress = (digit) => {
    if (value.length < 4) onChange(value + digit);
  };
  const handleClear = () => onChange("");
  const handleEnter = () => {
    if (value.length === 4) handleLogin();
  };

  const renderButton = (label, onClick, extraClass = "") => (
    <button
      key={label}
      onClick={onClick}
      className={`w-20 h-16 text-white font-bold rounded-lg shadow-xl transition transform active:scale-95
        ${extraClass} hover:brightness-125 active:shadow-[0_0_15px_white] border border-white`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-black via-zinc-900 to-[#cd7f32] relative">
      <div className="absolute inset-0 bg-black bg-opacity-60 z-0" />

      <img
        src={logo}
        alt="The Edge HD Salon Logo"
        className="w-40 z-10 mb-8 animate-pulse"
      />

      <div className="z-10 bg-black bg-opacity-60 p-6 rounded-xl shadow-2xl border border-bronze backdrop-blur-md">
        <div className="flex justify-center space-x-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`w-6 h-6 rounded-full border-2 duration-150 ${
                i < value.length
                  ? "bg-bronze border-white"
                  : "bg-white border-bronze"
              }`}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) =>
            renderButton(num, () => handlePress(String(num)), "bg-bronze")
          )}
          {renderButton("Clear", handleClear, "bg-orange-500")}
          {renderButton("0", () => handlePress("0"), "bg-bronze")}
          {renderButton("Enter", handleEnter, "bg-green-600")}
        </div>
      </div>
    </div>
  );
}
