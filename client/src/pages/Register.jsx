import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { register } from "../api/auth";

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", display_name: "" });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const validate = () => {
    const e = {};
    if (!form.display_name.trim()) e.display_name = "נא להזין שם תצוגה.";
    if (!form.email.trim()) e.email = "נא להזין אימייל.";
    if (form.password.length < 8) e.password = "הסיסמה חייבת להכיל לפחות 8 תווים.";
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const v = validate();
    if (Object.keys(v).length) { setErrors(v); return; }
    setErrors({});
    setLoading(true);
    try {
      await register(form);
      navigate("/login");
    } catch (err) {
      const msg = err.response?.data?.detail || "ההרשמה נכשלה. נסי שוב.";
      if (msg.toLowerCase().includes("email")) {
        setErrors({ email: "האימייל הזה כבר רשום במערכת." });
      } else {
        setErrors({ general: msg });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-logo">
          <span className="auth-logo-name">FocusFlow</span>
          <span className="auth-logo-sub">למד בריכוז, התקדם מהר יותר</span>
        </div>

        <h2 className="auth-title">יצירת חשבון</h2>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {errors.general && <span className="field-error">{errors.general}</span>}

          <div className="field">
            <label className="field-label" htmlFor="display_name">שם תצוגה</label>
            <input
              id="display_name"
              className="field-input"
              type="text"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              placeholder="השם שיופיע בממשק"
              required
              autoComplete="name"
            />
            {errors.display_name && <span className="field-error">{errors.display_name}</span>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="reg-email">אימייל</label>
            <input
              id="reg-email"
              className="field-input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="reg-password">סיסמה</label>
            <div className="pw-wrapper">
              <input
                id="reg-password"
                className="field-input"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="לפחות 8 תווים"
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
              >
                {showPassword ? (
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
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: "100%", marginTop: 4 }}>
            {loading ? <span className="btn-spinner" /> : "יצירת חשבון"}
          </button>
        </form>

        <p className="auth-footer">
          כבר יש לך חשבון?{" "}
          <Link to="/login">כניסה</Link>
        </p>
      </div>
    </div>
  );
}
