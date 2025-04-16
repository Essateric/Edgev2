import React from "react";
import { Link, useLocation } from "react-router-dom";
import { FaCalendarAlt, FaHome, FaUser, FaUsers, FaCog, FaSignOutAlt, FaCut } from "react-icons/fa";
import { useAuth } from "../contexts/AuthContext";
import essatericLogo from "../assets/essateric_white.png";
import edgeLogo from "../assets/EdgeLogo.png";

const navItems = [
  { label: "Dashboard", icon: <FaHome />, path: "/dashboard" },
  { label: "Clients", icon: <FaUser />, path: "/clients" },
  { label: "Calendar", icon: <FaCalendarAlt />, path: "/calendar" },
  { label: "Staff", icon: <FaUsers />, path: "/staff" },
  { label: "Services", icon: <FaCut />, path: "/services" },
  { label: "Settings", icon: <FaCog />, path: "/settings" },
];

export default function Sidebar() {
  const { currentUser, logout } = useAuth();
  const location = useLocation();

  return (
    <aside className="w-56 bg-black text-white p-4 flex flex-col justify-between">
      {/* Top Logo & Navigation */}
      <div>
        <div className="mb-6">
          <img src={edgeLogo} alt="Edge Salon Logo" className="w-32 mx-auto" />
        </div>
        <nav className="space-y-2">
          {navItems.map(({ label, icon, path }) => (
            <Link
              key={path}
              to={path}
              className={`flex items-center gap-2 p-2 rounded hover:bg-bronze/20 transition ${
                location.pathname === path ? "bg-bronze/30" : ""
              }`}
            >
              {icon} <span>{label}</span>
            </Link>
          ))}
        </nav>
      </div>

      {/* Logout + Attribution */}
      <div className="mt-6">
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 text-sm hover:text-bronze mb-4"
        >
          <FaSignOutAlt /> Logout
        </button>

        <a
          href="https://www.essateric.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-bronze"
        >
          <img src={essatericLogo} alt="Essateric Logo" className="w-20 h-20" />
          <span className="leading-tight">
            Designed and developed by <br />
            <span className="font-semibold  hover:text-bronze">Essateric Solutions ©2025</span>
          </span>
        </a>
      </div>
    </aside>
  );
}
