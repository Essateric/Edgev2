import React from "react";
import { seedStaff } from "../scripts/seedStaffData"; // Adjust path if needed

export default function SeedButton() {
  return (
    <div className="mb-4">
      <button
        onClick={seedStaff}
        className="bg-bronze text-white px-4 py-2 rounded shadow hover:bg-bronze/90"
      >
        🚀 Seed Staff Data
      </button>
    </div>
  );
}
