import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { bootApp } from "./appCore.js";

import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <App />
);
bootApp();
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}