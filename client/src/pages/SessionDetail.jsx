import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { getSession } from "../api/sessions";
import { getMe } from "../api/auth";

export default function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    getMe().then((r) => setUser(r.data));
    getSession(id).then((r) => setSession(r.data)).catch(() => navigate("/history"));
  }, [id]);

  if (!session) return <div>Loading...</div>;

  return (
    <div>
      <Navbar displayName={user?.display_name} />
      <div className="page-container">
        <button onClick={() => navigate("/history")}>← Back to History</button>
        <h2>Session Details</h2>
        <p>Started: {new Date(session.started_at).toLocaleString()}</p>
        <p>Ended: {session.ended_at ? new Date(session.ended_at).toLocaleString() : "In Progress"}</p>
        <p>Average Focus Score: <strong>{session.average_score.toFixed(2)}</strong></p>
        <p>Total Readings: {session.readings.length}</p>

        <h3>Focus Timeline</h3>
        <div className="readings-list">
          {session.readings.map((r, i) => (
            <div key={i} className={`reading-item ${r.score < 0.4 ? "low" : r.score < 0.7 ? "medium" : "high"}`}>
              <span>Position: {r.position.toFixed(0)}s</span>
              <span>Score: {r.score.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
