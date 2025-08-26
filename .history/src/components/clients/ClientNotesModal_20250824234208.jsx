import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "../../supabaseClient";
import Modal from "../Modal";
import Button from "../Button";
import ClientHistoryFullScreen from "../../pages/ClientHistory";

// ✅ simple, safe email validator (blank allowed)
const isValidEmail = (s) =>
  !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());

export default function ClientNotesModal({ isOpen, onClose, clientId }) {
  const [client, setClient] = useState(null);
  const [notes, setNotes] = useState([]);
  const [noteContent, setNoteContent] = useState("");

  const [dobInput, setDobInput] = useState("");
  const [isEditingDob, setIsEditingDob] = useState(false);

  const [showFullHistory, setShowFullHistory] = useState(false);

  const [emailInput, setEmailInput] = useState("");
  const [mobileInput, setMobileInput] = useState("");
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    if (!clientId) return;
    const fetchClient = async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();
      if (!error) {
        setClient(data);
        if (data.dob) setDobInput(String(data.dob).split("T")[0]);
        setEmailInput(data.email || "");
        setMobileInput(data.mobile || "");
      } else {
        console.error("Fetch client failed:", error.message);
      }
    };
    fetchClient();
  }, [clientId, isOpen]);

  useEffect(() => {
    if (!clientId) return;
    const fetchNotes = async () => {
      const { data, error } = await supabase
        .from("client_notes")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (!error) setNotes(data || []);
      else console.error("Error fetching notes:", error.message);
    };
    fetchNotes();
  }, [clientId, isOpen]);

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    const { error } = await supabase.from("client_notes").insert([
      {
        client_id: clientId,
        note_content: noteContent.trim(),
        created_by: "Stylist",
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

  const handleSaveDOB = async () => {
    const { error } = await supabase
      .from("clients")
      .update({ dob: dobInput || null })
      .eq("id", clientId);
    if (!error) {
      setIsEditingDob(false);
      setClient({ ...client, dob: dobInput });
    } else {
      console.error("Save DOB failed:", error.message);
    }
  };

  // ✅ Email validation added here
  const handleSaveContactInfo = async () => {
    const email = (emailInput || "").trim();

    // block invalid emails (allow blank)
    if (!isValidEmail(email)) {
      setEmailError("Enter a valid email address (e.g. alex@example.com)");
      return;
    }
    setEmailError("");
    try {
      setSavingContact(true);
      const { error } = await supabase
        .from("clients")
        .update({ email: email || null, mobile: mobileInput || null })
        .eq("id", clientId);

      if (error) throw error;

      setIsEditingContact(false);
      setClient({ ...client, email: email || null, mobile: mobileInput || null });
    } catch (err) {
      console.error("Failed to update contact info", err);
      alert("Failed to update contact info");
    } finally {
      setSavingContact(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Client Details">
      <div className="space-y-4">
        {client && (
          <div className="text-sm space-y-2">
            {isEditingContact ? (
              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <span>📞</span>
                  <input
                    type="text"
                    className="border px-2 py-1 rounded text-sm w-full"
                    value={mobileInput}
                    onChange={(e) => setMobileInput(e.target.value)}
                  />
                </div>

                <div className="flex gap-2 items-center">
                  <span>📧</span>
                  <input
                    type="email"
                    className={`border px-2 py-1 rounded text-sm w-full ${
                      emailInput && !isValidEmail(emailInput) ? "border-red-500" : ""
                    }`}
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="name@example.com"
                    aria-invalid={!!emailInput && !isValidEmail(emailInput)}
                  />
                </div>

                {/* inline error */}
                {emailError && (
                  <p className="text-xs text-red-600 -mt-1">{emailError}</p>
                )}

                <div className="flex gap-2 text-xs mt-1">
                  <button
                    onClick={handleSaveContactInfo}
                    className="text-green-600"
                    disabled={savingContact || (!!emailInput && !isValidEmail(emailInput))}
                  >
                    {savingContact ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingContact(false);
                      setEmailInput(client.email || "");
                      setMobileInput(client.mobile || "");
                      setEmailError("");
                    }}
                    className="text-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <p>📞 <strong>{client.mobile || "N/A"}</strong></p>
                <p>📧 <strong>{client.email || "N/A"}</strong></p>
                <button
                  onClick={() => setIsEditingContact(true)}
                  className="text-blue-600 text-xs underline"
                >
                  Edit
                </button>
              </div>
            )}

            {/* DOB section left as-is (you said keep existing logic) */}
            <div className="flex items-center gap-2">
              🎂{" "}
              {isEditingDob ? (
                <>
                  <input
                    type="date"
                    className="border px-2 py-1 rounded"
                    value={dobInput}
                    onChange={(e) => setDobInput(e.target.value)}
                  />
                  <button
                    onClick={handleSaveDOB}
                    className="text-green-600 text-xs"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setIsEditingDob(false)}
                    className="text-gray-500 text-xs"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <strong>
                    {client?.dob
                      ? format(
                          new Date(String(client.dob).split("T")[0] + "T00:00:00"),
                          "dd MMM"
                        )
                      : "N/A"}
                  </strong>
                  <button
                    onClick={() => setIsEditingDob(true)}
                    className="text-blue-600 text-xs underline"
                  >
                    {client?.dob ? "Edit" : "Add Birthday"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <hr />

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
            <div className="text-sm text-gray-500">
              No notes for this client yet.
            </div>
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
