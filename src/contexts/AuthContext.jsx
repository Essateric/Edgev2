import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../supabaseClient"; // Make sure this points to your Supabase client file

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
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('pin', pin)
      .single(); // Only expect one match

    if (error || !data) {
      throw new Error('Invalid PIN');
    }

    setCurrentUser(data);
    localStorage.setItem('user', JSON.stringify(data)); // Optional
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
