import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import { AppProvider } from "./context/AppContext";

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
