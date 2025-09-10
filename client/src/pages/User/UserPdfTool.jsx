import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";

// Configure PDF.js worker
const PDFJS_VERSION = pdfjsLib.version || "5.4.54";
const PDFJS_MAJOR = parseInt(PDFJS_VERSION.split(".")[0], 10) || 5;
const WORKER_EXT = PDFJS_MAJOR >= 4 ? "mjs" : "js";
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.${WORKER_EXT}`;

/* ------------------------------------------
   Helpers: inject Google Fonts & Font Awesome
------------------------------------------- */
const ensureHeadLink = (href, attrs = {}) => {
  if (typeof document === "undefined") return;
  if ([...document.styleSheets].some((s) => (s?.href || "").includes(href))) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  Object.entries(attrs).forEach(([k, v]) => link.setAttribute(k, v));
  document.head.appendChild(link);
};

const ensureExternalAssets = () => {
  // Extended font options
ensureHeadLink(
  "https://fonts.googleapis.com/css2" +
  "?family=Inter:wght@400;500;600;700" +
  "&family=Great+Vibes" +
  "&family=Pacifico" +
  "&family=Satisfy" +
  "&family=Dancing+Script:wght@400;600" +
  "&family=Caveat:wght@500;700" +
  "&family=Allura" +
  "&family=Sacramento" +
  "&family=Kaushan+Script" +
  "&family=Amatic+SC:wght@700" +
  "&family=Permanent+Marker" +
  "&family=Rock+Salt" +
  "&family=Homemade+Apple" +
  "&family=Parisienne" +
  "&family=Yellowtail" +
  "&family=Marck+Script" +
  "&family=Alex+Brush" +
  "&family=Cookie" +
  "&family=Courgette" +
  // New additions
  "&family=Arizonia" +
  "&family=Clicker+Script" +
  "&family=Mr+Dafoe" +
  "&family=Qwigley" +
  "&family=Pinyon+Script" +
  "&family=Tangerine:wght@400;700" +
  "&family=Herr+Von+Muellerhoff" +
  "&family=La+Belle+Aurore" +
  "&family=Bad+Script" +
  "&family=Rouge+Script" +
  "&family=Bilbo+Swash+Caps" +
  "&family=Meddon" +
  "&family=Mea+Culpa" +
  "&display=swap",
  { "data-google-fonts": "true" }
);
  if (
    ![...document.styleSheets].some(
      (s) =>
        (s?.href || "").includes("fontawesome") ||
        (s?.href || "").includes("font-awesome") ||
        (s?.href || "").includes("cdnjs.cloudflare.com/ajax/libs/font-awesome")
    )
  ) {
    ensureHeadLink(
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css",
      { "data-fontawesome": "true" }
    );
  }
};

/* ------------------------------------------
   Measuring helpers for auto-fitting signature text
------------------------------------------- */
const measureCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
const measureCtx = measureCanvas ? measureCanvas.getContext("2d") : null;

function computeFittingFontSize({ text, fontFamily, maxWidth, maxHeight }) {
  if (!measureCtx) return 12;
  const pad = 4;
  let low = 8, high = Math.max(10, Math.floor(maxHeight - pad));
  let best = 8;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    measureCtx.font = `${mid}px '${fontFamily}', cursive`;
    const w = measureCtx.measureText(text).width;
    const h = mid;
    if (w <= Math.max(2, maxWidth - pad) && h <= Math.max(2, maxHeight - pad)) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return Math.max(8, best);
}

const generateInitials = (fullName) => {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) {
    const n = parts[0];
    return n.length === 1 ? n.toUpperCase() : (n[0] + n[n.length - 1]).toUpperCase();
  }
  const particles = ["de", "la", "del", "van", "von", "der", "den", "ter", "da"];
  const sig = parts.filter((p) => !particles.includes(p.toLowerCase()));
  if (sig.length >= 2) return (sig[0][0] + sig[sig.length - 1][0]).toUpperCase();
  if (sig.length === 1) {
    const n = sig[0];
    return n.length === 1 ? n.toUpperCase() : (n[0] + n[n.length - 1]).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Add this near the top (after generateInitials or helpers)
const FONT_CHOICES = [
  // already in your app
  "Dancing Script","Great Vibes","Pacifico","Satisfy","Caveat","Allura",
  "Sacramento","Kaushan Script","Amatic SC","Permanent Marker","Rock Salt",
  "Homemade Apple","Parisienne","Yellowtail","Marck Script","Alex Brush",
  "Cookie","Courgette",
  // new cursive options
  "Arizonia","Clicker Script","Mr Dafoe","Qwigley","Pinyon Script",
  "Tangerine","Herr Von Muellerhoff","La Belle Aurore","Bad Script",
  "Rouge Script","Bilbo Swash Caps","Meddon","Mea Culpa"
];

/* ------------------------------------------
   CSS Styles from index.css - FIXED z-index issues
------------------------------------------- */
const styles = `
:root {
  --blue:#1e88ff;
  --bg:#0f1220;
  --panel:#0f162b;
  --panel-2:#101a34;
  --muted:#2a334d;
  --muted-2:#1b2236;
  --text:#e8ecf3;
  --text-dim:#a9b3c9;
  --green:#1db954;
  --red:#ff5c5c;
  --amber:#ffb020;
  --teal:#32d4a4;
  --pill-bg:#202a44;
  --shadow:0 14px 40px rgba(0,0,0,.35);
  --radius:14px;
  --radius-sm:10px;
  --glass:rgba(17,22,38,.8);
  --stroke:#1b2340;
  --ring:#4c66ff;
  --ring-soft:rgba(76,102,255,.28);
  --right-panel: 360px;
  --right-gap: 24px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { 
  font: 14px/1.45 system-ui, -apple-system, sans-serif; 
  background: linear-gradient(180deg,#0b0f1d 0%, #0c1020 40%, #0a0e1b 100%);
  color: var(--text);
}


.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  color: #e8ecf3;
}

.brand i {
  font-size: 20px;
  color: #42b0d5;
}

.controls {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
}

.spacer { flex: 1; }

button, .file-btn > span {
  background: #1b2547;
  border: 1px solid #2e3a6b;
  color: #d8e2ff;
  padding: 9px 14px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.15s;
  position: relative; /* Ensure button content is above */
}

button:hover {
  background: #233061;
  border-color: #3a4a7d;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,.2);
}

button.primary {
  background: linear-gradient(180deg,#3f76ff,#315bff);
  border-color: #2b47c6;
  color: #fff;
}

button.primary:hover {
  background: linear-gradient(180deg,#4a81ff,#3a66ff);
  box-shadow: 0 4px 16px rgba(63,118,255,.3);
}

button.ghost {
  background: #111831;
  border-color: #26335d;
  color: #c9d5ff;
}

button.danger {
  background: #2a151a;
  border-color: #7a2b36;
  color: #ffc9ce;
}

button:disabled {
  opacity: .45;
  cursor: not-allowed;
  transform: none;
}

button:disabled:hover {
  transform: none;
  box-shadow: none;
}

.file-btn {
  position: relative;
  display: inline-block;
  overflow: hidden; /* ensure the overlay stays within the button bounds */
}


.file-btn > span {
  display: inline-block;
  z-index: 1;
  pointer-events: none; /* avoid intercepting the click */
}

.layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  padding: 16px;
  min-height: calc(100vh - 64px);
}

body.user-mode .layout {
  grid-template-columns: 1fr;
}

/* Keep header controls visible when the right panel is fixed */
body.user-mode .topbar {
  position: relative; /* create its own stacking context */
  z-index: 60;        /* above .right (which is z-index: 40) */
  padding-right: calc(var(--right-panel) + var(--right-gap) + 24px); /* reserve space for the panel */
}

.viewer {
  background: linear-gradient(180deg,#0e1330,#0b1026);
  border: 1px solid #1e2851;
  border-radius: 16px;
  box-shadow: var(--shadow);
  overflow: auto;
  padding: 18px;
  height: calc(100vh - 96px);
}

body.user-mode .viewer {
  padding-right: calc(var(--right-panel) + var(--right-gap) + 24px);
}

.pages {
  display: flex;
  flex-direction: column;
  gap: 18px;
  align-items: center;
}

.page-wrap {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 6px 20px rgba(0,0,0,.45), inset 0 0 0 1px #2a3769;
  background: #fff;
}

.page-canvas {
  display: block;
  max-width: 100%;
  height: auto;
}

.overlay {
  position: absolute;
  inset: 0;
  pointer-events: auto;
}

/* DocuSign-style field */
.field {
  position: absolute;
  border-radius: 3px;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0 8px;
  gap: 6px;
  font-size: 13px;
  font-weight: 400;
  min-height: 35px;
}

.field[data-type="signature"],
.field[data-type="initials"],
.field[data-type="date"],
.field[data-type="text"],
.field[data-type="name"],
.field[data-type="email"],
.field[data-type="company"],
.field[data-type="title"],
.field[data-type="number"],
.field[data-type="checkbox"],
.field[data-type="dropdown"],
.field[data-type="stamp"] {
  background: #e6f7fb;
  border: 1px solid #42b0d5;
}

.field:hover {
  background: #d4f1f9;
  border-color: #2b9ec3;
  box-shadow: 0 2px 8px rgba(66,176,213,.2);
}

.field.filled {
  background: rgba(255,255,255,0.95);
  border: 1px solid #10b981;
}

/* DocuSign-style yellow icon badges */
.field-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fbbf24;
  border-radius: 3px;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.field-icon i {
  font-size: 13px;
}

.field-icon.initials {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.field-label {
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}

.field.filled .field-label {
  color: #047857;
}

/* Signature content in filled fields */
.signature-content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  font-style: italic;
}

/* Right panel - FIXED z-index */
main.layout .right {
  background: linear-gradient(180deg,var(--panel),var(--panel-2));
  border: 1px solid #242e56;
  border-radius: 16px;
  padding: 14px;
  box-shadow: var(--shadow);
  height: fit-content;
  position: sticky;
  top: 88px;
}

body.user-mode main.layout .right {
  position: fixed;
  right: var(--right-gap);
  top: 88px;
  width: var(--right-panel);
  max-height: calc(100vh - 120px);
  overflow: auto;
  z-index: 40; /* Reduced from 60 to be below topbar */
}

.right h3 {
  margin: 6px 0 10px 0;
  color: #cfe0ff;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.fill-list {
  display: grid;
  gap: 10px;
}

/* Show about 7 items, then scroll */
.right .fill-list {
  max-height: calc(7 * 64px + 6 * 10px); /* 7 rows + 6 gaps (gap=10px) */
  overflow: auto;
  padding-right: 6px; /* space for scrollbar */
}

/* Flash highlight when focusing a field */
.field.flash-highlight {
  box-shadow: 0 0 0 3px rgba(74,158,255,.7), 0 0 0 8px rgba(74,158,255,.25);
  transition: box-shadow .3s ease-out;
}

.fill-item {
  background: #0f1837;
  border: 1px solid #2b3868;
  border-left: 4px solid #2b3868;
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  transition: all 0.15s;
  cursor: pointer;
}

.fill-item:hover {
  background: #121c3a;
  border-color: #334580;
}

.fill-item .left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.fill-item .idx {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: #0e1330;
  border: 1px solid #293872;
  color: #b9c7f8;
  font-weight: 700;
  font-size: .9rem;
}

.fill-item .label {
  font-weight: 600;
  color: #e8ecf3;
}

.fill-item .meta {
  font-size: .85rem;
  color: #9fb0e8;
}

.fill-item .status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #9fb0e8;
}

.fill-item.filled {
  border-color: #1f7138;
  border-left-color: #22c55e;
  background: linear-gradient(180deg,#0f1f1a,#0c1714);
}

.fill-item.filled .status {
  color: #22c55e;
}

/* Zoom control */
.zoom-control {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #2a3868;
}

.zoom-control label {
  font-size: 12px;
  color: #9fb0e8;
  white-space: nowrap;
}

.zoom-control button {
  padding: 4px 8px !important;
  font-size: 12px !important;
  min-width: 30px;
}

.zoom-control input[type="range"] {
  flex: 1;
  height: 6px;
  background: linear-gradient(90deg,#23345d,#2f447c);
  border-radius: 999px;
  outline: none;
  -webkit-appearance: none;
}

.zoom-control input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #42b0d5;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,.3);
}

.zoom-control input[type="range"]::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #42b0d5;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,.3);
  border: none;
}

.zoom-val {
  font-size: .85rem;
  color: #9fb0e8;
  min-width: 45px;
  text-align: right;
}

/* Modal */
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.55);
  display: grid;
  place-items: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.modal.hidden {
  display: none;
}

.modal-card {
  width: min(1100px,95vw);
  background: #0f142a;
  border: 1px solid #243064;
  border-radius: 16px;
  box-shadow: var(--shadow);
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #233264;
}

.modal-head h2 {
  margin: 0;
  color: #e8ecf3;
  font-size: 18px;
}

.icon-btn {
  background: #121a36;
  border: 1px solid #2a3668;
  border-radius: 10px;
  padding: 6px 10px;
  cursor: pointer;
  color: #9fb0e8;
  transition: all 0.15s;
}

.icon-btn:hover {
  background: #1a2344;
  border-color: #3a4a7d;
}

.modal-body {
  padding: 14px;
  overflow: auto;
  flex: 1;
}

.columns {
  display: grid;
  grid-template-columns: 1.3fr .9fr;
  gap: 16px;
}

.columns .left input {
  width: 100%;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid #2b3767;
  background: #0c1228;
  color: #e8ecff;
  margin-bottom: 10px;
  outline: none;
}

.columns .left input:focus {
  border-color: #42b0d5;
  box-shadow: 0 0 0 3px rgba(66,176,213,.2);
}

.columns .left label {
  display: block;
  font-size: 12px;
  color: #9fb0e8;
  margin-bottom: 6px;
}

.tabs {
  display: flex;
  gap: 8px;
  margin: 12px 0;
  flex-wrap: wrap;
}

.tab {
  background: #111a36;
  border: 1px solid #2a3668;
  color: #cbd6ff;
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
  font-size: 13px;
}

.tab:hover {
  background: #1a2344;
  border-color: #3a4a7d;
}

.tab.active {
  background: #2b3a74;
  color: #fff;
  border-color: #3a4a7d;
}

.panel {
  display: none;
}

.panel.active {
  display: block;
}

.style-list {
  display: grid;
  gap: 10px;
  max-height: 400px;
  overflow: auto;
  padding-right: 6px;
}

.style-item {
  display: grid;
  grid-template-columns: 1fr 72px;
  gap: 10px;
  align-items: center;
  background: #0d1330;
  border: 1px solid #2a366a;
  border-radius: 12px;
  padding: 10px;
  cursor: pointer;
  transition: all 0.15s;
}

.style-item:hover {
  background: #111a3a;
  border-color: #3a4a7d;
}

.style-item.selected {
  background: #1a2a55;
  border-color: #42b0d5;
  box-shadow: 0 0 0 2px rgba(66,176,213,.2);
}

.style-item .sig {
  font-size: 28px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ini-box {
  height: 64px;
  border: 2px solid #2d3c79;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: #0a1130;
}

.ini-box .val {
  font-size: 26px;
  font-weight: 800;
}

.draw-wrap {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #2e3b6f;
  background: #fff;
  margin-top: 10px;
}

.draw-wrap canvas {
  display: block;
  width: 100%;
  height: auto;
  cursor: crosshair;
  background: #fff; /* ensure visible draw surface */
  pointer-events: auto; /* enable drawing */
  z-index: 1;
  touch-action: none; /* prevent scrolling while drawing */
}

.preview-card {
  background: #0f1835;
  border: 1px solid #2b3868;
  border-radius: 12px;
  padding: 16px;
  margin-top: 12px;
}

.preview-card .row {
  display: flex;
  gap: 12px;
}

.preview-card .col {
  flex: 1;
  background: #0b1126;
  border: 1px solid #26315b;
  border-radius: 10px;
  padding: 12px;
  min-height: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.cap {
  font-size: .75rem;
  color: #93a5e8;
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  align-self: flex-start;
}

.sig-preview {
  font-size: 32px;
  line-height: 1.2;
  white-space: nowrap;
  margin: auto;
  padding: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.ini-preview {
  font-weight: 700;
  font-size: 24px;
  letter-spacing: 0.5px;
  margin: auto;
}

/* Live preview in the draw tab */
.draw-preview {
  margin-top: 12px;
  padding: 12px;
  background: #0d1330;
  border: 1px solid #2a366a;
  border-radius: 10px;
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #93a5e8;
  font-size: 13px;
}

/* Drawing controls */
.draw-controls {
  display: flex;
  gap: 10px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.draw-controls button {
  padding: 8px 12px;
  font-size: 12px;
}

/* Signature color options */
.color-options {
  display: flex;
  gap: 8px;
  margin: 10px 0;
  align-items: center;
}

.color-option {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.15s;
}

.color-option:hover {
  transform: scale(1.1);
}

.color-option.selected {
  border-color: #42b0d5;
  box-shadow: 0 0 0 3px rgba(66,176,213,.2);
}

/* Pen size options */
.pen-sizes {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 10px 0;
}

.pen-size {
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  background: #0d1330;
  border: 1px solid #2a366a;
  transition: all 0.15s;
}

.pen-size:hover {
  background: #111a3a;
}

.pen-size.selected {
  background: #1a2a55;
  border-color: #42b0d5;
}

.pen-size .dot {
  border-radius: 50%;
  background: #e8ecf3;
}

/* Upload option */
.upload-sig {
  margin-top: 10px;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: linear-gradient(180deg,#0c1228,#0b1124);
  border-bottom: 1px solid #1e2851;
}

/* Ensure the Download Signed button is always clickable above panels */
.topbar .download-btn {
  position: relative;
  z-index: 61;
  pointer-events: auto;
}

.upload-sig input[type="file"] {
  display: none;
}

.upload-btn {
  background: #111a36;
  border: 2px dashed #2a3668;
  border-radius: 10px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.15s;
}

.upload-btn:hover {
  background: #1a2344;
  border-color: #3a4a7d;
}

.upload-btn i {
  font-size: 24px;
  color: #9fb0e8;
  margin-bottom: 8px;
}

.upload-btn p {
  color: #9fb0e8;
  font-size: 13px;
  margin: 0;
}

.actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 14px;
  padding: 14px;
  border-top: 1px solid #233264;
}

.toast {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: #0f162b;
  border: 1px solid #284076;
  color: #dbe6ff;
  padding: 12px 16px;
  border-radius: 10px;
  box-shadow: var(--shadow);
  z-index: 2000;
  display: none;
  animation: slideIn 0.3s ease-out;
}

.toast.show {
  display: block;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* Text modal */
.text-input {
  width: 100%;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #2b3767;
  background: #0c1228;
  color: #e8ecff;
  font-size: 14px;
  outline: none;
}

.text-input:focus {
  border-color: #42b0d5;
  box-shadow: 0 0 0 3px rgba(66,176,213,.2);
}

/* Mobile responsiveness */
@media (max-width: 980px) {
  .layout {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  
  body.user-mode .right {
    position: static;
    width: 100%;
    margin-top: 16px;
  }
  
  body.user-mode .viewer {
    padding-right: 18px;
  }
  
  .columns {
    grid-template-columns: 1fr;
  }
  
  .modal-card {
    width: 95vw;
  }
}

.modal .preview-col {
  position: static;
  width: auto;
  max-height: none;
  overflow: visible;
}

.modal .columns {
  grid-template-columns: 1.2fr 0.8fr;
  align-items: start;
}

.draw-wrap {
  background: #ffffff;
  box-shadow: 0 0 0 2px rgba(34, 53, 106, 0.5) inset;
}

.draw-wrap canvas {
  background: #ffffff;        /* ensure white drawing surface */
  pointer-events: auto;       /* receive pointer events */
  touch-action: none;         /* avoid scrolling while drawing */
}

@media (max-width: 680px) {
  .topbar {
    padding: 8px 12px;
    flex-wrap: wrap;
    height: auto;
  }
  
  .controls {
    flex-wrap: wrap;
    gap: 8px;
  }
  
  button {
    padding: 8px 12px;
    font-size: 12px;
  }
  
  .tabs {
    flex-wrap: wrap;
  }
  
  .tab {
    font-size: 12px;
    padding: 6px 10px;
  }
}
`;

/* ------------------------------------------
   Component
------------------------------------------- */
// US states for validation (missing earlier)
const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"
]);

export default function UserPdfTool() {
  const { api, user } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const search = typeof window !== "undefined" ? new URLSearchParams(location.search) : null;
  const envelopeId = search?.get("envelopeId") || "";
  const [scale, setScale] = useState(1.8);
  const [pdfBytes, setPdfBytes] = useState(null);
  const [pagesMeta, setPagesMeta] = useState([]);
  const pdfDocRef = useRef(null);
  const canvasRefs = useRef({});
  const [fields, setFields] = useState([]);
  const [placements, setPlacements] = useState({});
  // add radio groups from template/demo
  const [radioGroups, setRadioGroups] = useState({});
  // Hold template fields until a PDF is available to convert/position them
  const [pendingTemplateFields, setPendingTemplateFields] = useState(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [sigTab, setSigTab] = useState("type");
  const [fullName, setFullName] = useState("");
  const [initials, setInitials] = useState("");
  const [selectedFont, setSelectedFont] = useState("Dancing Script");
  const [signature, setSignature] = useState(null);
  const [textModal, setTextModal] = useState({ open: false, fieldId: null, value: "", placeholder: "Enter text", type: "text", mode: "text" });
  const drawCanvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const [toast, setToast] = useState(null);
  const drawCtxRef = useRef(null);
  const drawHistoryRef = useRef([]);
  const lastPointRef = useRef(null);
  const dprRef = useRef(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  // Track explicit user intent for opening the signature modal
  const sigModalIntentRef = useRef(false);
  
  // New states for enhanced features
  // Pen/ink color for the draw tool
  const [signatureColor] = useState("#000000");
  const [penSize, setPenSize] = useState(2);
  const [uploadedSignature, setUploadedSignature] = useState(null);

  // Envelope/template state
  const [envelope, setEnvelope] = useState(null);
  const [template, setTemplate] = useState(null);
  const [myRecipient, setMyRecipient] = useState(null);
  const [isLoadingEnvelope, setIsLoadingEnvelope] = useState(false);

  // Map fieldId -> DOM node for scroll/highlight
  const fieldDomMap = useRef({});
  const registerFieldDom = (id, el) => {
    if (!id) return;
    if (el) fieldDomMap.current[id] = el;
    else delete fieldDomMap.current[id];
  };
  const focusField = (id) => {
    const el = fieldDomMap.current[id];
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      el.classList.add("flash-highlight");
      setTimeout(() => el.classList && el.classList.remove("flash-highlight"), 1200);
    } catch {}
  };

  useEffect(() => {
    ensureExternalAssets();
    document.body.classList.add('user-mode');
    return () => document.body.classList.remove('user-mode');
  }, []);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // Helper: Uint8Array/ArrayBuffer -> base64 string
  const uint8ToBase64 = (arr) => {
    try {
      const bytes = arr instanceof Uint8Array ? arr : new Uint8Array(arr);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      return btoa(binary);
    } catch { return ""; }
  };

  const onPdfFileChange = async (e) => {
    if (envelopeId) {
      showToast("This document is managed by the school. Upload is disabled.");
      e.target.value = "";
      return;
    }
    const inputEl = e.target;
    const file = inputEl.files?.[0];
    if (!file || file.type !== "application/pdf") {
      inputEl.value = ""; // reset to allow picking the same file again
      return;
    }
    const ab = await file.arrayBuffer();
    setPdfBytes(ab);
    setFields([]);
    setPlacements({});
    showToast("PDF loaded successfully");
    inputEl.value = ""; // reset so re-selecting the same file still fires onChange
  };

  // Convert Admin template fields (normalized nx,ny,nw,nh + pageIndex) to absolute (x,y,width,height + page)
  const convertTemplateFields = async (tmplFields = []) => {
    if (!pdfDocRef.current) return [];
    const out = [];
    for (const f of tmplFields) {
      const pageNum = (f.page ?? f.pageIndex) || 1;
      const page = await pdfDocRef.current.getPage(pageNum);
      const vp = page.getViewport({ scale: 1 }); // base size (independent of current zoom)
      if (typeof f.nx === "number" && typeof f.ny === "number") {
        out.push({
          id: f.id,
          type: f.type,
          page: pageNum,
          x: f.nx * vp.width,
          y: f.ny * vp.height,
          width: f.nw * vp.width,
          height: f.nh * vp.height,
          // preserve radio metadata
          groupId: f.groupId,
          optionText: f.optionText,
        });
      } else {
        // Already absolute (fallback)
        out.push({
          id: f.id,
          type: f.type,
          page: pageNum,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          // preserve radio metadata
          groupId: f.groupId,
          optionText: f.optionText,
        });
      }
    }
    return out;
  };

  // Normalizes an uploaded image (type/size) -> PNG dataURL, downscaled if huge
async function handleSignatureImageFile(file, showToast, setUploadedSignature) {
  if (!file || !file.type.startsWith("image/")) {
    showToast && showToast("Please select an image file");
    return;
  }
  const MAX_BYTES = 2 * 1024 * 1024; // 2MB guard
  if (file.size > MAX_BYTES) {
    showToast && showToast("Image too large (max 2MB)");
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      // Downscale to keep PDF size small
      const MAX_DIM = 1200;
      let w = img.width, h = img.height;
      const scale = Math.min(1, MAX_DIM / Math.max(w, h));
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));

      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const octx = off.getContext("2d");
      octx.drawImage(img, 0, 0, w, h);

      // Normalize to PNG to avoid EXIF/orientation surprises
      const dataUrl = off.toDataURL("image/png");
      setUploadedSignature && setUploadedSignature(dataUrl);
      showToast && showToast("Signature image ready");
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

const onSignatureImageUpload = async (e) => {
  const file = e.target.files?.[0];
  await handleSignatureImageFile(file, showToast, setUploadedSignature);
};

  // PDF rendering
  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      if (!pdfBytes) return;
      try {
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
        const doc = await loadingTask.promise;
        if (cancelled) return;
        pdfDocRef.current = doc;

        const metas = [];
        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
          const page = await doc.getPage(pageNum);
          const viewport = page.getViewport({ scale });
          metas.push({ num: pageNum, width: viewport.width, height: viewport.height });
        }
        setPagesMeta(metas);
      } catch (err) {
        console.error("Error loading PDF:", err);
        showToast("Error loading PDF");
      }
    };
    render();
    return () => {
      cancelled = true;
    };
  }, [pdfBytes, scale]);

  // Deep-link: fetch envelope + template and set up document
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!envelopeId || !api?.get) return;
      setIsLoadingEnvelope(true);
      try {
        const env = await api.get("envelopes", envelopeId);
        if (!alive || !env) return;
        setEnvelope(env);
        const recips = Array.isArray(env.recipients) ? env.recipients : [];
        const meUserId = user?.id;
        const myStudentId = user?.studentId || null;
        const mine = recips.find((r) => (r.userId && meUserId && r.userId === meUserId) || (myStudentId && (r.studentId === myStudentId || r.id === myStudentId))) || recips[0] || null;
        setMyRecipient(mine || null);

        if (env.templateId) {
          const tpl = await api.get("pdfTemplates", env.templateId).catch(() => null);
          if (!alive || !tpl) return;
          setTemplate(tpl);
          // Take radioGroups/colors if present
          if (tpl?.radioGroups) setRadioGroups(tpl.radioGroups);

          // Prefer embedded base64; fall back to URL (gs:// normalized)
          let pdfLoaded = false;
          if (tpl?.pdfBase64) {
            try {
              const bytes = base64ToUint8(String(tpl.pdfBase64).trim());
              if (bytes && bytes.byteLength > 0) {
                setPdfBytes(bytes.buffer);
                pdfLoaded = true;
              }
            } catch {}
          }
          if (!pdfLoaded && tpl?.pdfUrl) {
            const url = normalizeStorageUrl(tpl.pdfUrl);
            try {
              const res = await fetch(url, { credentials: "include" });
              if (res.ok) {
                const ab = await res.arrayBuffer();
                setPdfBytes(ab);
                pdfLoaded = true;
              }
            } catch {}
          }
          if (!pdfLoaded) {
            // Explain to user why nothing shows
            showToast("Template has no embedded PDF. Ask the sender to include it.");
          }
          if (Array.isArray(tpl?.fields) && tpl.fields.length) setPendingTemplateFields(tpl.fields);
        }

        // Mark viewed (best-effort)
        if (mine?.id || mine?.studentId || mine?.userId) {
          const rid = mine.id || mine.studentId || mine.userId;
          try {
            await fetch(`/api/envelopes/${encodeURIComponent(env.id)}/recipient/${encodeURIComponent(rid)}/status`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ status: "viewed" }),
            });
          } catch {}
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        showToast("Failed to load envelope");
      } finally {
        setIsLoadingEnvelope(false);
      }
    })();
    return () => { alive = false; };
  }, [envelopeId, api, user?.id, user?.studentId]);

  useEffect(() => {
    let cancelled = false;
    const drawPages = async () => {
      if (!pdfDocRef.current || pagesMeta.length === 0) return;
      for (const meta of pagesMeta) {
        const { num } = meta;
        const canvas = canvasRefs.current[num];
        if (!canvas) continue;
        const page = await pdfDocRef.current.getPage(num);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
      }
    };
    drawPages();
    return () => {
      cancelled = true;
    };
  }, [pagesMeta, scale]);

  const fillField = (field) => {
    // Radio: select one option per group (no deselect)
    if (field.type === "radio") {
      const gid = field.groupId;
      if (!gid) return;
      setPlacements((prev) => {
        const next = { ...prev };
        // clear any other selection in same group
        for (const f of fields) {
          if (f.type === "radio" && f.groupId === gid) {
            delete next[f.id];
          }
        }
        next[field.id] = { type: "radio", data: "selected" };
        return next;
      });
      showToast(field.optionText ? `Selected: ${field.optionText}` : "Option selected");
      return;
    }
    if (field.type === "signature" || field.type === "initials" || field.type === "stamp") {
      if (!signature) {
        showToast("Please adopt a signature first");
        return;
      }
      if (signature.drawnSignature && field.type === "signature") {
        setPlacements((prev) => ({
          ...prev,
          [field.id]: { type: "drawnImage", data: signature.drawnSignature },
        }));
      } else if (signature.uploadedSignature && field.type === "signature") {
        setPlacements((prev) => ({
          ...prev,
          [field.id]: { type: "drawnImage", data: signature.uploadedSignature },
        }));
      } else {
        setPlacements((prev) => ({
          ...prev,
          [field.id]: {
            type: "signature",
            text: field.type === "signature" ? signature.name : field.type === "initials" ? signature.initials : signature.name,
            font: signature.font,
            color: signature.color || "#000080",
          },
        }));
      }
      showToast(`${field.type.charAt(0).toUpperCase() + field.type.slice(1)} added`);
    } else if (field.type === "date") {
      // Use date picker
      setTextModal({ open: true, fieldId: field.id, value: "", placeholder: "Select date", type: "date", mode: "date" });
    } else if (field.type === "name") {
      if (!signature) {
        showToast("Please adopt a signature first");
        return;
      }
      setPlacements((prev) => ({
        ...prev,
        [field.id]: { type: "text", data: fullName || "Your Name" }
      }));
      showToast("Name added");
    } else if (field.type === "email") {
      setTextModal({ open: true, fieldId: field.id, value: "", placeholder: "Enter email address", type: "email", mode: "text" });
    } else if (field.type === "company") {
      setTextModal({ open: true, fieldId: field.id, value: "", placeholder: "Enter company name", type: "text", mode: "text" });
    } else if (field.type === "title") {
      setTextModal({ open: true, fieldId: field.id, value: "", placeholder: "Enter job title", type: "text", mode: "text" });
    } else if (field.type === "number") {
      setTextModal({ open: true, fieldId: field.id, value: "", placeholder: "Enter number", type: "number", mode: "text" });
    } else if (field.type === "checkbox") {
      const isChecked = placements[field.id]?.data === "checked";
      setPlacements((prev) => ({ 
        ...prev, 
        [field.id]: { type: "checkbox", data: isChecked ? "" : "checked" } 
      }));
      showToast(isChecked ? "Unchecked" : "Checked");
    } else if (field.type === "dropdown") {
      setTextModal({ open: true, fieldId: field.id, value: "", placeholder: "Select or enter option", type: "text", mode: "text" });
    // New field types
    } else if (field.type === "phone") {
      setTextModal({ open: true, fieldId: field.id, value: "", placeholder: "Enter phone (e.g., 555-123-4567)", type: "tel", mode: "phone" });
    } else if (field.type === "age") {
      setTextModal({ open: true, fieldId: field.id, value: "", placeholder: "Enter age (0–120)", type: "number", mode: "age" });
    } else if (field.type === "numberSelect") {
      setTextModal({ open: true, fieldId: field.id, value: "", placeholder: "Enter a number (0–99)", type: "number", mode: "numberSelect" });
    } else if (field.type === "state") {
      setTextModal({ open: true, fieldId: field.id, value: "", placeholder: "State (e.g., TX)", type: "text", mode: "state" });
    } else {
      setTextModal({ open: true, fieldId: field.id, value: "", placeholder: "Enter text", type: "text", mode: "text" });
    }
  };

  const onConfirmTextModal = () => {
    const { fieldId, value, mode } = textModal;
    if (!fieldId) {
      setTextModal({ open: false, fieldId: null, value: "" });
      return;
    }
    let v = (value || "").trim();

    // Validation/normalization per mode
    if (mode === "date") {
      if (!v) return; // disabled by button anyway
      const norm = normalizeDateToMMDDYYYY(v);
      if (!norm) {
        showToast("Enter a valid date (MM/DD/YYYY)");
        return;
      }
      v = norm;
    } else if (mode === "phone") {
      const digits = v.replace(/\D/g, "");
      if (digits.length !== 10) {
        showToast("Enter a 10-digit phone number");
        return;
      }
      v = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    } else if (mode === "age") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 120) {
        showToast("Age must be between 0 and 120");
        return;
      }
      v = String(n);
    } else if (mode === "numberSelect") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 99) {
        showToast("Number must be between 0 and 99");
        return;
      }
      v = String(n);
    } else if (mode === "state") {
      const up = v.toUpperCase();
      if (!US_STATES.has(up)) {
        showToast("Enter a valid 2-letter US state code");
        return;
      }
      v = up;
    } else {
      if (!v) {
        return;
      }
    }

    setPlacements((prev) => ({ ...prev, [fieldId]: { type: "text", data: v } }));
    setTextModal({ open: false, fieldId: null, value: "", placeholder: "Enter text", type: "text", mode: "text" });
    showToast("Field updated");
  };

  const onCancelTextModal = () =>
    setTextModal({ open: false, fieldId: null, value: "", placeholder: "Enter text", type: "text", mode: "text" });

  useEffect(() => {
    setInitials(generateInitials(fullName));
  }, [fullName]);

  const openSignatureModal = () => {
    sigModalIntentRef.current = true; // mark user-initiated
    setSigTab("type");
    setShowSignatureModal(true);
  };

  const closeSignatureModal = () => {
    setShowSignatureModal(false);
    sigModalIntentRef.current = false; // reset intent
  };

  // Defensive guard: prevent modal from showing without user intent
  useEffect(() => {
    if (showSignatureModal && !sigModalIntentRef.current) {
      setShowSignatureModal(false);
    }
  }, [showSignatureModal]);

  // --- Drawing helpers for blank/trim/undo ---
  function isCanvasBlank(canvas) {
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) return false;
    }
    return true;
  }

  function trimCanvas(canvas) {
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    const img = ctx.getImageData(0, 0, width, height);
    const data = img.data;

    let top = height, left = width, right = 0, bottom = 0;
    let found = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = data[(y * width + x) * 4 + 3];
        if (a !== 0) {
          found = true;
          if (x < left) left = x;
          if (y < top) top = y;
          if (x > right) right = x;
          if (y > bottom) bottom = y;
        }
      }
    }

    if (!found) return null;

    const w = right - left + 1;
    const h = bottom - top + 1;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    out.getContext("2d").drawImage(canvas, left, top, w, h, 0, 0, w, h);
    return out;
  }

const adoptSignature = () => {
  // Upload tab — allow without name/initials
  if (sigTab === "upload") {
    if (!uploadedSignature) {
      showToast("Upload an image first");
      return;
    }
    setSignature({
      name: fullName || "",
      initials: initials || generateInitials(fullName || ""),
      font: selectedFont,
      uploadedSignature,
    });
    setShowSignatureModal(false);
    sigModalIntentRef.current = false; // reset intent
    showToast("Signature image adopted");
    return;
  }

  // Draw tab — trim and adopt the drawn PNG
  if (sigTab === "draw") {
    const canvas = drawCanvasRef.current;
    if (!canvas || isCanvasBlank(canvas)) {
      showToast("Please draw your signature");
      return;
    }
    const trimmed = trimCanvas(canvas) || canvas;
    const imageData = trimmed.toDataURL("image/png");
    setSignature({
      name: fullName || "",
      initials: initials || generateInitials(fullName || ""),
      font: selectedFont,
      drawnSignature: imageData,
    });
    setShowSignatureModal(false);
    sigModalIntentRef.current = false; // reset intent
    showToast("Drawn signature adopted");
    return;
  }

  // Type tab — require at least a name or initials
  if (!fullName && !initials) {
    showToast("Enter your name or initials");
    return;
  }
  setSignature({
    name: fullName || "",
    initials: initials || generateInitials(fullName || ""),
    font: selectedFont,
  });
  setShowSignatureModal(false);
  sigModalIntentRef.current = false; // reset intent
  showToast("Signature adopted");
};

const adoptUploadedSignature = () => {
  if (!uploadedSignature) {
    showToast("Upload an image first");
    return;
  }
  setSignature({
    name: fullName || "",
    initials: (initials || generateInitials(fullName || "")),
    font: selectedFont,
    uploadedSignature
  });
  setShowSignatureModal(false);
  sigModalIntentRef.current = false; // reset intent
  showToast("Signature image adopted");
};

  const clearDrawing = () => {
    const canvas = drawCanvasRef.current;
    const ctx = drawCtxRef.current || canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    // snapshot before clearing so Undo works
    drawHistoryRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const undoDrawing = () => {
    const canvas = drawCanvasRef.current;
    const ctx = drawCtxRef.current || canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const prev = drawHistoryRef.current.pop();
    if (prev) {
      ctx.putImageData(prev, 0, 0);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // Drawing setup with hi‑DPI support, pointer events, and undo snapshots
  useEffect(() => {
    if (!showSignatureModal || sigTab !== "draw") return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;

    // prevent scroll/zoom gestures on touch devices while drawing
    canvas.style.touchAction = "none";

    const ctx = canvas.getContext("2d");
    drawCtxRef.current = ctx;

    // Hi‑DPI scaling so lines are crisp on retina screens
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    dprRef.current = dpr;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = signatureColor;
    ctx.lineWidth = penSize;

    const getMouseCoords = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const startStroke = (x, y) => {
      isDrawingRef.current = true;
      // snapshot for undo
      drawHistoryRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      ctx.beginPath();
      ctx.moveTo(x, y);
      lastPointRef.current = { x, y };
    };

    const continueStroke = (x, y) => {
      if (!isDrawingRef.current) return;
      ctx.lineWidth = penSize; // keep in sync
      ctx.lineTo(x, y);
      ctx.stroke();
      lastPointRef.current = { x, y };
    };

    const endStroke = () => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      ctx.closePath();
      lastPointRef.current = null;
    };

    // Pointer events (modern browsers)
    const onPointerDown = (e) => {
      e.preventDefault();
      const { x, y } = getMouseCoords(e.clientX, e.clientY);
      startStroke(x, y);
    };
    const onPointerMove = (e) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      const { x, y } = getMouseCoords(e.clientX, e.clientY);
      continueStroke(x, y);
    };
    const onPointerUp = (e) => {
      e && e.preventDefault && e.preventDefault();
      endStroke();
    };

    // Mouse fallbacks
    const onMouseDown = (e) => { e.preventDefault(); const { x, y } = getMouseCoords(e.clientX, e.clientY); startStroke(x, y); };
    const onMouseMove = (e) => { if (!isDrawingRef.current) return; e.preventDefault(); const { x, y } = getMouseCoords(e.clientX, e.clientY); continueStroke(x, y); };
    const onMouseUp = () => endStroke();

    // Touch fallbacks
    const onTouchStart = (e) => {
      if (!e.touches || e.touches.length === 0) return;
      e.preventDefault();
      const t = e.touches[0];
      const { x, y } = getMouseCoords(t.clientX, t.clientY);
      startStroke(x, y);
    };
    const onTouchMove = (e) => {
      if (!isDrawingRef.current || !e.touches || e.touches.length === 0) return;
      e.preventDefault();
      const t = e.touches[0];
      const { x, y } = getMouseCoords(t.clientX, t.clientY);
      continueStroke(x, y);
    };
    const onTouchEnd = (e) => { e && e.preventDefault && e.preventDefault(); endStroke(); };

    // Register listeners
    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp, { passive: false });
    canvas.addEventListener("pointerleave", onPointerUp, { passive: false });

    canvas.addEventListener("mousedown", onMouseDown, { passive: false });
    canvas.addEventListener("mousemove", onMouseMove, { passive: false });
    window.addEventListener("mouseup", onMouseUp, { passive: false });
    canvas.addEventListener("mouseleave", onMouseUp, { passive: false });

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);

      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseUp);

      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [showSignatureModal, sigTab, signatureColor, penSize]);

  // Small helper for dataURL -> Uint8Array
  const dataUrlToUint8 = (dataUrl) => {
    const b64 = dataUrl.split(",")[1] || "";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  };
  // Normalize gs:// URLs to HTTPS for viewing/fetching
  const normalizeStorageUrl = (url) => {
    if (!url) return url;
    const s = String(url).trim();
    if (s.startsWith("gs://")) {
      const path = s.replace(/^gs:\/\//, "");
      const [bucket, ...rest] = path.split("/");
      return `https://storage.googleapis.com/${bucket}/${rest.join("/")}`;
    }
    return s;
  };
  // Helper: robust base64 -> Uint8Array (handles url-safe and data: URLs)
  const base64ToUint8 = (b64) => {
    try {
      let data = String(b64 || "").trim();
      if (data.startsWith("data:")) {
        const parts = data.split(",");
        data = parts[1] || "";
      }
      data = data.replace(/-/g, "+").replace(/_/g, "/");
      while (data.length % 4 !== 0) data += "=";
      const bin = atob(data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    } catch (e) {
      console.error("Base64 decode error:", e);
      return new Uint8Array();
    }
  };

  // Normalize many date inputs to MM/DD/YYYY; returns null if invalid
  const normalizeDateToMMDDYYYY = (input) => {
    if (!input) return null;
    const s = String(input).trim();
    // If input is from a native date input, it's likely YYYY-MM-DD
    const hyphen = /^\d{4}-\d{2}-\d{2}$/;
    const slashMDY = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/; // accept M/D/YY(YY)
    const dotMDY = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/;
    const iso = /^\d{4}-\d{2}-\d{2}T.*Z?$/;

    let m, d, y;
    if (hyphen.test(s)) {
      const [yy, mm, dd] = s.split("-");
      y = Number(yy); m = Number(mm); d = Number(dd);
    } else if (slashMDY.test(s)) {
      const parts = s.match(slashMDY);
      m = Number(parts[1]); d = Number(parts[2]); y = Number(parts[3]);
      if (y < 100) y += 2000; // assume 20xx for 2-digit years
    } else if (dotMDY.test(s)) {
      const parts = s.match(dotMDY);
      m = Number(parts[1]); d = Number(parts[2]); y = Number(parts[3]);
      if (y < 100) y += 2000;
    } else if (iso.test(s)) {
      const dt = new Date(s);
      if (isNaN(dt.getTime())) return null;
      m = dt.getMonth() + 1; d = dt.getDate(); y = dt.getFullYear();
    } else {
      const dt = new Date(s);
      if (isNaN(dt.getTime())) return null;
      m = dt.getMonth() + 1; d = dt.getDate(); y = dt.getFullYear();
    }

    // Basic range checks
    if (!(y >= 1900 && y <= 3000)) return null;
    if (!(m >= 1 && m <= 12)) return null;
    const daysInMonth = new Date(y, m, 0).getDate();
    if (!(d >= 1 && d <= daysInMonth)) return null;

    const mm = String(m).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${mm}/${dd}/${y}`;
  };

  // Ensure web font is loaded before measuring/drawing to canvas
  const ensureWebFontLoaded = async (fontFamily) => {
    try {
      if (document?.fonts?.load) {
        // load a sample size; browsers will fetch the face
        await document.fonts.load(`24px '${fontFamily}', cursive`);
        await document.fonts.ready;
      }
    } catch {
      // ignore font loading errors, fallback to cursive
    }
  };

  // Cross-browser, robust blob downloader (handles Safari/iOS fallbacks)
  const downloadBlob = (blob, filename) => {
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      // IE / Edge legacy
      if (nav && typeof nav.msSaveOrOpenBlob === 'function') {
        nav.msSaveOrOpenBlob(blob, filename);
        return;
      }

      const urlCreator = (typeof window !== 'undefined' && (window.URL || window.webkitURL)) || URL;
      const url = urlCreator.createObjectURL(blob);

      const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
      const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator?.platform === 'MacIntel' && navigator?.maxTouchPoints > 1);
      const isSafari = /^((?!chrome|android).)*safari/i.test(ua);

      // Safari/iOS have limited support for the download attribute with Blobs
      if (isIOS || isSafari) {
        // Open in a new tab; user can use built-in share/save options
        const opened = window.open(url, '_blank');
        if (!opened) {
          // Fallback: navigate current tab (last resort)
          window.location.href = url;
        }
        // Revoke a bit later to allow the load to start
        setTimeout(() => urlCreator.revokeObjectURL(url), 2000);
        return;
      }

      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename || 'download';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      // Clean up after a tick to avoid canceling the download in some browsers
      setTimeout(() => {
        document.body.removeChild(a);
        urlCreator.revokeObjectURL(url);
      }, 1000);
    } catch (e) {
      console.error('Download failed:', e);
      showToast('Unable to download file');
    }
  };

  // Higher pixel density for exported signature images (px per PDF point)
  const SIG_EXPORT_SCALE = 4; // 4x => ~288 dpi; increase to 5-6 if needed

  // Render signature text to a transparent PNG using the chosen font (same style as sig-preview)
  const renderSignatureToDataUrl = async ({ text, fontFamily, color = "#000000", width, height }) => {
    if (!text || !width || !height) return null;

    await ensureWebFontLoaded(fontFamily);

    const fitSize = computeFittingFontSize({
      text,
      fontFamily,
      maxWidth: Math.max(2, width - 8),
      maxHeight: Math.max(2, height - 8),
    });

    // Render at high resolution for crisp output in PDF
    const cssW = Math.max(1, Math.floor(width));
    const cssH = Math.max(1, Math.floor(height));
    const scale = SIG_EXPORT_SCALE; // independent of devicePixelRatio for consistent quality
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(cssW * scale));
    canvas.height = Math.max(1, Math.floor(cssH * scale));
    const ctx = canvas.getContext("2d");

    // Scale drawing space to logical points
    ctx.scale(scale, scale);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${fitSize}px '${fontFamily}', cursive`;

    const cx = cssW / 2;
    const cy = cssH / 2;
    ctx.fillText(text, cx, cy);

    return canvas.toDataURL("image/png");
  };

  const downloadPDF = async () => {
    if (!pdfBytes) {
      showToast("Please upload a PDF first");
      return;
    }
    // Enforce required fields
    const missingRequired = (fields || []).some((f) => f.required && !placements[f.id]);
    if (missingRequired) {
      showToast("Please complete all required fields");
      return;
    }
    const anyPlaced = Object.values(placements || {}).length > 0;
    if (!anyPlaced) {
      // No fields filled — export the original PDF as-is
  const blob = new Blob([pdfBytes instanceof ArrayBuffer ? pdfBytes : new Uint8Array(pdfBytes)], { type: "application/pdf" });
  downloadBlob(blob, "document.pdf");
      showToast("Exported original PDF");
      return;
    }
    try {
      // Try normal path: load original PDF and draw on it
      let pdfDoc;
      try {
        pdfDoc = await PDFDocument.load(pdfBytes);
      } catch (e) {
        pdfDoc = null;
      }

      const helveticaFont = StandardFonts.Helvetica;
      const italicFont = StandardFonts.TimesRomanItalic;

      const drawAllPlacements = async (doc, getPageSize) => {
        const helvetica = await doc.embedFont(helveticaFont);
        const timesItalic = await doc.embedFont(italicFont);

        for (const field of fields) {
          const placement = placements[field.id];
          if (!placement) continue;

          const { width: fieldWidth, height: fieldHeight } = {
            width: field.width,
            height: field.height,
          };

          const { page, pageH } = await getPageSize(doc, field.page);
          const x = field.x;
          const y = pageH - (field.y + fieldHeight);

          if (placement.type === "signature") {
            // Render adopted signature with the same style as sig-preview (web font -> PNG)
            const sigDataUrl = await renderSignatureToDataUrl({
              text: placement.text,
              fontFamily: placement.font || selectedFont || "Dancing Script",
              color: placement.color || "#000080",
              width: fieldWidth,
              height: fieldHeight,
            });

            if (sigDataUrl) {
              const imgBytes = dataUrlToUint8(sigDataUrl);
              const img = await doc.embedPng(imgBytes);
              const dims = img.scale(1);
              const s = Math.min(fieldWidth / dims.width, fieldHeight / dims.height);
              const w = dims.width * s;
              const h = dims.height * s;
              page.drawImage(img, {
                x: x + (fieldWidth - w) / 2,
                y: y + (fieldHeight - h) / 2,
                width: w,
                height: h,
              });
            } else {
              // Fallback to vector text if image render fails
              const pad = 4;
              const aw = Math.max(1, fieldWidth - pad * 2);
              const ah = Math.max(1, fieldHeight - pad * 2);
              const widthAt1 = timesItalic.widthOfTextAtSize(placement.text, 1);
              const heightAt1 = timesItalic.heightAtSize(1);
              const sizeByWidth = aw / Math.max(1, widthAt1);
              const sizeByHeight = ah / Math.max(1, heightAt1);
              const size = Math.max(1, Math.min(sizeByWidth, sizeByHeight));
              const textW = timesItalic.widthOfTextAtSize(placement.text, size);
              const textH = timesItalic.heightAtSize(size);
              const tx = x + (fieldWidth - textW) / 2;
              const ty = y + (fieldHeight - textH) / 2;
              const hex = placement.color || "#000080";
              const r = parseInt(hex.slice(1, 3), 16) / 255;
              const g = parseInt(hex.slice(3, 5), 16) / 255;
              const b = parseInt(hex.slice(5, 7), 16) / 255;
              page.drawText(placement.text, { x: tx, y: ty, size, font: timesItalic, color: rgb(r, g, b) });
            }
          } else if (placement.type === "drawnImage") {
            const imgBytes = dataUrlToUint8(placement.data);
            const img = await doc.embedPng(imgBytes);
            const dims = img.scale(1);
            const s = Math.min(fieldWidth / dims.width, fieldHeight / dims.height) * 0.8;
            const w = dims.width * s;
            const h = dims.height * s;
            page.drawImage(img, {
              x: x + (fieldWidth - w) / 2,
              y: y + (fieldHeight - h) / 2,
              width: w,
              height: h,
            });
          } else if (placement.type === "text") {
            page.drawText(placement.data, {
              x: x + 5,
              y: y + fieldHeight / 2 - 6,
              size: 12,
              font: helvetica,
              color: rgb(0, 0, 0),
            });
          } else if (placement.type === "checkbox") {
            const color = rgb(0.1, 0.7, 0.4);
            const t = Math.max(1.5, Math.min(fieldWidth, fieldHeight) * 0.12);
            const pad = Math.min(fieldWidth, fieldHeight) * 0.18;
            const sx = x + pad;
            const sy = y + fieldHeight * 0.45;
            const mx = x + fieldWidth * 0.42;
            const my = y + fieldHeight * 0.15;
            const ex = x + fieldWidth * 0.82;
            const ey = y + fieldHeight * 0.75;
            page.drawLine({ start: { x: sx, y: sy }, end: { x: mx, y: my }, thickness: t, color });
            page.drawLine({ start: { x: mx, y: my }, end: { x: ex, y: ey }, thickness: t, color });
          } else if (placement.type === "radio") {
            const groupColor = radioGroups?.[field.groupId]?.color || "#4a9eff";
            const r = parseInt(groupColor.slice(1, 3), 16) / 255;
            const g = parseInt(groupColor.slice(3, 5), 16) / 255;
            const b = parseInt(groupColor.slice(5, 7), 16) / 255;
            const cx = x + fieldWidth / 2;
            const cy = y + fieldHeight / 2;
            const R = Math.min(fieldWidth, fieldHeight) / 2 - 1;
            page.drawEllipse({ x: cx, y: cy, xScale: R, yScale: R, borderColor: rgb(r, g, b), borderWidth: 1.5 });
            page.drawEllipse({ x: cx, y: cy, xScale: Math.max(1, R * 0.45), yScale: Math.max(1, R * 0.45), color: rgb(r, g, b) });
          }
        }
      };

      if (pdfDoc) {
        // Primary path: draw on the original PDF
        const pages = pdfDoc.getPages();
        const getPageSize = async (_doc, pageNum) => {
          const page = pages[pageNum - 1];
          const { height: pageH } = page.getSize();
          return { page, pageH };
        };

        await drawAllPlacements(pdfDoc, getPageSize);

  const out = await pdfDoc.save();
  const blob = new Blob([out], { type: "application/pdf" });
  downloadBlob(blob, "signed-document.pdf");
        showToast("PDF downloaded successfully");
        return;
      }

      // Fallback: rebuild a new PDF from rendered canvases
      if (!pdfDocRef.current) {
        showToast("Unable to access PDF pages");
        return;
      }

      const newPdf = await PDFDocument.create();

      // Pre-embed background pages from canvases, page-by-page
      // const num = pdfDocRef.current.numPages; // unused
      // Embed once; reused by drawAllPlacements
      const helvetica = await newPdf.embedFont(helveticaFont);
      const timesItalic = await newPdf.embedFont(italicFont);
      // Create a getter that also ensures background is drawn
      const pageCache = {};
      const getPageSize = async (_doc, pageNum) => {
        if (!pageCache[pageNum]) {
          const page = await pdfDocRef.current.getPage(pageNum);
          const vp = page.getViewport({ scale: 1 });
          const p = newPdf.addPage([vp.width, vp.height]);

          // Use already-rendered canvas (at current zoom) as background
          const c = canvasRefs.current[pageNum];
          if (c) {
            const pngBytes = dataUrlToUint8(c.toDataURL("image/png"));
            const png = await newPdf.embedPng(pngBytes);
            p.drawImage(png, { x: 0, y: 0, width: vp.width, height: vp.height });
          }
          pageCache[pageNum] = { page: p, pageH: vp.height };
        }
        return pageCache[pageNum];
      };

      // Draw placements over the stamped background
      await (async () => {
        const helvetica = await newPdf.embedFont(helveticaFont);
        const timesItalic = await newPdf.embedFont(italicFont);

        for (const field of fields) {
          const placement = placements[field.id];
          if (!placement) continue;

          const fieldWidth = field.width;
          const fieldHeight = field.height;

          const { page, pageH } = await getPageSize(newPdf, field.page);
          const x = field.x;
          const y = pageH - (field.y + fieldHeight);

          if (placement.type === "signature") {
            const sigDataUrl = await renderSignatureToDataUrl({
              text: placement.text,
              fontFamily: placement.font || selectedFont || "Dancing Script",
              color: placement.color || "#000080",
              width: fieldWidth,
              height: fieldHeight,
            });

            if (sigDataUrl) {
              const imgBytes = dataUrlToUint8(sigDataUrl);
              const img = await newPdf.embedPng(imgBytes);
              const dims = img.scale(1);
              const s = Math.min(fieldWidth / dims.width, fieldHeight / dims.height);
              const w = dims.width * s;
              const h = dims.height * s;
              page.drawImage(img, {
                x: x + (fieldWidth - w) / 2,
                y: y + (fieldHeight - h) / 2,
                width: w,
                height: h,
              });
            } else {
              // Fallback to vector text if image render fails
              const pad = 4;
              const aw = Math.max(1, fieldWidth - pad * 2);
              const ah = Math.max(1, fieldHeight - pad * 2);
              const widthAt1 = timesItalic.widthOfTextAtSize(placement.text, 1);
              const heightAt1 = timesItalic.heightAtSize(1);
              const sizeByWidth = aw / Math.max(1, widthAt1);
              const sizeByHeight = ah / Math.max(1, heightAt1);
              const size = Math.max(1, Math.min(sizeByWidth, sizeByHeight));

              const textW = timesItalic.widthOfTextAtSize(placement.text, size);
              const textH = timesItalic.heightAtSize(size);
              const tx = x + (fieldWidth - textW) / 2;
              const ty = y + (fieldHeight - textH) / 2;

              const hex = placement.color || "#000080";
              const r = parseInt(hex.slice(1, 3), 16) / 255;
              const g = parseInt(hex.slice(3, 5), 16) / 255;
              const b = parseInt(hex.slice(5, 7), 16) / 255;

              page.drawText(placement.text, { x: tx, y: ty, size, font: timesItalic, color: rgb(r, g, b) });
            }
          } else if (placement.type === "drawnImage") {
            const imgBytes = dataUrlToUint8(placement.data);
            const img = await newPdf.embedPng(imgBytes);
            const dims = img.scale(1);
            const s = Math.min(fieldWidth / dims.width, fieldHeight / dims.height) * 0.8;
            const w = dims.width * s;
            const h = dims.height * s;
            page.drawImage(img, {
              x: x + (fieldWidth - w) / 2,
              y: y + (fieldHeight - h) / 2,
              width: w,
              height: h,
            });
          } else if (placement.type === "text") {
            page.drawText(placement.data, {
              x: x + 5,
              y: y + fieldHeight / 2 - 6,
              size: 12,
              font: helvetica,
              color: rgb(0, 0, 0),
            });
          } else if (placement.type === "checkbox") {
            const color = rgb(0.1, 0.7, 0.4);
            const t = Math.max(1.5, Math.min(fieldWidth, fieldHeight) * 0.12);
            const pad = Math.min(fieldWidth, fieldHeight) * 0.18;
            const sx = x + pad;
            const sy = y + fieldHeight * 0.45;
            const mx = x + fieldWidth * 0.42;
            const my = y + fieldHeight * 0.15;
            const ex = x + fieldWidth * 0.82;
            const ey = y + fieldHeight * 0.75;
            page.drawLine({ start: { x: sx, y: sy }, end: { x: mx, y: my }, thickness: t, color });
            page.drawLine({ start: { x: mx, y: my }, end: { x: ex, y: ey }, thickness: t, color });
          } else if (placement.type === "radio") {
            const groupColor = radioGroups?.[field.groupId]?.color || "#4a9eff";
            const r = parseInt(groupColor.slice(1, 3), 16) / 255;
            const g = parseInt(groupColor.slice(3, 5), 16) / 255;
            const b = parseInt(groupColor.slice(5, 7), 16) / 255;
            const cx = x + fieldWidth / 2;
            const cy = y + fieldHeight / 2;
            const R = Math.min(fieldWidth, fieldHeight) / 2 - 1;
            page.drawEllipse({ x: cx, y: cy, xScale: R, yScale: R, borderColor: rgb(r, g, b), borderWidth: 1.5 });
            page.drawEllipse({ x: cx, y: cy, xScale: Math.max(1, R * 0.45), yScale: Math.max(1, R * 0.45), color: rgb(r, g, b) });
          }
        }
      })();

  const out = await newPdf.save();
  const blob = new Blob([out], { type: "application/pdf" });
  downloadBlob(blob, "signed-document.pdf");
      showToast("PDF downloaded successfully");
    } catch (err) {
      console.error("Error generating PDF:", err);
      showToast("Error downloading PDF");
    }
  };

  const loadDemo = async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    page.drawText("SERVICE AGREEMENT", { x: 50, y: 720, size: 24, font: bold, color: rgb(0.1, 0.1, 0.3) });

    const content = [
      'This Service Agreement ("Agreement") is entered into on the date signed below',
      'between Example Corp ("Service Provider") and the undersigned ("Client").',
      "",
      "SERVICES: The Service Provider agrees to provide professional consulting services",
      "as described in the attached Statement of Work.",
      "",
      "TERM: This Agreement shall commence on the date signed and continue for a period",
      "of twelve (12) months unless terminated earlier in accordance with this Agreement.",
      "",
      "COMPENSATION: The Client agrees to pay the Service Provider a fee of $5,000 per",
      "month for the services rendered under this Agreement.",
      "",
      "CONFIDENTIALITY: Both parties agree to maintain the confidentiality of any",
      "proprietary information shared during the term of this Agreement.",
      "",
      "TERMINATION: Either party may terminate this Agreement with 30 days written notice.",
      "",
      "GOVERNING LAW: This Agreement shall be governed by the laws of the State of",
      "California, United States.",
    ];
    let y = 660;
    for (const line of content) {
      page.drawText(line, { x: 50, y, size: 12, font, color: rgb(0, 0, 0) });
      y -= 20;
    }

    page.drawText("CLIENT SIGNATURE:", { x: 50, y: 200, size: 12, font: bold });
    page.drawLine({ start: { x: 50, y: 180 }, end: { x: 250, y: 180 }, thickness: 1, color: rgb(0, 0, 0) });
    page.drawText("DATE:", { x: 300, y: 200, size: 12, font: bold });
    page.drawLine({ start: { x: 300, y: 180 }, end: { x: 450, y: 180 }, thickness: 1, color: rgb(0, 0, 0) });

    page.drawText("PROVIDER SIGNATURE:", { x: 50, y: 130, size: 12, font: bold });
    page.drawLine({ start: { x: 50, y: 110 }, end: { x: 250, y: 110 }, thickness: 1, color: rgb(0, 0, 0) });
    page.drawText("DATE:", { x: 300, y: 130, size: 12, font: bold });
    page.drawLine({ start: { x: 300, y: 110 }, end: { x: 450, y: 110 }, thickness: 1, color: rgb(0, 0, 0) });

    const bytes = await pdfDoc.save();
    setPdfBytes(bytes);

    const demoFields = [
      { id: "field_1", type: "signature", page: 1, x: 50, y: 580, width: 180, height: 35 },
      { id: "field_2", type: "date", page: 1, x: 300, y: 580, width: 140, height: 35 },
      { id: "field_3", type: "initials", page: 1, x: 460, y: 580, width: 80, height: 35 },
      { id: "field_4", type: "signature", page: 1, x: 50, y: 650, width: 180, height: 35 },
      { id: "field_5", type: "date", page: 1, x: 300, y: 650, width: 140, height: 35 },
      { id: "field_6", type: "name", page: 1, x: 50, y: 380, width: 200, height: 35 },
      { id: "field_7", type: "email", page: 1, x: 260, y: 380, width: 200, height: 35 },
      { id: "field_8", type: "checkbox", page: 1, x: 470, y: 380, width: 35, height: 35 },
    ];

    // Radio example: one colored group with three options
    const demoRadioGroupId = "group_demo";
    setRadioGroups({
      [demoRadioGroupId]: {
        id: demoRadioGroupId,
        name: "Contact Method",
        options: ["Email", "Phone", "SMS"],
        color: "#eab308" // amber
      }
    });
    const demoRadioFields = [
      { id: "radio_1", type: "radio", page: 1, x: 50, y: 430, width: 24, height: 24, groupId: demoRadioGroupId, optionText: "Email" },
      { id: "radio_2", type: "radio", page: 1, x: 50, y: 460, width: 24, height: 24, groupId: demoRadioGroupId, optionText: "Phone" },
      { id: "radio_3", type: "radio", page: 1, x: 50, y: 490, width: 24, height: 24, groupId: demoRadioGroupId, optionText: "SMS" },
    ];

    setFields([...demoFields, ...demoRadioFields]);
    setPlacements({});
    showToast("Demo PDF loaded with sample fields (includes radio group)");
  };

  // Build a signed PDF and return bytes
  const buildSignedPdfBytes = async () => {
    if (!pdfBytes) return null;
    // Reuse existing downloadPDF logic paths but return bytes instead of download
    try {
      let pdfDoc;
      try { pdfDoc = await PDFDocument.load(pdfBytes); } catch { pdfDoc = null; }

      const helveticaFont = StandardFonts.Helvetica;
      const italicFont = StandardFonts.TimesRomanItalic;

      const drawAllPlacements = async (doc, getPageSize) => {
        const helvetica = await doc.embedFont(helveticaFont);
        const timesItalic = await doc.embedFont(italicFont);
        for (const field of fields) {
          const placement = placements[field.id];
          if (!placement) continue;
          const fieldWidth = field.width;
          const fieldHeight = field.height;
          const { page, pageH } = await getPageSize(doc, field.page);
          const x = field.x;
          const y = pageH - (field.y + fieldHeight);
          if (placement.type === "signature") {
            const sigDataUrl = await renderSignatureToDataUrl({
              text: placement.text,
              fontFamily: placement.font || selectedFont || "Dancing Script",
              color: placement.color || "#000080",
              width: fieldWidth,
              height: fieldHeight,
            });
            if (sigDataUrl) {
              const imgBytes = dataUrlToUint8(sigDataUrl);
              const img = await doc.embedPng(imgBytes);
              const dims = img.scale(1);
              const s = Math.min(fieldWidth / dims.width, fieldHeight / dims.height);
              const w = dims.width * s;
              const h = dims.height * s;
              page.drawImage(img, { x: x + (fieldWidth - w) / 2, y: y + (fieldHeight - h) / 2, width: w, height: h });
            }
          } else if (placement.type === "drawnImage") {
            const imgBytes = dataUrlToUint8(placement.data);
            const img = await doc.embedPng(imgBytes);
            const dims = img.scale(1);
            const s = Math.min(fieldWidth / dims.width, fieldHeight / dims.height) * 0.8;
            const w = dims.width * s;
            const h = dims.height * s;
            page.drawImage(img, { x: x + (fieldWidth - w) / 2, y: y + (fieldHeight - h) / 2, width: w, height: h });
          } else if (placement.type === "text") {
            page.drawText(placement.data, { x: x + 5, y: y + fieldHeight / 2 - 6, size: 12, font: helvetica, color: rgb(0, 0, 0) });
          } else if (placement.type === "checkbox") {
            const color = rgb(0.1, 0.7, 0.4);
            const t = Math.max(1.5, Math.min(fieldWidth, fieldHeight) * 0.12);
            const pad = Math.min(fieldWidth, fieldHeight) * 0.18;
            const sx = x + pad;
            const sy = y + fieldHeight * 0.45;
            const mx = x + fieldWidth * 0.42;
            const my = y + fieldHeight * 0.15;
            const ex = x + fieldWidth * 0.82;
            const ey = y + fieldHeight * 0.75;
            page.drawLine({ start: { x: sx, y: sy }, end: { x: mx, y: my }, thickness: t, color });
            page.drawLine({ start: { x: mx, y: my }, end: { x: ex, y: ey }, thickness: t, color });
          } else if (placement.type === "radio") {
            const groupColor = radioGroups?.[field.groupId]?.color || "#4a9eff";
            const r = parseInt(groupColor.slice(1, 3), 16) / 255;
            const g = parseInt(groupColor.slice(3, 5), 16) / 255;
            const b = parseInt(groupColor.slice(5, 7), 16) / 255;
            const cx = x + fieldWidth / 2;
            const cy = y + fieldHeight / 2;
            const R = Math.min(fieldWidth, fieldHeight) / 2 - 1;
            page.drawEllipse({ x: cx, y: cy, xScale: R, yScale: R, borderColor: rgb(r, g, b), borderWidth: 1.5 });
            page.drawEllipse({ x: cx, y: cy, xScale: Math.max(1, R * 0.45), yScale: Math.max(1, R * 0.45), color: rgb(r, g, b) });
          }
        }
      };

      if (pdfDoc) {
        const pages = pdfDoc.getPages();
        const getPageSize = async (_doc, pageNum) => {
          const page = pages[pageNum - 1];
          const { height: pageH } = page.getSize();
          return { page, pageH };
        };
        await drawAllPlacements(pdfDoc, getPageSize);
        return await pdfDoc.save();
      }

      if (!pdfDocRef.current) return null;
      const newPdf = await PDFDocument.create();
      const helvetica = await newPdf.embedFont(helveticaFont);
      const timesItalic = await newPdf.embedFont(italicFont);
      const pageCache = {};
      const getPageSize = async (_doc, pageNum) => {
        if (!pageCache[pageNum]) {
          const page = await pdfDocRef.current.getPage(pageNum);
          const vp = page.getViewport({ scale: 1 });
          const p = newPdf.addPage([vp.width, vp.height]);
          const c = canvasRefs.current[pageNum];
          if (c) {
            const pngBytes = dataUrlToUint8(c.toDataURL("image/png"));
            const png = await newPdf.embedPng(pngBytes);
            p.drawImage(png, { x: 0, y: 0, width: vp.width, height: vp.height });
          }
          pageCache[pageNum] = { page: p, pageH: vp.height };
        }
        return pageCache[pageNum];
      };
      await drawAllPlacements(newPdf, getPageSize);
      return await newPdf.save();
    } catch {
      return null;
    }
  };

  const submitEnvelope = async () => {
    if (!envelopeId || !envelope) return;
    const bytes = await buildSignedPdfBytes();
    if (!bytes) { showToast("Build failed"); return; }
    const rid = myRecipient?.id || myRecipient?.studentId || myRecipient?.userId || "";
    const fileName = (template?.pdfName || "document.pdf").replace(/\.pdf$/i, "-signed.pdf");
    const pdfBase64 = uint8ToBase64(bytes);
    try {
      const res = await fetch(`/api/envelopes/${encodeURIComponent(envelopeId)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ studentId: myRecipient?.studentId || myRecipient?.id || "", recipientId: rid, fileName, pdfBase64 }),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast("Submitted successfully");
  setTimeout(() => navigate("/dashboard"), 800);
    } catch (e) {
      showToast("Submit failed");
    }
  };

  // When a PDF is rendered (pagesMeta ready) and we have pending template fields, convert and place them
  useEffect(() => {
    if (!pdfDocRef.current || !pagesMeta.length || !pendingTemplateFields?.length) return;
    (async () => {
      try {
        const converted = await convertTemplateFields(pendingTemplateFields);
        setFields(converted);
        setPlacements({});
        setPendingTemplateFields(null);
        showToast("Template fields loaded");
      } catch {
        showToast("Failed to place template fields");
      }
    })();
  }, [pagesMeta, pendingTemplateFields]);

  // Replace onTemplateFileChange to support embedded PDF or defer until PDF is loaded
  const onTemplateFileChange = async (e) => {
    const inputEl = e.target;
    const file = inputEl.files?.[0];
    if (!file) {
      inputEl.value = "";
      return;
    }
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (Array.isArray(json.fields)) {
        // Always take radio groups/colors
        setRadioGroups(json.radioGroups || {});
        // If the template carries the PDF, load it now
        const hasPdf = typeof json.pdfBase64 === "string" && json.pdfBase64.trim().length > 0;
        if (hasPdf) {
          try {
            const bytes = base64ToUint8(json.pdfBase64.trim());
            if (bytes.byteLength > 0) {
              setPdfBytes(bytes.buffer);
              setPendingTemplateFields(json.fields);
              showToast("Template loaded (embedded PDF)");
            } else {
              showToast("Template PDF missing/invalid; please upload the PDF");
              setPendingTemplateFields(json.fields);
            }
          } catch {
            showToast("Failed to read embedded PDF; please upload the PDF");
            setPendingTemplateFields(json.fields);
          }
        } else if (pdfDocRef.current) {
          // Convert immediately if a PDF is already open
          const converted = await convertTemplateFields(json.fields);
          setFields(converted);
          setPlacements({});
          showToast("Template loaded");
        } else {
          // Defer until a PDF is loaded
          setPendingTemplateFields(json.fields);
          showToast("Template loaded. Now upload the PDF to place fields.");
        }
      } else {
        showToast("Invalid template");
      }
    } catch {
      showToast("Failed to read template");
    } finally {
      inputEl.value = ""; // allow re-selecting the same file
    }
  };

  const FieldBox = ({ field, registerRef }) => {
    const placement = placements[field.id];
    const [signatureSize, setSignatureSize] = React.useState(null);
    const fieldRef = useRef(null);
    // Register DOM node for scroll-to
    useEffect(() => {
      if (registerRef) registerRef(field.id, fieldRef.current);
      return () => registerRef && registerRef(field.id, null);
    }, [field.id, registerRef]);

    // Always call hooks before any early return to satisfy rules-of-hooks
    React.useEffect(() => {
      if (!placement || placement.type !== "signature") {
        setSignatureSize(null);
        return;
      }
      const fontFamily = placement.font || "Dancing Script";
      const size = computeFittingFontSize({
        text: placement.text || "",
        fontFamily,
        maxWidth: field.width - 16,
        maxHeight: field.height - 8,
      });
      setSignatureSize(Math.min(size, 32));
    }, [placement, field.width, field.height]);

    // Radio rendering: colored circle + inner dot when selected
    if (field.type === "radio") {
      const group = radioGroups?.[field.groupId];
      const color = group?.color || "#4a9eff";
      const selected = placement?.type === "radio";
      return (
        <div
          ref={fieldRef}
          className="field"
          data-type="radio"
          style={{
            left: field.x * scale,
            top: field.y * scale,
            width: field.width * scale,
            height: field.height * scale,
            padding: 0,
            background: "transparent",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
          onClick={(e) => {
            e.stopPropagation();
            fillField(field);
          }}
          title={field.optionText || "Option"}
        >
          <div
            style={{
              width: Math.max(16, field.width * scale - 2),
              height: Math.max(16, field.height * scale - 2),
              borderRadius: "50%",
              border: `2px solid ${color}`,
              background: `${color}20`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {selected && (
              <div
                style={{
                  width: Math.max(6, (field.width * scale) * 0.45),
                  height: Math.max(6, (field.height * scale) * 0.45),
                  borderRadius: "50%",
                  background: color,
                  opacity: 0.8,
                }}
              />
            )}
          </div>
        </div>
      );
    }

    const getFieldIcon = (type) => {
      switch(type) {
        case 'signature': return <i className="fa-solid fa-pen"></i>;
        case 'initials': return <span className="initials">DS</span>;
        case 'stamp': return <i className="fa-solid fa-user"></i>;
        case 'date': return <i className="fa-regular fa-calendar"></i>;
        case 'name': return <i className="fa-solid fa-user"></i>;
        case 'email': return <span>@</span>;
        case 'company': return <i className="fa-solid fa-building"></i>;
        case 'title': return <i className="fa-solid fa-briefcase"></i>;
        case 'text': return <span>T</span>;
        case 'number': return <span>#</span>;
        case 'checkbox': return <i className="fa-solid fa-check"></i>;
        case 'dropdown': return <i className="fa-solid fa-square-check"></i>;
        // New icons
        case 'phone': return <i className="fa-solid fa-phone"></i>;
        case 'age': return <i className="fa-solid fa-hashtag"></i>;
        case 'numberSelect': return <i className="fa-solid fa-list-ol"></i>;
        case 'state': return <i className="fa-solid fa-map"></i>;
        default: return <i className="fa-solid fa-font"></i>;
      }
    };

    const getFieldLabel = (type) => {
      switch(type) {
        case 'signature': return 'Sign';
        case 'initials': return 'Initial';
        case 'stamp': return 'Stamp';
        case 'date': return 'Date Signed';
        case 'name': return 'Printed Name'; // renamed for consistency with Admin tool
        case 'email': return 'Email';
        case 'company': return 'Company';
        case 'title': return 'Title';
        case 'text': return 'Text';
        case 'number': return 'Number';
        case 'checkbox': return 'Checkbox';
        case 'dropdown': return 'Dropdown';
        default: return type.charAt(0).toUpperCase() + type.slice(1);
      }
    };

    return (
      <div
        ref={fieldRef}
        className={`field ${placement ? "filled" : ""}`}
        data-type={field.type}
        title={field.type === 'name' && !signature ? 'Adopt a signature first' : undefined}
        style={{
          left: field.x * scale,
          top: field.y * scale,
          width: field.width * scale,
          height: field.height * scale,
          cursor: field.type === 'name' && !signature ? 'not-allowed' : undefined,
          opacity: field.type === 'name' && !signature && !placement ? 0.65 : undefined,
        }}
        onClick={(e) => {
          e.stopPropagation();
          fillField(field);
        }}
      >
        {!placement ? (
          <div style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "4px",
          }}>
            <div className="field-icon">
              {getFieldIcon(field.type)}
            </div>
            <div className="field-label">{getFieldLabel(field.type)}</div>
          </div>
        ) : placement.type === "signature" ? (
          <div
            className="signature-content"
            style={{
              fontFamily: `'${placement.font}', cursive`,
              fontSize: signatureSize ? `${signatureSize}px` : '16px',
              lineHeight: '1',
              color: placement.color || "#000080",
            }}
          >
            {placement.text}
          </div>
        ) : placement.type === "drawnImage" ? (
          <img
            src={placement.data}
            alt="Signature"
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              display: "block",
              margin: "auto",
            }}
          />
        ) : placement.type === "checkbox" ? (
          <div style={{ 
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <i className="fa-solid fa-check" style={{ 
              color: "#10b981", 
              fontSize: "20px" 
            }}></i>
          </div>
        ) : (
          <div style={{ 
            color: "#1e3a8a", 
            fontSize: "13px",
            padding: "4px",
            width: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}>
            {placement.data}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100vh" }}>
      <style>{styles}</style>

      <header className="topbar">
        <div className="brand">
          <i className="fa-solid fa-file-signature" />
          <div className="pdf-signer">
          <span>PDF Document Signer</span>
          </div>
        </div>

        <div className="controls">
          {!envelopeId && (
            <div className="file-btn">
              <input type="file" id="pdfInput" accept="application/pdf" onChange={onPdfFileChange} />
              <span>
                <i className="fa-solid fa-upload"></i> Upload PDF
              </span>
            </div>
          )}

          {envelopeId && envelope && (
            <div style={{ color: "#e8ecf3", fontSize: "14px", fontWeight: 600 }}>
              {envelope.subject || "Document to Sign"}
            </div>
          )}

          {!envelopeId && (
            <>
              <div className="file-btn">
                <input type="file" id="templateInput" accept="application/json" onChange={onTemplateFileChange} />
                <span>
                  <i className="fa-solid fa-puzzle-piece"></i> Load Template
                </span>
              </div>
              <button onClick={loadDemo}>
                <i className="fa-solid fa-file-lines"></i> Load Demo
              </button>
            </>
          )}

          <div className="spacer"></div>

          <button className="primary" onClick={openSignatureModal}>
            <i className="fa-solid fa-pen-nib"></i> Adopt Signature
          </button>
          {envelopeId ? (
            <>
              <button className="primary download-btn" onClick={submitEnvelope} disabled={!pdfBytes || isLoadingEnvelope}>
                <i className="fa-solid fa-paper-plane"></i> Submit
              </button>
              <button className="ghost" onClick={downloadPDF} disabled={!pdfBytes || isLoadingEnvelope}>
                <i className="fa-solid fa-download"></i> Download Copy
              </button>
            </>
          ) : (
            <button className="primary download-btn" onClick={downloadPDF} disabled={!pdfBytes} title={!pdfBytes ? "Upload a PDF first" : undefined}>
              <i className="fa-solid fa-download"></i> Download Signed
            </button>
          )}
        </div>
      </header>

      <main className="layout">
        <section className="viewer">
          <div className="pages">
            {isLoadingEnvelope ? (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '400px',
                flexDirection: 'column',
                gap: '1rem',
                color: '#9ca3af'
              }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.5rem', opacity: 0.7 }}></i>
                <p style={{ fontSize: '1rem', fontWeight: 500, color: '#6b7280' }}>Loading document...</p>
              </div>
            ) : !pdfBytes ? (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '400px',
                flexDirection: 'column',
                gap: '1rem',
                color: '#9ca3af'
              }}>
                <i className="fa-solid fa-file-pdf" style={{ fontSize: '3rem', opacity: 0.4 }}></i>
                <p style={{ fontSize: '1rem', fontWeight: 500, color: '#6b7280' }}>No PDF loaded</p>
                {!envelopeId && <p style={{ fontSize: '0.8rem' }}>Upload a PDF or load the demo to get started</p>}
              </div>
            ) : (
              pagesMeta.map((meta) => (
                <div key={`page-${meta.num}`} className="page-wrap" style={{ width: meta.width, height: meta.height }}>
                  <canvas
                    className="page-canvas"
                    ref={(el) => (canvasRefs.current[meta.num] = el)}
                    width={meta.width}
                    height={meta.height}
                  />
                  <div className="overlay">
                    {fields
                      .filter((f) => f.page === meta.num)
                      .map((f) => (
                        <FieldBox key={f.id} field={f} registerRef={registerFieldDom} />
                      ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {fields.length > 0 && (
          <aside className="right">
            <h3>Required Fields</h3>
            <div className="fill-list">
              {fields.map((field, i) => {
                const filled = !!placements[field.id];
                return (
                  <div 
                    key={field.id} 
                    className={`fill-item ${filled ? "filled" : ""}`}
                    onClick={() => {
                      focusField(field.id);
                      fillField(field);
                    }}
                  >
                    <div className="left">
                      <div className="idx">{i + 1}</div>
                      <div>
                        <div className="label">
                          {field.type.charAt(0).toUpperCase() + field.type.slice(1)}
                        </div>
                        <div className="meta">Page {field.page}</div>
                      </div>
                    </div>
                    <div className="status">
                      {filled ? (
                        <i className="fa-solid fa-check"></i>
                      ) : (
                        <i className="fa-regular fa-circle"></i>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="zoom-control">
              <label>Zoom:</label>
              <button 
                onClick={() => setScale(Math.max(0.5, scale - 0.25))}
                disabled={scale <= 0.5}
              >
                <i className="fa-solid fa-minus"></i>
              </button>
              <input
                type="range"
                min="50"
                max="300"
                step="10"
                value={scale * 100}
                onChange={(e) => setScale(Number(e.target.value) / 100)}
              />
              <button 
                onClick={() => setScale(Math.min(3, scale + 0.25))}
                disabled={scale >= 3}
              >
                <i className="fa-solid fa-plus"></i>
              </button>
              <span className="zoom-val">{Math.round(scale * 100)}%</span>
              {scale !== 1 && (
                <button 
                  onClick={() => setScale(1)}
                  style={{ padding: "4px 8px", fontSize: "11px", marginLeft: "8px" }}
                  title="Reset zoom"
                >
                  Reset
                </button>
              )}
            </div>
          </aside>
        )}
      </main>

      {/* Enhanced Signature Modal */}
      {showSignatureModal && (
        <div className="modal">
          <div className="modal-card">
            <div className="modal-head">
              <h2>Adopt Your Signature</h2>
              <button className="icon-btn" onClick={closeSignatureModal}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="modal-body">
              <div className="columns">
                <div className="left">
                  <label>Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                  />

                  <label>Initials</label>
                  <input
                    type="text"
                    value={initials}
                    onChange={(e) => setInitials(e.target.value.toUpperCase())}
                    placeholder="Your initials"
                    maxLength={4}
                  />

                  <div className="tabs">
                    <button className={`tab ${sigTab === "type" ? "active" : ""}`} onClick={() => setSigTab("type")}>
                      <i className="fa-solid fa-font"></i> Type
                    </button>
                    <button className={`tab ${sigTab === "draw" ? "active" : ""}`} onClick={() => setSigTab("draw")}>
                      <i className="fa-solid fa-pen"></i> Draw
                    </button>
                    <button className={`tab ${sigTab === "upload" ? "active" : ""}`} onClick={() => setSigTab("upload")}>
                      <i className="fa-solid fa-upload"></i> Upload
                    </button>
                  </div>

                  <div className={`panel ${sigTab === "type" ? "active" : ""}`}>
<div className="style-list">
  {FONT_CHOICES.map((font) => (
    <div
      key={font}
      className={`style-item ${selectedFont === font ? "selected" : ""}`}
      onClick={() => setSelectedFont(font)}
    >
      <div
        className="sig"
        style={{ fontFamily: `'${font}', cursive`, color: "#ffffff" }}
      >
        {fullName || "Your Name"}
      </div>
      <div className="ini-box">
        <div className="val" style={{ fontFamily: `'${font}', cursive`, color: "#ffffff" }}>
          {initials || "YN"}
        </div>
      </div>
    </div>
  ))}
</div>
                               </div>

                <div className={`panel ${sigTab === "draw" ? "active" : ""}`}>
                  <p style={{ color: "#9fb0e8", marginBottom: "10px" }}>Select your pen size, then draw in the box on the right.</p>
                  <label style={{ fontSize: "12px", color: "#9fb0e8" }}>Pen Size:</label>
                  <div className="pen-sizes">
                    {[1, 2, 3, 5].map((size) => (
                      <div
                        key={size}
                        className={`pen-size ${penSize === size ? "selected" : ""}`}
                        onClick={() => setPenSize(size)}
                      >
                        <div className="dot" style={{ width: size * 4 + "px", height: size * 4 + "px", backgroundColor: "#000000" }} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`panel ${sigTab === "upload" ? "active" : ""}`}>
<div
  className="upload-sig"
  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
  onDrop={(e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleSignatureImageFile(f, showToast, setUploadedSignature);
  }}
>
<label htmlFor="sigUpload" className="upload-btn">
  <i className="fa-solid fa-cloud-arrow-up"></i>
  <p>Click or drop a signature image</p>
  <p style={{ fontSize: "11px", opacity: 0.8 }}>PNG, JPG, GIF (Max 2MB)</p>
</label>
                    <input 
                      type="file" 
                      id="sigUpload" 
                      accept="image/*" 
                      onChange={onSignatureImageUpload}
                    />
                    {uploadedSignature && (
                      <div style={{ marginTop: "10px", textAlign: "center" }}>
                        <img 
                          src={uploadedSignature} 
                          alt="Uploaded signature" 
                          style={{ 
                            maxWidth: "100%", 
                            maxHeight: "100px", 
                            border: "1px solid #2a3668",
                            borderRadius: "8px",
                            padding: "8px",
                            background: "#fff"
                          }} 
                        />
<button
  className="primary"
  style={{ marginTop: "8px", marginLeft: "8px" }}
  onClick={adoptUploadedSignature}
>
  <i className="fa-solid fa-check"></i> Use this image
</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

<div className="preview-col">
  <div className="preview-card">
                  <div className="cap">Preview</div>
                  {sigTab === "type" ? (
                    <>
                      {fullName && (
                        <div className="row">
                          <div className="col">
                            <div className="cap">Signature</div>
                            <div className="sig-preview" style={{ fontFamily: `'${selectedFont}', cursive`, color: "#ffffff" }}>
                              {fullName}
                            </div>
                          </div>
                        </div>
                      )}
                      {initials && (
                        <div className="row" style={{ marginTop: '12px' }}>
                          <div className="col">
                            <div className="cap">Initials</div>
                            <div className="ini-preview" style={{ fontFamily: `'${selectedFont}', cursive`, color: "#ffffff" }}>
                              {initials}
                            </div>
                          </div>
                        </div>
                      )}
                      {!fullName && !initials && (
                        <div style={{ textAlign: 'center', color: '#93a5e8', padding: '24px' }}>
                          Enter your name to see preview
                        </div>
                      )}
                    </>
                  ) : sigTab === "upload" ? (
                      <div style={{ padding: "12px", textAlign: "center" }}>
                        <img 
                          src={uploadedSignature} 
                          alt="Preview" 
                          style={{ 
                            maxWidth: "100%", 
                            maxHeight: "120px",
                            background: "#fff",
                            padding: "8px",
                            borderRadius: "8px"
                          }} 
                        />
                      </div>
                    ) : (
                      <>
                      <div className="cap">Draw</div>
                      <div className="draw-wrap" style={{ height: 220 }}>
                        <canvas
                          ref={drawCanvasRef}
                          width={900}
                          height={300}
                          style={{ width: "100%", height: "100%", background: "#fff" }}
                        />
                      </div>
                      <div className="draw-controls">
                        <button className="ghost" onClick={clearDrawing}>
                          <i className="fa-solid fa-eraser"></i> Clear
                        </button>
                        <button className="ghost" onClick={undoDrawing}>
                          <i className="fa-solid fa-undo"></i> Undo
                        </button>
                      </div>
                      </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="actions">
            <button className="ghost" onClick={closeSignatureModal}>
              Cancel
            </button>
            <button className="primary" onClick={adoptSignature}>
              <i className="fa-solid fa-check"></i> Adopt & Sign
            </button>
          </div>
        </div>
      </div>
      )}
      {textModal.open && (
        <div className="modal">
          <div className="modal-card" style={{ maxWidth: "520px" }}>
            <div className="modal-head">
              <h2>Enter {textModal.type === 'email' ? 'Email' : textModal.type === 'number' ? 'Number' : 'Text'}</h2>
              <button className="icon-btn" onClick={onCancelTextModal}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="modal-body">
              <input
                type={textModal.type || "text"}
                className="text-input"
                value={textModal.value}
                onChange={(e) => setTextModal((m) => ({ ...m, value: e.target.value }))}
                placeholder={textModal.placeholder || "Type here..."}
                autoFocus
              />
            </div>
            <div className="actions">
              <button className="ghost" onClick={onCancelTextModal}>
                Cancel
              </button>
              <button className="primary" onClick={onConfirmTextModal} disabled={!textModal.value.trim()}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
