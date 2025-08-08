import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import Modal from "./Modal";
import Button from "./Button";

export default function ClientNotesModal({ isOpen, onClose, clientId }) {
  const [notes, setNotes] = useState([]);
  const [noteType, setNoteType] = useState("Patch Test");
  const [noteContent, setNoteContent] = useState("");

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
        created_by: "Stylist", // Replace with currentUser.name if needed
      },
    ]);

    if (!error) {
      setNoteContent("");
      setNoteType("Patch Test");
      // Reload notes
      const { data } = await supabase
        .from("client_notes")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      setNotes(data);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Client Notes">
      <div className="space-y-4">
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
            <div className="text-sm text-gray-500">No notes for this client yet.</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
