import React, { createContext, useContext, useState, useEffect } from "react";
import bcrypt from "bcryptjs";
import { supabase } from "../supabaseClient"; // ✅ shared instance
import { getStaffPins, cacheStaffPins } from "../utils/PinCache.jsx";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [session?.user, setsession?.user] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);

  const EDGE_FUNCTION_URL =
    "https://vmtcofezozrblfxudauk.functions.supabase.co/login-with-pin";

useEffect(() => {
  const restoreSession = async () => {
    const storedUser = localStorage.getItem("session?.user");
    const offlineUser = localStorage.getItem("offlineUser");

    if (offlineUser) {
      const parsed = JSON.parse(offlineUser);
      setsession?.user(parsed);
    } else if (storedUser) {
      const parsed = JSON.parse(storedUser);
      await supabase.auth.setSession({
        access_token: parsed.token,
        refresh_token: "",
      });
      setsession?.user(parsed);
    } else {
      setsession?.user(null);
    }

    if (navigator.onLine) {
      cacheStaffPinsFromSupabase();
    }

    setAuthLoading(false);
  };

  restoreSession();
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
    // ----- Offline path (unchanged)
    if (!navigator.onLine) {
      const staffPins = await getStaffPins();
      const user = staffPins.find(
        (staff) => staff.pin_hash && bcrypt.compareSync(pin, staff.pin_hash)
      );
      if (user) {
        const offlineUser = { ...user, offline: true };
        setsession?.user(offlineUser);
        localStorage.setItem("offlineUser", JSON.stringify(offlineUser));
        return;
      } else {
        throw new Error("Invalid PIN (offline)");
      }
    }

    // ----- Call Edge Function (now returns email + token_hash)
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "PIN login failed");

    // Expecting: { email, token_hash, name, permission, logs? }
    const { email, token_hash, name, permission } = result;

    // ----- Create REAL Supabase session
    const { data, error } = await supabase.auth.verifyOtp({
      type: "magiclink",
      token_hash,
      email,
    });
    if (error) throw error;

    // ----- Store user/session
    const userData = {
      id: data.user.id,
      email,
      name,
      permission,
      token: data.session?.access_token,
      offline: false,
    };

    setsession?.user(userData);
    localStorage.setItem("session?.user", JSON.stringify(userData));
    localStorage.removeItem("offlineUser");

    // ----- Refresh cached staff pins
    await cacheStaffPinsFromSupabase();
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

    setsession?.user(user);
    localStorage.setItem("session?.user", JSON.stringify(user));
    localStorage.removeItem("offlineUser");

    await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token || "",
    });
  };

  const logout = async () => {
    setsession?.user(null);
    localStorage.removeItem("offlineUser");
    localStorage.removeItem("session?.user");
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session?.user,
        login,
        loginWithPin,
        logout,
        authLoading,
        isAuthenticated: !!session?.user,
        pageLoading,
        setPageLoading,
        supabaseClient: supabase, // Expose shared client
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
