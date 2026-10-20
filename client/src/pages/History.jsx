import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { listSessions } from "../api/sessions";
import { getMe } from "../api/auth";

export default function History() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [user, setUser] = useState(null);

  useEffect(() => {
    getMe().then((r) => setUser(r.data));
    listSessions().then((r) => setSessions(r.data));
  }, []);

  return (
    <div>
      <Navbar displayName={user?.display_name} />
      <div className="page-container">
        <h2>Session History</h2>
        {sessions.length === 0 && <p>No sessions yet. Open a content item to start.</p>}
        <div className="content-list">
          {sessions.map((s) => (
            <div key={s.id} className="content-card" onClick={() => navigate(`/history/${s.id}`)} style={{ cursor: "pointer" }}>
              <div>
                <p>{new Date(s.started_at).toLocaleString()}</p>
                <p>Status: {s.ended_at ? "Completed" : "In Progress"}</p>
              </div>
              <div>
                <span className="score-badge">Avg Score: {s.average_score.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
