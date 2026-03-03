// src/appCore.js
import { getLogArr, upsertRowIntoHistory } from "./lib/storage.js";
import { todayDateStr, timeToMinutes, calculatePace } from "./lib/date.js";
import { saveHyroxScore, getHyroxReadyPct } from "./lib/hyroxEngine.js";

import { isHyroxDay, renderHyroxHtml, computeHyroxScoreFromSavedInputs, buildHyroxRow } from "./lib/hyroxSession.js";
import {
  runKey,
  todayRunDate,
  clearRunDraftForToday,
  markRunDoneToday,
  isRunLoggedToday,
} from "./lib/run.js";
import {
  postToSheets,
  enqueueSheetsJob,
  initSheetsAutoSync,
  getPendingSheetsCount,
  flushSheetsQueue,
} from "./lib/sync.js";

let app;
// ==========================
// CLIENT HELPERS
// ==========================
export function normalizeClientId(id) {
  if (!id) return "alana";
  return String(id)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-");
}
// ==========================
// TOP-LEVEL UI HELPERS (MUST BE OUTSIDE bootApp)
// ==========================
function sessionSuffix() {
  return todayDateStr(); // e.g. "2026-02-21"
}
function updateVisibleSyncStatusTexts() {
  const pending = getPendingSheetsCount();

  const ids = [
    "syncStatus", // Workout/sets sync status
    "runSyncStatus", // Run tab sync status
    "nutriSyncStatus", // Nutrition tab sync status
    "bodySyncStatus", // Body tab sync status
  ];

  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    const t = String(el.textContent || "");

    // keep the Pending: X accurate
    if (pending > 0 && /Pending:\s*\d+/.test(t)) {
      el.textContent = t.replace(/Pending:\s*\d+/, `Pending: ${pending}`);
      return;
    }

    // clear queued/offline messages when queue is empty
    if (
      pending <= 0 &&
      (t.includes("saved to queue") ||
        t.includes("Offline/failed") ||
        /Pending:\s*\d+/.test(t))
    ) {
      el.textContent = "";
    }
  });
}

function updateProgressBadge() {
  const badge = document.getElementById("progressBadge");
  if (!badge) return;

  const pending = getPendingSheetsCount();
  badge.style.display = pending > 0 ? "inline-block" : "none";
}

// ==========================
// CONFIG
// ==========================
const SHEETS_URL =
  "https://script.google.com/macros/s/AKfycbyxnqtM-JHiCmjXcMtXNMelSdPL_QKTpL0DhEMtCo38I_Cc0DV9LBQbXiEom0rHaRxu/exec";
function getAthleteName() {
  const cid = (typeof getActiveClientId === "function")
    ? getActiveClientId()
    : (window.__trainingActiveClientId || "alana");
  const s = String(cid || "alana");
  return s.charAt(0).toUpperCase() + s.slice(1);
}


const NUTRITION_TARGETS = {
  protein_g: 110,
  water_l_min: 2.5,
  water_l_max: 3.0,
  veg_serves: 5,
  steps: 10000,
};

const STORAGE_DAY = "currentTrainingDay";
const STORAGE_DAY_ABS = "currentTrainingDayAbs"; // counts 0..83 for 12 weeks
const STORAGE_VIEW_DAY_ABS = "viewTrainingDayAbs"; // browsing day (read-only past)
const STORAGE_PROGRAM_START = "programStartDate";
const STORAGE_COACH_MODE = "coachMode";
const SETS_LOG_KEY = "history_sets";
const RUNS_LOG_KEY = "history_runs";
const NUTRI_LOG_KEY = "history_nutrition";
const BODY_LOG_KEY = "history_body";
const HYROX_LOG_KEY = "history_hyrox";
function isCoachMode() {
  return localStorage.getItem(STORAGE_COACH_MODE) === "1";
}

function enableCoachMode() {
  localStorage.setItem(STORAGE_COACH_MODE, "1");
  location.reload();
}

function disableCoachMode() {
  localStorage.removeItem(STORAGE_COACH_MODE);
  location.reload();
}

window.enableCoachMode = enableCoachMode;
window.disableCoachMode = disableCoachMode;
function getProgramStartDate() {
  let d = localStorage.getItem(STORAGE_PROGRAM_START);
  if (!d) {
        const cid = normalizeClientId(window.__trainingActiveClientId || 'alana');
    d = (cid === 'blake') ? '2026-03-02' : todayDateStr(); // first use = Week 1 Day 1
    localStorage.setItem(STORAGE_PROGRAM_START, d);
  }
  return d;
}

function addDays(yyyyMmDd, days) {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);

  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");

  return `${yy}-${mm}-${dd}`;
}

function sessionSuffixForAbs(absDay) {
  return addDays(getProgramStartDate(), absDay);
}
// ==========================
// PROGRAM
// ==========================
// ==========================
// PROGRAMS (per client)
// - Keep Alana EXACTLY as-is
// - Add Blake as separate program (can change later)
// ==========================
const PROGRAMS = {
  alana: [
  {
    name: "Lower Body Strength",
    exercises: [
      { name: "Back Squat", sets: 3, reps: 10 },
      { name: "Romanian Deadlift", sets: 3, reps: 10 },
      { name: "Walking Lunges", sets: 3, reps: 12 },
      { name: "Leg Press", sets: 3, reps: 10 },
      { name: "Calf Raises", sets: 4, reps: 12 },
    ],
  },
  {
    name: "Upper Pull + Core",
    exercises: [
      { name: "Lat Pulldown", sets: 3, reps: 10 },
      { name: "Seated Row", sets: 3, reps: 10 },
      { name: "Face Pull", sets: 3, reps: 15 },
      { name: "Rear Delt Fly", sets: 3, reps: 15 },
      { name: "Biceps Curl", sets: 3, reps: 12 },
       // Core finisher
    { name: "Plank", sets: 3, reps: 90, timerSec: 90 },
    ],
  },
  {
  name: "Glutes + Core",
  exercises: [
    { name: "Hip Thrust", sets: 4, reps: 10 },
    { name: "Step Ups", sets: 3, reps: 12 },
    { name: "Cable Kickbacks", sets: 3, reps: 15 },
    { name: "45° Back Extension (Glute Bias)", sets: 3, reps: 12 },

    { name: "Dead Bug", sets: 3, reps: 10 },
    { name: "Pallof Press", sets: 3, reps: 12 },
    { name: "Side Plank", sets: 3, reps: 60, timerSec: 60 },
  ],
},
  {
    name: "Shoulders + Upper Back",
    exercises: [
      { name: "Machine Shoulder Press", sets: 3, reps: 10 },
      { name: "Lateral Raise", sets: 4, reps: 15 },
      { name: "Cable Y Raise", sets: 3, reps: 15 },
      { name: "Assisted Pullups", sets: 3, reps: 8 },
      { name: "Rope Rows", sets: 3, reps: 12 },
    ],
  },
  {
    name: "Lower Hypertrophy",
    exercises: [
      { name: "Hack Squat", sets: 4, reps: 12 },
      { name: "Bulgarian Split Squat", sets: 3, reps: 10 },
      { name: "Leg Curl", sets: 4, reps: 12 },
      { name: "Cable Pull Through", sets: 3, reps: 15 },
      { name: "Calves", sets: 4, reps: 15 },
    ],
  },
  
  {
    name: "HYROX Engine Session",
    exercises: [{ name: "HYROX_SESSION", sets: 1, reps: 1 }],
  },
  {
    name: "Long Easy Run",
    exercises: [{ name: "RUN_LONG", sets: 1, reps: 1 }],
  },
],
  blake: [
    {
    name: "Day 1 — Lower Max Force (Squat + Posterior)",
    exercises: [
      { name: "Box Jump", sets: 5, reps: 3 },
      { name: "Med Ball Scoop Toss", sets: 4, reps: 5 },
      { name: "Back Squat", sets: 5, reps: 5 },
      { name: "Romanian Deadlift", sets: 4, reps: 6 },
      { name: "DB Walking Lunge (each leg)", sets: 4, reps: 10 },
      { name: "Nordic Hamstring Curl", sets: 4, reps: 5 },
      { name: "Reverse Hyper", sets: 3, reps: 12 },
      { name: "Cable Chop (each side)", sets: 3, reps: 12 },
      { name: "Farmer Carry (meters)", sets: 4, reps: 30 },
    ],
  },
  {
    name: "Day 2 — Upper Max Force (Bench + Pull)",
    exercises: [
      { name: "Med Ball Chest Pass", sets: 5, reps: 5 },
      { name: "Bench Press", sets: 5, reps: 5 },
      { name: "Weighted Chin Up", sets: 5, reps: 5 },
      { name: "Incline DB Press", sets: 4, reps: 8 },
      { name: "Chest Supported Row", sets: 4, reps: 10 },
      { name: "Landmine Press", sets: 3, reps: 10 },
      { name: "Face Pull", sets: 3, reps: 15 },
      { name: "Neck Flexion", sets: 3, reps: 15 },
      { name: "Neck Extension", sets: 3, reps: 15 },
      { name: "Neck Lateral (each side)", sets: 3, reps: 15 },
      { name: "Pallof Press (each side)", sets: 3, reps: 12 },
    ],
  },
  {
    name: "Day 3 — Power + Speed Strength",
    exercises: [
      { name: "Hang Power Clean", sets: 6, reps: 3 },
      { name: "Push Press", sets: 5, reps: 3 },
      { name: "Trap Bar Jump", sets: 5, reps: 3 },
      { name: "Speed Squat (60% 1RM)", sets: 6, reps: 2 },
      { name: "Hip Thrust (explosive)", sets: 4, reps: 6 },
      { name: "Hamstring Curl", sets: 3, reps: 10 },
      { name: "Rotational Med Ball Throw (each side)", sets: 5, reps: 4 },
      { name: "Sled Drag (meters)", sets: 4, reps: 25 },
    ],
  },
  {
    name: "Day 4 — Hypertrophy / Armor Build",
    exercises: [
      { name: "DB Bench Press", sets: 4, reps: 12 },
      { name: "Pull Ups (AMRAP)", sets: 4, reps: 8 },
      { name: "Seated Cable Row", sets: 4, reps: 12 },
      { name: "Lateral Raise", sets: 4, reps: 15 },
      { name: "Hack Squat", sets: 4, reps: 12 },
      { name: "Leg Curl", sets: 4, reps: 12 },
      { name: "Calf Raise", sets: 5, reps: 15 },
      { name: "Hanging Leg Raise", sets: 4, reps: 12 },
      { name: "Back Extension", sets: 4, reps: 15 },
      { name: "Biceps Curl", sets: 3, reps: 12 },
      { name: "Rope Triceps Pushdown", sets: 3, reps: 12 },
    ],
  },
  {
    name: "Day 5 — Total Body Power + Strongman",
    exercises: [
      { name: "Clean Pull", sets: 5, reps: 3 },
      { name: "Plyo Push Up", sets: 5, reps: 5 },
      { name: "Front Squat", sets: 4, reps: 4 },
      { name: "Weighted Dips", sets: 4, reps: 6 },
      { name: "Bulgarian Split Squat (each leg)", sets: 3, reps: 8 },
      { name: "Sled Push (meters)", sets: 6, reps: 20 },
      { name: "Sandbag Carry (meters)", sets: 5, reps: 30 },
      { name: "Battle Ropes (seconds)", sets: 6, reps: 20, timerSec: 20 },
      { name: "Copenhagen Plank (each side, seconds)", sets: 3, reps: 30, timerSec: 30 },
    ],
  }
],
};

function getProgramForClient(clientId) {
  const cid = normalizeClientId(clientId);
  return PROGRAMS[cid] || PROGRAMS.alana;
}

function getActiveProgram() {
  return getProgramForClient(window.__trainingActiveClientId);
}


// ==========================
// NAVIGATION
// ==========================
function showTab(tab) {
  if (tab === "today") renderToday();
  if (tab === "run") renderRun();
  if (tab === "nutrition") renderNutrition();
  if (tab === "body") renderBody();
  if (tab === "progress") renderProgress();

  // keep nav badge in sync no matter which tab is open
  updateProgressBadge();
}
window.showTab = showTab;

// ==========================
// DAY TRACKING + WEEK/PHASE (TOP-LEVEL!)
// ==========================
function getCurrentDay() {
  let day = localStorage.getItem(STORAGE_DAY);
  if (!day) {
    day = "0";
    localStorage.setItem(STORAGE_DAY, day);
  }
  return parseInt(day, 10);
}

function getAbsDay() {
  let n = localStorage.getItem(STORAGE_DAY_ABS);
  if (!n) {
    n = "0";
    localStorage.setItem(STORAGE_DAY_ABS, n);
  }
  return parseInt(n, 10);
}

function setAbsDay(n) {
  localStorage.setItem(STORAGE_DAY_ABS, String(n));
}


function getViewAbsDay() {
  let n = localStorage.getItem(STORAGE_VIEW_DAY_ABS);
  if (!n) {
    n = String(getAbsDay()); // default view = current
    localStorage.setItem(STORAGE_VIEW_DAY_ABS, n);
  }
  return parseInt(n, 10);
}

function setViewAbsDay(n) {
  localStorage.setItem(STORAGE_VIEW_DAY_ABS, String(n));
}

function getWeekDayLabel(absOverride) {
  const abs = Number.isFinite(absOverride) ? absOverride : getAbsDay(); // 0..83
  const week = Math.floor(abs / 7) + 1; // 1..12
  const day = (abs % 7) + 1; // 1..7
  return `Week ${week} • Day ${day}`;
}

function getCurrentWeekNumber() {
  const abs = getAbsDay();
  return Math.floor(abs / 7) + 1; // 1..12
}

function getActiveClientId() {
  return normalizeClientId(window.__trainingActiveClientId || "alana");
}

function getMicroWeek(week) {
  // 1..4 repeating
  return ((week - 1) % 4) + 1;
}

function getMicroLabel(microWeek) {
  if (microWeek === 1) return "Accumulate";
  if (microWeek === 2) return "Build";
  if (microWeek === 3) return "Overreach";
  return "Deload";
}

// Blake: Mar 2, 2026 start → peak into September trials (SG Ball)
function getBlakeMacroPhaseForWeek(week) {
  // ~26 weeks from Mar 2 to end of Aug (peak heading into Sept)
  if (week <= 12) return "Build";
  if (week <= 20) return "Convert";
  return "Peak";
}

// Alana: keep original simple 12-week flow
function getAlanaPhaseForWeek(week) {
  if (week <= 4) return "Base";
  if (week <= 8) return "Build";
  return "Peak";
}

function getPhaseForWeek(week) {
  const cid = getActiveClientId();
  return cid === "blake" ? getBlakeMacroPhaseForWeek(week) : getAlanaPhaseForWeek(week);
}

function getPhaseLabel(absOverride) {
  const abs = Number.isFinite(absOverride) ? absOverride : getAbsDay();
  const week = Math.floor(abs / 7) + 1;
  const phase = getPhaseForWeek(week);
  const microWeek = getMicroWeek(week);

  // Add microcycle label for Blake (4-week wave)
  if (getActiveClientId() === "blake") {
    const mw = getMicroWeek(week);
    return `${phase} • ${getMicroLabel(mw)} (W${mw}/4)`;
  }

  return phase;
}


window.getWeekDayLabel = () => getWeekDayLabel(getViewAbsDay());
window.getPhaseLabel = () => getPhaseLabel(getViewAbsDay());
window.getViewAbsDay = getViewAbsDay;
window.sessionSuffixForAbs = sessionSuffixForAbs;
window.getAbsDay = getAbsDay;
window.getProgramStartDate = getProgramStartDate;
function applyPhaseToExercise(ex, phase, microWeek = 1) {
  const nm = String(ex?.name || "");
  if (nm.toUpperCase().startsWith("RUN_")) return ex;

  const out = { ...ex };
  if (!Number.isFinite(out.sets) || !Number.isFinite(out.reps)) return out;

  const cid = getActiveClientId();

  // --------------------------
  // Blake: strength/power athlete — adjust volume by macro + deload
  // --------------------------
  if (cid === "blake") {
    const low = nm.toLowerCase();
    const isMainStrength =
      low.includes("back squat") ||
      (low.includes("squat") && !low.includes("speed")) ||
      low.includes("bench press") ||
      low.includes("front squat") ||
      low.includes("romanian deadlift") ||
      low.includes("rdl") ||
      low.includes("weighted chin") ||
      low.includes("chin up") ||
      low.includes("clean pull");

    const isPower =
      low.includes("power clean") ||
      low.includes("hang power clean") ||
      low.includes("trap bar jump") ||
      low.includes("plyo") ||
      low.includes("med ball") ||
      low.includes("speed squat") ||
      low.includes("push press");

    // Macro phase adjustments (keep templates; tweak fatigue)
    if (phase === "Convert") {
      // slightly lower reps, keep intent high
      if (isMainStrength) out.reps = Math.min(out.reps, 5);
      if (isPower) out.reps = Math.min(out.reps, 3);
    }

    if (phase === "Peak") {
      // low fatigue: maintain strength, maximize speed
      if (isMainStrength) {
        out.sets = Math.max(3, Math.min(out.sets, 4));
        out.reps = Math.min(out.reps, 4);
      }
      if (isPower) {
        out.sets = Math.max(4, Math.min(out.sets, 6));
        out.reps = Math.min(out.reps, 2);
      }
    }

    // 4-week wave: deload on week 4
    if (microWeek === 4) {
      out.sets = Math.max(2, out.sets - 1);
      // keep power crisp; reduce reps slightly for heavy work
      if (isMainStrength) out.reps = Math.max(3, Math.round(out.reps * 0.8));
    }

    return out;
  }

  // --------------------------
// Alana: keep original behaviour
// --------------------------
if (phase === "Base") out.reps = out.reps + 2;

if (phase === "Build") {
  const low = nm.toLowerCase();
  const isBigLift =
    low.includes("squat") ||
    low.includes("deadlift") ||
    low.includes("hip thrust") ||
    low.includes("leg press") ||
    low.includes("shoulder press") ||
    low.includes("lat pulldown") ||
    low.includes("row");

  if (isBigLift) out.sets = Math.min(out.sets + 1, 5);
  out.reps = Math.max(out.reps, 8);
}

if (phase === "Peak") {
  out.reps = Math.max(5, Math.round(out.reps * 0.7));
}

// ✅ ADD THIS (microcycle wave)
const mw = Number(microWeek) || 1;
const low2 = nm.toLowerCase();

const isGluteOrCore =
  low2.includes("hip thrust") ||
  low2.includes("kickback") ||
  low2.includes("step up") ||
  low2.includes("back extension") ||
  low2.includes("plank") ||
  low2.includes("core");

if (isGluteOrCore) {
  if (mw === 3) out.sets = Math.min((out.sets || 3) + 1, 5); // overreach
  if (mw === 4) out.sets = Math.max(2, (out.sets || 3) - 1); // deload
}

return out;
}


let __advancing = false;

// Browse days (view-only). Never browse into the future.
window.viewNextDay = function viewNextDay() {
  const view = getViewAbsDay();
  const maxAbs = 83; // 12 weeks * 7 days - 1
  const next = Math.min(view + 1, maxAbs);
  setViewAbsDay(next);
  renderToday();
  window.dispatchEvent(new Event("training:dayChanged"));
};

window.viewPrevDay = function viewPrevDay() {
  const view = getViewAbsDay();
  const prev = Math.max(view - 1, 0);
  setViewAbsDay(prev);
  renderToday();
  window.dispatchEvent(new Event("training:dayChanged"));
};

// Advance program (Finish Workout). Guard against double-advance.
window.nextDay = function nextDay() {
  if (__advancing) return;
  __advancing = true;

  try {
    const abs = getAbsDay() + 1;
    setAbsDay(abs);
    setViewAbsDay(abs); // keep view in sync with current day

    const dayIndex = abs % getActiveProgram().length;
    localStorage.setItem(STORAGE_DAY, String(dayIndex));

    renderToday();
    window.dispatchEvent(new Event("training:dayChanged"));
  } finally {
    setTimeout(() => {
      __advancing = false;
    }, 250);
  }
};

function getRestSecondsForExercise(exName, phase) {
  const nm = String(exName || "").toLowerCase();
  const cid = getActiveClientId();

  // Defaults
  let rest = 60;

  const isPower =
    nm.includes("power clean") ||
    nm.includes("hang power clean") ||
    nm.includes("trap bar jump") ||
    nm.includes("plyo") ||
    nm.includes("med ball") ||
    nm.includes("speed squat") ||
    nm.includes("push press");

  const isHeavyCompound =
    nm.includes("back squat") ||
    nm.includes("front squat") ||
    nm.includes("bench press") ||
    nm.includes("romanian deadlift") ||
    nm.includes("deadlift") ||
    nm.includes("clean pull") ||
    nm.includes("weighted chin") ||
    nm.includes("chin up");

  const isCarryOrSled =
    nm.includes("carry") || nm.includes("sled");

  if (isPower) rest = 120;
  if (isHeavyCompound) rest = 180;
  if (isCarryOrSled) rest = 120;

  // Peak phase: keep quality high but reduce total time a bit
  if (cid === "blake" && String(phase).startsWith("Peak")) rest = Math.max(90, rest - 30);

  return rest;
}

function getRpeTargetText(exName, phase, microWeek) {
  const nm = String(exName || "").toLowerCase();
  const cid = getActiveClientId();

  // Simple defaults
  let rpe = "RPE 7–8";

  const isPower =
    nm.includes("power clean") ||
    nm.includes("hang power clean") ||
    nm.includes("trap bar jump") ||
    nm.includes("plyo") ||
    nm.includes("med ball") ||
    nm.includes("speed squat");

  const isMainStrength =
    nm.includes("back squat") ||
    nm.includes("bench press") ||
    nm.includes("front squat") ||
    nm.includes("romanian deadlift") ||
    nm.includes("clean pull") ||
    nm.includes("weighted chin");

  if (isPower) rpe = "Power: fast reps (leave 2–3 reps in reserve)";

  if (cid === "blake") {
    const micro = Number(microWeek) || 1;

    if (isMainStrength) {
      if (micro === 1) rpe = "Target: RPE 7 (smooth)";
      if (micro === 2) rpe = "Target: RPE 8 (heavy but clean)";
      if (micro === 3) rpe = "Target: RPE 8–9 (top effort, no grind)";
      if (micro === 4) rpe = "Deload: RPE 6–7 (speed + technique)";
    }

    if (String(phase).startsWith("Peak") && isMainStrength) {
      rpe = "Peak: RPE 7–8 (keep strength, stay fresh)";
    }
  }

  return rpe;
}

// ==========================
// SESSION TIMER (90+ mins target)
// ==========================
let __sessionTimerInterval = null;

function sessionKeyForToday() {
  const abs = getViewAbsDay();
  const ss = sessionSuffixForAbs(abs);
  return `sessionStart_${ss}`;
}

function formatMMSS(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function startSessionTimer() {
  const k = sessionKeyForToday();
  if (!localStorage.getItem(k)) {
    localStorage.setItem(k, String(Date.now()));
  }
  tickSessionTimer();
  if (__sessionTimerInterval) clearInterval(__sessionTimerInterval);
  __sessionTimerInterval = setInterval(tickSessionTimer, 1000);
}

function resetSessionTimer() {
  const k = sessionKeyForToday();
  localStorage.removeItem(k);
  tickSessionTimer();
}

function tickSessionTimer() {
  const el = document.getElementById("sessionTimer");
  if (!el) return;
  const k = sessionKeyForToday();
  const start = Number(localStorage.getItem(k) || 0);
  if (!start) {
    el.textContent = "Session: 0:00 / 90:00";
    return;
  }
  const sec = Math.max(0, Math.floor((Date.now() - start) / 1000));
  el.textContent = `Session: ${formatMMSS(sec)} / 90:00`;
}
window.startSessionTimer = startSessionTimer;
window.resetSessionTimer = resetSessionTimer;

// ==========================
// REST TIMER
// ==========================
function startRestTimer(btn) {
  // ✅ Use per-button rest if provided, otherwise default 60
  let seconds = Number(btn.dataset.rest) || 60;

  btn.disabled = true;

  const interval = setInterval(() => {
    btn.innerText = `Rest ${seconds}s`;
    seconds--;

    if (seconds < 0) {
      clearInterval(interval);

      // ✅ If this rest was triggered after a timed set, end on DONE
      if (btn.dataset.afterRestDone === "1") {
        btn.innerText = "✅ Done";
        btn.disabled = true; // lock it after completion
        // cleanup optional
        delete btn.dataset.afterRestDone;
        delete btn.dataset.rest;
        return;
      }

      // normal behavior for non-timed rest timers
      btn.innerText = "Start 60s Rest";
      btn.disabled = false;
      delete btn.dataset.rest;
    }
  }, 1000);
}
window.startRestTimer = startRestTimer;

// ==========================
// WORK (COUNTDOWN) TIMER
// ==========================
function startCountdownTimer(btn, totalSeconds, label, restSeconds) {
  let seconds = Number(totalSeconds) || 0;
  if (seconds <= 0) return;

  btn.disabled = true;

  const pad2 = (n) => String(n).padStart(2, "0");
  const render = () => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    btn.innerText = `${label} ${m}:${pad2(s)}`;
  };

  render();

  const interval = setInterval(() => {
    seconds--;

    if (seconds <= 0) {
      clearInterval(interval);

      // If restSeconds is provided, auto-start the existing rest timer on the same button
      const rest = Number(restSeconds) || 0;
      if (rest > 0 && typeof window.startRestTimer === "function") {
        btn.disabled = false;                 // rest timer expects enabled
        btn.dataset.rest = String(rest);      // ✅ rest duration per button
        btn.dataset.afterRestDone = "1";      // ✅ tell rest timer to finish on DONE
        btn.innerText = `Rest ${rest}s`;      // brief handoff text
        window.startRestTimer(btn);           // 🚀 auto-start rest
        return;
      }

      btn.innerText = `✅ ${label} done`;
      btn.disabled = true;
      return;
    }

    render();
  }, 1000);
}
window.startCountdownTimer = startCountdownTimer;
window.startSidePlankSet = function startSidePlankSet(btn, secondsPerSide, setNum) {
  const sec = Number(secondsPerSide) || 0;
  if (!sec) return;

  // Left side first
  startCountdownTimer(btn, sec, `Side Plank (Left) set ${setNum}`, 0);

  // After left completes, immediately run right side (no rest between sides)
  setTimeout(() => {
    // Right side then rest 60s AFTER the set (i.e., after both sides)
    startCountdownTimer(btn, sec, `Side Plank (Right) set ${setNum}`, 60);
  }, (sec + 1) * 1000); // +1 to avoid timing edge cases
};

// ==========================
// SET SUGGESTIONS
// ==========================
// ==========================
// 1RM + 80% TARGET HELPERS
// ==========================
function normExKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function oneRMKey(exName) {
  return `rm1_${normExKey(exName)}`;
}

// Epley estimate: 1RM ≈ weight * (1 + reps/30)
function estimate1RM(weight, reps) {
  const w = Number(weight);
  const r = Number(reps);
  if (!isFinite(w) || !isFinite(r) || w <= 0 || r <= 0) return null;
  return w * (1 + r / 30);
}

function getOneRM(exName) {
  const v = parseFloat(localStorage.getItem(oneRMKey(exName)) || "");
  return isFinite(v) && v > 0 ? v : null;
}

function upsertOneRM(exName, weight, reps) {
  const est = estimate1RM(weight, reps);
  if (!est) return;

  const key = oneRMKey(exName);
  const current = parseFloat(localStorage.getItem(key) || "0") || 0;

  // keep the best (highest) estimate
  if (est > current) localStorage.setItem(key, est.toFixed(1));
}

// round to nearest 1.25kg (matches your 1.25 / 2.5 progression vibe)
function roundTo125(x) {
  return Math.round(x / 1.25) * 1.25;
}

function target80(exName) {
  const rm = getOneRM(exName);
  if (!rm) return null;
  return roundTo125(rm * 0.8);
}

// called by inputs to update 1RM using the stored keys
function updateOneRMFromKeys(exName, weightKey, repsKey) {
  const w = parseFloat(localStorage.getItem(weightKey) || "");
  const r = parseFloat(localStorage.getItem(repsKey) || "");
  upsertOneRM(exName, w, r);
}
window.updateOneRMFromKeys = updateOneRMFromKeys;
function getSuggestion(dayIndex, exIndex, targetReps, exName) {
  // 80% target if we have a 1RM
  const base = exName ? target80(exName) : null;

  let totalWeight = 0;
  let totalReps = 0;
  let setsLogged = 0;

  for (let s = 1; s <= 6; s++) {
    const w = parseFloat(localStorage.getItem(`d${dayIndex}-e${exIndex}-s${s}-w`));
    const r = parseFloat(localStorage.getItem(`d${dayIndex}-e${exIndex}-s${s}-r`));
    if (!isNaN(w) && !isNaN(r)) {
      totalWeight += w;
      totalReps += r;
      setsLogged++;
    }
  }

  // If no history yet: show the 80% target if we have it, otherwise blank
  if (!setsLogged) return base ? base.toFixed(1) : "";

  const avgWeight = totalWeight / setsLogged;
  const avgReps = totalReps / setsLogged;

  // ALWAYS increase once there is history
  const increase = avgReps >= targetReps ? 2.5 : 1.25;

  // Ensure she's working at (at least) 80% 1RM and trending upward
  const suggested = Math.max(avgWeight + increase, base || 0);

  return suggested.toFixed(1);
}

// ==========================
// RUN HELPERS
// ==========================
function todayRequiresRun(dayObj) {
  if (!dayObj) return false;
  const dn = (dayObj.name || "").toLowerCase();
  if (dn.includes("run")) return true;
  return (dayObj.exercises || []).some((ex) =>
    String(ex.name).toUpperCase().startsWith("RUN_")
  );
}

function getRunPrescription(dayName) {
  const name = (dayName || "").toLowerCase();

  if (name.includes("long easy run")) {
    return {
      title: "Long Easy Run (Comfortable)",
      details: [
        "Warm-up: 5–8 min brisk walk or very easy jog",
        "Run: 3–6km EASY pace (you can talk in sentences)",
        "Cool-down: 5 min walk + light stretching",
      ],
      effort: "Easy",
      defaultDistance: "4.0",
    };
  }

  if (name.includes("run + glutes")) {
    return {
      title: "Run Session (Quality but Controlled)",
      details: [
        "Warm-up: 5–8 min easy jog",
        "Main set: 6 × 1 min faster / 1 min easy (repeat)",
        "Cool-down: 5 min easy + stretch calves/hips",
      ],
      effort: "Moderate",
      defaultDistance: "3.0",
    };
  }

  return {
    title: "Run Session",
    details: ["Warm-up 5 min", "Run easy–moderate", "Cool-down 5 min walk"],
    effort: "Easy",
    defaultDistance: "",
  };
}

// ==========================
// TODAY TAB
// ==========================
function renderToday() {
  const currentAbs = getAbsDay();
  const viewAbs = getViewAbsDay();

  const dayIndex = viewAbs % getActiveProgram().length;
  const day = getActiveProgram()[dayIndex];

 const ss = sessionSuffixForAbs(viewAbs); // matches renderToday input suffix

 const isReadOnly = !isCoachMode() && viewAbs !== currentAbs;

  const week = Math.floor(viewAbs / 7) + 1;
  const phase = getPhaseForWeek(week);
  const microWeek = getMicroWeek(week);

  const needsRun = todayRequiresRun(day);
  const runDone = !needsRun ? true : isRunLoggedToday();

  let html = `
    <div class="card">
      <h2>Today</h2>
      ${isReadOnly ? `<div style="background:#f7f7f7;border:1px solid #ddd;border-radius:12px;padding:10px;margin:10px 0;color:#333;">📅 Viewing another day (read-only). You can browse past/future, but you can’t edit or finish.</div>` : ``}
      <div style="color:#666;font-size:13px;margin-top:-6px;margin-bottom:10px;">
        ${getWeekDayLabel()} • Phase: <strong>${getPhaseLabel()}</strong>
      </div>
      ${(typeof getHyroxReadyPct === "function" && getHyroxReadyPct() != null) ? ('<div style="background:#111;color:#fff;padding:8px 12px;border-radius:20px;display:inline-block;font-weight:800;margin:8px 0 10px 0;">HYROX READY: ' + getHyroxReadyPct() + '%</div>') : ''}

      <div id="sessionTimer" style="margin:8px 0 12px 0;font-weight:800;">Session: 0:00 / 90:00</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
        <button onclick="startSessionTimer()" style="padding:10px 12px;cursor:pointer;">Start Session ⏱️</button>
        <button onclick="resetSessionTimer()" style="padding:10px 12px;cursor:pointer;">Reset</button>
      </div>
      <h3>${day.name}</h3>
  `;


  if (isHyroxDay(day)) {
    html += renderHyroxHtml({ ss, week, phase });
  }
  if (needsRun) {
    html += `
      <div style="background:#fff7e6;border:1px solid #f0c36d;border-radius:12px;padding:14px;margin:12px 0;">
        <div style="font-weight:800;margin-bottom:6px;">🏃 Run Session</div>
        <div style="color:#7a5a12;margin-bottom:10px;">
          Please log your run before finishing today’s workout.
        </div>
        <button onclick="showTab('run')" style="padding:10px 12px;cursor:pointer;">
          Go To Run Tab →
        </button>
        <div style="margin-top:8px;color:#666;font-size:13px;">
          Status: ${runDone ? "✅ Run logged" : "❌ Not logged yet"}
        </div>
      </div>
    `;
  }

  day.exercises.forEach((ex, exIndex) => {
    const adj = applyPhaseToExercise(ex, phase, microWeek);
    const exName = String(adj.name || "");

    if (exName === "HYROX_SESSION") return;
    if (exName.toUpperCase().startsWith("RUN_")) return;
// ---- TIMED EXERCISE BLOCK (e.g., Plank) ----
const isTimed = !!adj.timerSec;

if (isTimed) {
  const mins = Math.floor(adj.timerSec / 60);
  const secs = adj.timerSec % 60;
  const durLabel = `${mins}:${String(secs).padStart(2, "0")}`;

  html += `
    <h4>${adj.name} — ${adj.sets} sets × ${durLabel}</h4>
  `;

  for (let s = 1; s <= (adj.sets || 1); s++) {
  const isSidePlank = String(adj.name || "").toLowerCase().includes("side plank");

  html += `
    <div style="margin-bottom:10px;">
      <div style="color:#666;font-size:13px;">Set ${s}${isSidePlank ? " (each side)" : ""}</div>

      <button
        onclick="${
          isSidePlank
            ? `startSidePlankSet(this, ${adj.timerSec}, ${s})`
            : `startCountdownTimer(this, ${adj.timerSec}, '${adj.name} set ${s}', 60)`
        }"
        style="padding:10px 12px;cursor:pointer;"
      >
        Start ${durLabel} Timer
      </button>
    </div>
  `;
}

  html += `<hr>`;
  return; // IMPORTANT: prevents normal reps/weights UI from rendering
}
// -------------------------------------------
const suggestion = getSuggestion(dayIndex, exIndex, adj.reps, adj.name);
   const rm = getOneRM(adj.name);
const t80 = target80(adj.name);
const restSec = getRestSecondsForExercise(adj.name, phase);
const rpeText = getRpeTargetText(adj.name, phase, microWeek);
html += `
      <h4>${adj.name} — ${adj.sets} x ${adj.reps}</h4>
      <small style="color:#666;">
    ${rm ? `1RM: ${rm.toFixed(1)} kg • 80%: ${t80.toFixed(1)} kg` : `1RM: — (log a set to auto-calc)`}
    ${suggestion ? `<br>Suggested next time: ${suggestion} kg` : ""}
    <br><strong>${rpeText}</strong> • Rest: ${restSec}s
  </small>
`;

    for (let s = 1; s <= adj.sets; s++) {
const viewAbs = getViewAbsDay();
const ss = sessionSuffixForAbs(viewAbs);const weightKey = `d${dayIndex}-e${exIndex}-s${s}-w-${ss}`;
const repsKey   = `d${dayIndex}-e${exIndex}-s${s}-r-${ss}`;

      const weight = localStorage.getItem(weightKey) || "";
      const reps = localStorage.getItem(repsKey) || "";

      html += `
        <div style="margin-bottom:10px;">
          <div style="color:#666;font-size:13px;">Set ${s}</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <input
              style="padding:10px;width:160px;"
              placeholder="Weight"
              value="${weight}"
              ${isReadOnly ? "disabled" : ""}
              oninput="${isReadOnly ? "" : `localStorage.setItem('${weightKey}', this.value); updateOneRMFromKeys('${adj.name}', '${weightKey}', '${repsKey}');`}"
            >
            <input
              style="padding:10px;width:160px;"
              placeholder="Reps"
              value="${reps}"
              ${isReadOnly ? "disabled" : ""}
              oninput="${isReadOnly ? "" : `localStorage.setItem('${repsKey}', this.value); updateOneRMFromKeys('${adj.name}', '${weightKey}', '${repsKey}');`}"
            >
          </div>
        </div>
      `;
    }

    html += `
      <button data-rest="${restSec}" onclick="startRestTimer(this)" style="padding:10px 12px;cursor:pointer;margin-bottom:10px;">
        Start ${restSec}s Rest
      </button>
      <hr>
    `;
  });

 html += `
      <button onclick="syncToCoach()" style="padding:10px 12px;cursor:pointer;">
        Sync to Coach ✅
      </button>
      <p id="syncStatus" style="color:#666; margin-top:8px;"></p>

      ${
        isReadOnly
          ? `
            <button onclick="pullSetsFromCoachForViewedDay()" style="padding:10px 12px;cursor:pointer;margin-top:10px;">
              Pull from Coach ⬇️ (Sets)
            </button>
          `
          : ""
      }

      <button
        id="finishBtn"
        onclick="finishWorkout()"
        style="padding:10px 12px;cursor:pointer;margin-top:10px;"
        ${(isReadOnly || !runDone) ? "disabled" : ""}
      >
        Finish Workout ✅
      </button>

      <p id="finishHint" style="color:${runDone ? "#2e7d32" : "#b26a00"}; margin-top:8px;">
        ${
          isReadOnly
            ? "🔒 Read-only past day (can re-sync only)."
            : (runDone ? "✅ Ready to finish." : "🔒 Finish locked until today’s run is logged.")
        }
      </p>

      <p style="color:green;">✓ Auto saved</p>
    </div>
  `;

app.innerHTML = html;
  // keep session timer display live
  tickSessionTimer();
  const k = sessionKeyForToday();
  if (localStorage.getItem(k)) startSessionTimer();
}

// ==========================
// SYNC SETS
// ==========================
async function syncToCoach() {
  const ts = new Date().toISOString();
  const viewAbs = getViewAbsDay();
  const week = Math.floor(viewAbs / 7) + 1;
  const phase = getPhaseForWeek(week);

  const dayIndex = viewAbs % getActiveProgram().length;
  const day = getActiveProgram()[dayIndex];
  const ss = sessionSuffixForAbs(viewAbs); // YYYY-MM-DD (program day date)
  const athlete = getAthleteName();

  const el = document.getElementById("syncStatus");
  if (el) el.textContent = "";

  // --------------------------
  // Build SET rows from localStorage (this viewed day only)
  // Sheet expects: [rowId, ts, athlete, date, exName, setNum, targetReps, weight, reps]
  // --------------------------
  const setRows = [];

  (day.exercises || []).forEach((ex, exIndex) => {
    const exName = String(ex?.name || "");
    if (!exName) return;
    if (exName === "HYROX_SESSION") return;
    if (exName.toUpperCase().startsWith("RUN_")) return;

    const adj = applyPhaseToExercise(ex, phase, getMicroWeek(week));
    const sets = Number(adj.sets) || 1;
    const targetReps = Number(adj.reps) || "";

    for (let s = 1; s <= sets; s++) {
      const wKey = `d${dayIndex}-e${exIndex}-s${s}-w-${ss}`;
      const rKey = `d${dayIndex}-e${exIndex}-s${s}-r-${ss}`;
      const weight = (localStorage.getItem(wKey) || "").trim();
      const reps = (localStorage.getItem(rKey) || "").trim();

      if (!weight && !reps) continue;

      const rowId = `${athlete}|${ss}|ABS${viewAbs}|${exName}|S${s}`;
      const row = [rowId, ts, athlete, ss, exName, s, targetReps, weight, reps];
      setRows.push(row);
      upsertRowIntoHistory(SETS_LOG_KEY, row);
    }
  });

  // --------------------------
  // HYROX row (only on HYROX day)
  // --------------------------
  let hyroxRows = [];
  try {
    if (typeof isHyroxDay === "function" && isHyroxDay(day)) {
      const row = buildHyroxRow({ ss, athlete, abs: viewAbs, week, phase });
      if (row && Array.isArray(row)) {
        hyroxRows = [row];
        upsertRowIntoHistory(HYROX_LOG_KEY, row);
      }
    }
  } catch (e) {
    console.warn("HYROX row build failed (non-blocking)", e);
    hyroxRows = [];
  }

  const payload = JSON.stringify({
    setRows,
    runRows: [],
    nutritionRows: [],
    bodyRows: [],
    hyroxRows,
  });

  if (el) el.textContent = "Syncing…";

  try {
    await postToSheets(SHEETS_URL, payload);
    if (el) el.textContent = "✅ Sets synced!";
  } catch (err) {
    console.error(err);

    enqueueSheetsJob({
      kind: "sets",
      url: SHEETS_URL,
      payload,
      createdAt: ts,
    });

    const pending = getPendingSheetsCount();
    if (el) el.textContent = `📥 Offline/failed — saved to queue. Pending: ${pending}`;
  }
}
window.syncToCoach = syncToCoach;
window.pullSetsFromCoachForViewedDay = async function pullSetsFromCoachForViewedDay() {
  const athlete = getAthleteName();
  const viewAbs = getViewAbsDay();
  const dayIndex = viewAbs % getActiveProgram().length;
  const day = getActiveProgram()[dayIndex];
  const ss = sessionSuffixForAbs(viewAbs); // YYYY-MM-DD
  const date = ss;

  const el = document.getElementById("syncStatus");
  if (el) el.textContent = "⬇️ Pulling from coach…";

  const qs = new URLSearchParams({
    action: "getSets",
    athlete,
    date,
    abs: String(viewAbs),
  });

  const res = await fetch(`${SHEETS_URL}?${qs.toString()}`);
  const data = await res.json();
console.log("PULL params", {
  athlete,
  viewAbs,
  date,
  dayIndex,
  dayName: day?.name
});

console.log(
  "PULL rows count",
  Array.isArray(data.setRows) ? data.setRows.length : "no setRows",
  data
);
  const rows = Array.isArray(data.setRows) ? data.setRows : [];

if (!rows.length) {
  if (el) el.textContent = "⚠️ No coach data for this day.";
  return;
}

// IMPORTANT: use VIEWED day, not current da

// map rows → localStorage keys used by renderToday()
rows.forEach(r => {
  console.log("Row exName:", r[4], "set:", r[5], "w:", r[7], "r:", r[8]);
  const exName = r[4];
  const setNum = Number(r[5]);
  const weight = r[7];
  const reps = r[8];

  const exIndex = day.exercises.findIndex(ex => String(ex.name) === String(exName));
  if (exIndex < 0) return;
console.log("Match exIndex", exIndex, "for", exName, "in day", day.name);
  const wKey = `d${dayIndex}-e${exIndex}-s${setNum}-w-${date}`;
  const rKey = `d${dayIndex}-e${exIndex}-s${setNum}-r-${date}`;

  if (weight !== "") localStorage.setItem(wKey, weight);
  if (reps !== "") localStorage.setItem(rKey, reps);
});

renderToday();
if (el) el.textContent = "✅ Pulled from coach";
};
// ==========================
// FINISH WORKOUT (AUTO SYNC + ADVANCE)
// ==========================
window.finishWorkout = async function finishWorkout() {
  const btn = document.getElementById("finishBtn");
  if (btn) btn.disabled = true;

  const viewAbs = getViewAbsDay();
  const dayIndex = viewAbs % getActiveProgram().length;
  const day = getActiveProgram()[dayIndex];
  const ss = sessionSuffixForAbs(viewAbs);

  // If HYROX day: compute + save score BEFORE advancing
  try {
    if (isHyroxDay(day)) {
      const hyroxScore = computeHyroxScoreFromSavedInputs(ss);
      saveHyroxScore(hyroxScore);

      const hint = document.getElementById("finishHint");
      if (hint) hint.textContent = `✅ HYROX score saved: ${hyroxScore}/100`;
    }
  } catch (e) {
    console.warn("HYROX scoring failed (non-blocking)", e);
  }

  try {
    if (window.syncToCoach) {
      await window.syncToCoach();
    }
  } catch (e) {
    console.warn("Sync failed — queued instead");
  }

  window.nextDay();
};


// ==========================
// RUN TAB
// ==========================
function renderRun() {
  const dayIndex = getCurrentDay();
  const day = getActiveProgram()[dayIndex];
  const date = todayRunDate();

  const prescription = getRunPrescription(day?.name || "");

  const distance =
    localStorage.getItem(runKey(date, "distance")) ||
    prescription.defaultDistance ||
    "";
  const time = localStorage.getItem(runKey(date, "time")) || "";
  const effort =
    localStorage.getItem(runKey(date, "effort")) ||
    prescription.effort ||
    "Easy";
  const notes = localStorage.getItem(runKey(date, "notes")) || "";

  app.innerHTML = `
    <div class="card">
      <h2>Run</h2>

      <div style="background:#f7f7f7;border:1px solid #ddd;border-radius:12px;padding:12px;margin:12px 0;">
        <div style="font-weight:800;margin-bottom:6px;">Today's Run Plan</div>
        <div style="font-weight:700;margin-bottom:6px;">${prescription.title}</div>
        <ul style="margin:0 0 0 18px; padding:0; line-height:1.6; color:#333;">
          ${prescription.details.map((x) => `<li>${x}</li>`).join("")}
        </ul>
        <div style="margin-top:8px;color:#666;font-size:13px;">
          Log your run here, then go back to <strong>Today</strong> to finish the workout.
        </div>
      </div>

      <label>Date</label>
      <input id="runDate" type="date" value="${date}">

      <label>Distance (km)</label>
      <input id="runDistance" inputmode="decimal" placeholder="e.g. 3.0" value="${distance}">

      <label>Time (mm:ss)</label>
      <input id="runTime" placeholder="e.g. 28:30" value="${time}">

      <label>Effort</label>
      <select id="runEffort">
        <option ${effort === "Easy" ? "selected" : ""}>Easy</option>
        <option ${effort === "Moderate" ? "selected" : ""}>Moderate</option>
        <option ${effort === "Hard" ? "selected" : ""}>Hard</option>
      </select>

      <label>Notes</label>
      <input id="runNotes" placeholder="How it felt / terrain / anything notable" value="${notes}">

      <p><strong>Pace:</strong> <span id="paceDisplay">--</span></p>

      <button onclick="syncRun()" style="padding:10px 12px;cursor:pointer;">Sync Run to Coach 🏃</button>
      <p id="runSyncStatus" style="color:#666;"></p>

      <button onclick="showTab('today')" style="padding:10px 12px;cursor:pointer;margin-top:10px;">
        Back to Today →
      </button>
    </div>
  `;

  const dateInput = document.getElementById("runDate");
  const distInput = document.getElementById("runDistance");
  const timeInput = document.getElementById("runTime");
  const effortSelect = document.getElementById("runEffort");
  const notesInput = document.getElementById("runNotes");
  const paceDisplay = document.getElementById("paceDisplay");

  function updatePace() {
    const pace = calculatePace(distInput.value, timeInput.value);
    paceDisplay.textContent = pace || "--";
  }

  dateInput.addEventListener("change", () => {
    localStorage.setItem("run_date", dateInput.value);
    renderRun();
  });

  distInput.addEventListener("input", () => {
    localStorage.setItem(runKey(todayRunDate(), "distance"), distInput.value);
    updatePace();
  });

  timeInput.addEventListener("input", () => {
    localStorage.setItem(runKey(todayRunDate(), "time"), timeInput.value);
    updatePace();
  });

  effortSelect.addEventListener("change", () => {
    localStorage.setItem(runKey(todayRunDate(), "effort"), effortSelect.value);
  });

  notesInput.addEventListener("input", () => {
    localStorage.setItem(runKey(todayRunDate(), "notes"), notesInput.value);
  });

  updatePace();
}

async function syncRun() {
  const ts = new Date().toISOString();
  const date = todayRunDate();

  const distance = (localStorage.getItem(runKey(date, "distance")) || "").trim();
  const time = (localStorage.getItem(runKey(date, "time")) || "").trim();
  const effort = (localStorage.getItem(runKey(date, "effort")) || "").trim();
  const notes = (localStorage.getItem(runKey(date, "notes")) || "").trim();

  const pace = calculatePace(distance, time);

  const el = document.getElementById("runSyncStatus");
  if (el) el.textContent = "";

  if (!distance || !time) {
    if (el) el.textContent = "Please enter both distance and time first.";
    return;
  }

  const rowId = `${getAthleteName()}|RUN|${ts}`;
  const runRows = [[rowId, ts, getAthleteName(), distance, time, effort, notes, pace]];
  runRows.forEach((r) => upsertRowIntoHistory(RUNS_LOG_KEY, r));

  const payload = JSON.stringify({
    setRows: [],
    runRows,
    nutritionRows: [],
    bodyRows: [],
  });

  if (el) el.textContent = "Syncing…";

  try {
    await postToSheets(SHEETS_URL, payload);

    if (el) el.textContent = "✅ Run synced!";

    markRunDoneToday();
    clearRunDraftForToday();

    renderRun();
    renderToday();
  } catch (err) {
    console.error(err);

    enqueueSheetsJob({
      kind: "run",
      url: SHEETS_URL,
      payload,
      createdAt: ts,
    });

    const pending = getPendingSheetsCount();
    if (el) el.textContent = `📥 Offline/failed — run saved to queue. Pending: ${pending}`;
  }
}
window.syncRun = syncRun;

// ==========================
// NUTRITION TAB
// ==========================
function renderNutrition() {
  const date = localStorage.getItem("nutri_date") || todayDateStr();
  const key = (k) => `nutri_${date}_${k}`;

  const energy = localStorage.getItem(key("energy")) || "";
  const notes = localStorage.getItem(key("notes")) || "";

  app.innerHTML = `
    <div class="card">
      <h2>Nutrition (Daily Check)</h2>

      <div style="background:#f7f7f7;border:1px solid #ddd;border-radius:12px;padding:12px;margin:12px 0;">
        <h3 style="margin:0 0 8px 0;">Today's Targets</h3>
        <strong>Protein:</strong> ${NUTRITION_TARGETS.protein_g}g<br>
        <small style="color:#555;">Protein every meal + snack</small><br><br>
        <strong>Water:</strong> ${NUTRITION_TARGETS.water_l_min}-${NUTRITION_TARGETS.water_l_max}L<br>
        <small style="color:#555;">Add extra on run days</small><br><br>
        <strong>Veg:</strong> ${NUTRITION_TARGETS.veg_serves}+ serves<br>
        <small style="color:#555;">2 fists veg lunch + dinner</small><br><br>
        <strong>Steps:</strong> ${NUTRITION_TARGETS.steps.toLocaleString()}+
      </div>

      <label>Date</label>
      <input id="nutriDate" type="date" value="${date}" />

      <hr style="margin:12px 0;">

      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button id="btnProtein" type="button"></button>
        <button id="btnWater" type="button"></button>
        <button id="btnVeg" type="button"></button>
        <button id="btnSteps" type="button"></button>
      </div>

      <div style="margin-top:12px;">
        <label>Steps (optional number)</label>
        <input id="nutriStepsCount" placeholder="e.g. 10350" />
      </div>

      <div style="margin-top:12px;">
        <label>Energy (1–5)</label>
        <input id="nutriEnergy" inputmode="numeric" placeholder="1–5" value="${energy}">
      </div>

      <div style="margin-top:8px;">
        <label>Notes</label>
        <input id="nutriNotes" placeholder="Hunger/sleep/stress etc" value="${notes}">
      </div>

      <div style="margin-top:12px;">
        <button onclick="syncNutrition()" style="padding:10px 12px;cursor:pointer;">Sync Nutrition to Coach 🍎</button>
        <p id="nutriSyncStatus" style="color:#666;"></p>
      </div>

      <p style="color:green;">✓ Auto saved</p>
    </div>
  `;

  const nutriDate = document.getElementById("nutriDate");
  const btnProtein = document.getElementById("btnProtein");
  const btnWater = document.getElementById("btnWater");
  const btnVeg = document.getElementById("btnVeg");
  const btnSteps = document.getElementById("btnSteps");

  const inpStepsCount = document.getElementById("nutriStepsCount");
  const inpEnergy = document.getElementById("nutriEnergy");
  const inpNotes = document.getElementById("nutriNotes");

  function setBtn(btn, label, val) {
    const yes = val === "Yes";
    btn.textContent = `${label} ${yes ? "✅" : "❌"}`;
    btn.style.background = yes ? "#111" : "#fff";
    btn.style.color = yes ? "#fff" : "#111";
    btn.style.border = "1px solid #111";
    btn.style.padding = "10px 12px";
    btn.style.cursor = "pointer";
  }

  function toggle(field) {
    const cur = localStorage.getItem(key(field)) || "No";
    localStorage.setItem(key(field), cur === "Yes" ? "No" : "Yes");
    refresh();
  }

  function refresh() {
    setBtn(btnProtein, "Protein", localStorage.getItem(key("protein")) || "No");
    setBtn(btnWater, "Water", localStorage.getItem(key("water")) || "No");
    setBtn(btnVeg, "Veg", localStorage.getItem(key("veg")) || "No");
    setBtn(btnSteps, "Steps", localStorage.getItem(key("steps")) || "No");
    inpStepsCount.value = localStorage.getItem(key("stepsCount")) || "";
  }

  nutriDate.addEventListener("change", () => {
    localStorage.setItem("nutri_date", nutriDate.value);
    renderNutrition();
  });

  btnProtein.onclick = () => toggle("protein");
  btnWater.onclick = () => toggle("water");
  btnVeg.onclick = () => toggle("veg");
  btnSteps.onclick = () => toggle("steps");

  inpStepsCount.oninput = () =>
    localStorage.setItem(key("stepsCount"), inpStepsCount.value);
  inpEnergy.oninput = () => localStorage.setItem(key("energy"), inpEnergy.value);
  inpNotes.oninput = () => localStorage.setItem(key("notes"), inpNotes.value);

  refresh();
}

async function syncNutrition() {
  const ts = new Date().toISOString();
  const date = localStorage.getItem("nutri_date") || todayDateStr();
  const key = (k) => `nutri_${date}_${k}`;

  const protein = localStorage.getItem(key("protein")) || "No";
  const water = localStorage.getItem(key("water")) || "No";
  const veg = localStorage.getItem(key("veg")) || "No";
  const steps = localStorage.getItem(key("steps")) || "No";
  const stepsCount = (localStorage.getItem(key("stepsCount")) || "").trim();
  const energy = (localStorage.getItem(key("energy")) || "").trim();
  const notes = (localStorage.getItem(key("notes")) || "").trim();

  const rowId = `${getAthleteName()}|NUTRITION|${date}`;
  const nutritionRows = [
    [rowId, date, getAthleteName(), protein, water, veg, steps, stepsCount, energy, notes, ts],
  ];
  nutritionRows.forEach((r) => upsertRowIntoHistory(NUTRI_LOG_KEY, r));

  const payload = JSON.stringify({
    setRows: [],
    runRows: [],
    nutritionRows,
    bodyRows: [],
    hyroxRows: [],
  });

  const el = document.getElementById("nutriSyncStatus");
  if (el) el.textContent = "Syncing…";

  try {
    await postToSheets(SHEETS_URL, payload);
    if (el) el.textContent = "✅ Nutrition synced!";
  } catch (err) {
    console.error(err);

    enqueueSheetsJob({
      kind: "nutrition",
      url: SHEETS_URL,
      payload,
      createdAt: ts,
    });

    const pending = getPendingSheetsCount();
    if (el) el.textContent = `📥 Offline/failed — saved to queue. Pending: ${pending}`;
  }
}
window.syncNutrition = syncNutrition;

// ==========================
// BODY TAB
// ==========================
function renderBody() {
  const date = localStorage.getItem("body_date") || todayDateStr();
  const key = (k) => `body_${date}_${k}`;

  const weight = localStorage.getItem(key("weight")) || "";
  const waist = localStorage.getItem(key("waist")) || "";
  const hips = localStorage.getItem(key("hips")) || "";
  const notes = localStorage.getItem(key("notes")) || "";

  app.innerHTML = `
    <div class="card">
      <h2>Body Tracking</h2>

      <div style="background:#f7f7f7;border:1px solid #ddd;border-radius:12px;padding:12px;margin-bottom:12px;">
        <strong>Coach Goal</strong><br>
        Lean muscle gain + improved 5K endurance.<br>
        Track weekly trends — not daily fluctuations.
      </div>

      <label>Date</label>
      <input id="bodyDate" type="date" value="${date}">

      <label>Bodyweight (kg)</label>
      <input id="bodyWeight" placeholder="56.0" value="${weight}">

      <label>Waist (cm)</label>
      <input id="bodyWaist" placeholder="Optional" value="${waist}">

      <label>Hips (cm)</label>
      <input id="bodyHips" placeholder="Optional" value="${hips}">

      <label>Notes</label>
      <input id="bodyNotes" placeholder="Sleep, cycle, stress etc" value="${notes}">

      <button onclick="syncBody()" style="padding:10px 12px;cursor:pointer;margin-top:12px;">
        Sync Body to Coach 📊
      </button>
      <p id="bodySyncStatus" style="color:#666;"></p>

      <p style="color:green;">✓ Auto saved</p>
    </div>
  `;

  const dateInput = document.getElementById("bodyDate");
  const weightInput = document.getElementById("bodyWeight");
  const waistInput = document.getElementById("bodyWaist");
  const hipsInput = document.getElementById("bodyHips");
  const notesInput = document.getElementById("bodyNotes");

  dateInput.addEventListener("change", () => {
    localStorage.setItem("body_date", dateInput.value);
    renderBody();
  });

  weightInput.oninput = () => localStorage.setItem(key("weight"), weightInput.value);
  waistInput.oninput = () => localStorage.setItem(key("waist"), waistInput.value);
  hipsInput.oninput = () => localStorage.setItem(key("hips"), hipsInput.value);
  notesInput.oninput = () => localStorage.setItem(key("notes"), notesInput.value);
}

async function syncBody() {
  const ts = new Date().toISOString();
  const date = localStorage.getItem("body_date") || todayDateStr();
  const key = (k) => `body_${date}_${k}`;

  const weight = (localStorage.getItem(key("weight")) || "").trim();
  const waist = (localStorage.getItem(key("waist")) || "").trim();
  const hips = (localStorage.getItem(key("hips")) || "").trim();
  const notes = (localStorage.getItem(key("notes")) || "").trim();

  if (!weight && !waist && !hips && !notes) return;

  const rowId = `${getAthleteName()}|BODY|${date}`;
  const bodyRows = [[rowId, date, getAthleteName(), weight, waist, hips, notes, ts]];
  bodyRows.forEach((r) => upsertRowIntoHistory(BODY_LOG_KEY, r));

  const payload = JSON.stringify({
    setRows: [],
    runRows: [],
    nutritionRows: [],
    bodyRows,
    hyroxRows: [],
  });

  const el = document.getElementById("bodySyncStatus");
  if (el) el.textContent = "Syncing…";

  try {
    await postToSheets(SHEETS_URL, payload);
    if (el) el.textContent = "✅ Body stats synced!";
  } catch (err) {
    console.error(err);

    enqueueSheetsJob({
      kind: "body",
      url: SHEETS_URL,
      payload,
      createdAt: ts,
    });

    const pending = getPendingSheetsCount();
    if (el) el.textContent = `📥 Offline/failed — saved to queue. Pending: ${pending}`;
  }
}
window.syncBody = syncBody;

// ==========================
// PROGRESS TAB (charts + queue UI)
// ==========================
function loadChartJs() {
  return new Promise((resolve, reject) => {
    if (window.Chart) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Chart.js failed to load"));
    document.head.appendChild(s);
  });
}

let runChartInst = null;
let strengthChartInst = null;

function renderProgress() {
  app.innerHTML = `
    <div class="card">
      <h2>Progress</h2>

      <div style="border:1px solid #e5e5e5;border-radius:12px;padding:12px;margin:12px 0;display:flex;align-items:center;gap:12px;justify-content:space-between;">
        <div>
          <div style="font-weight:700;">Sync Queue</div>
          <div id="pendingSync" style="color:#666;font-size:13px;">Checking…</div>
          <div id="retrySyncStatus" style="color:#666;font-size:13px;margin-top:4px;"></div>
        </div>
        <button id="retrySyncBtn" class="btn" style="white-space:nowrap;">Retry now</button>
      </div>

      <div style="border:1px solid #ddd;border-radius:12px;padding:12px;margin:12px 0;">
        <h3 style="margin:0 0 8px 0;">Run Pace Trend</h3>
        <canvas id="runPaceChart" height="180"></canvas>
      </div>

      <div style="border:1px solid #ddd;border-radius:12px;padding:12px;margin:12px 0;">
        <h3 style="margin:0 0 8px 0;">Strength Trend</h3>
        <label>Select exercise</label>
        <select id="exSelect" style="padding:8px;min-width:220px;"></select>
        <canvas id="strengthChart" height="180" style="margin-top:10px;"></canvas>
      </div>

      <p style="color:#666;font-size:13px;">
        Tip: charts use local history. Sync Sets/Run/Nutrition/Body at least once.
      </p>
    </div>
  `;

  updatePendingSyncUI();

  const retryBtn = document.getElementById("retrySyncBtn");
  const retryStatus = document.getElementById("retrySyncStatus");

  if (retryBtn) {
    retryBtn.onclick = async () => {
      try {
        retryBtn.disabled = true;
        if (retryStatus) retryStatus.textContent = "⏳ Retrying queued sync…";

        const res = await flushSheetsQueue({ max: 50 });

        if (retryStatus) {
          if (res.offline) {
            retryStatus.textContent = "📴 Still offline — queued items remain.";
          } else {
            retryStatus.textContent = `✅ Sent ${res.flushed}. Remaining: ${res.pending}`;
          }
        }

        updatePendingSyncUI();
      } catch (e) {
        console.error(e);
        if (retryStatus) retryStatus.textContent = "❌ Retry failed.";
      } finally {
        retryBtn.disabled = false;
      }
    };
  }

  renderCharts();
}

async function renderCharts() {
  try {
    await loadChartJs();
  } catch (e) {
    console.error(e);
    return;
  }

  const runRows = getLogArr(RUNS_LOG_KEY);
  const runLabels = runRows.map((r) => String(r[1] || "").slice(0, 10));
  const runPaceMin = runRows.map((r) => {
    const dist = parseFloat(r[3]);
    const mins = timeToMinutes(r[4]);
    if (!dist || mins == null) return null;
    return mins / dist;
  });

  const runCtx = document.getElementById("runPaceChart")?.getContext("2d");
  if (runCtx) {
    if (runChartInst) runChartInst.destroy();
    runChartInst = new Chart(runCtx, {
      type: "line",
      data: {
        labels: runLabels,
        datasets: [{ label: "Pace (min/km)", data: runPaceMin, spanGaps: true, tension: 0.25 }],
      },
      options: { responsive: true, plugins: { legend: { display: true } } },
    });
  }

  const exSelect = document.getElementById("exSelect");
  if (!exSelect) return;

  const names = [];
  getActiveProgram().forEach((d) =>
    d.exercises.forEach((ex) => {
      const nm = String(ex.name || "");
      if (nm.toUpperCase().startsWith("RUN_")) return;
      if (!names.includes(nm) && ex.sets > 1) names.push(nm);
    })
  );

  exSelect.innerHTML = names.map((n) => `<option value="${n}">${n}</option>`).join("");
  exSelect.value = exSelect.value || names[0] || "";

  function drawStrength(exName) {
    const setRows = getLogArr(SETS_LOG_KEY);

    const map = new Map(); // date -> {sum,count}
    setRows.forEach((r) => {
      if (String(r[4]) !== exName) return;
      const date = String(r[1] || "").slice(0, 10);
      const w = parseFloat(r[7]);
      if (!date || !Number.isFinite(w)) return;

      if (!map.has(date)) map.set(date, { sum: 0, count: 0 });
      const o = map.get(date);
      o.sum += w;
      o.count += 1;
    });

    const dates = [...map.keys()].sort();
    const avg = dates.map((d) => {
      const o = map.get(d);
      return o.count ? o.sum / o.count : null;
    });

    const ctx = document.getElementById("strengthChart")?.getContext("2d");
    if (!ctx) return;

    if (strengthChartInst) strengthChartInst.destroy();
    strengthChartInst = new Chart(ctx, {
      type: "line",
      data: {
        labels: dates,
        datasets: [{ label: `${exName} avg weight (kg)`, data: avg, spanGaps: true, tension: 0.25 }],
      },
      options: { responsive: true, plugins: { legend: { display: true } } },
    });
  }

  drawStrength(exSelect.value);
  exSelect.addEventListener("change", () => drawStrength(exSelect.value));
}

function updatePendingSyncUI() {
  const el = document.getElementById("pendingSync");
  const btn = document.getElementById("retrySyncBtn");
  if (!el) return;

  const pending = getPendingSheetsCount();
  const online = typeof navigator !== "undefined" ? navigator.onLine !== false : true;

  if (pending <= 0) {
    el.textContent = "✅ No pending sync items.";
    if (btn) btn.disabled = true;
    return;
  }

  el.textContent = online
    ? `📤 Pending items: ${pending} (online)`
    : `📥 Pending items: ${pending} (offline)`;

  if (btn) btn.disabled = !online;
}

// ==========================
// BOOT
// ==========================
function bootApp(opts = {}) {
  if (window.__alanaBooted) return;
  window.__alanaBooted = true;
  // --------------------------
  // ACTIVE CLIENT (LOCKED BY APP SHELL)
  // --------------------------
  const activeClientId = normalizeClientId(opts.clientId || "alana");
  window.__trainingActiveClientId = activeClientId;

  // --------------------------
  // NAMESPACE localStorage per client (migration-safe for Alana)
  // This makes ALL existing getItem/setItem calls client-specific
  // without rewriting the whole codebase.
  // --------------------------
  if (!window.__trainingStoragePatched) {
    window.__trainingStoragePatched = true;

    const rawGet = localStorage.getItem.bind(localStorage);
    const rawSet = localStorage.setItem.bind(localStorage);
    const rawRemove = localStorage.removeItem.bind(localStorage);

    localStorage.getItem = (key) => {
      if (typeof key !== "string") return rawGet(key);
      if (key.includes(":")) return rawGet(key);

      const cid = window.__trainingActiveClientId || "alana";
      const namespacedKey = `${cid}:${key}`;
      let v = rawGet(namespacedKey);

      // Migration: Alana can still read legacy keys if namespaced missing
      if (v == null && cid === "alana") v = rawGet(key);
      return v;
    };

    localStorage.setItem = (key, value) => {
      if (typeof key !== "string") return rawSet(key, value);
      if (key.includes(":")) return rawSet(key, value);

      const cid = window.__trainingActiveClientId || "alana";
      const namespacedKey = `${cid}:${key}`;
      rawSet(namespacedKey, value);

      // Migration: keep Alana writing legacy keys for safety
      if (cid === "alana") rawSet(key, value);
    };

    localStorage.removeItem = (key) => {
      if (typeof key !== "string") return rawRemove(key);
      if (key.includes(":")) return rawRemove(key);

      const cid = window.__trainingActiveClientId || "alana";
      const namespacedKey = `${cid}:${key}`;
      rawRemove(namespacedKey);

      if (cid === "alana") rawRemove(key);
    };
    // --------------------------
    // SAFARI FIX: filter Object.keys(localStorage) by active client
    // Safari exposes localStorage keys via Object.keys and some parts of the app
    // scan keys for progress/history. Without filtering, Blake can "see" Alana's legacy keys.
    // --------------------------
    if (!window.__trainingObjectKeysPatched) {
      window.__trainingObjectKeysPatched = true;
      const rawObjectKeys = Object.keys.bind(Object);
      Object.keys = (obj) => {
        const keys = rawObjectKeys(obj);
        if (obj !== localStorage) return keys;

        const cid = window.__trainingActiveClientId || "alana";
        const prefix = `client:${cid}:`;

        return keys.filter((k) => {
          if (k === `pin_ok:${cid}`) return true;
          if (k.startsWith(prefix)) return true;

          // Alana migration: allow legacy un-namespaced keys ONLY for Alana
          if (cid === "alana" && !k.startsWith("client:") && !k.startsWith("pin_ok:")) return true;

          return false;
        });
      };
    }

  }

  app =
    document.getElementById("app") ||
    document.getElementById("root") ||
    document.querySelector("[data-app]");

  if (!app) throw new Error("Missing mount element (#app or #root)");

  initSheetsAutoSync();
  flushSheetsQueue({ max: 20 }).catch(() => {});
  // Ensure view day is initialised
  try { getViewAbsDay(); } catch (e) {}
  updateProgressBadge();

  // Install queue UI listener ONCE
  if (!window.__queueUiListenerInstalled) {
    window.__queueUiListenerInstalled = true;
    window.addEventListener("training:sheetsQueueChanged", () => {
      updatePendingSyncUI();
      updateVisibleSyncStatusTexts();
      updateProgressBadge();
    });
  }

  // Initial render
  showTab("today");

  // Kick the React header once on initial load
  setTimeout(() => {
    window.dispatchEvent(new Event("training:dayChanged"));
  }, 0);
}
window.bootApp = bootApp;
