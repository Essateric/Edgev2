import Papa from "papaparse";

export async function exportClientsToCSV() {
  const ref = collection(db, "clients");
  const snapshot = await getDocs(ref);

  const clients = snapshot.docs.map((doc) => doc.data());

  const csv = Papa.unparse(clients);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "clients_export.csv";
  a.click();
  URL.revokeObjectURL(url);
}
