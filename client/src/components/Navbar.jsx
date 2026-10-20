import { Link, useNavigate } from "react-router-dom";
import { logout } from "../api/auth";

export default function Navbar({ displayName }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await logout(); } catch {}
    localStorage.removeItem("token");
    navigate("/login");
  };

  return (
    <nav className="navbar">
      <span className="navbar-brand">FocusFlow</span>
      <div className="navbar-links">
        <Link to="/library">Library</Link>
        <Link to="/history">History</Link>
      </div>
      <div className="navbar-user">
        <span>{displayName}</span>
        <button onClick={handleLogout}>Sign Out</button>
      </div>
    </nav>
  );
}
