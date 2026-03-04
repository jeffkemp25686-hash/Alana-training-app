import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./appCore.js";
import "./styles.css";

function getClientFromURL() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("client");
  const client = raw ? String(raw).toLowerCase().trim().replace(/\s+/g, "-") : "";

  const allowed = ["alana", "blake", "jeff", "coach"];
  if (!client) return "alana";
  if (!allowed.includes(client)) return "alana";
  return client;
}

function bootWhenReady() {
  const el = document.getElementById("app");
  if (!el) {
    requestAnimationFrame(bootWhenReady);
    return;
  }

  // allow re-boot in case a previous early boot happened
  window.__alanaBooted = false;

    const clientId = getClientFromURL();

  if (clientId !== "coach") {
    window.bootApp?.({ clientId });
    window.showTab?.("today");
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

// 👇 This guarantees #app exists before booting
bootWhenReady();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}