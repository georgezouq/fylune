/* eslint-disable no-unused-vars -- the base ESLint config does not mark JSX references as usage */
import React from "react";
import { createRoot } from "react-dom/client";
import "./i18n/index.js";
import { App } from "./App.jsx";
import "./design-system/tokens.css";
import "./styles.css";
import "./preview-and-tabs.css";
import "./tab-controls.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
