// panel.js — Side Panel (per-tab isolated)

const IS_DEV = !("update_url" in chrome.runtime.getManifest());
const API = IS_DEV
  ? "http://localhost:8000"
  : "https://focusflow-backend-487393220084.me-west1.run.app";

const LOW_FOCUS_THRESHOLD = 0.4;
const FRAME_RATE = 10;
const WINDOW_SIZE = 100;
const SLIDE_EVERY = 10;
const LOW_FOCUS_SECONDS = 10;

// ── State ─────────────────────────────────────────────────
let token = null;
let user = null;
let sessionId = null;
let sessionActive = false;
let boundTabId = null; // הטאב שאליו הפאנל הזה שייך

let landmarker = null;
let videoStream = null;
let intervalId = null;
let frameBuffer = [];
let newFrames = 0;
let ortFast = null;
let ortDeep = null;
let modelsReady = false;
let isInferring = false;
let questionPending = false;

let readings = [];
let alertCount = 0;
let lowFocusSince = null;
let lowDropTimestamp = null;
let startTime = null;
let timerInterval = null;

// מידע התוכן הנוכחי — נשמר בתחילת סשן לשימוש ב-Gemini
let currentContentId = null;    // content_id בספרייה (אם נשמר)
let currentContentTitle = "";
let currentTranscript = null;   // list | null — ל-YouTube
let currentContentText = null;  // string | null — למאמר טקסט

// ── DOM ───────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showView(name) {
  ["view-login", "view-main", "view-session", "view-conflict"].forEach(id => {
    const el = $(id);
    if (el) el.classList.add("hidden");
  });
  const target = $(`view-${name}`);
  if (target) target.classList.remove("hidden");
}

// ── API ───────────────────────────────────────────────────
async function apiCall(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────
async function tryLogin(email, password) {
  const data = await apiCall("POST", "/api/auth/login", { email, password });
  token = data.access_token;
  user = await apiCall("GET", "/api/users/me");
  await chrome.storage.local.set({ token, user });
}

async function doLogout() {
  try { await apiCall("POST", "/api/auth/logout"); } catch {}
  token = null;
  user = null;
  await chrome.storage.local.set({ token: null, user: null, activeSession: null });
  showView("login");
}

// ── Tab helpers ───────────────────────────────────────────
async function sendToTab(tabId, msg) {
  try { return await chrome.tabs.sendMessage(tabId, msg); } catch { return null; }
}

// ── Transcript fetch ──────────────────────────────────────
// בעדיפות שולף מ-ytInitialPlayerResponse (יותר אמין),
// fallback ל-/api/timedtext
async function fetchTranscriptFromPage() {
  if (!boundTabId) return null;
  const ctx = await sendToTab(boundTabId, { type: "GET_VIDEO_CONTEXT" });
  return ctx?.transcript || null;
}

// ── Gemini questions ──────────────────────────────────────
async function fetchQuestions(videoId, title, transcript) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${API}/api/gemini/questions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        // שמות שדות תואמים ל-backend: video_id, title, transcript (list | null)
        body: JSON.stringify({
          video_id: videoId,
          title: title || "",
          transcript: transcript || null,
        }),
        signal: AbortSignal.timeout(90000),
      });
      if (res.ok) {
        const qs = await res.json();
        console.log(`[FocusFlow] Gemini returned ${qs.length} questions`);
        return qs;
      }
      const errText = await res.text().catch(() => "");
      console.warn(`[FocusFlow] Gemini HTTP ${res.status}:`, errText);
      if (res.status === 503 && attempt < 3) {
        await new Promise(r => setTimeout(r, 2000 * attempt));
        continue;
      }
      return [];
    } catch (e) {
      console.warn(`[FocusFlow] Gemini attempt ${attempt} failed:`, e.message);
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  return [];
}

// ── Library: שמור תוכן ומנע כפילויות ────────────────────
async function ensureContentInLibrary(ctx) {
  if (!ctx?.type || !ctx.title?.trim()) return null;
  if (!ctx.url || ctx.url.startsWith("chrome://") || ctx.url.startsWith("about:")) return null;

  // דלג על שמירה לספרייה עבור דפי localhost / 127.0.0.1
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?[/]?/i.test(ctx.url)) return null;

  // PDF — שלח ל-endpoint ייעודי שמחלץ טקסט בשרת
  if (ctx.isPdf) {
    return uploadPdfToLibrary(ctx.url, ctx.title);
  }

  try {
    // שלוף ספרייה קיימת
    const existing = await apiCall("GET", "/api/content");
    const items = Array.isArray(existing) ? existing : [];

    // בדוק כפילות לפי url / videoId / title
    const duplicate = items.find(item => {
      if (ctx.type === "youtube") {
        return item.source?.includes(ctx.videoId) || item.source === ctx.url;
      }
      // text — לפי כותרת
      return item.title === ctx.title && item.type === "text";
    });

    if (duplicate) {
      console.log("[FocusFlow Panel] content already in library:", duplicate.id);
      return duplicate.id;
    }

    // שמור
    const body = ctx.type === "youtube"
      ? { type: "youtube", title: ctx.title, source: ctx.url }
      : { type: "text",    title: ctx.title, source: ctx.contentText?.slice(0, 5000) || ctx.url };

    const created = await apiCall("POST", "/api/content", body);
    console.log("[FocusFlow Panel] saved to library:", created.id, ctx.title);
    return created.id;
  } catch (err) {
    console.warn("[FocusFlow Panel] library save failed (non-blocking):", err.message);
    return null;
  }
}

// ── PDF: שלח URL לשרת לצורך הורדה וחילוץ טקסט ──────────
async function uploadPdfToLibrary(pdfUrl, title) {
  try {
    const res = await fetch(`${API}/api/content/upload-pdf-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url: pdfUrl, title }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();
    console.log("[FocusFlow Panel] PDF saved to library:", data.id, title);

    // שמור את הטקסט שחולץ ב-state הסשן
    currentContentText = data.content || null;
    return data.id;
  } catch (err) {
    console.warn("[FocusFlow Panel] PDF upload failed (non-blocking):", err.message);
    return null;
  }
}
async function loadMediaPipe() {
  const { FaceLandmarker, FilesetResolver } = await import(
    chrome.runtime.getURL("lib/vision_bundle.mjs")
  );
  const vision = await FilesetResolver.forVisionTasks(
    chrome.runtime.getURL("lib/wasm")
  );
  landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
  });
}

// ── ONNX ──────────────────────────────────────────────────
async function loadModels() {
  ort.env.wasm.wasmPaths = chrome.runtime.getURL("lib/");
  ort.env.wasm.numThreads = 1;
  const base = chrome.runtime.getURL("models/");
  ortFast = await ort.InferenceSession.create(`${base}v1.onnx`, { executionProviders: ["wasm"] });
  ortDeep  = await ort.InferenceSession.create(`${base}v4_2.onnx`, { executionProviders: ["wasm"] });
  modelsReady = true;
}

async function runInference(frames) {
  if (!modelsReady) return null;
  const flat = new Float32Array(100 * 478 * 3);
  for (let i = 0; i < 100; i++) flat.set(frames[i], i * 478 * 3);
  const run = async (session) => {
    const name = session.inputNames[0];
    const tensor = new ort.Tensor("float32", flat, [1, 100, 478, 3]);
    const out = await session.run({ [name]: tensor });
    return parseFloat(out[session.outputNames[0]].data[0]);
  };
  const fast = await run(ortFast);
  if (fast < 0.5) return await run(ortDeep);
  return fast;
}

// ── Camera ────────────────────────────────────────────────
async function startCamera() {
  const video = $("camera-video");
  videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = videoStream;
  await video.play();

  intervalId = setInterval(() => {
    if (!video || !landmarker || video.readyState < 2) return;
    const result = landmarker.detectForVideo(video, performance.now());
    const lm = result.faceLandmarks?.[0];
    const overlay = $("no-face-overlay");
    if (!lm || lm.length === 0) { overlay?.classList.remove("hidden"); return; }
    overlay?.classList.add("hidden");
    const flat = new Float32Array(478 * 3);
    for (let i = 0; i < 478; i++) {
      flat[i * 3]     = lm[i].x;
      flat[i * 3 + 1] = lm[i].y;
      flat[i * 3 + 2] = lm[i].z;
    }
    frameBuffer.push(flat);
    if (frameBuffer.length > WINDOW_SIZE) frameBuffer.shift();
    newFrames++;
    if (newFrames >= SLIDE_EVERY && frameBuffer.length === WINDOW_SIZE) {
      newFrames = 0;
      handleFrameWindow([...frameBuffer]);
    }
  }, 1000 / FRAME_RATE);
}

function stopCamera() {
  clearInterval(intervalId);
  intervalId = null;
  if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
  frameBuffer = [];
  newFrames = 0;
}

// ── Inference loop ────────────────────────────────────────
async function handleFrameWindow(frames) {
  if (!sessionActive || isInferring || questionPending) return;
  isInferring = true;
  try {
    const score = await runInference(frames);
    if (score === null) return;
    const rounded = parseFloat(score.toFixed(3));
    readings.push(rounded);

    // עדכן activeSession ב-storage
    const stored = await chrome.storage.local.get("activeSession");
    if (stored.activeSession?.tabId === boundTabId) {
      await chrome.storage.local.set({
        activeSession: {
          ...stored.activeSession,
          scores: readings.slice(-200),
          alertsCount: alertCount,
        },
      });
    }

    const position = (Date.now() - startTime) / 1000;
    apiCall("POST", `/api/sessions/${sessionId}/readings`, { position, score: rounded }).catch(() => {});
    updateScoreUI(rounded);
    await checkLowFocus(rounded);
  } finally {
    isInferring = false;
  }
}

// ── UI helpers ────────────────────────────────────────────
function scoreClass(s) {
  if (s == null) return "none";
  if (s >= 0.7) return "good";
  if (s >= 0.4) return "mid";
  return "low";
}
function scoreLabel(s) {
  if (s == null) return "ממתין...";
  if (s >= 0.7) return "קשוב";
  if (s >= 0.4) return "קשב בינוני";
  return "קשב נמוך";
}
function formatTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function updateScoreUI(score) {
  const cls = scoreClass(score);
  const numEl = $("score-value");
  if (numEl) { numEl.textContent = `${(score * 100).toFixed(0)}%`; numEl.className = `score-number ${cls}`; }
  const labelEl = $("score-label");
  if (labelEl) labelEl.textContent = scoreLabel(score);
  const fillEl = $("score-bar-fill");
  if (fillEl) { fillEl.style.width = `${Math.min(score * 100, 100)}%`; fillEl.className = `score-bar-fill ${cls}`; }
  if (readings.length) {
    const avg = readings.reduce((a, b) => a + b, 0) / readings.length;
    const avgEl = $("stat-avg");
    if (avgEl) avgEl.textContent = `${(avg * 100).toFixed(0)}%`;
  }
  // עדכן גרף
  updateChart();
}

// ── Attention chart (canvas) ──────────────────────────────
function drawChart(scores) {
  const canvas = document.getElementById("attention-chart");
  if (!canvas) return;

  // קבע גודל פיזי לפי רוחב הelement
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const W = rect.width || canvas.offsetWidth || 240;
  const H = 80;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const PAD = { t: 6, b: 14, l: 22, r: 6 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;
  const THRESH = 0.4;
  const thY = PAD.t + (1 - THRESH) * iH;

  // ── Threshold shade ──
  ctx.fillStyle = "rgba(194,65,12,0.06)";
  ctx.fillRect(PAD.l, thY, iW, PAD.t + iH - thY);

  // ── Threshold dashed line ──
  ctx.save();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.l, thY);
  ctx.lineTo(PAD.l + iW, thY);
  ctx.stroke();
  ctx.restore();

  // ── Y axis labels ──
  ctx.fillStyle = "#5a6b79";
  ctx.font = "8px Heebo, system-ui";
  ctx.textAlign = "right";
  ctx.fillText("1", PAD.l - 3, PAD.t + 5);
  ctx.fillText("0", PAD.l - 3, PAD.t + iH + 4);
  ctx.fillStyle = "#f59e0b";
  ctx.fillText(".4", PAD.l - 3, thY + 3);

  if (scores.length < 2) return;

  // ── Score line ──
  ctx.beginPath();
  scores.forEach((s, i) => {
    const x = PAD.l + (i / (scores.length - 1)) * iW;
    const y = PAD.t + (1 - Math.min(1, Math.max(0, s))) * iH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#0b7285";
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.setLineDash([]);
  ctx.stroke();

  // ── Low-focus dots ──
  scores.forEach((s, i) => {
    if (s < THRESH) {
      const x = PAD.l + (i / (scores.length - 1)) * iW;
      const y = PAD.t + (1 - s) * iH;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#f59e0b";
      ctx.fill();
    }
  });
}

function updateChart() {
  const wrap = document.getElementById("chart-wrap");
  if (!wrap) return;
  if (readings.length >= 2) {
    wrap.classList.remove("hidden");
    drawChart(readings);
  }
}
async function checkLowFocus(score) {
  if (score < LOW_FOCUS_THRESHOLD) {
    if (!lowFocusSince) {
      lowFocusSince = Date.now();
      // שמור נקודת ירידה
      if (boundTabId) {
        const pos = await sendToTab(boundTabId, { type: "SAVE_DROP_POSITION" });
        if (pos?.videoTime !== undefined) lowDropTimestamp = pos.videoTime;
      }
      return;
    }
    if (Date.now() - lowFocusSince < LOW_FOCUS_SECONDS * 1000) return;

    // 10 שניות ברצף
    lowFocusSince = null;
    questionPending = true;
    alertCount++;
    const alertEl = $("stat-alerts");
    if (alertEl) alertEl.textContent = alertCount;
    $("low-focus-banner")?.classList.remove("hidden");
    setTimeout(() => $("low-focus-banner")?.classList.add("hidden"), 6000);

    await triggerQuestion();
    questionPending = false;
  } else {
    lowFocusSince = null;
  }
}

async function triggerQuestion() {
  if (!boundTabId) return;

  // שלוף context מהדף הפעיל (לצורך videoId עדכני)
  const ctx = await sendToTab(boundTabId, { type: "GET_PAGE_CONTEXT" });
  console.log("[FocusFlow Panel] video context:", ctx);

  let question = null;
  let usedFallback = false;

  // השתמש ב-transcript / contentText שנשמר בתחילת הסשן
  const transcript = currentTranscript || ctx?.transcript || null;
  const contentText = currentContentText || ctx?.contentText || null;
  const title = currentContentTitle || ctx?.title || "";

  if (ctx?.isYouTube && ctx.videoId) {
    // YouTube — שלח videoId + title + transcript
    try {
      const questions = await fetchQuestions(ctx.videoId, title, transcript);
      console.log("[FocusFlow Panel] questions from Gemini:", questions);
      if (questions?.length) {
        const pos = lowDropTimestamp ?? 0;
        question = questions.reduce((best, q) =>
          Math.abs(q.time - pos) < Math.abs(best.time - pos) ? q : best
        );
      } else {
        console.info("[FocusFlow Panel] Gemini returned empty — using fallback");
        usedFallback = true;
      }
    } catch (e) {
      console.warn("[FocusFlow Panel] fetchQuestions failed:", e.message, "— using fallback");
      usedFallback = true;
    }
  } else if (ctx?.type === "text" && (contentText || title)) {
    // מאמר טקסט / PDF — שלח את הטקסט ישירות כ-content
    try {
      const res = await fetch(`${API}/api/gemini/questions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          content: contentText ? contentText.slice(0, 12000) : null,
        }),
        signal: AbortSignal.timeout(90000),
      });
      const questions = res.ok ? await res.json() : [];
      console.log("[FocusFlow Panel] text questions from Gemini:", questions);
      if (questions?.length) {
        question = questions[0];
      } else {
        usedFallback = true;
      }
    } catch (e) {
      console.warn("[FocusFlow Panel] text fetchQuestions failed:", e.message);
      usedFallback = true;
    }
  } else {
    usedFallback = true;
  }

  if (!question) {
    if (usedFallback) console.info("[FocusFlow Panel] showing fallback question");
    question = {
      question: "האם היית קשוב לתוכן עד כה?",
      options: ["כן, הייתי מרוכז", "לא ממש", "חלקית", "לא בטוח"],
      correct: 0,
    };
  }

  // ודא שהשאלה תקינה לפני שליחה
  const safeQuestion = {
    question: String(question.question || "האם היית קשוב?"),
    options: Array.isArray(question.options) && question.options.length >= 2
      ? question.options.slice(0, 4).map(String)
      : ["כן", "לא", "חלקית", "לא בטוח"],
    correct: typeof question.correct === "number" ? question.correct : 0,
  };

  console.log("[FocusFlow Panel] sending question to content.js:", safeQuestion);

  // נסה להזריק modal לדף; אם הדפדפן חסם (PDF / דף מוגן) — הצג ב-side panel
  try {
    const result = await chrome.tabs.sendMessage(boundTabId, {
      type: "SHOW_COMPREHENSION_MODAL",
      question: safeQuestion,
      dropTimestamp: lowDropTimestamp,
    });
    if (!result?.ok) throw new Error("content script returned ok:false");
  } catch (injectionErr) {
    console.warn("[FocusFlow Panel] modal injection blocked, showing in side panel:", injectionErr.message);
    showInPanelQuestion(safeQuestion);
  }
}

// ── Fallback: הצג שאלת הבנה ישירות ב-side panel ───────────
function showInPanelQuestion(safeQuestion) {
  // הסר שאלה קיימת
  document.getElementById("panel-question-overlay")?.remove();

  const letters = ["א", "ב", "ג", "ד"];
  const overlay = document.createElement("div");
  overlay.id = "panel-question-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    background: "rgba(0,0,0,0.65)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "99999",
    direction: "rtl",
    fontFamily: "'Heebo', 'Segoe UI', Arial, sans-serif",
  });

  const card = document.createElement("div");
  Object.assign(card.style, {
    background: "#fff",
    borderRadius: "10px",
    padding: "24px 20px",
    maxWidth: "360px",
    width: "90%",
    color: "#14202b",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  });

  const label = document.createElement("div");
  label.textContent = "בדיקת ריכוז";
  Object.assign(label.style, { fontSize: "11px", fontWeight: "700", color: "#0b7285", letterSpacing: "1.5px", marginBottom: "10px" });

  const questionEl = document.createElement("div");
  questionEl.textContent = safeQuestion.question;
  Object.assign(questionEl.style, { fontSize: "15px", fontWeight: "600", lineHeight: "1.6", marginBottom: "16px" });

  const optionsEl = document.createElement("div");
  Object.assign(optionsEl.style, { display: "flex", flexDirection: "column", gap: "8px" });

  const feedbackEl = document.createElement("div");
  Object.assign(feedbackEl.style, { marginTop: "12px", padding: "10px 14px", borderRadius: "6px", fontSize: "13px", fontWeight: "600", display: "none" });

  safeQuestion.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    Object.assign(btn.style, {
      display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px",
      background: "#f4f6f8", border: "1px solid #c9d2d9", borderRadius: "6px",
      cursor: "pointer", fontSize: "13px", fontFamily: "inherit", color: "#14202b",
      textAlign: "right", width: "100%",
    });

    const letterSpan = document.createElement("span");
    letterSpan.textContent = letters[i] || String(i + 1);
    Object.assign(letterSpan.style, {
      minWidth: "26px", height: "26px", flexShrink: "0",
      background: "#fff", border: "1px solid #c9d2d9", borderRadius: "4px",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: "700", fontSize: "12px", color: "#5a6b79",
    });

    const textSpan = document.createElement("span");
    textSpan.textContent = opt;

    btn.appendChild(letterSpan);
    btn.appendChild(textSpan);

    btn.addEventListener("click", () => {
      card.querySelectorAll("button").forEach(b => { b.disabled = true; });

      const correct = i === safeQuestion.correct;
      feedbackEl.textContent = correct ? "✓ תשובה נכונה! ממשיכים." : "✗ לא נכון. נסה להתרכז יותר.";
      Object.assign(feedbackEl.style, {
        display: "block",
        background: correct ? "#edf7f2" : "#fdf0ed",
        color: correct ? "#1d7f55" : "#c2410c",
        border: `1px solid ${correct ? "#a8d9be" : "#e5bab0"}`,
      });

      setTimeout(() => {
        overlay.remove();
        questionPending = false;
        lowFocusSince = null;
        chrome.runtime.sendMessage({ type: "ANSWER_RESULT", correct });
      }, correct ? 1200 : 1800);
    });

    optionsEl.appendChild(btn);
  });

  card.appendChild(label);
  card.appendChild(questionEl);
  card.appendChild(optionsEl);
  card.appendChild(feedbackEl);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

// ── Session ────────────────────────────────────────────────
async function startSession() {
  // 1. שלוף context מהדף
  let ctx = null;
  try {
    ctx = await sendToTab(boundTabId, { type: "GET_PAGE_CONTEXT" });
    console.log("[FocusFlow Panel] page context for session:", ctx?.type, ctx?.title?.slice(0, 40));
  } catch (e) {
    console.warn("[FocusFlow Panel] could not get page context:", e.message);
  }

  // 2. שמור תוכן בספרייה (non-blocking)
  currentContentId = null;
  currentContentTitle = ctx?.title || "";
  currentTranscript = ctx?.transcript || null;
  currentContentText = ctx?.contentText || null;

  // דלג על שמירה לספרייה עבור דפי localhost / 127.0.0.1
  let tabUrlForCheck = ctx?.url || "";
  if (!tabUrlForCheck) {
    try { const tab = await chrome.tabs.get(boundTabId); tabUrlForCheck = tab.url || ""; } catch {}
  }
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?[/]?/i.test(tabUrlForCheck);

  if (!isLocalhost) {
    // אם content.js לא הוזרק (PDF מובנה של כרום) — בדוק את כתובת הלשונית ישירות
    if (!ctx?.type) {
      try {
        const tab = await chrome.tabs.get(boundTabId);
        const tabUrl = tab.url || "";
        const isPdfTab = /\.pdf(\?|#|$)/i.test(tabUrl);
        if (isPdfTab) {
          const rawName = tabUrl.split("?")[0].split("/").pop() || "";
          const pdfTitle = decodeURIComponent(rawName.replace(/\.pdf$/i, "")).trim() || tab.title || "PDF Document";
          console.log("[FocusFlow Panel] PDF tab detected via tab.url, uploading:", pdfTitle);
          currentContentTitle = pdfTitle;
          currentContentId = await uploadPdfToLibrary(tabUrl, pdfTitle);
        }
      } catch (tabErr) {
        console.warn("[FocusFlow Panel] tab.url PDF fallback failed:", tabErr.message);
      }
    } else if (ctx.type) {
      currentContentId = await ensureContentInLibrary(ctx);
    }
  } else {
    console.log("[FocusFlow Panel] localhost tab — skipping library save");
  }

  // 3. פתח סשן — עם content_id אם יש, אחרת free
  let data;
  if (currentContentId) {
    data = await apiCall("POST", "/api/sessions", { content_id: currentContentId });
  } else {
    const sourceUrl = ctx?.url || null;
    data = await apiCall("POST", "/api/sessions/free", { source_url: sourceUrl });
  }

  sessionId = data.id;
  sessionActive = true;
  startTime = Date.now();
  readings = [];
  alertCount = 0;
  lowFocusSince = null;
  questionPending = false;

  let tabTitle = currentContentTitle;
  if (!tabTitle) {
    try { const tab = await chrome.tabs.get(boundTabId); tabTitle = tab.title || ""; } catch {}
  }

  await chrome.storage.local.set({
    activeSession: {
      sessionId,
      tabId: boundTabId,
      tabTitle,
      startTime,
      alertsCount: 0,
      scores: [],
      contentId: currentContentId,
      contentTitle: currentContentTitle,
      transcript: currentTranscript,
      contentText: currentContentText,
    },
  });

  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const el = $("stat-timer");
    if (el) el.textContent = formatTime(elapsed);
  }, 1000);

  showView("session");
  $("camera-consent")?.classList.remove("hidden");
  $("camera-wrap")?.classList.add("hidden");
  $("score-block")?.classList.add("hidden");
  $("stats-row")?.classList.add("hidden");

  try {
    const tab = await chrome.tabs.get(boundTabId);
    const url = new URL(tab.url);
    const el = $("session-domain");
    if (el) el.textContent = url.hostname;
  } catch {}
}

async function stopSession() {
  sessionActive = false;
  stopCamera();
  clearInterval(timerInterval);
  if (sessionId) {
    await apiCall("POST", `/api/sessions/${sessionId}/end`).catch(() => {});
  }
  await chrome.storage.local.set({ activeSession: null });
  sessionId = null;
  showView("main");
}

// ── Conflict view helpers ─────────────────────────────────
function showConflictView(existingSession) {
  const infoEl = $("conflict-info");
  if (infoEl) {
    const title = existingSession.tabTitle || `טאב ${existingSession.tabId}`;
    infoEl.textContent = `"${title.slice(0, 60)}"`;
  }
  showView("conflict");
}

// ── Init ──────────────────────────────────────────────────
async function init() {
  // קבע את boundTabId מהטאב הפעיל הנוכחי
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    boundTabId = tab?.id ?? null;
  } catch {}

  const stored = await chrome.storage.local.get(["token", "user", "activeSession"]);
  token = stored.token || null;
  user = stored.user || null;

  if (!token) { showView("login"); return; }

  // ודא שהטוקן תקין
  try {
    user = await apiCall("GET", "/api/users/me");
    await chrome.storage.local.set({ user });
  } catch {
    token = null;
    await chrome.storage.local.set({ token: null });
    showView("login");
    return;
  }

  // עדכן שם משתמש בכותרת
  const headerUser = $("header-user");
  if (headerUser) headerUser.textContent = user.display_name;
  const userNameEl = $("user-name");
  if (userNameEl) userNameEl.textContent = user.display_name;

  // עדכן domain
  try {
    const tab = await chrome.tabs.get(boundTabId);
    const url = new URL(tab.url);
    const el = $("page-domain");
    if (el) el.textContent = url.hostname;
  } catch {}

  const existing = stored.activeSession;

  if (existing) {
    if (existing.tabId === boundTabId) {
      // ── אותו טאב — חזור לסשן הפעיל ──
      sessionId = existing.sessionId;
      sessionActive = true;
      startTime = existing.startTime || Date.now();
      alertCount = existing.alertsCount || 0;
      readings = existing.scores || [];
      // שחזר מידע תוכן
      currentContentId = existing.contentId || null;
      currentContentTitle = existing.contentTitle || "";
      currentTranscript = existing.transcript || null;
      currentContentText = existing.contentText || null;

      showView("session");
      $("camera-consent")?.classList.remove("hidden");
      $("camera-wrap")?.classList.add("hidden");
      $("score-block")?.classList.add("hidden");
      $("stats-row")?.classList.add("hidden");

      const alertEl = $("stat-alerts");
      if (alertEl) alertEl.textContent = alertCount;

      // שחזר גרף מהיסטוריה שמורה
      if (readings.length >= 2) {
        $("chart-wrap")?.classList.remove("hidden");
        // קצת delay כדי שה-canvas יקבל גודל
        setTimeout(updateChart, 50);
      }

      timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const el = $("stat-timer");
        if (el) el.textContent = formatTime(elapsed);
      }, 1000);

      try {
        const tab = await chrome.tabs.get(boundTabId);
        const url = new URL(tab.url);
        const el = $("session-domain");
        if (el) el.textContent = url.hostname;
      } catch {}
      return;
    } else {
      // ── טאב אחר — הצג מסך conflict ──
      showConflictView(existing);
      return;
    }
  }

  showView("main");
}

// ── Message listener (מה-content.js) ──────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "ANSWER_RESULT") {
    questionPending = false;
    lowFocusSince = null;
  }
});

// ── Event listeners ────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  init();

  // כניסה
  $("btn-login")?.addEventListener("click", async () => {
    const email = $("login-email")?.value.trim();
    const password = $("login-password")?.value;
    const errorEl = $("login-error");
    if (!email || !password) { if (errorEl) errorEl.textContent = "נא למלא אימייל וסיסמה."; return; }
    const btn = $("btn-login");
    btn.disabled = true; btn.textContent = "מתחבר...";
    if (errorEl) errorEl.textContent = "";
    try {
      await tryLogin(email, password);
      $("header-user").textContent = user.display_name;
      $("user-name").textContent = user.display_name;
      try {
        const tab = await chrome.tabs.get(boundTabId);
        const url = new URL(tab.url);
        $("page-domain").textContent = url.hostname;
      } catch {}
      showView("main");
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message || "שגיאה בהתחברות.";
    } finally {
      btn.disabled = false; btn.textContent = "כניסה";
    }
  });

  $("toggle-pw")?.addEventListener("click", () => {
    const input = $("login-password");
    if (input) input.type = input.type === "password" ? "text" : "password";
  });

  $("login-password")?.addEventListener("keydown", e => {
    if (e.key === "Enter") $("btn-login")?.click();
  });

  $("btn-register")?.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://focusflow-frontend-487393220084.me-west1.run.app/register" });
  });

  $("btn-open-site")?.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://focusflow-frontend-487393220084.me-west1.run.app" });
  });

  $("btn-logout")?.addEventListener("click", doLogout);

  // התחל סשן
  $("btn-start")?.addEventListener("click", async () => {
    const btn = $("btn-start");
    btn.disabled = true; btn.textContent = "מתחיל...";
    try {
      await startSession();
    } catch (err) {
      btn.disabled = false; btn.textContent = "התחל מדידת קשב";
      console.error("startSession error:", err);
    }
  });

  // סיים סשן
  $("btn-stop")?.addEventListener("click", stopSession);

  // אפשר מצלמה
  $("btn-enable-camera")?.addEventListener("click", async () => {
    $("camera-consent")?.classList.add("hidden");
    $("camera-wrap")?.classList.remove("hidden");
    const loadingEl = $("loading-models");
    if (loadingEl) loadingEl.style.display = "flex";
    try {
      await Promise.all([loadMediaPipe(), loadModels()]);
      if (loadingEl) loadingEl.style.display = "none";
      await startCamera();
      $("score-block")?.classList.remove("hidden");
      $("stats-row")?.classList.remove("hidden");
    } catch (err) {
      console.error("Camera/model error:", err);
      if (loadingEl) loadingEl.textContent = "שגיאה בטעינה. רענן את הפאנל.";
    }
  });

  // דלג על מצלמה
  $("btn-skip-camera")?.addEventListener("click", () => {
    $("camera-consent")?.classList.add("hidden");
    $("camera-wrap")?.classList.add("hidden");
    $("score-block")?.classList.add("hidden");
    $("stats-row")?.classList.add("hidden");
  });

  // ── Conflict view ──
  // עבור ללשונית הפעילה
  $("btn-go-to-active-tab")?.addEventListener("click", async () => {
    const stored = await chrome.storage.local.get("activeSession");
    const tabId = stored.activeSession?.tabId;
    if (tabId) {
      await chrome.tabs.update(tabId, { active: true });
      window.close();
    }
  });

  // סיים סשן קודם והתחל כאן
  $("btn-end-and-start-here")?.addEventListener("click", async () => {
    const stored = await chrome.storage.local.get(["activeSession", "token"]);
    const existing = stored.activeSession;
    if (existing?.sessionId) {
      try {
        await apiCall("POST", `/api/sessions/${existing.sessionId}/end`);
      } catch {}
    }
    await chrome.storage.local.set({ activeSession: null });
    showView("main");
  });
});
