// src/firebase.js

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyDqzE6en-oSfYx1VSwadobG94kFTuyl6GM",
  authDomain: "booking-system-b29e5.firebaseapp.com",
  projectId: "booking-system-b29e5",
  storageBucket: "booking-system-b29e5.appspot.com",  // <-- small typo fix here!
  messagingSenderId: "728577248681",
  appId: "1:728577248681:web:b375827a5efeb7962988b8",
  measurementId: "G-2T8DNG0KLB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Authentication and Firestore
export const auth = getAuth(app);
export const db = getFirestore(app);