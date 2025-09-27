import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import { AppProvider } from "./context/AppContext";

// Some legacy vendor bundles expect a global `system` object (lowercase) when running in Safari.
// Ensure it exists so the production bundle doesn't crash before React mounts.
const globalScope =
  (typeof window !== "undefined" && window) ||
  (typeof global !== "undefined" && global) ||
  {};

if (typeof globalScope.system === "undefined") {
  globalScope.system = {};
}

const container = document.getElementById("root");
const root = createRoot(container);

// Ensure App is ALWAYS wrapped by AppProvider
root.render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);
