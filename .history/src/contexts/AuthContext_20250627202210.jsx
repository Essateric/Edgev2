import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../supabaseClient.js";
import bcrypt from "bcryptjs";
import { getStaffPins, cacheStaffPins } from "../utils/pinCache";

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

    if (navigator.onLine) {
      cacheStaffPinsFromSupabase();
    }

    return () => subscription.unsubscribe();
  }, []);

  // Cache staff pins locally (for offline use)
  const cacheStaffPinsFromSupabase = async () => {
    const { data: staffList } = await supabase
      .from("staff")
      .select("id, name, email, role, pin_hash");
    if (staffList) {
      cacheStaffPins(
        staffList.map(({ id, name, email, role }) => ({
          id, name, email, role
        }))
      );
    }
  };

  // PIN login (works online/offline)
  const loginWithPin = async (pin) => {
    setAuthLoading(true);

    try {
      // Offline mode
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

      // Online mode
      const { data: staffList, error } = await supabase
        .from("staff")
        .select("id, name, email, role, pin_hash");

      if (error || !staffList) {
        throw new Error("Could not fetch staff");
      }

      const matchedUser = staffList.find(
        staff => staff.pin_hash && bcrypt.compareSync(pin, staff.pin_hash)
      );

      if (!matchedUser) {
        throw new Error("Invalid PIN");
      }
      
console.log('Function Secret:', import.meta.env.FUNCTION_SECRET);
console.log("🚀 Function Secret being sent:", `Bearer ${import.meta.env.FUNCTION_SECRET}`);



      // ✅ Fetch token from Edge Function (with Authorization header)
      const res = await fetch(
        "https://vmtcofezozrblfxudauk.functions.supabase.co/generate-supabase-token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_FUNCTION_SECRET}`, // ✅ Correct Bearer header
          },
          body: JSON.stringify({ staff_id: matchedUser.id }),
        }
      );

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Token fetch failed");
      }

      const token = result.token;

      const { error: authError } = await supabase.auth.signInWithIdToken({ token });

      if (authError) {
        throw new Error(authError.message);
      }

      setCurrentUser({ ...matchedUser, offline: false });
      localStorage.removeItem("offlineUser");
      cacheStaffPinsFromSupabase();

    } catch (err) {
      console.error("Login with PIN failed:", err.message);
      throw err;
    } finally {
      setAuthLoading(false);
    }
  };

  // Email/password login (fallback option)
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
