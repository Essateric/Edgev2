import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase";

export async function resetClients() {
  const ref = collection(db, "clients");
  const snapshot = await getDocs(ref);

  const deletions = [];
  snapshot.forEach((docSnap) => {
    deletions.push(deleteDoc(doc(db, "clients", docSnap.id)));
  });

  await Promise.all(deletions);
  console.log(`Deleted ${deletions.length} clients`);
}