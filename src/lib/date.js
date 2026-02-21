// src/lib/date.js
export function todayDateStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export function timeToMinutes(timeStr) {
  const s = String(timeStr || "").trim();
  if (!s) return null;

  if (s.includes(":")) {
    const parts = s.split(":").map((p) => p.trim());
    const mins = parseFloat(parts[0]);
    const secs = parseFloat(parts[1] || "0");
    if (!Number.isFinite(mins) || !Number.isFinite(secs)) return null;
    return mins + secs / 60;
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function calculatePace(distance, timeStr) {
  const dist = parseFloat(distance);
  const mins = timeToMinutes(timeStr);
  if (!Number.isFinite(dist) || dist <= 0 || mins == null) return "";

  const pace = mins / dist;
  const m = Math.floor(pace);
  const s = Math.round((pace - m) * 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}
