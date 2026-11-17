// content.js — רץ בתוך הדף
// מקבל הודעות מה-popup ומחזיר את שם הדומיין

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_DOMAIN") {
    sendResponse({ domain: window.location.hostname });
  }
});
