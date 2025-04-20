// src/contexts/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { getDocs, collection } from "firebase/firestore";

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  // Email/Password login
  const login = async (email, password) => {
    const userCred = await signInWithEmailAndPassword(auth, email, password);
    setCurrentUser(userCred.user);
    setRole("manager"); // You can extend this logic
  };

  // PIN Login
  const loginWithPin = async (pin) => {
    const snapshot = await getDocs(collection(db, "staff"));
    const match = snapshot.docs.find((doc) => doc.data().pin === pin);
    if (!match) throw new Error("Invalid PIN");

    const user = { ...match.data(), id: match.id };
    localStorage.setItem("pinUser", JSON.stringify(user));
    setCurrentUser(user);
    setRole(user.role || "staff");
  };

  const logout = () => {
    localStorage.removeItem("pinUser");
    setCurrentUser(null);
    setRole(null);
    return signOut(auth).catch(() => {}); // No error if signed in with PIN
  };

  useEffect(() => {
    const localUser = localStorage.getItem("pinUser");
    if (localUser) {
      const parsed = JSON.parse(localUser);
      setCurrentUser(parsed);
      setRole(parsed.role || "staff");
      setLoading(false);
    } else {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          setCurrentUser(user);
          setRole("manager");
        } else {
          setCurrentUser(null);
          setRole(null);
        }
        setLoading(false);
      });
      return unsubscribe;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        role,
        login,
        loginWithPin,
        logout,
        isManager: role === "manager",
        isStaff: role === "staff",
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
}
