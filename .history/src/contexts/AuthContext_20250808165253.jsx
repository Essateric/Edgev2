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
    const restoreSession = async () => {
      try {
        const offlineUserRaw = localStorage.getItem("offlineUser");
        const storedUserRaw = localStorage.getItem("currentUser");

        // Prefer offline user if present
        if (offlineUserRaw) {
          const parsed = JSON.parse(offlineUserRaw);
          setCurrentUser(parsed);
        } else {
          // Ask Supabase for an existing session
          const { data } = await supabase.auth.getSession();
          const session = data.session;

          if (session?.user) {
            const stored = storedUserRaw ? JSON.parse(storedUserRaw) : {};
            setCurrentUser({
              id: session.user.id,
              email: session.user.email,
              name: stored?.name ?? session.user.email,
              permission: stored?.permission ?? "Staff",
              token: session.access_token,
              offline: false,
            });
          } else {
            setCurrentUser(null);
          }
        }

        if (navigator.onLine) {
          cacheStaffPinsFromSupabase();
        }
      } finally {
        setAuthLoading(false);
      }
    };

    restoreSession();

    // Keep UI in sync with auth changes
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        // logged out
        setCurrentUser(null);
        return;
      }
      setCurrentUser((prev) => ({
        id: session.user.id,
        email: session.user.email,
        name: prev?.name ?? session.user.email,
        permission: prev?.permission ?? "Staff",
        token: session.access_token,
        offline: false,
      }));
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const cacheStaffPinsFromSupabase = async () => {
    const { data: staffList } = await supabase
      .from("staff")
      .select("id, name, email, permission, pin_hash");
    if (staffList) cacheStaffPins(staffList);
  };

  const loginWithPin = async (pin) => {
    setAuthLoading(true);
    try {
      // ----- Offline login
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

      // ----- Online login via Edge Function
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "PIN login failed");

      // Expect: { email, name, permission, token_hash?, email_otp? }
      const { email, token_hash, email_otp, name, permission } = result;

      // ----- Verify with Supabase — magiclink first, OTP fallback
      let data, error;
      if (token_hash) {
        ({ data, error } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash, // ⚠️ do NOT pass email here
        }));
      } else if (email_otp) {
        ({ data, error } = await supabase.auth.verifyOtp({
          type: "email",
          email,              // OTP flow needs email
          token: email_otp,   // and token
        }));
      } else {
        throw new Error("Server returned neither token_hash nor email_otp");
      }
      if (error) throw error;

      // ----- Store user/session
      const userData = {
        id: data.user.id,
        email: data.user.email,
        name,
        permission,
        token: data.session?.access_token,
        offline: false,
      };

      setCurrentUser(userData);
      localStorage.setItem("currentUser", JSON.stringify(userData));
      localStorage.removeItem("offlineUser");

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
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw new Error(error.message);

      const user = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.email,
        permission: "Staff",
        token: data.session.access_token,
        offline: false,
      };

      setCurrentUser(user);
      localStorage.setItem("currentUser", JSON.stringify(user));
      localStorage.removeItem("offlineUser");
      // signInWithPassword already sets the session
    } finally {
      setAuthLoading(false);
    }
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
        supabaseClient: supabase,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
