// src/lib/sync.js
// Sheets sync helper + offline queue + auto-retry + UI notification
// Keeps legacy behavior: no-cors POST with form-encoded `payload=` JSON.

const QUEUE_KEY = "sheets_sync_queue_v1";
const MAX_QUEUE = 200;

function safeParseJSON(str, fallback) {
  try {
    const v = JSON.parse(str);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function loadQueue() {
  return safeParseJSON(localStorage.getItem(QUEUE_KEY) || "[]", []);
}

function saveQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function getPendingSheetsCount() {
  return loadQueue().length;
}

function notifyQueueChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("training:sheetsQueueChanged", {
      detail: { pending: getPendingSheetsCount() },
    })
  );
}

export function enqueueSheetsJob(job) {
  const queue = loadQueue();

  const item = {
    id: job.id || `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    kind: job.kind || "unknown",
    url: job.url,
    payload: job.payload, // string OR object
    createdAt: job.createdAt || new Date().toISOString(),
    attempts: job.attempts || 0,
    lastError: job.lastError || "",
  };

  queue.push(item);

  // cap queue size (drop oldest)
  while (queue.length > MAX_QUEUE) queue.shift();

  saveQueue(queue);
  notifyQueueChanged();
  return item;
}

export async function postToSheets(url, payload) {
  const payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload);

  // IMPORTANT: keep `return fetch(...)` on the same line (avoid ASI bug)
  return fetch(url, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: "payload=" + encodeURIComponent(payloadStr),
  });
}

export async function flushSheetsQueue({ max = 20 } = {}) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    notifyQueueChanged();
    return { flushed: 0, pending: getPendingSheetsCount(), offline: true };
  }

  const queue = loadQueue();
  let flushed = 0;

  while (queue.length && flushed < max) {
    const job = queue[0];

    try {
      await postToSheets(job.url, job.payload);
      queue.shift();
      flushed++;
      saveQueue(queue);
      notifyQueueChanged();
    } catch (err) {
      job.attempts = (job.attempts || 0) + 1;
      job.lastError = String(err?.message || err || "unknown error");
      queue[0] = job;
      saveQueue(queue);
      notifyQueueChanged();
      break;
    }
  }

  notifyQueueChanged();
  return { flushed, pending: queue.length, offline: false };
}

export function initSheetsAutoSync({ intervalMs = 30000 } = {}) {
  if (typeof window === "undefined") return;
  if (window.__sheetsAutoSyncInstalled) return;
  window.__sheetsAutoSyncInstalled = true;

  window.addEventListener("online", () => {
    flushSheetsQueue({ max: 50 }).catch(() => {});
  });

  setInterval(() => {
    flushSheetsQueue({ max: 10 }).catch(() => {});
  }, intervalMs);
}
