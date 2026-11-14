import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import ConfirmDialog from "../components/ConfirmDialog";
import Toast from "../components/Toast";
import { getMe, updateMe, changePassword, deleteMe, logout } from "../api/auth";

function PwInput({ id, value, onChange, placeholder, required, minLength }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrapper">
      <input
        id={id}
        className="field-input"
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
      />
      <button type="button" className="pw-toggle" onClick={() => setShow(s => !s)}
        aria-label={show ? "הסתר סיסמה" : "הצג סיסמה"}>
        {show ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        )}
      </button>
    </div>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [nameLoading, setNameLoading] = useState(false);
  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "" });
  const [pwLoading, setPwLoading] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [toast, setToast] = useState({ message: "", type: "success" });

  const showToast = (message, type = "success") => setToast({ message, type });

  useEffect(() => {
    getMe().then((r) => { setUser(r.data); setDisplayName(r.data.display_name); });
  }, []);

  const handleUpdateName = async (e) => {
    e.preventDefault();
    setNameLoading(true);
    try {
      const res = await updateMe({ display_name: displayName });
      setUser(res.data);
      showToast("שם התצוגה עודכן.");
    } catch (err) {
      showToast(err.response?.data?.detail || "העדכון נכשל.", "error");
    } finally { setNameLoading(false); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwForm.new_password.length < 8) {
      showToast("הסיסמה החדשה חייבת להכיל לפחות 8 תווים.", "error");
      return;
    }
    setPwLoading(true);
    try {
      await changePassword(pwForm);
      setPwForm({ current_password: "", new_password: "" });
      showToast("הסיסמה שונתה בהצלחה.");
    } catch (err) {
      showToast(err.response?.data?.detail || "שינוי הסיסמה נכשל.", "error");
    } finally { setPwLoading(false); }
  };

  const handleDeleteAccount = async () => {
    try { await deleteMe(); } catch {}
    try { await logout(); } catch {}
    localStorage.removeItem("token");
    navigate("/login");
  };

  if (!user) return <div className="loading">טוען...</div>;

  return (
    <div className="app-shell">
      <Navbar displayName={user.display_name} />
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "success" })} />
      <ConfirmDialog
        isOpen={showDelete}
        title="מחיקת חשבון"
        message="פעולה זו תמחק לצמיתות את כל הנתונים שלך — ספרייה, סשנים והיסטוריה. לא ניתן לשחזר."
        confirmText="מחק חשבון"
        onConfirm={handleDeleteAccount}
        onCancel={() => setShowDelete(false)}
      />

      <main className="main-content">
        <div className="page-container">
          <h1 className="page-title">פרופיל</h1>

          <div className="profile-section">
            {/* Account info */}
            <div className="panel">
              <p className="panel-label">פרטי חשבון</p>
              <div>
                <div className="profile-info-row">
                  <span className="field-hint">אימייל</span>
                  <span style={{ fontWeight: 500 }}>{user.email}</span>
                </div>
                <div className="profile-info-row" style={{ borderBottom: "none" }}>
                  <span className="field-hint">חבר מאז</span>
                  <span style={{ fontWeight: 500 }}>{new Date(user.created_at).toLocaleDateString("he-IL")}</span>
                </div>
              </div>
            </div>

            {/* Display name */}
            <div className="panel">
              <p className="panel-label">שם תצוגה</p>
              <form onSubmit={handleUpdateName} className="profile-form">
                <div className="field">
                  <label className="field-label" htmlFor="display-name">שם</label>
                  <input
                    id="display-name"
                    className="field-input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" disabled={nameLoading} className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }}>
                  {nameLoading ? "שומר..." : "שמור שינויים"}
                </button>
              </form>
            </div>

            {/* Change password */}
            <div className="panel">
              <p className="panel-label">שינוי סיסמה</p>
              <form onSubmit={handleChangePassword} className="profile-form">
                <div className="field">
                  <label className="field-label" htmlFor="cur-pw">סיסמה נוכחית</label>
                  <PwInput
                    id="cur-pw"
                    value={pwForm.current_password}
                    onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="new-pw">סיסמה חדשה</label>
                  <PwInput
                    id="new-pw"
                    value={pwForm.new_password}
                    onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
                    placeholder="לפחות 8 תווים"
                    required
                    minLength={8}
                  />
                </div>
                <button type="submit" disabled={pwLoading} className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }}>
                  {pwLoading ? "משנה..." : "שנה סיסמה"}
                </button>
              </form>
            </div>

            {/* Danger zone */}
            <div className="panel danger-zone-panel">
              <p className="panel-label">אזור מסוכן</p>
              <p>מחיקת החשבון תמחק לצמיתות את כל הנתונים שלך.</p>
              <button className="btn btn-danger" onClick={() => setShowDelete(true)}>
                מחק חשבון
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
