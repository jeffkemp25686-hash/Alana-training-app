import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./appCore.js";
import "./styles.css";

function getClientFromURL() {
  const allowed = ["alana", "blake", "jeff", "coach"];

  // ✅ 1) Prefer path: /jeff, /alana, /blake, /coach
  const seg = (window.location.pathname || "/")
    .split("/")
    .filter(Boolean)[0];

  if (seg && allowed.includes(seg.toLowerCase())) {
    return seg.toLowerCase();
  }

  // ✅ 2) Fallback to query: ?client=jeff
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("client");
  const client = raw ? String(raw).toLowerCase().trim().replace(/\s+/g, "-") : "";

  if (client && allowed.includes(client)) return client;

  // ✅ 3) Default
  return "alana";
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