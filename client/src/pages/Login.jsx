import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login } from "../api/auth";
import Toast from "../components/Toast";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [toast, setToast] = useState({ message: "", type: "error" });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const showToast = (message, type = "error") => setToast({ message, type });
  const clearToast = () => setToast({ message: "", type: "error" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearToast();
    setLoading(true);
    try {
      const res = await login(form);
      localStorage.setItem("token", res.data.access_token);
      showToast("Welcome back!", "success");
      setTimeout(() => navigate("/library"), 800);
    } catch (err) {
      const msg = err.response?.data?.detail || "Invalid email or password";
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />

      <div className="auth-brand">
        <span className="auth-brand-icon">◎</span>
        <h1>FocusFlow</h1>
        <p>Stay focused, learn better</p>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        <h2>Sign In</h2>

        <label>Email
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </label>

        <label>Password
          <div className="input-password-wrapper">
            <input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                // Eye-off
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                // Eye
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
        </label>

        <button type="submit" disabled={loading} className="btn-submit">
          {loading ? <span className="btn-spinner" /> : "Sign In"}
        </button>

        <p>Don't have an account? <Link to="/register">Create one</Link></p>
      </form>
    </div>
  );
}
