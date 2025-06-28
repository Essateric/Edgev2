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

    // OFFLINE MODE
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
        setAuthLoading(false);
        throw new Error("Invalid PIN (offline)");
      }
    }

    // ONLINE MODE
    const { data: staffList, error } = await supabase
      .from("staff")
      .select("id, name, email, role, pin_hash");
    if (error || !staffList) {
      setAuthLoading(false);
      throw new Error("Could not fetch staff");
    }

    // Find staff with matching PIN (bcrypt)
    const matchedUser = staffList.find(
      staff => staff.pin_hash && bcrypt.compareSync(pin, staff.pin_hash)
    );
    if (!matchedUser) {
      setAuthLoading(false);
      throw new Error("Invalid PIN");
    }

    // Call your Supabase Edge Function to get a custom token
    let token;
    try {
      const res = await fetch("https://vmtcofezozrblfxudauk.functions.supabase.co/generate-supabase-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`,
        body: JSON.stringify({ staff_id: matchedUser.id }),
      });
      if (!res.ok) throw new Error("Token fetch failed");
      const json = await res.json();
      token = json.token;
    } catch (err) {
      setAuthLoading(false);
      throw new Error("Failed to get token: " + (err.message || err));
    }

    // Login with Supabase using the token
    const { error: authError } = await supabase.auth.signInWithIdToken({ token });
    if (authError) {
      setAuthLoading(false);
      throw new Error(authError.message);
    }

    setCurrentUser({ ...matchedUser, offline: false });
    localStorage.removeItem("offlineUser");
    setAuthLoading(false);

    // Refresh PIN cache after successful login if online
    cacheStaffPinsFromSupabase();
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
