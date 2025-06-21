import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import bcrypt from "bcryptjs";

// Create the context
const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // 1. On mount, sync Supabase session
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // 2. Email/password login
  const login = async (email, password) => {
    setAuthLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthLoading(false);
    if (error) throw new Error(error.message);
    setCurrentUser(data.user);
    localStorage.removeItem("user"); // Remove PIN user if present
  };

  // 3. PIN login (checks staff table, then logs into Supabase Auth)
  const loginWithPin = async (pin) => {
    setAuthLoading(true);
    const { data: staffList, error } = await supabase.from("staff").select("*");
    if (error || !staffList) {
      setAuthLoading(false);
      throw new Error("Could not fetch staff");
    }

    let matchedUser = null;
    for (const staff of staffList) {
      const isMatch = await bcrypt.compare(pin, staff.pin_hash);
      if (isMatch) {
        matchedUser = staff;
        break;
      }
    }
    if (!matchedUser) {
      setAuthLoading(false);
      throw new Error("Invalid PIN");
    }

    // KEY PART: log into Supabase Auth using staff's email/password
    if (!matchedUser.email || !matchedUser.password) {
      setAuthLoading(false);
      alert("Staff record is missing email or password for Auth login. Please update in database.");
      throw new Error("Staff record missing email/password.");
    }

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: matchedUser.email,
      password: matchedUser.password,
    });

    setAuthLoading(false);

    if (authError) {
      throw new Error(authError.message);
    }

    // Store in React state and localStorage for convenience
    setCurrentUser(matchedUser);
    localStorage.setItem("user", JSON.stringify(matchedUser));
  };

  // 4. Logout (works for both email and PIN user)
  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    localStorage.removeItem("user");
  };

  return (
    <AuthContext.Provider value={{ currentUser, login, loginWithPin, logout, authLoading }}>
      {children}
    </AuthContext.Provider>
  );
};
