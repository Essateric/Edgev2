import { useState } from "react";
import Button from "./Button";
import toast from "react-hot-toast";

export default function ImportClientsButton({ onImport }) {
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/json") {
      setSelectedFile(file);
    } else {
      toast.error("Please upload a valid JSON file");
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast.error("Please select a JSON file first");
      return;
    }

    setLoading(true);
    toast.loading("Importing clients...");

    try {
      const text = await selectedFile.text();
      const parsedData = JSON.parse(text);

      if (typeof onImport === "function") {
        await onImport(parsedData); // Call passed function to upload to Supabase
      }

      toast.dismiss();
      toast.success("Clients imported successfully");
    } catch (err) {
      console.error(err);
      toast.dismiss();
      toast.error("Failed to import clients");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 space-y-2">
      <input
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="block text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-bronze file:text-white hover:file:bg-[#b36c2c]"
      />
      <Button onClick={handleImport} disabled={loading || !selectedFile}>
        {loading ? "Importing..." : "Import Clients"}
      </Button>
    </div>
  );
}
