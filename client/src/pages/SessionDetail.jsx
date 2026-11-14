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

/* ── גרף קשב SVG ── */
function SessionGraph({ readings, threshold = 0.4 }) {
  if (!readings || readings.length < 2) return null;

  const W = 800, H = 110;
  const pad = { t: 10, b: 24, l: 28, r: 10 };
  const iW = W - pad.l - pad.r;
  const iH = H - pad.t - pad.b;

  const pts = readings.map((r, i) => ({
    x: pad.l + (i / (readings.length - 1)) * iW,
    y: pad.t + (1 - r.score) * iH,
    low: r.score < threshold,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const thY = pad.t + (1 - threshold) * iH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", direction: "ltr", display: "block" }} preserveAspectRatio="none">
      {/* threshold shade */}
      <rect x={pad.l} y={thY} width={iW} height={pad.t + iH - thY} fill="rgba(194,65,12,0.06)" />
      {/* threshold dashed line */}
      <line x1={pad.l} y1={thY} x2={pad.l + iW} y2={thY} stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3" />
      {/* score line */}
      <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" />
      {/* low-focus dots */}
      {pts.filter(p => p.low).map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#f59e0b" />
      ))}
      {/* Y labels */}
      <text x={pad.l - 4} y={pad.t + 5} fontSize="9" fill="var(--muted)" textAnchor="end">1</text>
      <text x={pad.l - 4} y={pad.t + iH + 5} fontSize="9" fill="var(--muted)" textAnchor="end">0</text>
      <text x={pad.l - 4} y={thY + 4} fontSize="9" fill="#f59e0b" textAnchor="end">0.4</text>
    </svg>
  );
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

  const startDate = new Date(session.started_at).toLocaleDateString("he-IL", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
  const startTime = new Date(session.started_at).toLocaleTimeString("he-IL", {
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="app-shell">
      <Navbar displayName={user?.display_name} />
      <main className="main-content">
        <div className="page-container">

          {/* Header */}
          <div className="page-header">
            <div>
              <nav className="breadcrumb" style={{ marginBottom: 6 }}>
                <a href="/history">היסטוריה</a>
                <span className="breadcrumb-sep">/</span>
                <span>{session.content_title || "פירוט סשן"}</span>
              </nav>
              <h1 className="page-title">{session.content_title || "סשן"}</h1>
            </div>
            <button className="btn btn-secondary" onClick={() => navigate("/history")}>
              חזרה
            </button>
          </div>

          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="panel-label">ציון ממוצע</span>
              <span className={`score-pill ${scoreClass(session.average_score)}`} style={{ alignSelf: "flex-start", fontSize: 18, padding: "4px 14px" }}>
                {(session.average_score * 100).toFixed(0)}%
              </span>
            </div>
            <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="panel-label">תאריך</span>
              <span className="stat-value">{startDate}</span>
            </div>
            <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="panel-label">שעה</span>
              <span className="stat-value">{startTime}</span>
            </div>
            <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="panel-label">משך</span>
              <span className="stat-value">{duration !== null ? `${duration} דק׳` : "—"}</span>
            </div>
          </div>

          {/* Graph */}
          {session.readings.length > 1 && (
            <div className="panel">
              <p className="panel-label" style={{ marginBottom: 14 }}>קשב לאורך הסשן</p>
              <SessionGraph readings={session.readings} />
              <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 20, height: 2, background: "var(--accent)", display: "inline-block", borderRadius: 1 }} />
                  ציון קשב
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 16, height: 0, borderTop: "2px dashed #f59e0b", display: "inline-block" }} />
                  סף התראה (0.4)
                </span>
              </div>
            </div>
          )}

          {session.readings.length === 0 && (
            <div className="panel">
              <div className="empty-state" style={{ padding: "32px 0" }}>
                <p>לא נרשמו מדידות בסשן זה.</p>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
