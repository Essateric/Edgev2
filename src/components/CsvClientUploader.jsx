import { useState } from "react";
import Papa from "papaparse";
import toast from "react-hot-toast";
import Button from "./Button";
import { seedClients } from "../scripts/seedClients";

export default function CsvClientUploader() {
  const [clients, setClients] = useState([]);
  const [preview, setPreview] = useState([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !file.name.endsWith(".csv")) {
      toast.error("Please upload a valid CSV file.");
      return;
    }

    setFileName(file.name);
    toast.loading("Parsing CSV...");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        toast.dismiss();
        const parsed = results.data.map((row) => ({
          firstName: row.firstName?.trim() || "",
          lastName: row.lastName?.trim() || "",
          email: row.email?.trim() || "",
          mobile: row.mobile?.trim() || "",
          notes: row.notes?.trim() || ""
        })).filter(c => c.firstName && c.lastName && c.mobile);

        if (parsed.length === 0) {
          toast.error("No valid rows found.");
          return;
        }

        setClients(parsed);
        setPreview(parsed.slice(0, 3));
        toast.success("CSV parsed successfully");
      },
      error: () => {
        toast.dismiss();
        toast.error("Failed to parse CSV file");
      }
    });
  };

  const handleImport = async () => {
    if (!clients.length) return;
    setLoading(true);
    toast.loading("Uploading clients...");

    try {
      await seedClients(clients, 100, 1500, (p) => setProgress(p));
      toast.dismiss();
      toast.success("Clients imported successfully");
      setClients([]);
      setPreview([]);
      setFileName("");
      setProgress(null);
    } catch (err) {
      console.error(err);
      toast.dismiss();
      toast.error("Failed to upload clients");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-black mb-1">
          Upload Client CSV
        </label>
        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          disabled={loading}
          className="border border-chrome rounded px-3 py-2 text-sm w-full"
        />
        {fileName && (
          <p className="text-xs text-chrome mt-1">📄 {fileName}</p>
        )}
      </div>

      {preview.length > 0 && (
        <div className="bg-chrome/5 border border-chrome p-4 rounded">
          <h4 className="text-bronze font-semibold mb-2">Preview (first 3 clients)</h4>
          <ul className="list-disc pl-5 text-sm text-black">
            {preview.map((c, i) => (
              <li key={i}>{c.firstName} {c.lastName} – {c.mobile}</li>
            ))}
          </ul>
          <Button
            className="mt-3"
            onClick={handleImport}
            disabled={loading}
          >
            {loading ? "Importing..." : `Import ${clients.length} Clients`}
          </Button>
        </div>
      )}

      {progress && (
        <p className="text-xs text-chrome">
          Uploading {progress.completed} of {progress.total} clients...
        </p>
      )}
    </div>
  );
}
