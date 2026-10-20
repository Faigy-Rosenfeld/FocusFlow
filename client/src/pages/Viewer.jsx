import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import QuizModal from "../components/QuizModal";
import { getContent } from "../api/content";
import { getMe } from "../api/auth";
import { createSession, endSession, addReading } from "../api/sessions";
import { useCamera } from "../hooks/useCamera";
import { useModel } from "../hooks/useModel";
import { fetchQuestions, getQuestionForPosition } from "../api/gemini";

const LOW_FOCUS_THRESHOLD = 0.4;

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
  const [questions, setQuestions] = useState([]);
  const questionsRef = useRef([]);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [alert, setAlert] = useState("");

  const { videoRef, ready: cameraReady, active: cameraActive, facesDetected, error: cameraError, startCamera, stopCamera } = useCamera();
  const { ready: modelReady, runInference } = useModel();

  const sessionRef = useRef(null);
  const positionRef = useRef(0);
  const pausedRef = useRef(false);
  const lowFocusStartRef = useRef(0);

  const getVideoId = (url) => {
    const match = url?.match(/(?:v=|youtu\.be\/)([^&?/]+)/);
    return match?.[1] ?? null;
  };

  useEffect(() => {
    getMe().then((r) => setUser(r.data));
    getContent(id)
      .then((r) => setContent(r.data))
      .catch(() => setPageError("Content not found"));
  }, [id]);

  // load YouTube IFrame API and create player
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
        playerVars: { enablejsapi: 1 },
        events: {
          onReady: (e) => { playerRef.current = e.target; },
        },
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

  const sendPlayerCommand = (func, args = []) => {
    playerRef.current?.[func]?.(...args);
  };

  const handleStartSession = async () => {
    const res = await createSession(id);
    setSession(res.data);
    sessionRef.current = res.data;

    // fetch questions in background
    if (content?.type === "youtube") {
      setLoadingQuestions(true);
      const videoId = getVideoId(content.source);
      const qs = await fetchQuestions(videoId, content.title).catch(() => []);
      setQuestions(qs);
      questionsRef.current = qs;
      setLoadingQuestions(false);
    }
  };

  const handleCameraConsent = async () => {
    setCameraConsent(true);
    await startCamera(handleFrameWindow);
  };

  const handleFrameWindow = async (frames) => {
    if (!sessionRef.current || pausedRef.current) return;

    const result = await runInference(frames);
    if (result === null) return;

    const currentScore = parseFloat(result.toFixed(3));
    setScore(currentScore);
    await addReading(sessionRef.current.id, positionRef.current, currentScore);

    if (currentScore < LOW_FOCUS_THRESHOLD) {
      const pos = playerRef.current?.getCurrentTime?.() ?? positionRef.current;
      positionRef.current = pos;
      const q = getQuestionForPosition(questionsRef.current, pos);
      if (!q) return;
      lowFocusStartRef.current = pos;
      pausedRef.current = true;
      sendPlayerCommand("pauseVideo");
      setActiveQuestion(q);
    }
  };

  const handleNoQuestion = () => {
    const rewindTo = Math.max(0, positionRef.current - 10);
    sendPlayerCommand("seekTo", [rewindTo, true]);
    sendPlayerCommand("playVideo");
    pausedRef.current = false;
    setAlert("Low focus detected! Rewinding 10 seconds...");
    setTimeout(() => setAlert(""), 3000);
  };

  const handleCorrectAnswer = () => {
    setActiveQuestion(null);
    sendPlayerCommand("playVideo");
    pausedRef.current = false;
    setAlert("Correct! Keep going 🎉");
    setTimeout(() => setAlert(""), 2000);
  };

  const handleWrongAnswer = () => {
    setActiveQuestion(null);
    const rewindTo = Math.max(0, lowFocusStartRef.current - 10);
    sendPlayerCommand("seekTo", [rewindTo, true]);
    sendPlayerCommand("playVideo");
    pausedRef.current = false;
    setAlert("Not quite — rewinding to review that section.");
    setTimeout(() => setAlert(""), 3000);
  };

  const handleEndSession = async () => {
    stopCamera();
    if (session) await endSession(session.id);
    navigate("/history");
  };

  const getScoreColor = (s) => s >= 0.7 ? "#4caf50" : s >= 0.4 ? "#ff9800" : "#e05555";
  const getScoreLabel = (s) => s >= 0.7 ? "Focused" : s >= 0.4 ? "Moderate" : "Low Focus";

  if (pageError) return (
    <div>
      <Navbar displayName={user?.display_name} />
      <div className="page-container"><p className="error">{pageError}</p></div>
    </div>
  );

  if (!content) return <div className="loading">Loading...</div>;

  return (
    <div>
      <Navbar displayName={user?.display_name} />

      <QuizModal
        question={activeQuestion}
        onCorrect={handleCorrectAnswer}
        onWrong={handleWrongAnswer}
      />

      <div className="page-container">
        <button onClick={() => navigate("/library")} className="back-btn">← Back to Library</button>
        <h2>{content.title}</h2>

        {alert && <div className={`alert-banner ${alert.startsWith("Correct") ? "alert-success" : ""}`}>{alert}</div>}

        <div className="viewer-layout">
          <div className="content-area">
            {content.type === "youtube" ? (
              <div id="yt-player" style={{ width: "100%", aspectRatio: "16/9" }} />
            ) : (
              <div className="text-content">{content.source}</div>
            )}
          </div>

          <div className="session-panel">
            {!session ? (
              <div className="session-start">
                <h3>Ready to focus?</h3>
                <p>Start a session to measure your focus level in real time.</p>
                <button onClick={handleStartSession} className="btn-primary">Start Session</button>
              </div>
            ) : (
              <div className="session-active">
                <h3>Session Active</h3>

                {loadingQuestions && <p className="score-waiting">Preparing questions...</p>}

                {!cameraConsent ? (
                  <div className="camera-consent">
                    <p>Enable your camera to measure focus. Your video never leaves your device.</p>
                    <button onClick={handleCameraConsent} className="btn-primary">Enable Camera</button>
                    <button onClick={handleEndSession} className="btn-secondary">Continue Without Camera</button>
                  </div>
                ) : (
                  <>
                    <div className="camera-preview">
                      <video ref={videoRef} muted playsInline className="camera-video" />
                      {!facesDetected && cameraActive && (
                        <div className="no-face-overlay">No face detected</div>
                      )}
                    </div>

                    {cameraError && <p className="error">{cameraError}</p>}

                    {score !== null ? (
                      <div className="score-display">
                        <span className="score-label">Focus Score</span>
                        <span className="score-value" style={{ color: getScoreColor(score) }}>
                          {(score * 100).toFixed(0)}%
                        </span>
                        <span className="score-status" style={{ color: getScoreColor(score) }}>
                          {getScoreLabel(score)}
                        </span>
                      </div>
                    ) : (
                      <p className="score-waiting">
                        {!modelReady ? "Loading model..." : "Measuring focus... (~10s)"}
                      </p>
                    )}
                  </>
                )}

                <button onClick={handleEndSession} className="btn-danger">End Session</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
