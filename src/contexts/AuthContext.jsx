// src/contexts/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from "react";
import bcrypt from "bcryptjs";
import { supabase } from "../supabaseClient";
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

        if (offlineUserRaw) {
          const parsed = JSON.parse(offlineUserRaw);
          setCurrentUser({ ...parsed, staff_id: parsed.staff_id ?? parsed.id ?? null });
        } else {
          const { data } = await supabase.auth.getSession();
          const session = data.session;

          if (session?.user) {
            const stored = storedUserRaw ? JSON.parse(storedUserRaw) : {};
            const staffId = await findStaffIdForUser(session.user);

            const userData = {
              id: session.user.id,
              email: session.user.email,
              name: stored?.name ?? session.user.email,
              permission: stored?.permission ?? "Staff",
              token: session.access_token,
              offline: false,
              staff_id: staffId || stored?.staff_id || null,
            };

            setCurrentUser(userData);
            if (storedUserRaw) localStorage.setItem("currentUser", JSON.stringify(userData));
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

    // 🔧 Avoid duplicate resolve on INITIAL_SESSION
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return; // <-- important
      if (!session) {
        setCurrentUser(null);
        return;
      }
      (async () => {
        const staffId = await findStaffIdForUser(session.user);
        setCurrentUser((prev) => ({
          id: session.user.id,
          email: session.user.email,
          name: prev?.name ?? session.user.email,
          permission: prev?.permission ?? "Staff",
          token: session.access_token,
          offline: false,
          staff_id: staffId ?? prev?.staff_id ?? null,
        }));
      })();
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
      // Offline
      if (!navigator.onLine) {
        const staffPins = await getStaffPins();
        const user = staffPins.find(
          (s) => s.pin_hash && bcrypt.compareSync(pin, s.pin_hash)
        );
        if (!user) throw new Error("Invalid PIN (offline)");
        const offlineUser = { ...user, offline: true, staff_id: user.id ?? null };
        setCurrentUser(offlineUser);
        localStorage.setItem("offlineUser", JSON.stringify(offlineUser));
        return;
      }

      // Online via Edge Function
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "PIN login failed");

      const { email, token_hash, email_otp, name, permission } = result;

      let data, error;
      if (token_hash) {
        ({ data, error } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash,
        }));
      } else if (email_otp) {
        ({ data, error } = await supabase.auth.verifyOtp({
          type: "email",
          email,
          token: email_otp,
        }));
      } else {
        throw new Error("Server returned neither token_hash nor email_otp");
      }
      if (error) throw error;

      const staffId = await findStaffIdForUser(data.user);

      const userData = {
        id: data.user.id,
        email: data.user.email,
        name,
        permission,
        token: data.session?.access_token,
        offline: false,
        staff_id: staffId ?? null,
      };

      setCurrentUser(userData);
      localStorage.setItem("currentUser", JSON.stringify(userData));
      localStorage.removeItem("offlineUser");
      await cacheStaffPinsFromSupabase();
    } finally {
      setAuthLoading(false);
    }
  };

  const login = async (email, password) => {
    setAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);

      const staffId = await findStaffIdForUser(data.user);

      const user = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.email,
        permission: "Staff",
        token: data.session.access_token,
        offline: false,
        staff_id: staffId ?? null,
      };

      setCurrentUser(user);
      localStorage.setItem("currentUser", JSON.stringify(user));
      localStorage.removeItem("offlineUser");
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

/* ----------------------- helpers ----------------------- */
/**
 * Find staff.id for an authenticated user WITHOUT causing 400s.
 * 1) Try staff.email == authUser.email (safe)
 * 2) Optionally try staff.uid == authUser.id *only* if VITE_STAFF_UID_COLUMN is truthy
 */
async function findStaffIdForUser(authUser) {
  try {
    if (!authUser) return null;

    // 1) by email (safe; column exists)
    if (authUser.email) {
      const byEmail = await supabase
        .from("staff")
        .select("id")
        .eq("email", authUser.email)
        .maybeSingle();
      if (!byEmail.error && byEmail.data?.id) return byEmail.data.id;
    }

    // 2) by uid (guarded by env flag to avoid 400s when column doesn't exist)
    const tryUid = String(import.meta.env.VITE_STAFF_UID_COLUMN || "").toLowerCase();
    const uidEnabled = tryUid === "1" || tryUid === "true" || tryUid === "yes";
    if (uidEnabled) {
      try {
        const byUid = await supabase
          .from("staff")
          .select("id")
          .eq("uid", authUser.id)
          .maybeSingle();
        if (!byUid.error && byUid.data?.id) return byUid.data.id;
      } catch {
        // swallow quietly
      }
    }
  } catch {
    // swallow quietly
  }
  return null;
}
