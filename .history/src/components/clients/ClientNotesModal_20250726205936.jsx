import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "../../supabaseClient";
import Modal from "../Modal";
import Button from "../Button";
import ClientHistoryFullScreen from "../../pages/ClientHistory";

export default function ClientNotesModal({ isOpen, onClose, clientId }) {
  const [client, setClient] = useState(null);
  const [notes, setNotes] = useState([]);
  const [noteType, setNoteType] = useState("Patch Test");
  const [noteContent, setNoteContent] = useState("");
  const [dobInput, setDobInput] = useState("");
  const [isEditingDob, setIsEditingDob] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);

  useEffect(() => {
    const fetchClient = async () => {
      if (!clientId) return;
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();

      if (!error) {
        setClient(data);
        if (data.dob) setDobInput(data.dob.split("T")[0]);
      }
    };

    fetchClient();
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;

    const fetchNotes = async () => {
      const { data, error } = await supabase
        .from("client_notes")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (!error) setNotes(data);
      else console.error("Error fetching notes:", error.message);
    };

    fetchNotes();
  }, [clientId, isOpen]);

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;

    const { error } = await supabase.from("client_notes").insert([
      {
        client_id: clientId,
        note_type: noteType,
        note_content: noteContent.trim(),
        created_by: "Stylist",
      },
    ]);

    if (!error) {
      setNoteContent("");
      setNoteType("Patch Test");
      const { data } = await supabase
        .from("client_notes")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      setNotes(data);
    }
  };

  const handleSaveDOB = async () => {
    const { error } = await supabase
      .from("clients")
      .update({ dob: dobInput })
      .eq("id", clientId);

    if (!error) {
      setIsEditingDob(false);
      setClient({ ...client, dob: dobInput });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Client Details">
      <div className="space-y-4">
        {client && (
          <div className="text-sm space-y-2">
            <p>📞 <strong>{client.mobile || "N/A"}</strong></p>

            <p>
              📧 <strong>{client.email || "N/A"}</strong>
            </p>

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
                    {client.dob
                      ? format(new Date(client.dob), "dd MMM")
                      : "N/A"}
                  </strong>
                  <button
                    onClick={() => setIsEditingDob(true)}
                    className="text-blue-600 text-xs underline"
                  >
                    {client.dob ? "Edit" : "Add"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <hr />

        <div className="flex gap-2">
          <select
            className="border px-2 py-1 rounded"
            value={noteType}
            onChange={(e) => setNoteType(e.target.value)}
          >
            <option>Patch Test</option>
            <option>Allergy</option>
            <option>Preference</option>
            <option>Medical</option>
            <option>Other</option>
          </select>
          <input
            className="border flex-1 px-2 py-1 rounded"
            placeholder="Enter note..."
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
          />
          <Button onClick={handleAddNote}>Add</Button>
        </div>

        <div className="space-y-2 max-h-[300px] overflow-auto">
          {notes.map((note) => (
            <div key={note.id} className="border rounded p-2 text-sm">
              <div className="font-bold">{note.note_type}</div>
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
