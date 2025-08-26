import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "../../supabaseClient";
import Modal from "../Modal";
import Button from "../Button";
import ClientHistoryFullScreen from "../../pages/ClientHistory";

export default function ClientNotesModal({ isOpen, onClose, clientId }) {
  const [client, setClient] = useState(null);

  // Email editing
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState("");

  // Notes
  const [notes, setNotes] = useState([]);
  const [noteContent, setNoteContent] = useState("");

  // History (bookings)
  const [history, setHistory] = useState([]);
  const [providerMap, setProviderMap] = useState({}); // { staffId: "Name" }

  const [showFullHistory, setShowFullHistory] = useState(false);

  // NEW: current stylist name for note author
  const [staffName, setStaffName] = useState("Stylist");

  // --- Load client when opened ---
  useEffect(() => {
    if (!isOpen || !clientId) return;
    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, email")
        .eq("id", clientId)
        .single();

      if (!active) return;
      if (!error) {
        setClient(data);
        setEmailInput(data?.email || "");
      } else {
        console.error("Fetch client failed:", error.message);
      }
    })();

    return () => {
      active = false;
    };
  }, [isOpen, clientId]);

  // --- Load notes when opened ---
  useEffect(() => {
    if (!isOpen || !clientId) return;
    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from("client_notes")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (!active) return;
      if (!error) setNotes(data || []);
      else console.error("Error fetching notes:", error.message);
    })();

    return () => {
      active = false;
    };
  }, [isOpen, clientId]);

  // --- Load history (bookings) when opened ---
  useEffect(() => {
    if (!isOpen || !clientId) return;
    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, start, title, category, notes, resource_id")
        .eq("client_id", clientId)
        .order("start", { ascending: false });

      if (!active) return;

      if (error) {
        console.error("History fetch failed:", error.message);
        setHistory([]);
        return;
      }

      setHistory(data || []);

      // Build provider name map
      const ids = Array.from(
        new Set((data || []).map((b) => b.resource_id).filter(Boolean))
      );
      if (ids.length) {
        const { data: staffRows, error: staffErr } = await supabase
          .from("staff")
          .select("id, name, permission, email")
          .in("id", ids);

        if (!active) return;

        if (!staffErr) {
          const map = {};
          (staffRows || []).forEach((s) => {
            map[s.id] = s.name || s.email || s.permission || "—";
          });
          setProviderMap(map);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [isOpen, clientId]);

  // NEW: find current stylist's display name (auth -> staff)
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    (async () => {
      try {
        const { data: { user } = {} } = await supabase.auth.getUser();
        if (!user) return;

        // Try match by auth_id first, then by email as fallback
        const { data: rows, error } = await supabase
          .from("staff")
          .select("name, auth_id, email")
          .or(`auth_id.eq.${user.id},email.eq.${user.email}`)
          .limit(1);

        if (!active) return;
        if (!error) {
          const row = rows?.[0];
          if (row?.name) setStaffName(row.name);
          else if (user.user_metadata?.name) setStaffName(user.user_metadata.name);
          else if (user.email) setStaffName(user.email.split("@")[0]);
        }
      } catch (e) {
        console.warn("Could not resolve staff name:", e.message);
      }
    })();
    return () => {
      active = false;
    };
  }, [isOpen]);

  // --- Add note (now stores stylist's name) ---
  const handleAddNote = async () => {
    const text = noteContent.trim();
    if (!text) return;

    const author = staffName || "Stylist";

    const { error } = await supabase.from("client_notes").insert([
      {
        client_id: clientId,
        note_content: text,
        created_by: author, // <-- stylist name stored
      },
    ]);

    if (!error) {
      setNoteContent("");
      const { data } = await supabase
        .from("client_notes")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      setNotes(data || []);
    } else {
      console.error("Add note failed:", error.message);
    }
  };

  // --- Email validation ---
  const isValidEmail = (s) =>
    !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
  const emailIsInvalid = !!emailInput && !isValidEmail(emailInput);

  const handleSaveEmail = async () => {
    const val = (emailInput || "").trim();
    setEmailError("");
    if (!isValidEmail(val)) {
      setEmailError("Enter a valid email address (e.g. alex@example.com)");
      return;
    }

    try {
      setSavingEmail(true);
      const { data, error } = await supabase
        .from("clients")
        .update({ email: val || null })
        .eq("id", clientId)
        .select("id, first_name, last_name, email")
        .single();

      if (error) throw error;
      setClient(data);
      setIsEditingEmail(false);
    } catch (e) {
      console.error("Email update failed:", e.message);
      setEmailError(e.message || "Failed to save");
    } finally {
      setSavingEmail(false);
    }
  };

  const fullName = useMemo(() => {
    if (!client) return "Client details";
    return `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim() || "Client details";
  }, [client]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Client Details" className="w-full max-w-[640px]">
      <div className="space-y-4 text-gray-800">
        {/* Header name */}
        <h3 className="text-lg font-semibold">{fullName}</h3>

        {/* EMAIL */}
        <div>
          <p className="text-sm font-semibold mb-1">Email</p>

          {!isEditingEmail ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="flex-1">
                {client?.email || <span className="text-gray-500">No email</span>}
              </span>
              <button className="text-blue-600 underline" onClick={() => setIsEditingEmail(true)}>
                Edit
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  className={`flex-1 border rounded px-2 py-1 text-sm ${
                    emailIsInvalid ? "border-red-500" : ""
                  }`}
                  placeholder="name@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  aria-invalid={emailIsInvalid}
                />
                <Button
                  onClick={handleSaveEmail}
                  disabled={savingEmail || emailIsInvalid}
                  className="text-sm"
                  title={emailIsInvalid ? "Enter a valid email" : undefined}
                >
                  {savingEmail ? "Saving..." : "Save"}
                </Button>
                <Button
                  onClick={() => {
                    setIsEditingEmail(false);
                    setEmailInput(client?.email || "");
                    setEmailError("");
                  }}
                  className="text-sm"
                >
                  Cancel
                </Button>
              </div>

              {(emailError || emailIsInvalid) && (
                <p className="text-xs text-red-600">
                  {emailError || "Enter a valid email address (e.g. alex@example.com)"}
                </p>
              )}
            </div>
          )}
        </div>

        {/* HISTORY TABLE */}
        <div>
          <p className="text-sm font-semibold mb-2">Service History</p>

          {history.length === 0 ? (
            <p className="text-sm text-gray-500">No history for this client yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-2 font-semibold">Date</th>
                    <th className="text-left py-2 pr-2 font-semibold">Service provider</th>
                    <th className="text-left py-2 pr-2 font-semibold">Service</th>
                    <th className="text-left py-2 pr-0 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => {
                    const dateStr = isNaN(new Date(h.start))
                      ? "—"
                      : format(new Date(h.start), "dd MMM yyyy");
                    const provider = providerMap[h.resource_id] || "—";
                    const service =
                      (h.category ? `${h.category}: ` : "") + (h.title || "");
                    return (
                      <tr key={h.id} className="border-b align-top">
                        <td className="py-2 pr-2 whitespace-nowrap">{dateStr}</td>
                        <td className="py-2 pr-2 whitespace-nowrap">{provider}</td>
                        <td className="py-2 pr-2">{service || "—"}</td>
                        <td className="py-2 pr-0">{h.notes || <span className="text-gray-500">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* NOTES (freeform) */}
        <div className="flex gap-2">
          <input
            className="border flex-1 px-2 py-1 rounded"
            placeholder="Enter note..."
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
          />
          <Button onClick={handleAddNote}>Add Note</Button>
        </div>

        <div className="space-y-2 max-h-[300px] overflow-auto">
          {notes.map((note) => (
            <div key={note.id} className="border rounded p-2 text-sm">
              <div>{note.note_content}</div>
              <div className="text-xs text-gray-500">
                {new Date(note.created_at).toLocaleString()} by{" "}
                {note.created_by || "Unknown"}
              </div>
            </div>
          ))}
          {notes.length === 0 && (
            <div className="text-sm text-gray-500">No notes for this client yet.</div>
          )}
        </div>

        <Button
          onClick={() => setShowFullHistory(true)}
          className="bg-bronze text-white text-sm px-3 py-1 rounded"
        >
          View Full History
        </Button>

        {showFullHistory && (
          <ClientHistoryFullScreen
            clientId={clientId}
            isOpen={showFullHistory}
            onClose={() => setShowFullHistory(false)}
          />
        )}
      </div>
    </Modal>
  );
}
