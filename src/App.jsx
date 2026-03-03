import { useEffect, useMemo, useState } from "react";

function getClientFromURL() {
  const params = new URLSearchParams(window.location.search);
  const client = params.get("client");
  if (!client) return "alana";
  return String(client).toLowerCase().trim().replace(/\s+/g, "-");
}

// 🔐 Set PIN per client ("" disables PIN)
const CLIENT_PINS = {
  alana: "1357",
  blake: "2468",
};

function callShowTab(tab) {
  if (window.showTab) window.showTab(tab);
}

function prettyName(clientId) {
  if (!clientId) return "Athlete";
  return clientId.charAt(0).toUpperCase() + clientId.slice(1);
}

export default function App() {
  const [active, setActive] = useState("today");
  const [label, setLabel] = useState("");
  const [phase, setPhase] = useState("");

  const [clientId] = useState(() => getClientFromURL());
  const clientName = useMemo(() => prettyName(clientId), [clientId]);

  // Expose client immediately
  window.__trainingActiveClientId = clientId;

  const requiredPin = CLIENT_PINS[clientId] ?? "";
  const pinOkKey = `pin_ok:${clientId}`;

  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [unlocked, setUnlocked] = useState(() => {
    if (!requiredPin) return true;
    return localStorage.getItem(pinOkKey) === "1";
  });

  useEffect(() => {
    if (!unlocked) return;

    window.__trainingActiveClientId = clientId;

    function refresh() {
      if (window.getWeekDayLabel) setLabel(window.getWeekDayLabel());
      if (window.getPhaseLabel) setPhase(window.getPhaseLabel());
    }

    refresh();
    window.addEventListener("training:dayChanged", refresh);
    return () => window.removeEventListener("training:dayChanged", refresh);
  }, [unlocked, clientId]);

  function go(tab) {
    setActive(tab);
    callShowTab(tab);
  }

  function submitPin(e) {
    e.preventDefault();
    if (!requiredPin) {
      setUnlocked(true);
      return;
    }
    if (pin.trim() === requiredPin) {
      localStorage.setItem(pinOkKey, "1");
      setUnlocked(true);
      setPinError("");
      setPin("");
    } else {
      setPinError("Incorrect code.");
    }
  }

  if (!unlocked) {
    return (
      <div className="shell">
        <header className="topbar">
          <span>{clientName}’s Training</span>
        </header>

        <main className="content" style={{ padding: 18 }}>
          <div
            style={{
              maxWidth: 420,
              margin: "20px auto",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
              Enter access code
            </div>
            <div style={{ opacity: 0.85, marginBottom: 14 }}>
              This program is private.
            </div>

            <form onSubmit={submitPin} style={{ display: "grid", gap: 10 }}>
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Code"
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(0,0,0,0.25)",
                  color: "white",
                  fontSize: 16,
                }}
              />
              {pinError ? (
                <div style={{ color: "#ff6b6b", fontWeight: 700 }}>
                  {pinError}
                </div>
              ) : null}
              <button
                type="submit"
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "none",
                  background: "rgba(0, 180, 255, 0.9)",
                  color: "black",
                  fontWeight: 900,
                  fontSize: 16,
                  cursor: "pointer",
                }}
              >
                Unlock
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span>{clientName}’s Training</span>
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
          {["today","run","nutrition","body","progress"].map(tab => (
            <button
              key={tab}
              className={`navbtn ${active === tab ? "active" : ""}`}
              onClick={() => go(tab)}
              style={{ position: tab === "progress" ? "relative" : undefined }}
            >
              <span className="navlabel">
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </span>
              {tab === "progress" && (
                <span
                  id="progressBadge"
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
              )}
            </button>
          ))}

          <button className="navbtn" onClick={() => window.viewPrevDay?.()}>
            Back
          </button>

          <button className="navbtn" onClick={() => window.viewNextDay?.()}>
            Next
          </button>
        </nav>
      </footer>
    </div>
  );
}