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

  const [content, setContent] = useState(null);
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [score, setScore] = useState(null);
  const [pageError, setPageError] = useState("");
  const [cameraConsent, setCameraConsent] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [alert, setAlert] = useState("");

  const { videoRef, ready: cameraReady, active: cameraActive, facesDetected, error: cameraError, startCamera, stopCamera } = useCamera();
  const { ready: modelReady, runInference } = useModel();

  const sessionRef = useRef(null);
  const positionRef = useRef(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    getMe().then((r) => setUser(r.data));
    getContent(id)
      .then((r) => setContent(r.data))
      .catch(() => setPageError("Content not found"));
  }, [id]);

  // track youtube position
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.event === "infoDelivery" && e.data?.info?.currentTime != null) {
        positionRef.current = e.data.info.currentTime;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const getVideoId = (url) => {
    const match = url?.match(/(?:v=|youtu\.be\/)([^&?/]+)/);
    return match?.[1] ?? null;
  };

  const getYouTubeEmbedUrl = (url) => {
    const vid = getVideoId(url);
    return vid ? `https://www.youtube.com/embed/${vid}?enablejsapi=1` : null;
  };

  const sendPlayerCommand = (func, args = []) => {
    playerRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args }), "*"
    );
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
      pausedRef.current = true;
      sendPlayerCommand("pauseVideo");

      const q = getQuestionForPosition(questions, positionRef.current);
      if (q) {
        setActiveQuestion(q);
      } else {
        // no questions available → just rewind
        handleNoQuestion();
      }
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
    const rewindTo = Math.max(0, positionRef.current - 10);
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
              <iframe
                ref={playerRef}
                src={getYouTubeEmbedUrl(content.source)}
                title={content.title}
                allowFullScreen
                className="youtube-embed"
              />
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
