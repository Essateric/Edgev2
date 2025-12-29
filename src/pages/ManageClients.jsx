import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import Button from "../components/Button";
import Card from "../components/Card";
import { useAuth } from "../contexts/AuthContext";
import { findOrCreateClientStaff } from "../lib/findOrCreateClientStaff.js";

const COLS = "id,first_name,last_name,mobile,email,notes,created_at";

export default function ManageClients() {
    const { supabaseClient } = useAuth();
  const db = useMemo(() => supabaseClient || supabase, [supabaseClient]);
  const [clients, setClients] = useState([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mobile, setMobile] = useState("");
   const [email, setEmail] = useState("");
     const normalizePhone = (s = "") => String(s).replace(/[^\d]/g, "");

  // search & sort
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("newest"); // 'newest' | 'oldest' | 'last' | 'first'

  // pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalClients, setTotalClients] = useState(0);

  // admin gate + UX
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
   const [infoMsg, setInfoMsg] = useState("");

  const from = (currentPage - 1) * rowsPerPage;
  const to = from + rowsPerPage - 1;
  const debouncedSearch = useDebouncedValue(search, 300);

  // figure out if current user is an admin (based on staff.permission)
useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await db.auth.getUser();
        const email = data?.user?.email;
        if (!email) {
          if (mounted) setIsAdmin(false);
          return;
        }
        const { data: staffRow, error } = await db
          .from("staff")
          .select("permission")
          .eq("email", email)
          .maybeSingle();

        const ok =
          !error && staffRow && ["admin", "owner", "manager"].includes(staffRow.permission);
        if (mounted) setIsAdmin(!!ok);
      } catch {

        if (mounted) setIsAdmin(false);
      }
      })();
    return () => {
      mounted = false;
    };
  }, [db]);




  const fetchClients = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");

    const s = debouncedSearch.trim();
    const digits = s.replace(/[^\d]/g, "");
    const like = `%${s.replace(/[%_]/g, "\\$&")}%`;

    try {
        let q = db.from("clients").select(COLS, { count: "exact" });

      if (s) {
        const ors = [
          `first_name.ilike.${like}`,
          `last_name.ilike.${like}`,
          `email.ilike.${like}`,
          `mobile.ilike.%${s}%`,
        ];
        if (digits && digits !== s) ors.push(`mobile.ilike.%${digits}%`);
        q = q.or(ors.join(","));
      }

      switch (sortKey) {
        case "first":
          q = q
            .order("first_name", { ascending: true, nullsFirst: true })
            .order("last_name", { ascending: true, nullsFirst: true });
          break;
        case "last":
          q = q
            .order("last_name", { ascending: true, nullsFirst: true })
            .order("first_name", { ascending: true, nullsFirst: true });
          break;
        case "oldest":
          q = q.order("created_at", { ascending: true, nullsFirst: true });
          break;
        case "newest":
        default:
          q = q.order("created_at", { ascending: false, nullsFirst: true });
          break;
      }

      const { data, error, count, status } = await q.range(from, to);

      // fallback if created_at is missing and we're trying to sort by it
      if (
        error &&
        /created_at/.test(error.message) &&
        (sortKey === "newest" || sortKey === "oldest")
      ) {
        console.warn(
          "[ManageClients] created_at missing; falling back to id ordering.",
          { status, message: error.message }
        );

 let fb = db
          .from("clients")
          .select("id,first_name,last_name,mobile,email,notes", { count: "exact" });

        fb =
          sortKey === "oldest"
            ? fb.order("id", { ascending: true })
            : fb.order("id", { ascending: false });

        if (s) {
          const ors = [
            `first_name.ilike.${like}`,
            `last_name.ilike.${like}`,
            `email.ilike.${like}`,
            `mobile.ilike.%${s}%`,
          ];
          if (digits && digits !== s) ors.push(`mobile.ilike.%${digits}%`);
          fb = fb.or(ors.join(","));
        }

        const fbRes = await fb.range(from, to);
        if (fbRes.error) throw fbRes.error;

        setClients(fbRes.data ?? []);
        setTotalClients(fbRes.count ?? 0);
        return;
      }

      if (error) throw error;

      setClients(data ?? []);
      setTotalClients(count ?? 0);
    } catch (err) {
      console.error("Failed to fetch clients:", err?.message || err);
      setErrorMsg(err?.message || "Failed to fetch clients");
    } finally {
      setLoading(false);
    }
  }, [db, from, to, debouncedSearch, sortKey]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients, currentPage, rowsPerPage]);

  const handleAddClient = async () => {
    const fn = firstName.trim();
    const ln = lastName.trim();
    const mo = mobile.trim();
   const em = email.trim();

    const normMobile = normalizePhone(mo);
    if (!fn) {
      setErrorMsg("First name is required.");
      return;
    }
    if (!normMobile && !em) {
      setErrorMsg("Provide an email or phone number.");
      return;
    }

    if (!db) {
      setErrorMsg("No Supabase client available.");
      return;
    }
    setLoading(true);

    setErrorMsg("");

     if (!fn || !ln) {
      setErrorMsg("First and last name are required.");
      return;
    }
    if (!em && !mo) {
      setErrorMsg("Enter at least an email or mobile number.");

 const { error } = await db.from("clients").insert([
        {
          first_name: fn,
          last_name: ln || null,
          mobile: mo || null,
          email: em || null,
        },
      ]);

    if (error) {
      console.error("Failed to add client:", error.message);
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

         setLoading(false);
  };

  const handleDeleteClient = async (client) => {
    if (!isAdmin) return;
    const ok = confirm(
      `Delete client "${client.first_name ?? ""} ${client.last_name ?? ""}"? This cannot be undone.`
    );
    if (!ok) return;

    setLoading(true);
    setErrorMsg("");
    try {
     const { error } = await db.from("clients").delete().eq("id", client.id);
      if (error) {
        // typical FK message when bookings exist
        if (/foreign key/i.test(error.message) || /violates/.test(error.message)) {
          setErrorMsg(
            "Cannot delete: this client has related records (e.g. bookings or notes). Consider archiving instead."
          );
        } else {
          setErrorMsg(error.message);
        }
        return;
      }
      await fetchClients();
    } finally {
      setLoading(false);
    }
  };

  const showingFrom =
    totalClients === 0 ? 0 : Math.min(from + 1, totalClients);
  const showingTo =
    totalClients === 0 ? 0 : Math.min(from + clients.length, totalClients);

  return (
    <div className="p-4">
      {/* header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-700">Manage Clients</h1>

        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search name, email, or phone…"
            className="border rounded px-3 py-2 text-gray-700 w-full sm:w-72"
          />

          <select
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value);
              setCurrentPage(1);
            }}
            className="border rounded px-2 py-2 text-gray-700"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="last">Last name (A→Z)</option>
            <option value="first">First name (A→Z)</option>
          </select>

          <div className="flex items-center gap-2">
            {loading && <span className="text-xs text-gray-500">Loading…</span>}
            <Button onClick={fetchClients} className="px-3">
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Add New Client */}
      <Card className="mb-4">
        <h2 className="text-lg font-semibold text-gray-700 mb-2">
          Add New Client
        </h2>
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
           <input
            type="email"
            placeholder="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border rounded p-2 flex-1 min-w-[150px] text-gray-700"
          />
          <Button onClick={handleAddClient}>Add</Button>
        </div>
         {infoMsg && <p className="text-sm text-green-700">{infoMsg}</p>}
        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
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
              <th className="text-left p-2">Email</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id} className="border-b">
                <td className="p-2 text-gray-700">{client.first_name || ""}</td>
                <td className="p-2 text-gray-700">{client.last_name || ""}</td>
                <td className="p-2 text-gray-700">{client.mobile || ""}</td>
                <td className="p-2 text-gray-700">{client.email || ""}</td>
                <td className="p-2 text-gray-700 flex gap-2">
                  <Button className="bg-bronze text-white p-3">Notes</Button>
                  <Button className="bg-bronze text-white p-3">Edit</Button>
                  {isAdmin && (
                    <Button
                      className="bg-red-600 hover:bg-red-700 text-white p-3"
                      onClick={() => handleDeleteClient(client)}
                    >
                      Delete
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {clients.length === 0 && !loading && (
              <tr>
                <td colSpan="5" className="text-center p-4 text-gray-500">
                  No clients found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-600">
            Showing {showingFrom}–{showingTo} of {totalClients}
          </div>
          <div className="flex items-center gap-4">
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="border rounded px-2 py-1 text-gray-700"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <Button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3"
            >
              Previous
            </Button>
            <Button
              onClick={() =>
                setCurrentPage((p) =>
                  p * rowsPerPage < totalClients ? p + 1 : p
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

/** Small debounce hook (no external deps) */
function useDebouncedValue(value, delayMs) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return v;
}
