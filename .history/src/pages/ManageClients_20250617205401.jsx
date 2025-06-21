import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Button from "../components/Button";
import Card from "../components/Card";

export default function ManageClients() {
  const [clients, setClients] = useState([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mobile, setMobile] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalClients, setTotalClients] = useState(0);

  // Fetch clients from Supabase with pagination
  useEffect(() => {
    const fetchClients = async () => {
      const from = (currentPage - 1) * rowsPerPage;
      const to = from + rowsPerPage - 1;

      const { data, error, count } = await supabase
        .from("clients")
        .select("*", { count: "exact" })
        .range(from, to);

      if (error) {
        console.error("Failed to fetch clients:", error.message);
      } else {
        setClients(data);
        setTotalClients(count);
      }
    };

    fetchClients();
  }, [currentPage, rowsPerPage]);

  const handleAddClient = async () => {
    if (!firstName.trim() || !mobile.trim()) return;

    const { error } = await supabase.from("clients").insert([
      {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        mobile: mobile.trim(),
      },
    ]);

    if (!error) {
      setFirstName("");
      setLastName("");
      setMobile("");
      setCurrentPage(1); // Go back to first page after adding
    } else {
      console.error("Failed to add client:", error.message);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-gray-700 mb-4">Manage Clients</h1>

      {/* Add New Client */}
      <Card className="mb-4">
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Add New Client</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <input
            type="text"
            placeholder="First Name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="border rounded p-2 flex-1 min-w-[150px] text-gray-700"
          />
          <input
            type="text"
            placeholder="Last Name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="border rounded p-2 flex-1 min-w-[150px] text-gray-700"
          />
          <input
            type="text"
            placeholder="Phone Number"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            className="border rounded p-2 flex-1 min-w-[150px] text-gray-700"
          />
          <Button onClick={handleAddClient}>Add</Button>
        </div>
      </Card>

      {/* Client Table */}
      <Card className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Current Clients</h2>

        <table className="w-full text-sm border">
          <thead className="bg-bronze text-white">
            <tr>
              <th className="text-left p-2">First Name</th>
              <th className="text-left p-2">Last Name</th>
              <th className="text-left p-2">Phone</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id} className="border-b">
                <td className="p-2">{client.first_name}</td>
                <td className="p-2">{client.last_name}</td>
                <td className="p-2">{client.mobile}</td>
                <td className="p-2">
                  <Button className="bg-bronze text-white">Notes</Button>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan="4" className="text-center p-4 text-gray-500">
                  No clients found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-600">
            Showing {Math.min((currentPage - 1) * rowsPerPage + 1, totalClients)}–
            {Math.min(currentPage * rowsPerPage, totalClients)} of {totalClients}
          </div>
          <div className="flex items-center gap-4">
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="border rounded px-2 py-1"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <Button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3"
            >
              Previous
            </Button>
            <Button
              onClick={() =>
                setCurrentPage((prev) =>
                  prev * rowsPerPage < totalClients ? prev + 1 : prev
                )
              }
              disabled={currentPage * rowsPerPage >= totalClients}
              className="px-3"
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
