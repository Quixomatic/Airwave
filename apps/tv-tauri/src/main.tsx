import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initStore } from "./lib/store";
import "./styles.css";

// Hydrate the persisted store (server URL, token) BEFORE rendering, so the app's
// onboarding gate reads a live value instead of flashing ServerSetup then swapping.
initStore().then(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
