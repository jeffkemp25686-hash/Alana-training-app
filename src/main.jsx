import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// appCore attaches window.bootApp + window.showTab
import "./appCore.js";
import "./styles.css";

function getClientFromURL() {
  const params = new URLSearchParams(window.location.search);
  const client = params.get("client");
  if (!client) return "alana";
  return String(client).toLowerCase().trim().replace(/\s+/g, "-");
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

// ✅ boot AFTER React commits #app
setTimeout(() => {
  const clientId = getClientFromURL();
  window.bootApp?.({ clientId });
  window.showTab?.("today");
}, 0);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}