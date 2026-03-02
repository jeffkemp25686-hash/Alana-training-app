// ==========================
// HYROX ENGINE MODULE
// Auto-scaling + Readiness Badge
// ==========================

const HYROX_SCORES_KEY = "hyrox_scores";
const HYROX_LEVEL_KEY = "hyrox_level";

// --------------------------
// SCORE STORAGE
// --------------------------
export function saveHyroxScore(score) {
  const arr = JSON.parse(localStorage.getItem(HYROX_SCORES_KEY) || "[]");

  arr.push({
    date: new Date().toISOString(),
    score: Math.round(score),
  });

  // keep last 12 sessions
  const trimmed = arr.slice(-12);

  localStorage.setItem(HYROX_SCORES_KEY, JSON.stringify(trimmed));

  updateHyroxLevel(score);
}

// --------------------------
// AUTO LEVEL PROGRESSION
// --------------------------
function updateHyroxLevel(score) {
  let level = Number(localStorage.getItem(HYROX_LEVEL_KEY)) || 2;

  if (score >= 85) level += 1;
  else if (score <= 65) level -= 1;

  level = Math.max(0, Math.min(5, level));

  localStorage.setItem(HYROX_LEVEL_KEY, level);
}

export function getHyroxLevel() {
  return Number(localStorage.getItem(HYROX_LEVEL_KEY)) || 2;
}

// --------------------------
// READINESS % (Last 4 weighted)
// --------------------------
export function getHyroxReadyPct() {
  const arr = JSON.parse(localStorage.getItem(HYROX_SCORES_KEY) || "[]");
  if (!arr.length) return null;

  const last = arr.slice(-4).map((x) => x.score);

  const weights = [0.1, 0.2, 0.3, 0.4].slice(-last.length);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const weighted =
    last.reduce((acc, s, i) => acc + s * weights[i], 0) / totalWeight;

  return Math.round(weighted);
}

// --------------------------
// PERFORMANCE SCORE CALC
// --------------------------
export function calculateHyroxScore({ runConsistency, workCompletion, density }) {
  return runConsistency * 0.4 + workCompletion * 0.35 + density * 0.25;
}

// --------------------------
// SCALING HELPERS
// --------------------------
export function scaleRun(baseMeters) {
  const level = getHyroxLevel();
  return Math.round(baseMeters * (1 + level * 0.05));
}

export function scaleReps(baseReps) {
  const level = getHyroxLevel();
  return Math.round(baseReps + level * 3);
}

export function scaleLoad(baseLoad) {
  const level = getHyroxLevel();
  return Math.round(baseLoad * (1 + level * 0.05));
}