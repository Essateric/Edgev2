import Button from "../../Button";
import { format } from "date-fns";

export default function BookingHeader({
  clientName,
  clientPhone,
  clientEmail, // ✅ NEW
  isOnline,
  isEditingDob,
  dobInput,
  setDobInput,
  savingDOB,
  dobError,
  onSaveDOB,
  setIsEditingDob,
  onOpenDetails,
}) {
  const displayDob = dobInput
    ? format(new Date(`${dobInput}T00:00:00`), "do MMM")
    : "DOB not set";

  const emailText = String(clientEmail || "").trim();
  const hasEmail = !!emailText && emailText !== "N/A";

  return (
    <div className="flex justify-between items-start mb-2 px-2">
      <div>
        <h2 className="text-lg font-bold text-rose-600">{clientName}</h2>

        <p className="text-sm text-gray-700">📞 {clientPhone}</p>

        {/* ✅ Email line */}
        <p className="text-sm text-gray-700">
          ✉️{" "}
          {hasEmail ? (
            <a className="underline" href={`mailto:${emailText}`}>
              {emailText}
            </a>
          ) : (
            "N/A"
          )}
        </p>

        {isOnline && (
          <span className="inline-block mt-1 text-[11px] px-2 py-0.5 rounded bg-emerald-600/15 text-emerald-700 border border-emerald-700/30">
            Online
          </span>
        )}

        <div className="text-sm text-gray-700 flex items-center gap-2 mt-1">
          🎂{" "}
          {isEditingDob ? (
            <>
              <input
                type="date"
                value={dobInput || ""}
                onChange={(e) => setDobInput(e.target.value)}
                className="border p-1 text-sm"
              />
              <Button
                onClick={onSaveDOB}
                className="text-xs"
                disabled={!dobInput || savingDOB}
              >
                {savingDOB ? "Saving..." : "Save"}
              </Button>
              <Button onClick={() => setIsEditingDob(false)} className="text-xs">
                Cancel
              </Button>
            </>
          ) : (
            <>
              <span>{displayDob}</span>
              <button
                onClick={() => setIsEditingDob(true)}
                className="text-xs text-blue-600 underline"
              >
                Edit
              </button>
            </>
          )}
        </div>

        {dobError && <p className="text-xs text-red-600 mt-1">{dobError}</p>}
      </div>

      <Button onClick={onOpenDetails} className="text-sm">
        View Details
      </Button>
    </div>
  );
}
