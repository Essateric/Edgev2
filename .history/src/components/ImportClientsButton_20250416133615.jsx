import { useState } from "react";
import Button from "./Button";
import { seedClients } from "../scripts/seedClients";
import toast from "react-hot-toast";
import clientData from "../data/clients.json"; // make sure this JSON file exists

export default function ImportClientsButton() {
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    setLoading(true);
    toast.loading("Uploading clients...");
    try {
      await seedClients(clientData, 500, 300);
      toast.dismiss();
      toast.success("Clients uploaded successfully");
    } catch (err) {
      console.error(err);
      toast.dismiss();
      toast.error("Failed to upload clients");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4">
      <Button onClick={handleImport} disabled={loading}>
        {loading ? "Importing..." : "Import Clients"}
      </Button>
    </div>
  );
}
