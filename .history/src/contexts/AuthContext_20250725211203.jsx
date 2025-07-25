import React, { createContext, useContext, useState, useEffect } from "react";
import bcrypt from "bcryptjs";
import { supabase } from "../supabaseClient"; // ✅ shared instance
import { getStaffPins, cacheStaffPins } from "../utils/PinCache.jsx";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);

  const EDGE_FUNCTION_URL =
    "https://vmtcofezozrblfxudauk.functions.supabase.co/login-with-pin";

  useEffect(() => {
    const storedUser = localStorage.getItem("currentUser");
    const offlineUser = localStorage.getItem("offlineUser");

    if (offlineUser) {
      const parsed = JSON.parse(offlineUser);
      setCurrentUser(parsed);
    } else if (storedUser) {
      const parsed = JSON.parse(storedUser);
      setCurrentUser(parsed);
      // Restore access token to supabase
      supabase.auth.setSession({
        access_token: parsed.token,
        refresh_token: "", // optional
      });
    } else {
      setCurrentUser(null);
    }

    if (navigator.onLine) {
      cacheStaffPinsFromSupabase();
    }

    setAuthLoading(false);
  }, []);

  const cacheStaffPinsFromSupabase = async () => {
    const { data: staffList } = await supabase
      .from("staff")
      .select("id, name, email, permission, pin_hash");

    if (staffList) {
      cacheStaffPins(staffList);
    }
  };

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
      if (!res.ok) throw new Error(result.error || "PIN login failed");

      const { token, user } = result;
      const userData = { ...user, token, offline: false };

      setCurrentUser(userData);
      localStorage.setItem("currentUser", JSON.stringify(userData));
      localStorage.removeItem("offlineUser");

      // ✅ Apply token to Supabase client
      await supabase.auth.setSession({
        access_token: token,
        refresh_token: "",
      });

      cacheStaffPinsFromSupabase();
    } catch (err) {
      console.error("❌ Login with PIN failed:", err.message);
      throw err;
    } finally {
      setAuthLoading(false);
    }
  };

  const login = async (email, password) => {
    setAuthLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setAuthLoading(false);

    if (error) throw new Error(error.message);

    const user = {
      ...data.user,
      token: data.session.access_token,
      offline: false,
    };

    setCurrentUser(user);
    localStorage.setItem("currentUser", JSON.stringify(user));
    localStorage.removeItem("offlineUser");

    await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token || "",
    });
  };

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
        pageLoading,
        setPageLoading,
        supabaseClient: supabase, // Expose shared client
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
