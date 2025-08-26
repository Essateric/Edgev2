import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "../../supabaseClient";
import Modal from "../Modal";
import Button from "../Button";
import ClientHistoryFullScreen from "../../pages/ClientHistory";

/**
 * Props:
 * - isOpen, onClose
 * - clientId (required)
 * - bookingId (optional, the specific booking row this modal is opened from)
 */
export default function ClientNotesModal({ isOpen, onClose, clientId, bookingId = null }) {
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
  const [bookingMeta, setBookingMeta] = useState({});  // { bookingId: { when, title } }

  const [showFullHistory, setShowFullHistory] = useState(false);

  // Current stylist display name (author of notes)
  const [staffName, setStaffName] = useState("Stylist");

  // -------- helpers --------
  const isValidEmail = (s) =>
    !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());

  // Resolve current stylist name from auth -> staff row (or fallbacks)
  const resolveCurrentStaffName = async () => {
    try {
      const { data: { user } = {} } = await supabase.auth.getUser();
      if (!user) return staffName || "Stylist";

      // Try by auth_id first
      const byAuth = await supabase
        .from("staff")
        .select("name,email,permission")
        .eq("auth_id", user.id)
        .maybeSingle();

      if (byAuth.data) {
        const r = byAuth.data;
        return r.name || r.email || r.permission || (user.email ? user.email.split("@")[0] : "Stylist");
      }

      // Fallback by email
      const byEmail = await supabase
        .from("staff")
        .select("name,email,permission")
        .eq("email", user.email)
        .maybeSingle();

      if (byEmail.data) {
        const r = byEmail.data;
        return r.name || r.email || r.permission || (user.email ? user.email.split("@")[0] : "Stylist");
      }

      // Last resorts from auth
      return user.user_metadata?.name || (user.email ? user.email.split("@")[0] : "Stylist");
    } catch {
      return staffName || "Stylist";
    }
  };

  const loadNotes = async () => {
    const { data, error } = await supabase
      .from("client_notes")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (!error) setNotes(data || []);
    else console.error("Error fetching notes:", error.message);
  };

  // -------- data loads --------
  // Client + stylist name on open
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

    (async () => {
      const name = await resolveCurrentStaffName();
      if (active && name) setStaffName(name);
    })();

    return () => { active = false; };
  }, [isOpen, clientId]);

  // Notes on open
  useEffect(() => { if (isOpen && clientId) loadNotes(); }, [isOpen, clientId]);

  // History (NO 'notes' column here)
// --- Load history (bookings) when opened ---
useEffect(() => {
  if (!isOpen || !clientId) return;
  let active = true;

  (async () => {
    const { data, error } = await supabase
      .from("bookings")
      .select("id, start, title, category, resource_id")
      .eq("client_id", clientId)
      .order("start", { ascending: false })
      .order("id", { ascending: true }); // stable ordering helps with debugging

    if (!active) return;

    if (error) {
      console.error("History fetch failed:", error.message);
      setHistory([]);
      return;
    }

    const rows = data || [];

    // DEBUG: see what came back from the server
    console.log("🔎 bookings fetched:", {
      rawCount: rows.length,
      ids: rows.map(r => r.id)
    });

    // ✅ De-duplicate by composite "natural key"
    const seen = new Set();
    const unique = [];
    for (const b of rows) {
      const k = [
        b.resource_id || "",
        // normalize start so two Date objects stringify the same
        new Date(b.start).toISOString(),
        b.title || ""
      ].join("|");
      if (!seen.has(k)) {
        seen.add(k);
        unique.push(b);
      }
    }

    // DEBUG: show unique after de-dupe
    console.log("✅ unique bookings:", {
      uniqueCount: unique.length,
      ids: unique.map(r => r.id)
    });

    setHistory(unique);

    // Build provider name map (unchanged)
    const ids = Array.from(new Set(unique.map((b) => b.resource_id).filter(Boolean)));
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

    // Build booking metadata for note link (unchanged)
    const meta = {};
    unique.forEach((b) => {
      const when = isNaN(new Date(b.start))
        ? "—"
        : format(new Date(b.start), "dd MMM yyyy");
      meta[b.id] = {
        when,
        title: (b.category ? `${b.category}: ` : "") + (b.title || ""),
      };
    });
    setBookingMeta(meta);
  })();

  return () => {
    active = false; // prevent second setState if effect re-runs
  };
}, [isOpen, clientId, supabase]);

  // -------- actions --------
  const handleAddNote = async () => {
    const text = noteContent.trim();
    if (!text) return;

    // Re-resolve author at insert time (most reliable)
    const author = await resolveCurrentStaffName();
    console.log("🖊️ Note author resolved:", author, "bookingId:", bookingId);

    const payload = {
      client_id: clientId,
      note_content: text,
      created_by: author || "Stylist",
      booking_id: bookingId || null,       // link to this booking if given
    };

    const { error } = await supabase.from("client_notes").insert([payload]);
    if (error) {
      console.error("Add note failed:", error.message);
      return;
    }

    setNoteContent("");
    await loadNotes();
  };

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

  // -------- render --------
  const fullName = useMemo(() => {
    if (!client) return "Client details";
    return `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim() || "Client details";
  }, [client]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Client Details" className="w-full max-w-[640px]">
      <div className="space-y-4 text-gray-800">
        <h3 className="text-lg font-semibold">{fullName}</h3>

        {/* EMAIL */}
        <div>
          <p className="text-sm font-semibold mb-1">Email</p>

          {!isEditingEmail ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="flex-1">
                {client?.email || <span className="text-gray-500">No email</span>}
              </span>
              <button className="text-blue-600 underline" onClick={() => setIsEditingEmail(true)}>Edit</button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  className={`flex-1 border rounded px-2 py-1 text-sm ${emailIsInvalid ? "border-red-500" : ""}`}
                  placeholder="name@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  aria-invalid={emailIsInvalid}
                />
                <Button onClick={handleSaveEmail} disabled={savingEmail || emailIsInvalid} className="text-sm">
                  {savingEmail ? "Saving..." : "Save"}
                </Button>
                <Button
                  onClick={() => { setIsEditingEmail(false); setEmailInput(client?.email || ""); setEmailError(""); }}
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

{/* HISTORY TABLE (no Notes column) */}
<div>
  <p className="text-sm font-semibold mb-2">Service History</p>

  {history.length === 0 ? (
    <p className="text-sm text-gray-500">No history for this client yet.</p>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-2 font-semibold w-[170px]">
              Date & time
            </th>
            <th className="text-left py-2 pr-2 font-semibold w-[140px]">
              Service provider
            </th>
            <th className="text-left py-2 pr-0 font-semibold">
              Service
            </th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => {
            const d = new Date(h.start);
            const dateTime = isNaN(d)
              ? "—"
              : `${format(d, "dd MMM yyyy")} · ${format(d, "HH:mm")}`;

            const provider = providerMap[h.resource_id] || "—";
            const service =
              (h.category ? `${h.category}: ` : "") + (h.title || "");

            return (
              <tr key={h.id} className="border-b align-top">
                <td className="py-2 pr-2 whitespace-nowrap">{dateTime}</td>
                <td className="py-2 pr-2 whitespace-nowrap">{provider}</td>
                <td className="py-2 pr-0">{service || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  )}
</div>

        {/* ADD NOTE */}
        <div className="flex gap-2">
          <input
            className="border flex-1 px-2 py-1 rounded bg-white text-gray-900 placeholder-gray-500"
            placeholder="Enter note..."
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
          />
          <Button onClick={handleAddNote}>Add Note</Button>
        </div>

        {/* NOTES LIST */}
        <div className="space-y-2 max-h-[300px] overflow-auto bg-white p-1 rounded">
          {notes.map((note) => {
            const meta = note.booking_id ? bookingMeta[note.booking_id] : null;
            return (
              <div key={note.id} className="border rounded p-2 text-sm bg-white text-gray-900">
                <div>{note.note_content}</div>
                <div className="text-xs text-gray-500">
                  {new Date(note.created_at).toLocaleString()} by {note.created_by || "Unknown"}
                  {meta ? <> · <span className="italic">for {meta.title} on {meta.when}</span></> : null}
                </div>
              </div>
            );
          })}
          {notes.length === 0 && (
            <div className="text-sm text-gray-500 bg-white border rounded p-2">No notes for this client yet.</div>
          )}
        </div>

        <Button onClick={() => setShowFullHistory(true)} className="bg-bronze text-white text-sm px-3 py-1 rounded">
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
