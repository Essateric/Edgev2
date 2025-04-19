import { collection, addDoc } from "firebase/firestore";
import { db } from "../firebase";

// List of chemical categories that must be retained
const CHEMICAL_CATEGORIES = ["Highlights", "Tints", "Treatments"];

/**
 * Save retained booking to Firestore if it's in a chemical category
 */
export default async function SaveRetainedBooking({ clientId, clientName, stylistId, stylistName, service, start, end }) {
  if (!CHEMICAL_CATEGORIES.includes(service.category)) return;

  const retainedData = {
    clientId,
    clientName,
    stylistId,
    stylistName,
    serviceName: service.name,
    category: service.category,
    price: service.basePrice,
    duration: service.baseDuration,
    start,
    end,
    createdAt: new Date().toISOString(),
  };

  await addDoc(collection(db, "retainedBookings"), retainedData);
}
