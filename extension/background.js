// background.js — service worker
// שומר על state של הסשן הפעיל בין פתיחות של ה-popup

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ session: null, token: null, user: null });
});
