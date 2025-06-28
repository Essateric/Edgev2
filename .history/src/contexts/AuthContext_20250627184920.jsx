// src/contexts/AuthProvider.jsx

import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../supabaseClient.js";
import bcrypt from "bcryptjs";
import { getStaffPins, cacheStaffPins } from "../utils/pinCache"; // Ensure the path/extension matches

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Restore session (online or offline)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
    });

    // Refresh PIN cache from Supabase if online
    if (navigator.onLine) {
      cacheStaffPinsFromSupabase();
    }

    return () => subscription.unsubscribe();
  }, []);

  // Cache staff pins locally (for offline use)
  const cacheStaffPinsFromSupabase = async () => {
    const { data: staffList } = await supabase
      .from("staff")
      .select("id, name, email, role, pin_hash"); // Do NOT include plain pin
    if (staffList) {
      cacheStaffPins(
        staffList.map(({ id, name, email, role }) => ({
          id, name, email, role
        }))
      );
    }
  };

  // PIN login (online/offline)
const loginWithPin = async (pin) => {
  setAuthLoading(true);

  try {
    // Check Offline First
    if (!navigator.onLine) {
      const staffPins = await getStaffPins();
      const user = staffPins.find(staff => staff.pin === pin);

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

    // Online Mode: Fetch staff list
    const { data: staffList, error } = await supabase
      .from("staff")
      .select("id, name, email, role, pin_hash");

    if (error || !staffList) {
      throw new Error("Could not fetch staff");
    }

    // Check PIN against bcrypt hash
    const matchedUser = staffList.find(
      staff => staff.pin_hash && bcrypt.compareSync(pin, staff.pin_hash)
    );

    if (!matchedUser) {
      throw new Error("Invalid PIN");
    }

    // ✅ Fetch token from Edge Function with correct Authorization
    const res = await fetch("https://vmtcofezozrblfxudauk.functions.supabase.co/generate-supabase-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_FUNCTION_SECRET}`, // ✔️ Use FUNCTION_SECRET, NOT SERVICE_ROLE_KEY
      },
      body: JSON.stringify({ staff_id: matchedUser.id }),
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || "Token fetch failed");
    }

    const token = result.token;

    // 🔑 Login using the token
    const { error: authError } = await supabase.auth.signInWithIdToken({ token });

    if (authError) {
      throw new Error(authError.message);
    }

    setCurrentUser({ ...matchedUser, offline: false });
    localStorage.removeItem("offlineUser");

    // Refresh cache after login
    cacheStaffPinsFromSupabase();

  } catch (err) {
    console.error("Login with PIN failed:", err.message);
    throw err;
  } finally {
    setAuthLoading(false);
  }
};


  // Email login (optional, fallback)
  const login = async (email, password) => {
    setAuthLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthLoading(false);
    if (error) throw new Error(error.message);
    setCurrentUser({ ...data.user, offline: false });
    localStorage.removeItem("offlineUser");
  };

  // Logout
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
