import React from "react";

export default function StaffList({ staff, onEdit, onDelete }) {
  return (
    <div className="mt-6">
      <h3 className="text-lg font-bold text-chrome mb-2">Current Staff</h3>
      {staff.length === 0 ? (
        <p className="text-sm text-gray-600">No staff added yet.</p>
      ) : (
        staff.map((member) => (
          <div
            key={member.id}
            className="border border-bronze p-4 rounded mb-2 bg-white flex justify-between items-start"
          >
            <div>
              <p className="font-bold text-bronze text-lg">{member.name}</p>
              <p className="text-sm text-gray-700">{member.email}</p>

              <div className="mt-2 text-sm text-bronze">
                <p className="font-semibold mb-1">Services:</p>
                <ul className="list-disc list-inside">
                  {member.services?.map((s, i) => (
                    <li key={i}>
                      {s.name} - £{s.price} ({s.duration?.hours || 0}h {s.duration?.minutes || 0}m)
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-2 text-sm">
                <p className="font-semibold text-bronze mb-1">Weekly Hours:</p>
                <ul className="list-none">
                  {Object.entries(member.weeklyHours || {}).map(([day, time]) => (
                    <li key={day}>
                      {day}: {time.off ? "Off" : `${time.start || "--:--"} - ${time.end || "--:--"}`}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex gap-2 mt-2">
              <button
                onClick={() => onEdit(member)}
                className="text-blue-500 hover:underline"
              >
                Edit
              </button>
              <button
                onClick={() => onDelete(member.id)}
                className="text-red-500 hover:underline"
              >
                Delete
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
