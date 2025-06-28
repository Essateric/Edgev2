import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import bcrypt from "bcryptjs";
import { getStaffPins, cacheStaffPins } from "../utils/pinCache";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ✅ Monitor auth state
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

  // ✅ Cache staff for offline pin login
  const cacheStaffPinsFromSupabase = async () => {
    const { data } = await supabase
      .from("staff")
      .select("id, name, email, role, pin_hash");
    if (data) {
      cacheStaffPins(data);
    }
  };

  // ✅ PIN Login (offline + online JWT)
  const loginWithPin = async (pin) => {
    setAuthLoading(true);

    try {
      // 🔌 Offline Mode
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

      console.log("👉 Sending Function Secret:", import.meta.env.VITE_FUNCTION_SECRET);

      // 🌐 Online Mode
      const res = await fetch(
        "https://vmtcofezozrblfxudauk.functions.supabase.co/login-with-pin",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_FUNCTION_SECRET}`,
          },
          body: JSON.stringify({ pin }),
        }
      );

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Token fetch failed");
      }

      const token = result.token;

      // ✅ Login with JWT token
      const { error: authError } = await supabase.auth.signInWithIdToken({
        provider: "jwt",
        token,
      });

      if (authError) {
        throw new Error(authError.message);
      }

      setCurrentUser({ ...result.user, offline: false });
      localStorage.removeItem("offlineUser");
      cacheStaffPinsFromSupabase();
    } catch (err) {
      console.error("Login with PIN failed:", err.message);
      throw err;
    } finally {
      setAuthLoading(false);
    }
  };

  // ✅ Email/Password Login
  const login = async (email, password) => {
    setAuthLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setAuthLoading(false);
    if (error) throw new Error(error.message);
    setCurrentUser({ ...data.user, offline: false });
    localStorage.removeItem("offlineUser");
  };

  // ✅ Logout
  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    localStorage.removeItem("offlineUser");
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        login,
        loginWithPin,
        logout,
        authLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
