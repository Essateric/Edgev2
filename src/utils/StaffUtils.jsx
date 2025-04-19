// utils/staffUtils.js
import {
    collection,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    setDoc,
  } from "firebase/firestore";
  import { db } from "../firebase";
  
  // Fetch staff data
  export async function fetchStaffData(setStaff) {
    const staffSnap = await getDocs(collection(db, "staff"));
    const staffList = staffSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    setStaff(staffList);
  }
  
  // Fetch all services
  export async function fetchServiceData(setServicesList) {
    const servicesSnap = await getDocs(collection(db, "services"));
    const services = servicesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    setServicesList(services);
  }
  
  // Save staff and sync stylist record
  export async function saveStaff(form, editingId) {
    const staffRef = collection(db, "staff");
    const stylistRef = collection(db, "stylist");
  
    const staffData = {
      name: form.name,
      email: form.email,
      weeklyHours: form.weeklyHours,
      services: form.services,
    };
  
    let staffDocRef;
    if (editingId) {
      staffDocRef = doc(db, "staff", editingId);
      await updateDoc(staffDocRef, staffData);
    } else {
      staffDocRef = await addDoc(staffRef, staffData);
    }
  
    // Sync stylist record with services
    const stylistServices = {};
    form.services.forEach((s) => {
      stylistServices[s.name] = {
        price: s.price,
        duration: s.duration?.hours * 60 + s.duration?.minutes || 0,
      };
    });
  
    await setDoc(doc(stylistRef, staffDocRef.id), {
      title: form.name,
      services: stylistServices,
    });
  }
  
  // Delete staff and stylist records
  export async function deleteStaff(id) {
    await deleteDoc(doc(db, "staff", id));
    await deleteDoc(doc(db, "stylist", id));
  }
  