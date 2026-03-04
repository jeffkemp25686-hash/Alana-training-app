import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./appCore.js";
import "./styles.css";

function getCookie(name) {
  const m = document.cookie.match(new RegExp("(^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[2]) : "";
}

function setCookie(name, value) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000`;
}

function getClientFromURL() {
  const allowed = ["alana", "blake", "jeff", "coach"];

  // 1) Prefer PATH: /jeff
  const seg = (window.location.pathname || "/").split("/").filter(Boolean)[0];
  const pathClient = seg ? seg.toLowerCase() : "";
  if (pathClient && allowed.includes(pathClient)) {
    localStorage.setItem("lastClient", pathClient);
    setCookie("lastClient", pathClient);
    return pathClient;
  }

  // 2) Fallback to QUERY: ?client=jeff
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("client");
  const qClient = raw ? String(raw).toLowerCase().trim().replace(/\s+/g, "-") : "";
  if (qClient && allowed.includes(qClient)) {
    localStorage.setItem("lastClient", qClient);
    setCookie("lastClient", qClient);
    return qClient;
  }

  // 3) If launched at "/" (common on iOS home screen), recover last client from cookie/localStorage
  const cookieClient = getCookie("lastClient");
  if (cookieClient && allowed.includes(cookieClient)) return cookieClient;

  const saved = localStorage.getItem("lastClient");
  if (saved && allowed.includes(saved)) return saved;

  // 4) Default
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