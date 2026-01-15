import { NavLink } from "react-router-dom";
import BookingTagManager from "../components/BookingTagManager.jsx";

export default function Tags() {
  return (
    <div className="p-6 text-black space-y-8">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-bronze">Settings</h1>
        <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
          <NavLink
            to="/settings"
            end
            className={({ isActive }) =>
              `px-3 py-2 text-sm font-medium rounded-t ${
                isActive
                  ? "bg-white text-bronze border border-gray-200 border-b-white"
                  : "text-gray-600 hover:text-bronze"
              }`
            }
          >
            Scheduled Tasks
          </NavLink>
          <NavLink
            to="/tags"
            className={({ isActive }) =>
              `px-3 py-2 text-sm font-medium rounded-t ${
                isActive
                  ? "bg-white text-bronze border border-gray-200 border-b-white"
                  : "text-gray-600 hover:text-bronze"
              }`
            }
          >
            Tags
          </NavLink>
        </div>
      </div>

      <BookingTagManager />
    </div>
  );
}