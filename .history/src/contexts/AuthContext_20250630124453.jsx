import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import bcrypt from "bcryptjs";
import { getStaffPins, cacheStaffPins } from "../utils/pinCache";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const EDGE_FUNCTION_URL =
    "https://vmtcofezozrblfxudauk.functions.supabase.co/login-with-pin";

  // ✅ Load session from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem("currentUser");
    const offlineUser = localStorage.getItem("offlineUser");

    if (offlineUser) {
      setCurrentUser(JSON.parse(offlineUser));
    } else if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    } else {
      setCurrentUser(null);
    }

    if (navigator.onLine) {
      cacheStaffPinsFromSupabase();
    }

    setAuthLoading(false);
  }, []);

  // ✅ Cache staff pins for offline login
  const cacheStaffPinsFromSupabase = async () => {
    const { data: staffList } = await supabase
      .from("staff")
      .select("id, name, email, permission, pin_hash");

    if (staffList) {
      cacheStaffPins(staffList);
    }
  };

  // ✅ Login with PIN (online first, offline fallback)
  const loginWithPin = async (pin) => {
    setAuthLoading(true);
    try {
      // 🔌 Offline mode
      if (!navigator.onLine) {
        const staffPins = await getStaffPins();
        const user = staffPins.find(
          (staff) => staff.pin_hash && bcrypt.compareSync(pin, staff.pin_hash)
        );

        if (user) {
          const offlineUser = { ...user, offline: true };
          setCurrentUser(offlineUser);
          localStorage.setItem("offlineUser", JSON.stringify(offlineUser));
          setAuthLoading(false);
          return;
        } else {
          throw new Error("Invalid PIN (offline)");
        }
      }

      // 🌐 Online mode using Edge Function
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "PIN login failed");
      }

      const { token, user } = result;

      // ✅ Store token-based session (manual JWT session)
      const userData = {
        ...user,
        token,
        offline: false,
      };

      setCurrentUser(userData);
      localStorage.setItem("currentUser", JSON.stringify(userData));
      localStorage.removeItem("offlineUser");

      cacheStaffPinsFromSupabase();
    } catch (err) {
      console.error("❌ Login with PIN failed:", err.message);
      throw err;
    } finally {
      setAuthLoading(false);
    }
  };

  // ✅ Email/Password login (backup login if needed)
  const login = async (email, password) => {
    setAuthLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setAuthLoading(false);
    if (error) throw new Error(error.message);
    const user = { ...data.user, offline: false };
    setCurrentUser(user);
    localStorage.setItem("currentUser", JSON.stringify(user));
    localStorage.removeItem("offlineUser");
  };

  // ✅ Logout clears JWT session
  const logout = async () => {
    setCurrentUser(null);
    localStorage.removeItem("offlineUser");
    localStorage.removeItem("currentUser");
    await supabase.auth.signOut(); // Doesn't really do much in JWT-only flow but keeps cleanup safe
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        login,
        loginWithPin,
        logout,
        authLoading,
        isAuthenticated: !!currentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
