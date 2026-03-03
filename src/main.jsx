import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./appCore.js";
import "./styles.css";

function getClientFromURL() {
  const params = new URLSearchParams(window.location.search);
  const client = params.get("client");
  if (!client) return "alana";
  return String(client).toLowerCase().trim().replace(/\s+/g, "-");
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
  window.bootApp?.({ clientId });
  window.showTab?.("today");
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

// 👇 This guarantees #app exists before booting
bootWhenReady();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}