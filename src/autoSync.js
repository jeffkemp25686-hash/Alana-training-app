// src/autoSync.js
// Lightweight background sync helper for Alana Training App.
// Safe: does not touch progression/readiness/multi-client state.
// It only calls flushSheetsQueue() if available.

export function initAutoSync({
  initialDelayMs = 2000,
  intervalMs = 30000,
  maxPerFlush = 20,
} = {}) {
  // prevent double-install (HMR / re-renders)
  if (window.__autoSyncInstalled) return;
  window.__autoSyncInstalled = true;

  const tryFlush = () => {
    try {
      if (typeof window.flushSheetsQueue === "function") {
        // swallow errors so UI never breaks
        window.flushSheetsQueue({ max: maxPerFlush }).catch(() => {});
      }
    } catch (_) {}
  };

  // 1) shortly after app load
  setTimeout(tryFlush, initialDelayMs);

  // 2) periodic retry
  setInterval(tryFlush, intervalMs);

  // 3) when returning to the tab (nice UX)
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tryFlush();
  });

  // 4) when network comes back
  window.addEventListener("online", tryFlush);

  // Optional: expose for manual triggering if you want
  window.__tryAutoFlush = tryFlush;
}
