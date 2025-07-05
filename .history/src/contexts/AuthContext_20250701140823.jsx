import React, { createContext, useContext, useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { getStaffPins, cacheStaffPins } from "../utils/pinCache";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Create a supabase client without token initially
let supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);

  const EDGE_FUNCTION_URL =
    "https://vmtcofezozrblfxudauk.functions.supabase.co/login-with-pin";

  // Update supabase client with auth token
  const createSupabaseWithToken = (token) => {
    supabaseClient = createClient(SUPABASE_URL, token);
  };

  useEffect(() => {
    // Load session from localStorage on mount
    const storedUser = localStorage.getItem("currentUser");
    const offlineUser = localStorage.getItem("offlineUser");

    if (offlineUser) {
      setCurrentUser(JSON.parse(offlineUser));
      createSupabaseWithToken(JSON.parse(offlineUser).token);
    } else if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
      createSupabaseWithToken(JSON.parse(storedUser).token);
    } else {
      setCurrentUser(null);
      // No token, use anon key
      createSupabaseWithToken(SUPABASE_ANON_KEY);
    }

    if (navigator.onLine) {
      cacheStaffPinsFromSupabase();
    }

    setAuthLoading(false);
  }, []);

  const cacheStaffPinsFromSupabase = async () => {
    const { data: staffList } = await supabaseClient
      .from("staff")
      .select("id, name, email, permission, pin_hash");

    if (staffList) {
      cacheStaffPins(staffList);
    }
  };

  // Login with PIN (online first, offline fallback)
  const loginWithPin = async (pin) => {
    setAuthLoading(true);
    try {
      if (!navigator.onLine) {
        // Offline login
        const staffPins = await getStaffPins();
        const user = staffPins.find(
          (staff) => staff.pin_hash && bcrypt.compareSync(pin, staff.pin_hash)
        );

        if (user) {
          const offlineUser = { ...user, offline: true };
          setCurrentUser(offlineUser);
          localStorage.setItem("offlineUser", JSON.stringify(offlineUser));
          // Offline users use anon key (no token)
          createSupabaseWithToken(SUPABASE_ANON_KEY);
          setAuthLoading(false);
          return;
        } else {
          throw new Error("Invalid PIN (offline)");
        }
      }

      // Online login: call your edge function
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

      // Update supabase client with new token for authenticated requests
      createSupabaseWithToken(token);

      cacheStaffPinsFromSupabase();
    } catch (err) {
      console.error("❌ Login with PIN failed:", err.message);
      throw err;
    } finally {
      setAuthLoading(false);
    }
  };

  // Email/password login backup
  const login = async (email, password) => {
    setAuthLoading(true);
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });
    setAuthLoading(false);
    if (error) throw new Error(error.message);
    const user = { ...data.user, offline: false };
    setCurrentUser(user);
    localStorage.setItem("currentUser", JSON.stringify(user));
    localStorage.removeItem("offlineUser");

    // Update supabase client with user's access token
    createSupabaseWithToken(data.session.access_token);
  };

  // Logout
  const logout = async () => {
    setCurrentUser(null);
    localStorage.removeItem("offlineUser");
    localStorage.removeItem("currentUser");
    await supabaseClient.auth.signOut();

    // Reset supabase client to anon key
    createSupabaseWithToken(SUPABASE_ANON_KEY);
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
        supabaseClient, // expose client for components that want direct access
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
