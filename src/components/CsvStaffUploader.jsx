import { useState } from "react";
import Papa from "papaparse";
import { collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import toast from "react-hot-toast";

export default function CsvUploader() {
  const [loading, setLoading] = useState(false);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a valid .csv file");
      return;
    }

    setLoading(true);
    toast.loading("Uploading staff data...");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async function (results) {
        const groupedStaff = {};
        let addedCount = 0;

        try {
          results.data.forEach((row) => {
            if (!row.name || !row.email || !row.service_name) return;

            const email = row.email.trim();
            if (!groupedStaff[email]) {
              groupedStaff[email] = {
                name: row.name.trim(),
                email,
                hours: row.hours?.trim() || "",
                services: [],
              };
            }

            groupedStaff[email].services.push({
              category: row.service_category || "General",
              name: row.service_name,
              price: Number(row.price) || 0,
              duration: Number(row.duration) || 0,
            });
          });

          for (const staff of Object.values(groupedStaff)) {
            const staffRef = collection(db, "staff");
            const exists = await getDocs(query(staffRef, where("email", "==", staff.email)));
            if (exists.empty) {
              await addDoc(staffRef, staff);
              addedCount++;
            }
          }

          toast.dismiss();
          toast.success(`✅ Successfully added ${addedCount} staff`);
        } catch (err) {
          console.error(err);
          toast.dismiss();
          toast.error("❌ Error uploading staff");
        } finally {
          setLoading(false);
        }
      },
      error: (error) => {
        console.error("Parse error:", error);
        toast.dismiss();
        toast.error("❌ Failed to read the CSV file");
        setLoading(false);
      },
    });
  };

  return (
    <div className="mt-4 space-y-2">
      <label className="block font-medium">Upload Staff CSV</label>
      <input
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        className="border rounded px-3 py-2"
        disabled={loading}
      />
       <a
        href="/templates/staff-template.csv"
        download
        className="text-bronze text-sm hover:underline block mt-2"
      >
         Download Staff CSV Template
      </a>
    </div>

    
  );
}
