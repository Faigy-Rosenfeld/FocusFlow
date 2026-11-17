// background.js — service worker (Manifest V3)

// ── Setup: כבה פאנל גלובלי — כל טאב מנהל את עצמו ────────
function setup() {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
}

chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);

// ── Action click — חובה: ללא await לפני open (User Gesture Token) ──
chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;
  // setOptions ו-open חייבים להיקרא סינכרונית בתוך ה-listener
  // כדי לא לאבד את User Gesture Token של כרום
  chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: "panel.html",
    enabled: true,
  });
  chrome.sidePanel.open({ tabId: tab.id });
});

// ── Tab removed — סגור סשן פעיל אם הטאב נסגר ────────────
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const stored = await chrome.storage.local.get(["activeSession", "token"]);
  const session = stored.activeSession;
  if (!session || session.tabId !== tabId) return;

  const token = stored.token;
  if (session.sessionId && token) {
    const API = "https://focusflow-app.myftp.org";
    try {
      await fetch(`${API}/api/sessions/${session.sessionId}/end`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }
  await chrome.storage.local.set({ activeSession: null });
});
