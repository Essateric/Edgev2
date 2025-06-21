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
    throw new Error('Could not fetch staff');
  }

  // Try to match entered PIN to a hashed one
  const matchingUser = await Promise.any(
    staffList.map(async (staff) => {
      const isMatch = await bcrypt.compare(pin, staff.pin_hash);
      return isMatch ? staff : Promise.reject();
    })
  ).catch(() => null);

  if (!matchingUser) {
    throw new Error('Invalid PIN');
  }

  setCurrentUser(matchingUser);
  localStorage.setItem('user', JSON.stringify(matchingUser));
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
