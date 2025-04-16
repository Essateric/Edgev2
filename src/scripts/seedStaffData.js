import { collection, addDoc } from "firebase/firestore";
import { db } from "../firebase";

const staffSeedData = [
  {
    name: "Martin",
    email: "martin@example.com",
    hours: "9am - 6pm",
    services: [
      { category: "Cut and Finish", name: "Cut and Blow Dry", price: 25, duration: 30 },
      { category: "Cut and Finish", name: "Dry Cut", price: 20, duration: 30 },
      { category: "Cut and Finish", name: "Fringe-trim", price: 0, duration: 5 },
      { category: "Gents", name: "Dry Cut", price: 15, duration: 15 },
      { category: "Tints", name: "Scalp Bleach", price: 0, duration: 0 },
      // Add more as needed
    ],
  },
  {
    name: "Annalise",
    email: "annalise@example.com",
    hours: "10am - 5pm",
    services: [
      { category: "Cut and Finish", name: "Cut and Blow Dry", price: 20, duration: 45 },
      { category: "Gents", name: "Wet Cut", price: 15, duration: 30 },
    ],
  },
  {
    name: "Daisy",
    email: "daisy@example.com",
    hours: "9am - 4pm",
    services: [
      { category: "Cut and Finish", name: "Dry Cut", price: 15, duration: 45 },
      { category: "Gents", name: "Cut and Blow Dry", price: 20, duration: 40 },
    ],
  },
];

export async function seedStaff() {
  for (const staff of staffSeedData) {
    try {
      await addDoc(collection(db, "staff"), staff);
      console.log(`✅ Added ${staff.name}`);
    } catch (err) {
      console.error(`❌ Failed to add ${staff.name}:`, err);
    }
  }
}
