// content.js — רץ בתוך הדף
// שליפת context מ-YouTube + הצגת modal שאלות

// ── Page context (unified for all page types) ─────────────
async function getVideoContext() {
  return getPageContext();
}

async function getPageContext() {
  const videoId = new URLSearchParams(window.location.search).get("v");
  const isYouTube = !!videoId && window.location.hostname.includes("youtube.com");

  // ── PDF ──
  const isPdf =
    document.contentType === "application/pdf" ||
    window.location.pathname.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    const rawName = window.location.pathname.split("/").pop() || "";
    const title =
      decodeURIComponent(rawName.replace(/\.pdf$/i, "")).trim() ||
      document.title.trim() ||
      "PDF Document";
    return {
      type: "text",
      isPdf: true,
      isYouTube: false,
      videoId: null,
      url: window.location.href,
      title,
      transcript: null,
      contentText: null, // הטקסט ייחלץ בשרת מה-Blob
    };
  }

  if (isYouTube) {
    // ── YouTube ──
    const title = (
      document.querySelector("h1.ytd-watch-metadata yt-formatted-string")?.innerText?.trim() ||
      document.querySelector("h1.ytd-watch-metadata")?.innerText?.trim() ||
      document.querySelector("h1.title.ytd-video-primary-info-renderer")?.innerText?.trim() ||
      document.title.replace(" - YouTube", "").trim() ||
      ""
    );

    let transcript = null;
    transcript = await fetchTranscriptFromPage(videoId);
    if (!transcript) transcript = await fetchTranscriptFromAPI(videoId);

    return {
      type: "youtube",
      isYouTube: true,
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title,
      transcript,          // list | null — לשימוש ב-Gemini
      contentText: null,   // לא רלוונטי ל-YouTube
    };
  }

  // ── דף טקסט / מאמר ──
  const url = window.location.href;

  // סנן דפי מערכת
  if (url.startsWith("chrome://") || url.startsWith("about:") ||
      url.startsWith("chrome-extension://") || url === "about:newtab") {
    return { type: null, isYouTube: false, url, title: "", contentText: null, transcript: null };
  }

  const title = (
    document.querySelector("h1")?.innerText?.trim() ||
    document.title.trim() ||
    ""
  );

  // שלוף טקסט מרכזי — article → main → body
  const rawText = (
    document.querySelector("article")?.innerText ||
    document.querySelector("main")?.innerText ||
    document.body?.innerText ||
    ""
  );

  // נקה רווחים מיותרים וחתוך ל-8000 תווים (מגבלת Gemini prompt)
  const contentText = rawText
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);

  return {
    type: "text",
    isYouTube: false,
    videoId: null,
    url,
    title,
    transcript: null,
    contentText,
  };
}

// ── שליפה מ-ytInitialPlayerResponse (embedded in page) ───
async function fetchTranscriptFromPage(videoId) {
  try {
    // מצא את ytInitialPlayerResponse בתגיות script
    const scripts = document.querySelectorAll("script");
    let playerResponse = null;

    for (const script of scripts) {
      const text = script.textContent || "";
      const match = text.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});(?:\s*var|\s*window)/s)
        || text.match(/ytInitialPlayerResponse\s*=\s*(\{.+\})/s);
      if (match) {
        try { playerResponse = JSON.parse(match[1]); break; } catch {}
      }
    }

    if (!playerResponse) return null;

    const captionTracks =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captionTracks?.length) return null;

    // בחר רצועה: עדיפות עברית → אנגלית → ראשונה
    const preferred = ["iw", "he", "en"];
    let track = null;
    for (const lang of preferred) {
      track = captionTracks.find(t =>
        t.languageCode === lang || t.languageCode?.startsWith(lang)
      );
      if (track) break;
    }
    if (!track) track = captionTracks[0];
    if (!track?.baseUrl) return null;

    // fetch ל-URL המלא
    const res = await fetch(track.baseUrl + "&fmt=json3");
    if (!res.ok) return null;
    const data = await res.json();

    const events = data.events?.filter(e => e.segs);
    if (!events?.length) return null;

    return events.map(e => ({
      time: Math.floor((e.tStartMs || 0) / 1000),
      text: e.segs.map(s => s.utf8 || "").join(""),
    })).filter(e => e.text.trim());
  } catch (e) {
    console.warn("[FocusFlow] fetchTranscriptFromPage failed:", e.message);
    return null;
  }
}

// ── Fallback: /api/timedtext ──────────────────────────────
async function fetchTranscriptFromAPI(videoId) {
  for (const lang of ["iw", "he", "en"]) {
    try {
      const res = await fetch(
        `https://www.youtube.com/api/timedtext?lang=${lang}&v=${videoId}&fmt=json3`
      );
      if (!res.ok) continue;
      const data = await res.json();
      const events = data.events?.filter(e => e.segs);
      if (!events?.length) continue;
      return events.map(e => ({
        time: Math.floor((e.tStartMs || 0) / 1000),
        text: e.segs.map(s => s.utf8 || "").join(""),
      })).filter(e => e.text.trim());
    } catch {}
  }
  return null;
}

// ── Saved drop position ───────────────────────────────────
let savedDropPosition = null;

function saveDropPosition() {
  const video = document.querySelector("video");
  if (video && !video.paused && !video.ended && video.currentTime > 0) {
    savedDropPosition = { type: "video", time: video.currentTime };
    return { videoTime: video.currentTime };
  }
  savedDropPosition = { type: "scroll", y: window.scrollY };
  return { videoTime: null };
}

// ── Comprehension modal — DOM API בלבד (ללא innerHTML) ───
let modalHost = null;

function el(tag, styles, attrs) {
  const e = document.createElement(tag);
  if (styles) Object.assign(e.style, styles);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => {
    if (k === "textContent") e.textContent = v;
    else if (k === "type") e.type = v;
    else if (k === "disabled") e.disabled = v;
    else e.setAttribute(k, v);
  });
  return e;
}

function showModal(question, dropTimestamp) {
  console.log("[FocusFlow Content] showModal called, question:", question);

  // סגור modal קיים
  closeModal();

  // ולידציה
  const safeQ = {
    question: String(question?.question || "האם היית קשוב לתוכן?"),
    options: Array.isArray(question?.options) && question.options.length >= 2
      ? question.options.slice(0, 4).map(String)
      : ["כן, הייתי מרוכז", "לא ממש", "חלקית", "לא בטוח"],
    correct: typeof question?.correct === "number" ? question.correct : 0,
  };

  console.log("[FocusFlow Content] safe question:", safeQ);

  // עצור וידאו
  const video = document.querySelector("video");
  try { video?.pause(); } catch {}

  // ── Host overlay ──────────────────────────────────────
  modalHost = document.createElement("div");
  modalHost.id = "__focusflow_modal_host__";
  const hs = modalHost.style;
  hs.setProperty("position", "fixed", "important");
  hs.setProperty("top", "0", "important");
  hs.setProperty("left", "0", "important");
  hs.setProperty("width", "100vw", "important");
  hs.setProperty("height", "100vh", "important");
  hs.setProperty("z-index", "2147483647", "important");
  hs.setProperty("display", "flex", "important");
  hs.setProperty("align-items", "center", "important");
  hs.setProperty("justify-content", "center", "important");
  hs.setProperty("background", "rgba(0,0,0,0.72)", "important");
  hs.setProperty("pointer-events", "auto", "important");
  hs.setProperty("margin", "0", "important");
  hs.setProperty("padding", "0", "important");
  hs.setProperty("border", "none", "important");
  hs.setProperty("box-sizing", "border-box", "important");

  // ── Shadow root ───────────────────────────────────────
  const shadow = modalHost.attachShadow({ mode: "open" });

  // ── Stylesheet via CSSStyleSheet API (Trusted-Types-safe) ──
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    .modal {
      background: #fff; border-radius: 10px; padding: 24px 20px;
      max-width: 480px; width: 90vw; direction: rtl;
      font-family: 'Heebo', 'Segoe UI', Arial, sans-serif;
      font-size: 14px; color: #14202b;
      box-shadow: 0 20px 60px rgba(0,0,0,0.6);
      animation: ff-pop 0.18s ease;
    }
    @keyframes ff-pop {
      from { opacity:0; transform:scale(0.92); }
      to   { opacity:1; transform:scale(1); }
    }
    .label { font-size:11px; font-weight:700; color:#0b7285; letter-spacing:1.5px; margin-bottom:10px; }
    .question { font-size:15px; font-weight:600; line-height:1.6; margin-bottom:16px; }
    .options { display:flex; flex-direction:column; gap:8px; }
    .option {
      display:flex; align-items:center; gap:12px; padding:10px 14px;
      background:#f4f6f8; border:1px solid #c9d2d9; border-radius:6px;
      cursor:pointer; font-size:13px; font-family:inherit; color:#14202b;
      text-align:right; width:100%;
      transition: border-color 0.12s, background 0.12s;
    }
    .option:hover:not(:disabled) { border-color:#0b7285; background:#e9edf0; }
    .option:disabled { opacity:0.6; cursor:not-allowed; }
    .letter {
      min-width:26px; height:26px; flex-shrink:0;
      background:#fff; border:1px solid #c9d2d9; border-radius:4px;
      display:flex; align-items:center; justify-content:center;
      font-weight:700; font-size:12px; color:#5a6b79;
    }
    .feedback {
      margin-top:12px; padding:10px 14px; border-radius:6px;
      font-size:13px; font-weight:600; display:none;
    }
    .feedback.correct { background:#edf7f2; color:#1d7f55; border:1px solid #a8d9be; }
    .feedback.wrong   { background:#fdf0ed; color:#c2410c; border:1px solid #e5bab0; }
  `);
  shadow.adoptedStyleSheets = [sheet];

  // ── Build DOM with createElement ──────────────────────
  const modal = el("div"); modal.className = "modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");

  const label = el("div"); label.className = "label"; label.textContent = "בדיקת ריכוז";
  const questionEl = el("div"); questionEl.className = "question"; questionEl.textContent = safeQ.question;
  const optionsEl = el("div"); optionsEl.className = "options";
  const feedbackEl = el("div"); feedbackEl.className = "feedback"; feedbackEl.id = "ff-feedback";

  const letters = ["א", "ב", "ג", "ד"];
  safeQ.options.forEach((opt, i) => {
    const btn = el("button", null, { type: "button" });
    btn.className = "option";
    btn.dataset.index = String(i);

    const letterSpan = el("span"); letterSpan.className = "letter"; letterSpan.textContent = letters[i] || String(i + 1);
    const textSpan = el("span"); textSpan.textContent = opt;

    btn.appendChild(letterSpan);
    btn.appendChild(textSpan);

    btn.addEventListener("click", () => {
      try {
        console.log("[FocusFlow Content] answer clicked:", i, "correct:", safeQ.correct);
        handleAnswer(i, safeQ.correct, shadow, feedbackEl, video, dropTimestamp);
      } catch (err) {
        console.error("[FocusFlow Content Error] handleAnswer:", err);
        closeModal();
        try { video?.play(); } catch {}
        chrome.runtime.sendMessage({ type: "ANSWER_RESULT", correct: false });
      }
    });

    optionsEl.appendChild(btn);
  });

  modal.appendChild(label);
  modal.appendChild(questionEl);
  modal.appendChild(optionsEl);
  modal.appendChild(feedbackEl);
  shadow.appendChild(modal);

  // הוסף לדף — תמיד ל-documentElement כדי לעבוד גם מעל <embed> של PDF
  try {
    document.documentElement.appendChild(modalHost);
    console.log("[FocusFlow Content] modal appended to documentElement");
  } catch (err) {
    console.error("[FocusFlow Content Error] appendChild failed:", err);
  }
}

function handleAnswer(chosen, correct, shadow, feedbackEl, video, dropTimestamp) {
  // נעל כפתורים
  shadow.querySelectorAll(".option").forEach(b => { b.disabled = true; });

  if (chosen === correct) {
    feedbackEl.className = "feedback correct";
    feedbackEl.textContent = "✓ תשובה נכונה! ממשיכים.";
    feedbackEl.style.display = "block";
    setTimeout(() => {
      closeModal();
      try { video?.play(); } catch {}
      chrome.runtime.sendMessage({ type: "ANSWER_RESULT", correct: true });
    }, 1200);
  } else {
    feedbackEl.className = "feedback wrong";
    feedbackEl.textContent = "✗ לא נכון. חוזרים לנקודה שבה ירד הקשב.";
    feedbackEl.style.display = "block";
    setTimeout(() => {
      closeModal();
      try {
        if (video) {
          if (dropTimestamp != null && dropTimestamp >= 0) video.currentTime = dropTimestamp;
          video.play();
        }
      } catch {}
      chrome.runtime.sendMessage({ type: "ANSWER_RESULT", correct: false });
    }, 1800);
  }
}

function closeModal() {
  modalHost?.remove();
  modalHost = null;
}

// ── Message listener ──────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("[FocusFlow Content] message received:", msg.type);

  if (msg.type === "GET_DOMAIN") {
    sendResponse({ domain: window.location.hostname });
    return true;
  }
  if (msg.type === "SAVE_DROP_POSITION") {
    sendResponse(saveDropPosition());
    return true;
  }
  if (msg.type === "GET_VIDEO_CONTEXT" || msg.type === "GET_PAGE_CONTEXT") {
    getPageContext().then(ctx => {
      console.log("[FocusFlow Content] page context ready:", { type: ctx.type, isYouTube: ctx.isYouTube, videoId: ctx.videoId, hasTranscript: !!ctx.transcript, hasContentText: !!ctx.contentText, title: ctx.title?.slice(0, 40) });
      sendResponse(ctx);
    }).catch(err => {
      console.error("[FocusFlow Content Error] getPageContext:", err);
      sendResponse({ type: null, isYouTube: false, videoId: null, url: window.location.href, title: "", transcript: null, contentText: null });
    });
    return true;
  }
  if (msg.type === "SHOW_COMPREHENSION_MODAL") {
    console.log("[FocusFlow Content] showing modal, question:", msg.question);
    try {
      showModal(msg.question, msg.dropTimestamp ?? null);
      sendResponse({ ok: true });
    } catch (err) {
      console.error("[FocusFlow Content Error] showModal:", err);
      sendResponse({ ok: false, error: err.message });
    }
    return true;
  }
});
