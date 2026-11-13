import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import ConfirmDialog from "../components/ConfirmDialog";
import Toast from "../components/Toast";
import { getMe, updateMe, changePassword, deleteMe, logout } from "../api/auth";

function PasswordInput({ value, onChange, placeholder, required, minLength }) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-input-wrapper">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {show ? (
            <>
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </>
          ) : (
            <>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  // display name form
  const [displayName, setDisplayName] = useState("");
  const [nameLoading, setNameLoading] = useState(false);

  // password form
  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "" });
  const [pwLoading, setPwLoading] = useState(false);

  // delete dialog
  const [showDelete, setShowDelete] = useState(false);

  const [toast, setToast] = useState({ message: "", type: "success" });

  const showToast = (message, type = "success") => setToast({ message, type });

  useEffect(() => {
    getMe().then((r) => {
      setUser(r.data);
      setDisplayName(r.data.display_name);
    });
  }, []);

  const handleUpdateName = async (e) => {
    e.preventDefault();
    setNameLoading(true);
    try {
      const res = await updateMe({ display_name: displayName });
      setUser(res.data);
      showToast("Display name updated successfully");
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to update name", "error");
    } finally {
      setNameLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwForm.new_password.length < 8) {
      showToast("New password must be at least 8 characters", "error");
      return;
    }
    setPwLoading(true);
    try {
      await changePassword(pwForm);
      setPwForm({ current_password: "", new_password: "" });
      showToast("Password changed successfully");
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to change password", "error");
    } finally {
      setPwLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await deleteMe();
    } catch {}
    try { await logout(); } catch {}
    localStorage.removeItem("token");
    navigate("/login");
  };

  if (!user) return <div className="loading">Loading...</div>;

  return (
    <div>
      <Navbar displayName={user.display_name} />
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: "", type: "success" })}
      />
      <ConfirmDialog
        isOpen={showDelete}
        title="Delete Account"
        message="Are you sure you want to delete your account? This will permanently delete all your content, sessions, and data. This action cannot be undone."
        confirmText="Delete Account"
        onConfirm={handleDeleteAccount}
        onCancel={() => setShowDelete(false)}
      />

      <div className="page-container" style={{ maxWidth: 600 }}>
        <h2>My Profile</h2>

        {/* ── Account Info ── */}
        <div className="profile-card">
          <h3>Account Info</h3>
          <div className="profile-info-row">
            <span className="profile-label">Email</span>
            <span className="profile-value">{user.email}</span>
          </div>
          <div className="profile-info-row">
            <span className="profile-label">Member since</span>
            <span className="profile-value">
              {new Date(user.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* ── Update Display Name ── */}
        <div className="profile-card">
          <h3>Display Name</h3>
          <form onSubmit={handleUpdateName} className="profile-form">
            <label>
              Name
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                minLength={1}
              />
            </label>
            <button type="submit" disabled={nameLoading}>
              {nameLoading ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </div>

        {/* ── Change Password ── */}
        <div className="profile-card">
          <h3>Change Password</h3>
          <form onSubmit={handleChangePassword} className="profile-form">
            <label>
              Current Password
              <PasswordInput
                value={pwForm.current_password}
                onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
                required
              />
            </label>
            <label>
              New Password
              <PasswordInput
                value={pwForm.new_password}
                onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
                required
                minLength={8}
                placeholder="At least 8 characters"
              />
            </label>
            <button type="submit" disabled={pwLoading}>
              {pwLoading ? "Changing..." : "Change Password"}
            </button>
          </form>
        </div>

        {/* ── Danger Zone ── */}
        <div className="profile-card profile-danger-zone">
          <h3>Danger Zone</h3>
          <p>Permanently delete your account and all associated data. This cannot be undone.</p>
          <button
            className="btn-danger"
            onClick={() => setShowDelete(true)}
          >
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}
