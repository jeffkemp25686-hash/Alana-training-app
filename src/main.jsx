import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// load appCore for side-effects (it sets window.bootApp, window.showTab, etc)
import "./appCore.js";

import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

// boot the legacy app after React mounts
window.bootApp();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}