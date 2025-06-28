import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../supabaseClient.js";
import bcrypt from "bcryptjs";
import { getStaffPins, cacheStaffPins } from "../utils/pinCache";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const FUNCTION_SECRET = import.meta.env.VITE_FUNCTION_SECRET.trim();
  const EDGE_FUNCTION_URL =
    "https://vmtcofezozrblfxudauk.functions.supabase.co/login-with-pin";

  console.log("👉 Function Secret:", FUNCTION_SECRET);

  // ✅ Session Management (online/offline)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          setCurrentUser({ ...session.user, offline: false });
        } else {
          const offlineUser = localStorage.getItem("offlineUser");
          if (offlineUser) {
            setCurrentUser(JSON.parse(offlineUser));
          } else {
            setCurrentUser(null);
          }
        }
        setAuthLoading(false);
      }
    );

    if (navigator.onLine) {
      cacheStaffPinsFromSupabase();
    }

    return () => subscription.unsubscribe();
  }, []);

  // ✅ Cache staff pins for offline use
  const cacheStaffPinsFromSupabase = async () => {
    const { data: staffList } = await supabase
      .from("staff")
      .select("id, name, email, permission, pin_hash");

    if (staffList) {
      cacheStaffPins(staffList);
    }
  };

  // ✅ PIN Login (Edge function + Offline fallback)
  const loginWithPin = async (pin) => {
    setAuthLoading(true);
    try {
      // 🔌 Offline mode
      if (!navigator.onLine) {
        const staffPins = await getStaffPins();
        const user = staffPins.find(
          (staff) =>
            staff.pin_hash && bcrypt.compareSync(pin, staff.pin_hash)
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
      console.log("👉 Sending Function Secret:", FUNCTION_SECRET);

      const res = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${FUNCTION_SECRET}`,
        },
        body: JSON.stringify({ pin }),
      });

      const result = await res.json();
      console.log("✅ Edge function result:", result);

      if (!res.ok) {
        throw new Error(result.error || "Token fetch failed");
      }

      const { token, user } = result;

      // ✅ Skip Supabase OIDC — use JWT directly
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

  // ✅ Email/Password login (fallback)
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

  // ✅ Logout
  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    localStorage.removeItem("offlineUser");
    localStorage.removeItem("currentUser");
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
