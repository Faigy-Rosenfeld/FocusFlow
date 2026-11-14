import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { getSession } from "../api/sessions";
import { getMe } from "../api/auth";

function scoreClass(s) {
  if (s >= 0.7) return "good";
  if (s >= 0.4) return "mid";
  return "low";
}

export default function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    getMe().then((r) => setUser(r.data));
    getSession(id).then((r) => setSession(r.data)).catch(() => navigate("/history"));
  }, [id]);

  if (!session) return <div className="loading">טוען...</div>;

  const duration = session.ended_at
    ? Math.round((new Date(session.ended_at) - new Date(session.started_at)) / 60000)
    : null;

  return (
    <div className="app-shell">
      <Navbar displayName={user?.display_name} />
      <main className="main-content">
        <div className="page-container">
          <div className="page-header">
            <div>
              <nav className="breadcrumb" style={{ marginBottom: 6 }}>
                <a href="/history">היסטוריה</a>
                <span className="breadcrumb-sep">/</span>
                <span>פירוט סשן</span>
              </nav>
              <h1 className="page-title">{session.content_title || "פירוט סשן"}</h1>
            </div>
            <button className="btn btn-secondary" onClick={() => navigate("/history")}>
              חזרה
            </button>
          </div>

          {/* Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { label: "ציון ממוצע", value: `${(session.average_score * 100).toFixed(0)}%`, cls: scoreClass(session.average_score) },
              { label: "מדידות", value: session.readings.length },
              { label: "משך", value: duration !== null ? `${duration} דק׳` : "—" },
              { label: "סטטוס", value: session.ended_at ? "הסתיים" : "פעיל" },
            ].map(({ label, value, cls }) => (
              <div className="panel" key={label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="panel-label">{label}</span>
                <span className={`stat-value ${cls ? `score-pill ${cls}` : ""}`}
                  style={cls ? { alignSelf: "flex-start" } : {}}>{value}</span>
              </div>
            ))}
          </div>

          {/* Readings table */}
          <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 16px 0" }}>
              <p className="panel-label">ציוני קשב לאורך הסשן</p>
            </div>
            {session.readings.length === 0 ? (
              <div className="empty-state">
                <p>לא נרשמו מדידות בסשן זה.</p>
              </div>
            ) : (
              <table className="readings-table">
                <thead>
                  <tr>
                    <th>מיקום בסרטון</th>
                    <th>ציון קשב</th>
                    <th>זמן מדידה</th>
                  </tr>
                </thead>
                <tbody>
                  {session.readings.map((r, i) => (
                    <tr key={i} className={`r-${scoreClass(r.score)}`}>
                      <td>{r.position.toFixed(0)}ש׳</td>
                      <td>
                        <span className={`score-pill ${scoreClass(r.score)}`}>
                          {(r.score * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td style={{ color: "var(--muted)" }}>
                        {new Date(r.created_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
