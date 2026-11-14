import { useEffect, useRef, useState, useMemo, memo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import QuizModal from "../components/QuizModal";
import Toast from "../components/Toast";
import { getContent } from "../api/content";
import { getMe } from "../api/auth";
import { createSession, endSession, addReading } from "../api/sessions";
import { useCamera } from "../hooks/useCamera";
import { useModel } from "../hooks/useModel";
import { fetchQuestions, getQuestionForPosition } from "../api/gemini";

const LOW_FOCUS_THRESHOLD = 0.4;

function scoreClass(s) {
  if (s === null) return "none";
  if (s >= 0.7) return "good";
  if (s >= 0.4) return "mid";
  return "low";
}
function scoreLabel(s, facesDetected) {
  if (s === null) return "ממתין למדידה...";
  if (!facesDetected) return "אין מדידה";
  if (s >= 0.7) return "קשוב";
  if (s >= 0.4) return "קשב בינוני";
  return "קשב נמוך";
}

function useTimer(active) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function Viewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const playerRef = useRef(null);
  const ytPlayerRef = useRef(null);

  const [content, setContent] = useState(null);
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [score, setScore] = useState(null);
  const [pageError, setPageError] = useState("");
  const [cameraConsent, setCameraConsent] = useState(false);
  const questionsRef = useRef([]);
  const askedQuestionsRef = useRef(new Set());
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [banner, setBanner] = useState(null); // null | "low-focus" | "no-face"
  const [alertMsg, setAlertMsg] = useState({ message: "", type: "success" });
  const bannerRef = useRef(null); // mirror of banner for use inside async callbacks

  // keep bannerRef in sync
  const updateBanner = (val) => {
    bannerRef.current = val;
    setBanner(val);
  };

  // session stats
  const [readings, setReadings] = useState([]);
  const [alertCount, setAlertCount] = useState(0);

  const { videoRef, ready: cameraReady, active: cameraActive, facesDetected, error: cameraError, startCamera, stopCamera } = useCamera();
  const { ready: modelReady, runInference } = useModel();

  const sessionRef = useRef(null);
  const positionRef = useRef(0);
  const pausedRef = useRef(false);
  const lowFocusStartRef = useRef(0);
  const isInferringRef = useRef(false); // prevents concurrent handleFrameWindow calls
  const lowFocusSinceRef = useRef(null);

  const timer = useTimer(!!session);

  const getVideoId = (url) => {
    const match = url?.match(/(?:v=|youtu\.be\/)([^&?/]+)/);
    return match?.[1] ?? null;
  };

  useEffect(() => {
    getMe().then((r) => setUser(r.data));
    getContent(id)
      .then((r) => setContent(r.data))
      .catch(() => setPageError("התוכן לא נמצא."));

    return () => {
      if (sessionRef.current && !sessionRef.current.ended_at) {
        endSession(sessionRef.current.id).catch(() => {});
      }
      stopCamera();
    };
  }, [id]);

  // show no-face banner — uses bannerRef to avoid stale closure
  useEffect(() => {
    if (!cameraActive) return;
    if (!facesDetected && bannerRef.current !== "low-focus") updateBanner("no-face");
    if (facesDetected && bannerRef.current === "no-face") updateBanner(null);
  }, [facesDetected, cameraActive]);

  // YouTube player
  useEffect(() => {
    if (!content || content.type !== "youtube") return;
    const videoId = getVideoId(content.source);
    if (!videoId) return;

    const initPlayer = () => {
      if (!document.getElementById("yt-player")) return;
      ytPlayerRef.current = new window.YT.Player("yt-player", {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: { enablejsapi: 1, origin: window.location.origin },
        events: { onReady: (e) => { playerRef.current = e.target; } },
      });
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
      window.onYouTubeIframeAPIReady = initPlayer;
    }
    return () => { ytPlayerRef.current?.destroy?.(); };
  }, [content]);

  const sendPlayerCommand = (func, args = []) => playerRef.current?.[func]?.(...args);

  const handleStartSession = async () => {
    const res = await createSession(id);
    setSession(res.data);
    sessionRef.current = res.data;

    if (content?.type === "youtube") {
      setLoadingQuestions(true);
      const videoId = getVideoId(content.source);
      const qs = await fetchQuestions(videoId, content.title).catch(() => []);
      console.log("[FocusFlow] questions loaded:", qs.length, qs);

      if (qs.length > 0) {
        questionsRef.current = qs;
      } else {
        // Fallback — שאלת ברירת מחדל כשGemini לא זמין
        questionsRef.current = [
          {
            time: 0,
            question: "האם היית קשוב לתוכן עד כה?",
            options: ["כן, הייתי מרוכז", "לא ממש", "חלקית", "לא בטוח"],
            correct: 0,
          },
        ];
        console.log("[FocusFlow] using fallback question (Gemini unavailable)");
      }
      setLoadingQuestions(false);
    }
  };

  const handleCameraConsent = async () => {
    setCameraConsent(true);
    await startCamera(handleFrameWindow);
  };

  const handleFrameWindow = async (frames) => {
    if (!sessionRef.current || pausedRef.current) return;
    if (isInferringRef.current) return; // מונע קריאות מקבילות
    isInferringRef.current = true;

    try {
      const result = await runInference(frames);
      if (result === null) return;

      // בדיקה נוספת אחרי ה-await — ייתכן שהמצב השתנה בינתיים
      if (!sessionRef.current || pausedRef.current) return;

      const currentScore = parseFloat(result.toFixed(3));
      setScore(currentScore);

      const currentPos = playerRef.current?.getCurrentTime?.() ?? positionRef.current;
      positionRef.current = currentPos;

      setReadings(prev => [...prev, { position: currentPos, score: currentScore, created_at: new Date().toISOString() }]);
      await addReading(sessionRef.current.id, currentPos, currentScore);

      if (currentScore < LOW_FOCUS_THRESHOLD) {
        const now = Date.now();
        if (!lowFocusSinceRef.current) {
          lowFocusSinceRef.current = now;
          lowFocusStartRef.current = currentPos;
          return;
        }
        if (now - lowFocusSinceRef.current < 10000) return;

        // 10 שניות ברצף — מפעילים שאלה
        lowFocusSinceRef.current = null;
        setAlertCount(c => c + 1);

        const unasked = questionsRef.current.filter(q => !askedQuestionsRef.current.has(q.time));
        if (unasked.length === 0) askedQuestionsRef.current.clear();
        const available = unasked.length > 0 ? unasked : questionsRef.current;
        const q = getQuestionForPosition(available, currentPos);

        if (!q) {
          handleNoQuestion();
          return;
        }
        askedQuestionsRef.current.add(q.time);
        pausedRef.current = true;
        sendPlayerCommand("pauseVideo");
        updateBanner("low-focus");
        setActiveQuestion(q);
      } else {
        lowFocusSinceRef.current = null;
        if (bannerRef.current === "low-focus") updateBanner(null);
      }
    } finally {
      isInferringRef.current = false;
    }
  };

  const handleNoQuestion = () => {
    const rewindTo = Math.max(0, positionRef.current - 10);
    sendPlayerCommand("seekTo", [rewindTo, true]);
    sendPlayerCommand("playVideo");
    pausedRef.current = false;
    updateBanner(null);
  };

  const handleCorrectAnswer = () => {
    setActiveQuestion(null);
    pausedRef.current = false;
    updateBanner(null);
    sendPlayerCommand("playVideo");
    setAlertMsg({ message: "תשובה נכונה! ממשיכים.", type: "success" });
    setTimeout(() => setAlertMsg({ message: "", type: "success" }), 2500);
  };

  const handleWrongAnswer = () => {
    setActiveQuestion(null);
    pausedRef.current = false;
    updateBanner(null);
    const rewindTo = Math.max(0, lowFocusStartRef.current);
    sendPlayerCommand("seekTo", [rewindTo, true]);
    sendPlayerCommand("playVideo");
    setAlertMsg({ message: "חוזרים לנקודה שבה ירד הקשב.", type: "error" });
    setTimeout(() => setAlertMsg({ message: "", type: "error" }), 3000);
  };

  const handleRewindToMissed = () => {
    setActiveQuestion(null); // סוגר גם את המודל אם פתוח
    pausedRef.current = false;
    updateBanner(null);
    const rewindTo = Math.max(0, lowFocusStartRef.current);
    sendPlayerCommand("seekTo", [rewindTo, true]);
    sendPlayerCommand("playVideo");
  };

  const handleEndSession = async () => {
    stopCamera();
    if (sessionRef.current) {
      await endSession(sessionRef.current.id);
      sessionRef.current = { ...sessionRef.current, ended_at: true };
    }
    navigate("/history");
  };

  // useMemo — מחושב רק כשה-readings משתנים, לא בכל render
  const avgScore = useMemo(() =>
    readings.length ? readings.reduce((sum, r) => sum + r.score, 0) / readings.length : null,
    [readings]
  );

  const cls = scoreClass(score);
  const thresholdPct = LOW_FOCUS_THRESHOLD * 100;

  if (pageError) return (
    <div className="app-shell" style={{ display: "block" }}>
      <div className="page-container"><p className="error-text">{pageError}</p></div>
    </div>
  );
  if (!content) return <div className="loading">טוען...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg)" }}>
      <QuizModal question={activeQuestion} onCorrect={handleCorrectAnswer} onWrong={handleWrongAnswer} />

      {/* Top bar */}
      <div className="viewer-top-bar">
        <div style={{ flex: 1, minWidth: 0 }}>
          <nav className="breadcrumb" style={{ marginBottom: 3 }}>
            <Link to="/library">הספרייה שלי</Link>
            <span className="breadcrumb-sep">/</span>
            <span>{content.title}</span>
          </nav>
          <div className="viewer-title">{content.title}</div>
        </div>

        {cameraActive && (
          <div className="camera-active-tag">
            <span className="camera-dot" />
            המצלמה פעילה
          </div>
        )}

        {session && (
          <div className="session-timer">{timer}</div>
        )}

        {session && (
          <button className="btn btn-danger btn-sm" onClick={handleEndSession}>
            סיים סשן
          </button>
        )}
      </div>

      {/* Banners */}
      {banner === "low-focus" && (
        <div className="banner banner-low-focus" style={{ margin: "0 36px" }}>
          <div className="banner-text">
            <strong>הקשב ירד בעשר השניות האחרונות</strong>
            אפשר לחזור לקטע שהחמצת או לקחת הפסקה קצרה.
          </div>
          <div className="banner-actions">
            <button className="btn btn-secondary btn-sm" onClick={handleRewindToMissed}>
              חזרה לקטע שהחמצת
            </button>
          </div>
        </div>
      )}

      {banner === "no-face" && (
        <div className="banner banner-no-face" style={{ margin: "0 36px" }}>
          <strong>לא זוהו פנים.</strong>
          ודאי שהפנים מופיעות בתמונה ושיש מספיק אור. המדידה תמשיך אוטומטית.
        </div>
      )}

      {alertMsg.message && (
        <Toast
          message={alertMsg.message}
          type={alertMsg.type}
          onClose={() => setAlertMsg({ message: "", type: "success" })}
          duration={alertMsg.type === "success" ? 2500 : 3000}
        />
      )}

      {/* Body */}
      <div className="viewer-body">
        {/* Content */}
        <div className="viewer-content-col">
          {content.type === "youtube" ? (
            <div id="yt-player" style={{ width: "100%", aspectRatio: "16/9", borderRadius: 4, overflow: "hidden", background: "#000" }} />
          ) : (
            <div className="panel" style={{ lineHeight: 1.8, whiteSpace: "pre-wrap", maxHeight: 500, overflowY: "auto", fontSize: 15 }}>
              {content.source}
            </div>
          )}

          {/* Session start (overlaid below content if no session) */}
          {!session && (
            <div className="panel session-start-panel">
              <p className="panel-label">סשן חדש</p>
              <p>לחץ על "התחל סשן" כדי למדוד את רמת הקשב שלך בזמן אמת.</p>
              <button className="btn btn-primary" onClick={handleStartSession}>
                התחל סשן
              </button>
            </div>
          )}
        </div>

        {/* Side column */}
        {session && (
          <div className="viewer-side-col">
            {/* Camera panel */}
            <div className="panel camera-panel">
              <p className="panel-label">המצלמה</p>

              {!cameraConsent ? (
                <div className="camera-consent-panel">
                  <p>אפשר את המצלמה כדי למדוד את רמת הקשב. הוידאו לא יוצא מהמכשיר שלך.</p>
                  <div className="camera-consent-actions">
                    <button className="btn btn-primary btn-sm" onClick={handleCameraConsent}>
                      אפשר מצלמה
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setCameraConsent("skip")}>
                      דלג
                    </button>
                  </div>
                </div>
              ) : cameraConsent === "skip" ? (
                <div>
                  <p style={{ fontSize: 13, color: "var(--muted)" }}>
                    צופה ללא מדידת קשב.{" "}
                    <button onClick={handleCameraConsent} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 13 }}>
                      אפשר מצלמה
                    </button>
                  </p>
                </div>
              ) : (
                <>
                  <video ref={videoRef} muted playsInline style={{ width: "100%", display: "block", borderRadius: 4, background: "#000" }} />
                  {!facesDetected && cameraActive && (
                    <p style={{ fontSize: 12, color: "var(--none)", marginTop: 6 }}>לא זוהו פנים</p>
                  )}
                  {cameraError && <p className="error-text" style={{ marginTop: 6 }}>{cameraError}</p>}
                </>
              )}
            </div>

            {/* Focus score panel */}
            <div className="panel score-panel">
              <p className="panel-label">רמת הקשב</p>

              {score !== null ? (
                <>
                  <div className={`score-number ${cls}`}>
                    {(score * 100).toFixed(0)}
                    <span style={{ fontSize: 20, fontWeight: 400, color: "var(--muted)", marginRight: 2 }}>%</span>
                  </div>
                  <div className="score-label-text">{scoreLabel(score, facesDetected)}</div>

                  {/* Scale */}
                  <div style={{ marginTop: 14, position: "relative" }}>
                    <div className="score-scale">
                      <div
                        className={`score-scale-fill ${cls}`}
                        style={{ width: `${Math.min(score * 100, 100)}%` }}
                      />
                      <div
                        className="score-scale-threshold"
                        style={{ right: `${thresholdPct}%` }}
                      />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11, color: "var(--muted)" }}>
                      <span>0</span>
                      <span style={{ color: "var(--low)", position: "absolute", right: `${thresholdPct}%`, transform: "translateX(50%)", marginTop: 10 }}>
                        סף 0.4
                      </span>
                      <span>1</span>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ color: "var(--muted)", fontSize: 13 }}>
                  {!modelReady ? "טוען מודל..." : !cameraConsent ? "הפעל מצלמה למדידה" : "מחשב... (~10 שניות)"}
                </div>
              )}

              {/* Stats */}
              <div className="score-stats">
                <div className="stat-item">
                  <span className="stat-label">ממוצע בסשן</span>
                  <span className="stat-value">
                    {avgScore !== null ? `${(avgScore * 100).toFixed(0)}%` : "—"}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">התראות</span>
                  <span className="stat-value">{alertCount}</span>
                </div>
              </div>

              {loadingQuestions && (
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>מכין שאלות...</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Focus graph (shown when session active + readings exist) */}
      {session && readings.length > 1 && (
        <FocusGraph readings={readings} threshold={LOW_FOCUS_THRESHOLD} />
      )}
    </div>
  );
}

/* ── Inline SVG focus graph — memo מונע re-render מיותר ───── */
const FocusGraph = memo(function FocusGraph({ readings, threshold }) {
  const W = 800, H = 100;
  const pad = { t: 10, b: 20, l: 30, r: 10 };
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
    <div className="panel focus-graph-panel">
      <p className="panel-label">קשב לאורך הסשן</p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="focus-graph-canvas"
        style={{ direction: "ltr" }}
        preserveAspectRatio="none"
      >
        {/* threshold shade */}
        <rect
          x={pad.l} y={thY}
          width={iW} height={pad.t + iH - thY}
          fill="rgba(194,65,12,0.06)"
        />
        {/* threshold dashed line */}
        <line
          x1={pad.l} y1={thY} x2={pad.l + iW} y2={thY}
          stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3"
        />
        {/* score line */}
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
        {/* low-focus dots */}
        {pts.filter(p => p.low).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#f59e0b" />
        ))}
        {/* Y axis labels */}
        <text x={pad.l - 4} y={pad.t + 4} fontSize="9" fill="var(--muted)" textAnchor="end">1</text>
        <text x={pad.l - 4} y={pad.t + iH + 4} fontSize="9" fill="var(--muted)" textAnchor="end">0</text>
      </svg>
      <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 20, height: 2, background: "var(--accent)", display: "inline-block" }} />
          ציון קשב
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 20, height: 2, background: "#f59e0b", display: "inline-block", borderTop: "1px dashed #f59e0b" }} />
          סף התראה
        </span>
      </div>
    </div>
  );
})
