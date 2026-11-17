// ── קבועים ───────────────────────────────────────────────
const API = "https://focusflow-app.myftp.org";
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

let landmarker = null;
let videoStream = null;
let intervalId = null;
let frameBuffer = [];
let newFrames = 0;
let ortFast = null;
let ortDeep = null;
let modelsReady = false;
let isInferring = false;

let readings = [];
let alertCount = 0;
let lowFocusSince = null;
let startTime = null;
let timerInterval = null;

// ── DOM refs ──────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const viewLogin   = $("view-login");
const viewMain    = $("view-main");
const viewSession = $("view-session");

// ── Utils ─────────────────────────────────────────────────
function showView(name) {
  [viewLogin, viewMain, viewSession].forEach(v => v.classList.add("hidden"));
  if (name === "login")   viewLogin.classList.remove("hidden");
  if (name === "main")    viewMain.classList.remove("hidden");
  if (name === "session") viewSession.classList.remove("hidden");
}

function scoreClass(s) {
  if (s === null || s === undefined) return "none";
  if (s >= 0.7) return "good";
  if (s >= 0.4) return "mid";
  return "low";
}

function scoreLabel(s, faceDetected) {
  if (s === null || s === undefined) return "ממתין...";
  if (!faceDetected) return "אין מדידה";
  if (s >= 0.7) return "קשוב";
  if (s >= 0.4) return "קשב בינוני";
  return "קשב נמוך";
}

function formatTime(seconds) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ── API calls ─────────────────────────────────────────────
async function apiCall(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
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

async function logout() {
  try { await apiCall("POST", "/api/auth/logout"); } catch {}
  token = null;
  user = null;
  await chrome.storage.local.set({ token: null, user: null });
  showView("login");
}

// ── MediaPipe ─────────────────────────────────────────────
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

// ── ONNX models ───────────────────────────────────────────
async function loadModels() {
  // ort נטען כ-script גלובלי ב-popup.html
  ort.env.wasm.wasmPaths = chrome.runtime.getURL("lib/");
  ort.env.wasm.numThreads = 1;

  const baseUrl = chrome.runtime.getURL("models/");
  ortFast = await ort.InferenceSession.create(`${baseUrl}v1.onnx`, {
    executionProviders: ["wasm"],
  });
  ortDeep = await ort.InferenceSession.create(`${baseUrl}v4_2.onnx`, {
    executionProviders: ["wasm"],
  });
  modelsReady = true;
}

async function runInference(frames) {
  if (!modelsReady) return null;

  const flat = new Float32Array(100 * 478 * 3);
  for (let i = 0; i < 100; i++) flat.set(frames[i], i * 478 * 3);

  const runModel = async (session) => {
    const name = session.inputNames[0];
    const tensor = new ort.Tensor("float32", flat, [1, 100, 478, 3]);
    const out = await session.run({ [name]: tensor });
    return parseFloat(out[session.outputNames[0]].data[0]);
  };

  const fast = await runModel(ortFast);
  if (fast < 0.5) {
    const deep = await runModel(ortDeep);
    return deep;
  }
  return fast;
}

// ── Camera + processing ───────────────────────────────────
async function startCamera() {
  const video = $("camera-video");
  videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = videoStream;
  await video.play();

  intervalId = setInterval(() => {
    if (!video || !landmarker) return;
    if (video.readyState < 2) return;

    const result = landmarker.detectForVideo(video, performance.now());
    const lm = result.faceLandmarks?.[0];

    const overlay = $("no-face-overlay");
    if (!lm || lm.length === 0) {
      overlay?.classList.remove("hidden");
      return;
    }
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
  if (videoStream) {
    videoStream.getTracks().forEach(t => t.stop());
    videoStream = null;
  }
  frameBuffer = [];
  newFrames = 0;
}

// ── Frame window handler ───────────────────────────────────
async function handleFrameWindow(frames) {
  if (!sessionActive || isInferring) return;
  isInferring = true;

  try {
    const score = await runInference(frames);
    if (score === null) return;

    const rounded = parseFloat(score.toFixed(3));
    readings.push(rounded);

    // שלח reading לשרת
    const position = (Date.now() - startTime) / 1000;
    apiCall("POST", `/api/sessions/${sessionId}/readings`, {
      position,
      score: rounded,
    }).catch(() => {});

    updateScoreUI(rounded);
    checkLowFocus(rounded, position);
  } finally {
    isInferring = false;
  }
}

// ── UI updates ─────────────────────────────────────────────
function updateScoreUI(score) {
  const cls = scoreClass(score);
  const faceDetected = !$("no-face-overlay")?.classList.contains("hidden")
    ? false
    : true;

  const numEl = $("score-value");
  const labelEl = $("score-label");
  const fillEl = $("score-bar-fill");

  if (numEl) {
    numEl.textContent = `${(score * 100).toFixed(0)}%`;
    numEl.className = `score-number ${cls}`;
  }
  if (labelEl) labelEl.textContent = scoreLabel(score, faceDetected);
  if (fillEl) {
    fillEl.style.width = `${Math.min(score * 100, 100)}%`;
    fillEl.className = `score-bar-fill ${cls}`;
  }

  // ממוצע
  const avg = readings.reduce((s, r) => s + r, 0) / readings.length;
  const avgEl = $("stat-avg");
  if (avgEl) avgEl.textContent = `${(avg * 100).toFixed(0)}%`;
}

function checkLowFocus(score, position) {
  const banner = $("low-focus-banner");
  if (score < LOW_FOCUS_THRESHOLD) {
    if (!lowFocusSince) {
      lowFocusSince = Date.now();
      return;
    }
    if (Date.now() - lowFocusSince < LOW_FOCUS_SECONDS * 1000) return;

    // 10 שניות ברצף — הצג התראה והחזר חלון
    lowFocusSince = null;
    alertCount++;
    const alertEl = $("stat-alerts");
    if (alertEl) alertEl.textContent = alertCount;
    banner?.classList.remove("hidden");
    setTimeout(() => banner?.classList.add("hidden"), 5000);

    // החזר את החלון למסך
    restoreWindow();
  } else {
    lowFocusSince = null;
    banner?.classList.add("hidden");
  }
}

// ── Window management ─────────────────────────────────────
let currentWindowId = null;

async function openSessionWindow() {
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL("popup.html"),
    type: "popup",
    width: 300,
    height: 500,
    focused: true,
  });
  currentWindowId = win.id;
  await chrome.storage.local.set({ windowId: win.id });
}

async function minimizeWindow() {
  if (currentWindowId) {
    chrome.windows.update(currentWindowId, {
      width: 220,
      height: 180,
      left: window.screen.availWidth - 230,
      top: window.screen.availHeight - 190,
      focused: false,
    });
  }
}

async function restoreWindow() {
  if (currentWindowId) {
    chrome.windows.update(currentWindowId, {
      width: 300,
      height: 500,
      left: Math.floor((window.screen.availWidth - 300) / 2),
      top: Math.floor((window.screen.availHeight - 500) / 2),
      focused: true,
    });
  }
}

// אוטומטי — כשעוברים לחלון אחר, מקטין; כשחוזרים, מרחיב
chrome.windows.onFocusChanged.addListener((focusedWindowId) => {
  if (!currentWindowId || !sessionActive) return;
  if (focusedWindowId !== currentWindowId && focusedWindowId !== chrome.windows.WINDOW_ID_NONE) {
    minimizeWindow();
  }
});
async function startSession() {
  const data = await apiCall("POST", "/api/sessions/free", {});
  sessionId = data.id;
  sessionActive = true;
  startTime = Date.now();
  readings = [];
  alertCount = 0;
  lowFocusSince = null;

  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const el = $("stat-timer");
    if (el) el.textContent = formatTime(elapsed);
  }, 1000);

  await chrome.storage.local.set({ sessionId });

  // שמור את ה-windowId הנוכחי
  const wins = await chrome.windows.getCurrent();
  currentWindowId = wins.id;
  await chrome.storage.local.set({ windowId: wins.id });

  showView("session");
  $("camera-consent")?.classList.remove("hidden");
  $("camera-active")?.classList.add("hidden");
}

async function stopSession() {
  sessionActive = false;
  stopCamera();
  clearInterval(timerInterval);

  if (sessionId) {
    await apiCall("POST", `/api/sessions/${sessionId}/end`).catch(() => {});
    sessionId = null;
  }
  await chrome.storage.local.set({ sessionId: null, windowId: null });
  currentWindowId = null;
  showView("main");
}

// ── Init ───────────────────────────────────────────────────
async function init() {
  const stored = await chrome.storage.local.get(["token", "user", "sessionId", "windowId"]);
  token = stored.token || null;
  user = stored.user || null;
  currentWindowId = stored.windowId || null;

  if (!token) {
    showView("login");
    return;
  }

  // בדוק שהטוקן עדיין תקין
  try {
    user = await apiCall("GET", "/api/users/me");
    await chrome.storage.local.set({ user });
  } catch {
    token = null;
    await chrome.storage.local.set({ token: null });
    showView("login");
    return;
  }

  const nameEl = $("user-name");
  if (nameEl) nameEl.textContent = user.display_name;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);
    $("page-domain") && ($("page-domain").textContent = url.hostname);
    $("session-domain") && ($("session-domain").textContent = url.hostname);
  } catch {}

  // אם יש סשן פעיל — חזור לview של הסשן
  if (stored.sessionId) {
    sessionId = stored.sessionId;
    sessionActive = true;
    startTime = Date.now();
    showView("session");
    $("camera-consent")?.classList.remove("hidden");
    $("camera-active")?.classList.add("hidden");
    return;
  }

  showView("main");
}

// ── Event listeners ────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  init();

  // Login
  $("btn-login")?.addEventListener("click", async () => {
    const email = $("login-email")?.value.trim();
    const password = $("login-password")?.value;
    const errorEl = $("login-error");

    if (!email || !password) {
      if (errorEl) errorEl.textContent = "נא למלא אימייל וסיסמה.";
      return;
    }

    const btn = $("btn-login");
    btn.disabled = true;
    btn.textContent = "מתחבר...";
    if (errorEl) errorEl.textContent = "";

    try {
      await tryLogin(email, password);
      const nameEl = $("user-name");
      if (nameEl) nameEl.textContent = user.display_name;

      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const url = new URL(tab.url);
        const domainEl = $("page-domain");
        if (domainEl) domainEl.textContent = url.hostname;
      } catch {}

      showView("main");
    } catch (err) {
      if (errorEl) errorEl.textContent = err.message || "שגיאה בהתחברות.";
    } finally {
      btn.disabled = false;
      btn.textContent = "כניסה";
    }
  });

  // הצג/הסתר סיסמה
  $("toggle-pw")?.addEventListener("click", () => {
    const input = $("login-password");
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
  });

  // כניסה עם Enter
  $("login-password")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("btn-login")?.click();
  });

  // הירשם באתר
  $("btn-register")?.addEventListener("click", () => {
    chrome.tabs.create({
      url: "https://focusflow-frontend-487393220084.me-west1.run.app/register",
    });
  });

  // פתח אתר
  $("btn-open-site")?.addEventListener("click", () => {
    chrome.tabs.create({
      url: "https://focusflow-frontend-487393220084.me-west1.run.app",
    });
  });

  // התנתק
  $("btn-logout")?.addEventListener("click", logout);

  // התחל סשן
  $("btn-start")?.addEventListener("click", async () => {
    const btn = $("btn-start");
    btn.disabled = true;
    btn.textContent = "מתחיל...";
    try {
      await startSession();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "התחל מדידת קשב";
      console.error("Failed to start session:", err);
    }
  });

  // מזער
  $("btn-minimize")?.addEventListener("click", () => {
    minimizeWindow();
  });

  // סיים סשן
  $("btn-stop")?.addEventListener("click", stopSession);

  // אפשר מצלמה
  $("btn-enable-camera")?.addEventListener("click", async () => {
    $("camera-consent")?.classList.add("hidden");
    $("camera-active")?.classList.remove("hidden");
    const loadingEl = document.createElement("p");
    loadingEl.id = "loading-msg";
    loadingEl.style.cssText = "font-size:11px;color:var(--muted);text-align:center;padding:8px";
    loadingEl.textContent = "טוען מודלים... (~10 שניות)";
    $("camera-active")?.appendChild(loadingEl);

    try {
      // בקש הרשאת מצלמה דרך iframe נסתר
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(t => t.stop()); // שחרר מיד, startCamera יבקש שוב

      await Promise.all([loadMediaPipe(), loadModels()]);
      $("loading-msg")?.remove();
      await startCamera();
    } catch (err) {
      $("loading-msg")?.remove();
      if (err.name === "NotAllowedError") {
        // פתח כחלון קטן במקום טאב מלא
        chrome.windows.create({
          url: chrome.runtime.getURL("popup.html"),
          type: "popup",
          width: 300,
          height: 500,
          focused: true
        });
      }
      console.error("Camera/model error:", err);
    }
  });

  // דלג על מצלמה
  $("btn-skip-camera")?.addEventListener("click", () => {
    $("camera-consent")?.classList.add("hidden");
    $("camera-active")?.classList.remove("hidden");
    const p = document.createElement("p");
    p.style.cssText = "font-size:11px;color:var(--muted);text-align:center;padding:8px";
    p.textContent = "צופה ללא מדידת קשב";
    $("camera-active")?.appendChild(p);
  });
});
