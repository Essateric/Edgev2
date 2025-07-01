import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import bcrypt from "bcryptjs";
import { getStaffPins, cacheStaffPins } from "../utils/pinCache";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true); // 🔥 Auth-specific loading
  const [pageLoading, setPageLoading] = useState(false); // 🔥 Global page loader

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

  // ✅ Email/Password login (optional backup)
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
    await supabase.auth.signOut();
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

        // 🔥 Global page loader values
        pageLoading,
        setPageLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
