import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { logout } from "../api/auth";
import logo from "../assets/logo.svg";

const links = [
  {
    to: "/library",
    label: "הספרייה שלי",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
    ),
  },
  {
    to: "/history",
    label: "היסטוריה",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
  {
    to: "/profile",
    label: "פרופיל",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
];

export default function Navbar({ displayName }) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    try { await logout(); } catch {}
    localStorage.removeItem("token");
    navigate("/login");
  };

  const SidebarContent = () => (
    <>
      <div className="sidebar-brand">
        <img src={logo} alt="FocusFlow" className="sidebar-logo" />
      </div>

      <nav className="sidebar-nav">
        {links.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => "sidebar-link" + (isActive ? " active" : "")}
            onClick={() => setMobileOpen(false)}
          >
            <span className="sidebar-link-icon">{icon}</span>
            <span className="sidebar-link-label">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className="sidebar-username">{displayName}</span>
        <button className="sidebar-logout" onClick={handleLogout}>התנתקות</button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sidebar sidebar-desktop">
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <div className="mobile-topbar">
        <img src={logo} alt="FocusFlow" style={{ height: 28 }} />
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileOpen(true)}
          aria-label="פתח תפריט"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div className="mobile-backdrop" onClick={() => setMobileOpen(false)} />
          <aside className="sidebar sidebar-mobile-drawer">
            <button
              className="mobile-close-btn"
              onClick={() => setMobileOpen(false)}
              aria-label="סגור תפריט"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <SidebarContent />
          </aside>
        </>
      )}
    </>
  );
}
