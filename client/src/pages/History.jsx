import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { listSessions } from "../api/sessions";
import { getMe } from "../api/auth";

const PAGE_SIZE = 10;

function scoreClass(s) {
  if (s >= 0.7) return "good";
  if (s >= 0.4) return "mid";
  return "low";
}

export default function History() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [user, setUser] = useState(null);
  const [skip, setSkip] = useState(0);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialDone, setInitialDone] = useState(false);
  const sentinelRef = useRef(null);

  const hasMore = total === null || sessions.length < total;

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const res = await listSessions(sessions.length, PAGE_SIZE);
      const { items, total: t } = res.data;
      setSessions(prev => [...prev, ...items]);
      setTotal(t);
    } finally {
      setLoading(false);
      setInitialDone(true);
    }
  }, [loading, hasMore, sessions.length]);

  // Initial load
  useEffect(() => {
    getMe().then((r) => setUser(r.data));
    loadMore();
  }, []);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && initialDone && !loading && hasMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loadMore, initialDone, loading, hasMore]);

  return (
    <div className="app-shell">
      <Navbar displayName={user?.display_name} />
      <main className="main-content">
        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">היסטוריה</h1>
            {total !== null && (
              <span style={{ fontSize: 13, color: "var(--muted)" }}>
                {total} סשנים בסך הכל
              </span>
            )}
          </div>

          <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
            {initialDone && sessions.length === 0 ? (
              <div className="empty-state">
                <p>עדיין לא הייתה כאן שום פעילות.</p>
                <button className="btn btn-secondary" onClick={() => navigate("/library")}>
                  עברי לספרייה
                </button>
              </div>
            ) : (
              <table className="flat-table">
                <thead>
                  <tr>
                    <th>תוכן</th>
                    <th>תאריך</th>
                    <th>משך</th>
                    <th>ציון ממוצע</th>
                    <th>סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => {
                    const duration = s.ended_at
                      ? Math.round((new Date(s.ended_at) - new Date(s.started_at)) / 60000)
                      : null;
                    return (
                      <tr key={s.id} onClick={() => navigate(`/history/${s.id}`)}>
                        <td style={{ fontWeight: 500 }}>{s.content_title || "—"}</td>
                        <td style={{ color: "var(--muted)", fontSize: 13 }}>
                          {new Date(s.started_at).toLocaleString("he-IL", {
                            day: "2-digit", month: "2-digit", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </td>
                        <td style={{ color: "var(--muted)", fontSize: 13 }}>
                          {duration !== null ? `${duration} דק׳` : "—"}
                        </td>
                        <td>
                          <span className={`score-pill ${scoreClass(s.average_score)}`}>
                            {(s.average_score * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge ${s.ended_at ? "status-done" : "status-active"}`}>
                            {s.ended_at ? "הסתיים" : "פעיל"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Sentinel + loader */}
            <div ref={sentinelRef} style={{ height: 1 }} />
            {loading && (
              <div style={{ padding: "14px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                טוען...
              </div>
            )}
            {initialDone && !hasMore && sessions.length > 0 && (
              <div style={{ padding: "12px 16px", textAlign: "center", color: "var(--muted)", fontSize: 12, borderTop: "1px solid var(--line)" }}>
                סוף ההיסטוריה
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
