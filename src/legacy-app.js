// ==========================
// ALANA TRAINING APP (COMPLETE)
// WORKOUT ENGINE + SET LOGGING + SUGGESTIONS + REST TIMER
// RUNS (with prescription) + NUTRITION (targets + steps) + BODY
// LOCAL HISTORY + PROGRESS CHARTS
// COACH SYNC via Google Apps Script (payload=...)
// ==========================

// ===== CONFIG =====
const SHEETS_URL =
  "https://script.google.com/macros/s/AKfycbw5jJ4Zk0TtCp9etm2ImxxsSqsxiLoCxZ_U50tZwE1LdqPbkw3hEan8r1YgUCgs7vJaTA/exec";

const ATHLETE = "Alana";

const NUTRITION_TARGETS = {
  protein_g: 110,
  water_l_min: 2.5,
  water_l_max: 3.0,
  veg_serves: 5,
  steps: 10000,
};

const app = document.getElementById("app");
const STORAGE_DAY = "currentTrainingDay";

// ===== LOCAL HISTORY KEYS =====
const SETS_LOG_KEY = "history_sets";       // set rows
const RUNS_LOG_KEY = "history_runs";       // run rows
const NUTRI_LOG_KEY = "history_nutrition"; // nutrition rows
const BODY_LOG_KEY = "history_body";       // body rows

// ==========================
// STORAGE HELPERS
// ==========================
function getLogArr(key) {
  return JSON.parse(localStorage.getItem(key) || "[]");
}
function setLogArr(key, arr) {
  localStorage.setItem(key, JSON.stringify(arr));
}
function upsertRowIntoHistory(storageKey, row) {
  const arr = getLogArr(storageKey);
  const rowId = String(row[0] || "");
  if (!rowId) return;

  const idx = arr.findIndex((r) => String(r[0]) === rowId);
  if (idx >= 0) arr[idx] = row;
  else arr.push(row);

  setLogArr(storageKey, arr);
}

// ==========================
// DATE/TIME HELPERS
// ==========================
function todayDateStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function timeToMinutes(timeStr) {
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

function calculatePace(distance, timeStr) {
  const dist = parseFloat(distance);
  const mins = timeToMinutes(timeStr);
  if (!Number.isFinite(dist) || dist <= 0 || mins == null) return "";

  const pace = mins / dist;
  const m = Math.floor(pace);
  const s = Math.round((pace - m) * 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

// ==========================
// PROGRAM (6 DAYS + 1 ACTIVE REST)
// ==========================
const program = [
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
    ],
  },
  {
    name: "Run + Glutes",
    exercises: [
      { name: "RUN_SESSION", sets: 1, reps: 1 }, // special marker
      { name: "Hip Thrust", sets: 4, reps: 10 },
      { name: "Cable Kickbacks", sets: 3, reps: 15 },
      { name: "Step Ups", sets: 3, reps: 12 },
      { name: "Plank", sets: 3, reps: 30 },
    ],
  },
  {
    name: "Active Recovery",
    exercises: [{ name: "45–60 min walk / mobility", sets: 1, reps: 1 }],
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
    name: "Long Easy Run",
    exercises: [{ name: "RUN_LONG", sets: 1, reps: 1 }], // special marker
  },
];

// ==========================
// NAVIGATION (hooked to your bottom nav buttons)
// ==========================
function showTab(tab) {
  if (tab === "today") renderToday();
  if (tab === "run") renderRun();
  if (tab === "nutrition") renderNutrition();
  if (tab === "body") renderBody();
  if (tab === "progress") renderProgress();
}
window.showTab = showTab;

// ==========================
// DAY TRACKING
// ==========================
function getCurrentDay() {
  let day = localStorage.getItem(STORAGE_DAY);
  if (!day) {
    day = "0";
    localStorage.setItem(STORAGE_DAY, day);
  }
  return parseInt(day, 10);
}

function nextDay() {
  let day = getCurrentDay();
  day = (day + 1) % program.length;
  localStorage.setItem(STORAGE_DAY, String(day));
  renderToday();
}
window.nextDay = nextDay;

// ==========================
// REST TIMER (60s)
// ==========================
function startRestTimer(btn) {
  let seconds = 60;
  btn.disabled = true;

  const interval = setInterval(() => {
    btn.innerText = `Rest ${seconds}s`;
    seconds--;

    if (seconds < 0) {
      clearInterval(interval);
      btn.innerText = "Start 60s Rest";
      btn.disabled = false;
    }
  }, 1000);
}
window.startRestTimer = startRestTimer;

// ==========================
// SET SUGGESTIONS
// ==========================
function getSuggestion(dayIndex, exIndex, targetReps) {
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

  if (!setsLogged) return "";

  const avgWeight = totalWeight / setsLogged;
  const avgReps = totalReps / setsLogged;

  let increase = 0;
  if (avgReps >= targetReps) increase = 2.5;
  else if (avgReps >= targetReps - 1) increase = 1.25;

  return (avgWeight + increase).toFixed(1);
}

// ==========================
// RUN SESSION STATE + LOCKING
// ==========================
function todayRunDate() {
  return localStorage.getItem("run_date") || todayDateStr();
}

function runKey(date, field) {
  return `run_${date}_${field}`;
}

function clearRunDraftForToday() {
  const date = todayRunDate();
  localStorage.removeItem(runKey(date, "distance"));
  localStorage.removeItem(runKey(date, "time"));
  localStorage.removeItem(runKey(date, "effort"));
  localStorage.removeItem(runKey(date, "notes"));
}

function runDoneKey(date) {
  return `run_${date}_done`;
}
function markRunDoneToday() {
  const date = todayRunDate();
  localStorage.setItem(runDoneKey(date), "1");
}
function isRunLoggedToday() {
  const date = todayRunDate();

  // ✅ if synced today, it's done even after clearing the draft
  if (localStorage.getItem(runDoneKey(date)) === "1") return true;

  // draft counts as "done" only if distance + time exist
  const dist = (localStorage.getItem(runKey(date, "distance")) || "").trim();
  const time = (localStorage.getItem(runKey(date, "time")) || "").trim();
  return dist !== "" && time !== "";
}

// Determine if TODAY requires a run entry
function todayRequiresRun(dayObj) {
  if (!dayObj) return false;
  const dn = (dayObj.name || "").toLowerCase();
  if (dn.includes("run")) return true;
  return (dayObj.exercises || []).some((ex) => String(ex.name).toUpperCase().startsWith("RUN_"));
}

// ==========================
// RUN PRESCRIPTION (simple + clear)
// ==========================
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
  const dayIndex = getCurrentDay();
  const day = program[dayIndex];
  const needsRun = todayRequiresRun(day);
  const runDone = !needsRun ? true : isRunLoggedToday();

  let html = `
    <div class="card">
      <h2>Today</h2>
      <h3>${day.name}</h3>
  `;

  // If day requires run, show one clear run card at top
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

  // Render exercises (skip RUN markers completely)
  day.exercises.forEach((ex, exIndex) => {
    const exName = String(ex.name || "");

    if (exName.toUpperCase().startsWith("RUN_")) {
      // no strength inputs for run marker
      return;
    }

    // Normal logging
    const suggestion = getSuggestion(dayIndex, exIndex, ex.reps);

    html += `
      <h4>${ex.name} — ${ex.sets} x ${ex.reps}</h4>
      <small style="color:#666;">
        ${suggestion ? `Suggested next time: ${suggestion} kg` : ""}
      </small>
    `;

    for (let s = 1; s <= ex.sets; s++) {
      const weightKey = `d${dayIndex}-e${exIndex}-s${s}-w`;
      const repsKey = `d${dayIndex}-e${exIndex}-s${s}-r`;

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
              oninput="localStorage.setItem('${weightKey}', this.value)"
            >
            <input
              style="padding:10px;width:160px;"
              placeholder="Reps"
              value="${reps}"
              oninput="localStorage.setItem('${repsKey}', this.value)"
            >
          </div>
        </div>
      `;
    }

    html += `
      <button onclick="startRestTimer(this)" style="padding:10px 12px;cursor:pointer;margin-bottom:10px;">
        Start 60s Rest
      </button>
      <hr>
    `;
  });

  // Buttons: sync + finish (locked until run logged if required)
  html += `
      <button onclick="syncToCoach()" style="padding:10px 12px;cursor:pointer;">
        Sync to Coach ✅
      </button>
      <p id="syncStatus" style="color:#666; margin-top:8px;"></p>

      <button
        id="finishBtn"
        onclick="nextDay()"
        style="padding:10px 12px;cursor:pointer;margin-top:10px;"
        ${runDone ? "" : "disabled"}
      >
        Finish Workout ✅
      </button>

      <p id="finishHint" style="color:${runDone ? "#2e7d32" : "#b26a00"}; margin-top:8px;">
        ${runDone ? "✅ Ready to finish." : "🔒 Finish locked until today’s run is logged."}
      </p>

      <p style="color:green;">✓ Auto saved</p>
    </div>
  `;

  app.innerHTML = html;
}

// ==========================
// SYNC SETS TO COACH (Sheet tab: Sets)
// Columns:
// RowID | Timestamp | Athlete | DayName | Exercise | Set | TargetReps | Weight | Reps
// ==========================
async function syncToCoach() {
  const ts = new Date().toISOString();
  const date = ts.slice(0, 10);
  const dayIndex = getCurrentDay();
  const day = program[dayIndex];

  const setRows = [];

  day.exercises.forEach((ex, exIndex) => {
    const exName = String(ex.name || "");
    if (exName.toUpperCase().startsWith("RUN_")) return;

    for (let s = 1; s <= ex.sets; s++) {
      const w = (localStorage.getItem(`d${dayIndex}-e${exIndex}-s${s}-w`) || "").trim();
      const r = (localStorage.getItem(`d${dayIndex}-e${exIndex}-s${s}-r`) || "").trim();
      if (w || r) {
        const rowId = `${ATHLETE}|${date}|D${dayIndex}|${day.name}|${ex.name}|set${s}`;
        setRows.push([rowId, ts, ATHLETE, day.name, ex.name, s, ex.reps, w, r]);
      }
    }
  });

  setRows.forEach((r) => upsertRowIntoHistory(SETS_LOG_KEY, r));

  const payload = JSON.stringify({
    setRows,
    runRows: [],
    nutritionRows: [],
    bodyRows: [],
  });

  const el = document.getElementById("syncStatus");
  if (el) el.textContent = "Syncing…";

  try {
    await fetch(SHEETS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: "payload=" + encodeURIComponent(payload),
    });
    if (el) el.textContent = "✅ Synced. Check Google Sheet → Sets tab.";
  } catch (err) {
    console.error(err);
    if (el) el.textContent = "❌ Sync failed (check URL / deployment).";
  }
}
window.syncToCoach = syncToCoach;

// ==========================
// RUN TAB (prescription + logging)
// ==========================
function renderRun() {
  const dayIndex = getCurrentDay();
  const day = program[dayIndex];
  const date = todayRunDate();

  const prescription = getRunPrescription(day?.name || "");

  const distance = localStorage.getItem(runKey(date, "distance")) || prescription.defaultDistance || "";
  const time = localStorage.getItem(runKey(date, "time")) || "";
  const effort = localStorage.getItem(runKey(date, "effort")) || prescription.effort || "Easy";
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

// ==========================
// RUN SYNC (Sheet tab: Runs)
// Headers recommended:
// RowID | Timestamp | Athlete | DistanceKm | Time | Effort | Notes | Pace
// ==========================
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

  // Unique RowID so each run is stored historically
  const rowId = `${ATHLETE}|RUN|${ts}`;

  const runRows = [[rowId, ts, ATHLETE, distance, time, effort, notes, pace]];
  runRows.forEach((r) => upsertRowIntoHistory(RUNS_LOG_KEY, r));

  const payload = JSON.stringify({
    setRows: [],
    runRows,
    nutritionRows: [],
    bodyRows: [],
  });

  if (el) el.textContent = "Syncing…";

  try {
    await fetch(SHEETS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: "payload=" + encodeURIComponent(payload),
    });

    if (el) el.textContent = "✅ Run synced!";

    // ✅ This is the unlock flag (survives clearing draft)
    markRunDoneToday();

    // Clear draft so it doesn't carry over
    clearRunDraftForToday();

    // Refresh UI (Run cleared, Today unlocked)
    renderRun();
    renderToday();
  } catch (err) {
    console.error(err);
    if (el) el.textContent = "❌ Sync failed.";
  }
}
window.syncRun = syncRun;

// ==========================
// NUTRITION TAB (targets + toggles + steps count)
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

      <div style="background:#fff;border:1px solid #ddd;border-radius:12px;padding:12px;margin:12px 0;">
        <h3 style="margin:0 0 8px 0;">Protein Cheatsheet 🍗</h3>
        <div style="line-height:1.6;color:#444;">
          <strong>≈30g protein examples:</strong><br>
          ✅ 150g chicken breast<br>
          ✅ 200g Greek yogurt<br>
          ✅ Whey shake + milk<br>
          ✅ 4 eggs + egg whites<br>
          ✅ 150g lean beef<br>
          ✅ Tuna + rice cakes<br><br>
          <small style="color:#666;">
            Goal = ~4 protein feeds/day → hits ${NUTRITION_TARGETS.protein_g}g automatically.
          </small>
        </div>
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

  inpStepsCount.oninput = () => localStorage.setItem(key("stepsCount"), inpStepsCount.value);
  inpEnergy.oninput = () => localStorage.setItem(key("energy"), inpEnergy.value);
  inpNotes.oninput = () => localStorage.setItem(key("notes"), inpNotes.value);

  refresh();
}

// ==========================
// NUTRITION SYNC (Sheet tab: Nutrition)
// RowID | Date | Athlete | Protein | Water | Veg | Steps | StepsCount | Energy | Notes | Timestamp
// ==========================
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

  const rowId = `${ATHLETE}|NUTRITION|${date}`;

  const nutritionRows = [[rowId, date, ATHLETE, protein, water, veg, steps, stepsCount, energy, notes, ts]];
  nutritionRows.forEach((r) => upsertRowIntoHistory(NUTRI_LOG_KEY, r));

  const payload = JSON.stringify({
    setRows: [],
    runRows: [],
    nutritionRows,
    bodyRows: [],
  });

  const el = document.getElementById("nutriSyncStatus");
  if (el) el.textContent = "Syncing…";

  try {
    await fetch(SHEETS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: "payload=" + encodeURIComponent(payload),
    });
    if (el) el.textContent = "✅ Nutrition synced!";
  } catch (err) {
    console.error(err);
    if (el) el.textContent = "❌ Sync failed.";
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

// ==========================
// BODY SYNC (Sheet tab: Body)
// RowID | Date | Athlete | WeightKg | WaistCm | HipsCm | Notes | Timestamp
// ==========================
async function syncBody() {
  const ts = new Date().toISOString();
  const date = localStorage.getItem("body_date") || todayDateStr();
  const key = (k) => `body_${date}_${k}`;

  const weight = (localStorage.getItem(key("weight")) || "").trim();
  const waist = (localStorage.getItem(key("waist")) || "").trim();
  const hips = (localStorage.getItem(key("hips")) || "").trim();
  const notes = (localStorage.getItem(key("notes")) || "").trim();

  if (!weight && !waist && !hips && !notes) return;

  const rowId = `${ATHLETE}|BODY|${date}`;
  const bodyRows = [[rowId, date, ATHLETE, weight, waist, hips, notes, ts]];
  bodyRows.forEach((r) => upsertRowIntoHistory(BODY_LOG_KEY, r));

  const payload = JSON.stringify({
    setRows: [],
    runRows: [],
    nutritionRows: [],
    bodyRows,
  });

  const el = document.getElementById("bodySyncStatus");
  if (el) el.textContent = "Syncing…";

  try {
    await fetch(SHEETS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: "payload=" + encodeURIComponent(payload),
    });
    if (el) el.textContent = "✅ Body stats synced!";
  } catch (err) {
    console.error(err);
    if (el) el.textContent = "❌ Sync failed.";
  }
}
window.syncBody = syncBody;

// ==========================
// PROGRESS TAB (charts)
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

  renderCharts();
}

async function renderCharts() {
  try {
    await loadChartJs();
  } catch (e) {
    console.error(e);
    return;
  }

  // ===== RUN PACE =====
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

  // ===== STRENGTH AVG WEIGHT =====
  const exSelect = document.getElementById("exSelect");
  if (!exSelect) return;

  const names = [];
  program.forEach((d) =>
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

// ==========================
// INITIAL LOAD
// ==========================
renderToday();
