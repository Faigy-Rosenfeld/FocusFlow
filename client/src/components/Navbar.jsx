import { NavLink, useNavigate } from "react-router-dom";
import { logout } from "../api/auth";

export default function Navbar({ displayName }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await logout(); } catch {}
    localStorage.removeItem("token");
    navigate("/login");
  };

  const linkClass = ({ isActive }) =>
    isActive ? "nav-link nav-link-active" : "nav-link";

  return (
    <nav className="navbar">
      <span className="navbar-brand">FocusFlow</span>
      <div className="navbar-links">
        <NavLink to="/library" className={linkClass}>Library</NavLink>
        <NavLink to="/history" className={linkClass}>History</NavLink>
      </div>
      <div className="navbar-user">
        <NavLink to="/profile" className={({ isActive }) =>
          isActive ? "navbar-profile-link navbar-profile-active" : "navbar-profile-link"
        }>
          {displayName}
        </NavLink>
        <button onClick={handleLogout}>Sign Out</button>
      </div>
    </nav>
  );
}
