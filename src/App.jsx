import { useEffect, useState } from "react";
import { bootApp } from "./appCore";

function callShowTab(tab) {
  if (window.showTab) window.showTab(tab);
}



export default function App() {
  const [active, setActive] = useState("today");
  const [label, setLabel] = useState("");
  const [phase, setPhase] = useState("");

  useEffect(() => {
    // Boot the legacy app into #app
    bootApp();
    callShowTab("today");

    function refresh() {
      if (window.getWeekDayLabel) setLabel(window.getWeekDayLabel());
      if (window.getPhaseLabel) setPhase(window.getPhaseLabel());
    }

    refresh();
    window.addEventListener("training:dayChanged", refresh);
    return () => window.removeEventListener("training:dayChanged", refresh);
  }, []);

  function go(tab) {
    setActive(tab);
    callShowTab(tab);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span>Alana’s Training</span>
        <span style={{ marginLeft: 10, fontWeight: 700, opacity: 0.9 }}>
          {label}
          {phase ? ` • ${phase}` : ""}
        </span>
      </header>

      <main className="content">
        <div id="app" />
      </main>

      <footer className="bottomnavOuter">
        <nav className="bottomnav">
          <button
            className={`navbtn ${active === "today" ? "active" : ""}`}
            onClick={() => go("today")}
          >
            <span className="navicon">🏋️‍♀️</span>
            <span className="navlabel">Today</span>
          </button>

          <button
            className={`navbtn ${active === "run" ? "active" : ""}`}
            onClick={() => go("run")}
          >
            <span className="navicon">🏃</span>
            <span className="navlabel">Run</span>
          </button>

          <button
            className={`navbtn ${active === "nutrition" ? "active" : ""}`}
            onClick={() => go("nutrition")}
          >
            <span className="navicon">🍏</span>
            <span className="navlabel">Nutrition</span>
          </button>

          {/* ✅ BODY TAB (put this back if it’s missing) */}
          <button
            className={`navbtn ${active === "body" ? "active" : ""}`}
            onClick={() => go("body")}
          >
            <span className="navicon">🧍</span>
            <span className="navlabel">Body</span>
          </button>

          {/* ✅ ONLY ONE PROGRESS BUTTON + badge */}
          <button
            className={`navbtn ${active === "progress" ? "active" : ""}`}
            onClick={() => go("progress")}
            style={{ position: "relative" }}
          >
            <span className="navicon">📈</span>
            <span className="navlabel">Progress</span>

            <span
              id="progressBadge"
              aria-label="Pending sync"
              style={{
                display: "none",
                position: "absolute",
                top: 8,
                right: 14,
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "#ff3b30",
              }}
            />
          </button>

          <button className="navbtn" onClick={() => window.viewPrevDay?.()}>
  <span className="navicon">⏮️</span>
  <span className="navlabel">Back</span>
</button>

<button className="navbtn" onClick={() => window.viewNextDay?.()}>
  <span className="navicon">⏭️</span>
  <span className="navlabel">Next</span>
</button>
        </nav>
      </footer>
    </div>
  );
}
