import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { getMe } from "../api/auth";
import { getAnalytics } from "../api/sessions";

function scoreClass(s) {
  if (s === null) return "none";
  if (s >= 0.7) return "good";
  if (s >= 0.4) return "mid";
  return "low";
}

function ScoreGraph({ sessions }) {
  if (!sessions || sessions.length < 2) return null;

  const W = 800, H = 120;
  const pad = { t: 10, b: 28, l: 32, r: 10 };
  const iW = W - pad.l - pad.r;
  const iH = H - pad.t - pad.b;
  const thY = pad.t + (1 - 0.4) * iH;

  const pts = sessions.map((s, i) => ({
    x: pad.l + (i / (sessions.length - 1)) * iW,
    y: pad.t + (1 - s.average_score) * iH,
    score: s.average_score,
    label: s.content_title || "סשן",
    date: new Date(s.date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }),
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  // show date labels every N points to avoid crowding
  const step = Math.max(1, Math.floor(pts.length / 6));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", direction: "ltr", display: "block" }} preserveAspectRatio="none">
      <rect x={pad.l} y={thY} width={iW} height={pad.t + iH - thY} fill="rgba(194,65,12,0.05)" />
      <line x1={pad.l} y1={thY} x2={pad.l + iW} y2={thY} stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3" />
      <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5"
          fill={p.score >= 0.7 ? "var(--good)" : p.score >= 0.4 ? "var(--accent)" : "#f59e0b"} />
      ))}
      {pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p, i) => (
        <text key={i} x={p.x} y={H - 4} fontSize="9" fill="var(--muted)" textAnchor="middle">{p.date}</text>
      ))}
      <text x={pad.l - 4} y={pad.t + 5} fontSize="9" fill="var(--muted)" textAnchor="end">1</text>
      <text x={pad.l - 4} y={pad.t + iH + 5} fontSize="9" fill="var(--muted)" textAnchor="end">0</text>
      <text x={pad.l - 4} y={thY + 4} fontSize="9" fill="#f59e0b" textAnchor="end">0.4</text>
    </svg>
  );
}

function DistributionBar({ distribution }) {
  const total = distribution.high + distribution.mid + distribution.low;
  if (total === 0) return null;

  const pct = (n) => Math.round((n / total) * 100);

  return (
    <div>
      <div style={{ display: "flex", height: 20, borderRadius: 6, overflow: "hidden", gap: 2 }}>
        {distribution.high > 0 && (
          <div style={{ flex: distribution.high, background: "var(--good)", minWidth: 2 }} />
        )}
        {distribution.mid > 0 && (
          <div style={{ flex: distribution.mid, background: "var(--accent)", minWidth: 2 }} />
        )}
        {distribution.low > 0 && (
          <div style={{ flex: distribution.low, background: "var(--low)", minWidth: 2 }} />
        )}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--good)", display: "inline-block" }} />
          קשוב ({distribution.high} סשנים · {pct(distribution.high)}%)
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
          בינוני ({distribution.mid} סשנים · {pct(distribution.mid)}%)
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--low)", display: "inline-block" }} />
          נמוך ({distribution.low} סשנים · {pct(distribution.low)}%)
        </span>
      </div>
    </div>
  );
}

export default function Analytics() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe().then((r) => setUser(r.data));
    getAnalytics()
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">טוען...</div>;

  return (
    <div className="app-shell">
      <Navbar displayName={user?.display_name} />
      <main className="main-content">
        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">אנליטיקס</h1>
          </div>

          {data?.total_sessions === 0 ? (
            <div className="panel">
              <div className="empty-state">
                <p>עדיין אין סשנים שהסתיימו. סיים סשן ראשון כדי לראות נתונים.</p>
                <button className="btn btn-secondary" onClick={() => navigate("/library")}>
                  לספרייה
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
                <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="panel-label">ממוצע כללי</span>
                  <span className={`score-pill ${scoreClass(data.overall_avg)}`} style={{ alignSelf: "flex-start", fontSize: 18, padding: "4px 14px" }}>
                    {data.overall_avg !== null ? `${(data.overall_avg * 100).toFixed(0)}%` : "—"}
                  </span>
                </div>
                <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="panel-label">סשנים שהסתיימו</span>
                  <span className="stat-value" style={{ fontSize: 22 }}>{data.total_sessions}</span>
                </div>
                <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="panel-label">סה״כ זמן לימוד</span>
                  <span className="stat-value" style={{ fontSize: 22 }}>
                    {data.total_minutes >= 60
                      ? `${Math.floor(data.total_minutes / 60)}ש׳ ${Math.round(data.total_minutes % 60)}ד׳`
                      : `${data.total_minutes} דק׳`}
                  </span>
                </div>
              </div>

              {/* Score over time graph */}
              {data.sessions_over_time.length >= 2 && (
                <div className="panel">
                  <p className="panel-label" style={{ marginBottom: 14 }}>קשב לאורך זמן</p>
                  <ScoreGraph sessions={data.sessions_over_time} />
                  <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 20, height: 2, background: "var(--accent)", display: "inline-block" }} />
                      ממוצע קשב לסשן
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 16, height: 0, borderTop: "2px dashed #f59e0b", display: "inline-block" }} />
                      סף התראה (0.4)
                    </span>
                  </div>
                </div>
              )}

              {/* Distribution */}
              <div className="panel">
                <p className="panel-label" style={{ marginBottom: 14 }}>התפלגות רמות קשב</p>
                <DistributionBar distribution={data.score_distribution} />
              </div>

              {/* Best / Worst */}
              {data.best_session && data.worst_session && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="panel" style={{ cursor: "pointer" }} onClick={() => navigate(`/history/${data.best_session.id}`)}>
                    <p className="panel-label">הסשן הטוב ביותר</p>
                    <p style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>{data.best_session.content_title || "סשן"}</p>
                    <span className="score-pill good" style={{ fontSize: 15 }}>
                      {(data.best_session.average_score * 100).toFixed(0)}%
                    </span>
                    <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                      {new Date(data.best_session.date).toLocaleDateString("he-IL")}
                    </p>
                  </div>
                  <div className="panel" style={{ cursor: "pointer" }} onClick={() => navigate(`/history/${data.worst_session.id}`)}>
                    <p className="panel-label">הסשן הנמוך ביותר</p>
                    <p style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>{data.worst_session.content_title || "סשן"}</p>
                    <span className={`score-pill ${scoreClass(data.worst_session.average_score)}`} style={{ fontSize: 15 }}>
                      {(data.worst_session.average_score * 100).toFixed(0)}%
                    </span>
                    <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                      {new Date(data.worst_session.date).toLocaleDateString("he-IL")}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
