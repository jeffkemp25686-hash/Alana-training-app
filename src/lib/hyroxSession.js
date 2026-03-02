import { scaleRun, scaleReps, calculateHyroxScore } from "./hyroxEngine.js";

// Store inputs per day using your date suffix (YYYY-MM-DD)
function hyroxKey(ss, field) {
  return `hyrox_${ss}_${field}`;
}

export function isHyroxDay(dayObj) {
  const n = String(dayObj?.name || "").toLowerCase();
  return n.includes("hyrox");
}

function timeToSec(mmss) {
  const t = String(mmss || "").trim();
  if (!t) return null;
  const parts = t.split(":").map((x) => x.trim());
  if (parts.length !== 2) return null;
  const m = Number(parts[0]);
  const s = Number(parts[1]);
  if (!Number.isFinite(m) || !Number.isFinite(s)) return null;
  return m * 60 + s;
}

function runConsistencyFromSplitsSec(splitsSec) {
  const clean = splitsSec.filter((x) => Number.isFinite(x));
  if (clean.length < 2) return 70; // default if not enough data

  const fastest = Math.min(...clean);
  const slowest = Math.max(...clean);
  const diff = slowest - fastest;

  if (diff <= 10) return 100;
  if (diff <= 20) return 85;
  if (diff <= 30) return 70;
  return 55;
}

export function renderHyroxHtml({ ss, week, phase }) {
  // --- Base design (60 mins total) ---
  // Warmup fixed
  // Engine block fixed structure
  // Main block scales by phase
  // Finisher scales by phase

  // Scales
  const runShort = scaleRun(600);   // meters
  const runMid = scaleRun(800);     // meters
  const wallBallsBase = phase === "Base" ? 20 : phase === "Build" ? 25 : 30;
  const wallBalls = scaleReps(wallBallsBase);

  const rowBase = phase === "Base" ? 400 : phase === "Build" ? 500 : 600;
  const skiBase = phase === "Base" ? 300 : phase === "Build" ? 500 : 600;

  // Pull saved inputs
  const split1 = localStorage.getItem(hyroxKey(ss, "split1")) || "";
  const split2 = localStorage.getItem(hyroxKey(ss, "split2")) || "";
  const split3 = localStorage.getItem(hyroxKey(ss, "split3")) || "";
  const completion = localStorage.getItem(hyroxKey(ss, "completion")) || "100";
  const activeMins = localStorage.getItem(hyroxKey(ss, "activeMins")) || "50";

  const title =
    phase === "Base"
      ? "HYROX Engine Session (Base)"
      : phase === "Build"
      ? "HYROX Engine Session (Density)"
      : "HYROX Engine Session (Race Specific)";

  // Main work by phase
  const main =
    phase === "Base"
      ? `
        <div style="margin-top:10px;">
          <div style="font-weight:800;">Main Work (25 min)</div>
          <div style="color:#333;line-height:1.6;">
            3 rounds (smooth pace):<br>
            • Run ${runShort}m<br>
            • Wall Balls ${wallBalls} (light–moderate)<br>
            • Row ${rowBase}m<br>
            • KB Deadlift 15 reps<br>
          </div>
          <div style="color:#666;font-size:13px;margin-top:6px;">
            Rule: stay aerobic — no redline. Focus transitions + breathing.
          </div>
        </div>
      `
      : phase === "Build"
      ? `
        <div style="margin-top:10px;">
          <div style="font-weight:800;">Main Work (25 min)</div>
          <div style="color:#333;line-height:1.6;">
            4 rounds (pace accountable):<br>
            • Run ${runMid}m<br>
            • Wall Balls ${wallBalls}<br>
            • Walking Lunges 20 steps (DB)<br>
            • Sled Push 20–30m (moderate–heavy)<br>
          </div>
          <div style="color:#666;font-size:13px;margin-top:6px;">
            Rule: keep runs within ~10–20s drift. Push stations, control breathing.
          </div>
        </div>
      `
      : `
        <div style="margin-top:10px;">
          <div style="font-weight:800;">Main Work (25 min)</div>
          <div style="color:#333;line-height:1.6;">
            Race-Specific Ladder (quality suffering):<br>
            • Run 1000m<br>
            • Wall Balls ${wallBalls}<br>
            • Run ${runMid}m<br>
            • Sled Push/Pull combo<br>
            • Run ${runShort}m<br>
            • Farmer Carry 60–80m<br>
            • Run ${runShort}m<br>
            • Burpee Broad Jumps 15–25<br>
          </div>
          <div style="color:#666;font-size:13px;margin-top:6px;">
            Rule: clean transitions + steady pacing. Don’t blow up early.
          </div>
        </div>
      `;

  const finisher =
    phase === "Base"
      ? `EMOM 6: 10 burpees, remainder walk`
      : phase === "Build"
      ? `AMRAP 7: 12 cal ski + 12 burpee broad jumps`
      : `For time (cap 6): ${skiBase}m ski + 30 lunges + 20 wall balls`;

  return `
    <div style="background:#f7f7ff;border:1px solid #d8d8ff;border-radius:12px;padding:14px;margin:12px 0;">
      <div style="font-weight:900;margin-bottom:6px;">🏁 ${title}</div>
      <div style="color:#666;font-size:13px;margin-bottom:10px;">
        Week ${week} • Target: 60 min • Feel it (engine + legs)
      </div>

      <div>
        <div style="font-weight:800;">Warm-up (10 min)</div>
        <div style="color:#333;line-height:1.6;">
          2 rounds:<br>
          • 400m easy run<br>
          • 15 air squats<br>
          • 10 pushups<br>
          • 20 walking lunges<br>
          • 30s easy ski
        </div>
      </div>

      <div style="margin-top:10px;">
        <div style="font-weight:800;">Engine Builder (15 min)</div>
        <div style="color:#333;line-height:1.6;">
          Continuous (Zone 3):<br>
          • Run ${runMid}m<br>
          • Ski ${skiBase}m<br>
          • Farmer Carry 40m (moderate)
        </div>
      </div>

      ${main}

      <div style="margin-top:10px;">
        <div style="font-weight:800;">Finisher (5–7 min)</div>
        <div style="color:#333;line-height:1.6;">
          ${finisher}
        </div>
      </div>

      <div style="margin-top:8px;">
        <div 
          onclick="this.nextElementSibling.style.display =
            this.nextElementSibling.style.display === 'block' ? 'none' : 'block';"
          style="font-size:13px;color:#666;cursor:pointer;">
          ⓘ What does EMOM mean?
        </div>
        <div style="
          display:none;
          margin-top:8px;
          font-size:13px;
          background:#f4f4f4;
          padding:10px;
          border-radius:8px;
          line-height:1.4;">
          <strong>EMOM = Every Minute On the Minute.</strong><br><br>
          Start 10 burpees at the top of each minute.<br>
          When finished, walk until the next minute begins.<br><br>
          Stay smooth — don’t sprint.<br>
          Target effort: 7/10.
        </div>
      </div>

      <div style="margin-top:12px;padding-top:12px;border-top:1px dashed #bbb;">
        <div style="font-weight:900;margin-bottom:6px;">📊 HYROX Score Inputs (quick)</div>
        <div style="color:#666;font-size:13px;margin-bottom:10px;">
          Enter 3 run split times (same distance), completion %, and active minutes.
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
          <div>
            <div style="font-size:12px;color:#666;">Run split 1 (mm:ss)</div>
            <input style="padding:10px;width:140px;" placeholder="e.g. 4:10"
              value="${split1}"
              oninput="localStorage.setItem('${hyroxKey(ss, "split1")}', this.value)">
          </div>

          <div>
            <div style="font-size:12px;color:#666;">Run split 2 (mm:ss)</div>
            <input style="padding:10px;width:140px;" placeholder="e.g. 4:20"
              value="${split2}"
              oninput="localStorage.setItem('${hyroxKey(ss, "split2")}', this.value)">
          </div>

          <div>
            <div style="font-size:12px;color:#666;">Run split 3 (mm:ss)</div>
            <input style="padding:10px;width:140px;" placeholder="e.g. 4:35"
              value="${split3}"
              oninput="localStorage.setItem('${hyroxKey(ss, "split3")}', this.value)">
          </div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <div>
            <div style="font-size:12px;color:#666;">Work completion (%)</div>
            <input style="padding:10px;width:160px;" inputmode="numeric"
              value="${completion}"
              oninput="localStorage.setItem('${hyroxKey(ss, "completion")}', this.value)">
          </div>

          <div>
            <div style="font-size:12px;color:#666;">Active minutes (out of 60)</div>
            <input style="padding:10px;width:200px;" inputmode="numeric"
              value="${activeMins}"
              oninput="localStorage.setItem('${hyroxKey(ss, "activeMins")}', this.value)">
          </div>
        </div>
      </div>
    </div>
  `;
}

export function computeHyroxScoreFromSavedInputs(ss) {
  const s1 = timeToSec(localStorage.getItem(hyroxKey(ss, "split1")));
  const s2 = timeToSec(localStorage.getItem(hyroxKey(ss, "split2")));
  const s3 = timeToSec(localStorage.getItem(hyroxKey(ss, "split3")));

  const runConsistency = runConsistencyFromSplitsSec([s1, s2, s3]);

  const completionRaw = Number(localStorage.getItem(hyroxKey(ss, "completion")) || 0);
  const workCompletion = Math.max(0, Math.min(105, completionRaw));

  const active = Number(localStorage.getItem(hyroxKey(ss, "activeMins")) || 0);
  const density = Math.max(0, Math.min(100, Math.round((active / 60) * 100)));

  const score = calculateHyroxScore({ runConsistency, workCompletion, density });

  return Math.round(Math.max(0, Math.min(100, score)));
}