import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { seedStaff } from "../scripts/seedStaffData";
import { seedClients } from "../scripts/seedClients";
import { exportClientsToCSV } from "../scripts/exportClients";
import CsvStaffUploader from "../components/CsvStaffUploader";
import CsvClientUploader from "../components/CsvClientUploader";
import Button from "../components/Button";
import ImportClientsButton from "../components/ImportClientsButton";
import supabase from "../supabaseClient";

export default function Settings() {
  const [seedingStaff, setSeedingStaff] = useState(false);
  const [seedingClients, setSeedingClients] = useState(false);
  const [staffList, setStaffList] = useState([]);

  useEffect(() => {
    const fetchStaff = async () => {
      const { data, error } = await supabase.from("staff").select("*");
      if (error) {
        toast.error("Failed to fetch staff");
        console.error("Supabase error:", error);
        return;
      }
      setStaffList(data);
    };
    fetchStaff();
  }, []);

  const handleSeedStaff = async () => {
    setSeedingStaff(true);
    toast.loading("Seeding staff...");
    try {
      await seedStaff();
      toast.dismiss();
      toast.success("Staff seeded successfully");
    } catch (error) {
      toast.dismiss();
      toast.error("Failed to seed staff.");
      console.error(error);
    } finally {
      setSeedingStaff(false);
    }
  };

  const handleSeedClients = async () => {
    setSeedingClients(true);
    toast.loading("Seeding clients...");
    try {
      await seedClients();
      toast.dismiss();
      toast.success("Clients seeded successfully");
    } catch (error) {
      toast.dismiss();
      toast.error("Failed to seed clients.");
      console.error(error);
    } finally {
      setSeedingClients(false);
    }
  };

  return (
    <div className="p-6 text-black space-y-8">
      <h1 className="text-2xl font-bold text-bronze">Settings</h1>

      {/* Seed Data */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SettingCard
          title="Seed Staff Data"
          description="Adds demo staff members and services. Use for testing only."
          buttonLabel={seedingStaff ? "Seeding..." : "Seed Staff"}
          onClick={handleSeedStaff}
          disabled={seedingStaff}
        />
        <SettingCard
          title="Seed Client Data"
          description="Adds demo clients with notes. Useful for dashboard visuals and testing."
          buttonLabel={seedingClients ? "Seeding..." : "Seed Clients"}
          onClick={handleSeedClients}
          disabled={seedingClients}
        />
      </div>

      {/* CSV Upload */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SettingCard
          title="Import Staff Data"
          description="Upload a CSV to bulk import staff and services."
          content={<CsvStaffUploader />}
        />
        <SettingCard
          title="Import Client Data"
          description="Upload a CSV to bulk import client records and treatment history."
          content={<CsvClientUploader />}
        />
      </div>

      {/* JSON Upload */}
      <div className="bg-gray-100 p-4 rounded shadow-sm space-y-3">
        <h2 className="text-lg font-semibold text-bronze">Import Clients from JSON</h2>
        <p className="text-sm text-gray-600">
          Upload pre-formatted clients directly into Supabase (bypasses CSV).
        </p>
        <ImportClientsButton />
      </div>

      {/* Export Clients */}
      <div className="bg-gray-100 p-4 rounded shadow-sm space-y-3">
        <h2 className="text-lg font-semibold text-bronze">Export Clients</h2>
        <p className="text-sm text-gray-600">
          Download a CSV of all clients in your system.
        </p>
        <Button onClick={exportClientsToCSV}>Export Clients to CSV</Button>
      </div>

      {/* Danger Zone */}
      <div className="bg-gray-100 p-4 rounded shadow-sm space-y-3">
        <h2 className="text-lg font-semibold text-bronze">Danger Zone</h2>
        <p className="text-sm text-gray-600">
          This will permanently delete all client records from the database.
        </p>
        <Button disabled className="bg-gray-400 cursor-not-allowed">
          Delete All Clients (disabled)
        </Button>
      </div>
    </div>
  );
}

// Reusable card layout
function SettingCard({ title, description, buttonLabel, onClick, disabled, content }) {
  return (
    <div className="bg-gray-100 p-4 rounded shadow-sm space-y-3">
      <h2 className="text-lg font-semibold text-bronze">{title}</h2>
      <p className="text-sm text-gray-600">{description}</p>
      {content ? content : (
        <Button onClick={onClick} disabled={disabled}>
          {buttonLabel}
        </Button>
      )}
    </div>
  );
}
