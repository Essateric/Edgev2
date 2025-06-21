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
  // This keeps Supabase auth state in sync with your React state!
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    setCurrentUser(session?.user ?? null);
    // You can store in localStorage if you want too!
  });
  return () => subscription.unsubscribe();
}, []);


  // 2. Email/password login
  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    setCurrentUser(data.user);
    localStorage.removeItem("user"); // Remove PIN user if present
  };

  // 3. PIN login (against staff table)
  const loginWithPin = async (pin) => {
    const { data: staffList, error } = await supabase.from("staff").select("*");
    if (error || !staffList) throw new Error("Could not fetch staff");

    let matchedUser = null;
    for (const staff of staffList) {
      const isMatch = await bcrypt.compare(pin, staff.pin_hash);
      if (isMatch) {
        matchedUser = staff;
        break;
      }
    }
    if (!matchedUser) throw new Error("Invalid PIN");
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
