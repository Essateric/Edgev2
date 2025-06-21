import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../supabaseClient"; // Make sure this points to your Supabase client file
import bcrypt from "bcryptjs";

const AuthContext = createContext();

const useAuth = () => useContext(AuthContext);

const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);

  // Email/Password login (using Supabase Auth)
  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message);
    }

    setCurrentUser(data.user);
    localStorage.setItem("user", JSON.stringify(data.user)); // Optional
  };

  // PIN Login (search staff table manually)
const loginWithPin = async (pin) => {
  const { data: staffList, error } = await supabase
    .from('staff')
    .select('*');

  if (error || !staffList) {
    console.error('❌ Could not fetch staff:', error);
    throw new Error('Could not fetch staff');
  }

  let matched = null;

  for (const staff of staffList) {
    const isMatch = await bcrypt.compare(pin, staff.pin_hash);
    console.log(`Checking ${staff.name}: ${isMatch}`);
    if (isMatch) {
      matched = staff;
      break;
    }
  }

  if (!matched) {
    console.error('❌ No matching staff found for PIN');
    throw new Error('Invalid PIN');
  }

  setCurrentUser(matched);
  localStorage.setItem('user', JSON.stringify(matched));
};



  // Logout
  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    localStorage.removeItem('user');
  };

  // Keep user logged in on refresh (Optional improvement)
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        login,
        loginWithPin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export { AuthProvider, useAuth };
