import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../supabaseClient.js";
import bcrypt from "bcryptjs";

// ========== Helpers for PIN Caching ==========
import { getStaffPins, cacheStaffPins } from "../../utils/PinCache.jsx";

// Context creation
const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ========== 1. On mount: Restore session (Supabase & Offline) ==========
  useEffect(() => {
    // Check Supabase session first (for online users)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCurrentUser({
          ...session.user,
          offline: false, // User is authenticated online
        });
      } else {
        // Try restoring from local offline login
        const offlineUser = localStorage.getItem("offlineUser");
        if (offlineUser) {
          setCurrentUser(JSON.parse(offlineUser));
        } else {
          setCurrentUser(null);
        }
      }
      setAuthLoading(false);
    });

    // On first mount, cache latest PINs from Supabase (if online)
    if (navigator.onLine) {
      cacheStaffPinsFromSupabase();
    }

    return () => subscription.unsubscribe();
  }, []);

  // ========== 2. Helper: Cache staff PINs locally (for offline logins) ==========
  const cacheStaffPinsFromSupabase = async () => {
    const { data: staffList } = await supabase
      .from("staff")
      .select("id, name, email, role, pin");
    if (staffList) cacheStaffPins(staffList);
  };

  // ========== 3. PIN Login ==========
  const loginWithPin = async (pin) => {
    setAuthLoading(true);

    if (!navigator.onLine) {
      // ----------- OFFLINE MODE -----------
      // Get locally cached PINs (not hashed, so do NOT expose in production build)
      const staffPins = await getStaffPins();
      const user = staffPins.find(staff => staff.pin === pin);

      if (user) {
        // Store user state in both React and localStorage
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

    // ----------- ONLINE MODE -----------
    // 1. Fetch staff from Supabase
    const { data: staffList, error } = await supabase
      .from("staff")
      .select("id, name, email, role, pin_hash");
    if (error || !staffList) {
      setAuthLoading(false);
      throw new Error("Could not fetch staff");
    }

    // 2. Find staff where bcrypt.compareSync(pin, pin_hash)
    const matchedUser = staffList.find(staff =>
      staff.pin_hash && bcrypt.compareSync(pin, staff.pin_hash)
    );
    if (!matchedUser) {
      setAuthLoading(false);
      throw new Error("Invalid PIN");
    }

    // 3. Call your Supabase Edge Function to get a custom token
    //    (Replace with your real function endpoint and logic)
    let token;
    try {
      const res = await fetch("/.netlify/functions/generate-supabase-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: matchedUser.id }),
      });
      if (!res.ok) throw new Error("Token fetch failed");
      const json = await res.json();
      token = json.token;
    } catch (err) {
      setAuthLoading(false);
      throw new Error("Failed to get token: " + (err.message || err));
    }

    // 4. Login with Supabase using the token
    const { error: authError } = await supabase.auth.signInWithIdToken({ token });
    if (authError) {
      setAuthLoading(false);
      throw new Error(authError.message);
    }

    // 5. Store user state (clear offline flag)
    setCurrentUser({ ...matchedUser, offline: false });
    localStorage.removeItem("offlineUser");
    setAuthLoading(false);

    // 6. After successful login, refresh PIN cache if online
    cacheStaffPinsFromSupabase();
  };

  // ========== 4. Email Login (optional, fallback) ==========
  const login = async (email, password) => {
    setAuthLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthLoading(false);
    if (error) throw new Error(error.message);
    setCurrentUser({ ...data.user, offline: false });
    localStorage.removeItem("offlineUser");
  };

  // ========== 5. Logout ==========
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
