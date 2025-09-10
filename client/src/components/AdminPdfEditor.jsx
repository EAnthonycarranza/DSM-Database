import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import * as pdfjsLib from "pdfjs-dist";

// Optional: pdf-lib import only for preview/exporting sample stamped PDFs from Admin (not required for template JSON)
// import { PDFDocument } from "pdf-lib"; // removed unused import
import { useApp } from "../context/AppContext";
import { useNavigate } from "react-router-dom";

/**
 * AdminPdfEditor.jsx
 * - Admin-only: place, move, resize fields on pages
 * - Uses global dark styles from index.css (fields, overlay, layout)
 * - Saves/loads a template JSON (fields normalized to page size)
 */

// Configure PDF.js worker (load from CDN to avoid bundler config)
const PDFJS_VERSION = pdfjsLib.version || "5.4.54";
const PDFJS_MAJOR = parseInt((PDFJS_VERSION || "5").split(".")[0], 10) || 5;
const WORKER_EXT = PDFJS_MAJOR >= 4 ? "mjs" : "js";
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.${WORKER_EXT}`;

/* ------------------------------------------
   Helpers: inject Google Fonts & Font Awesome
------------------------------------------- */
const ensureHeadLink = (href, attrs = {}) => {
  if (typeof document === "undefined") return;
  // if already present, skip
  if ([...document.styleSheets].some((s) => (s?.href || "").includes(href))) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  Object.entries(attrs).forEach(([k, v]) => link.setAttribute(k, v));
  document.head.appendChild(link);
};

const ensureExternalAssets = () => {
  ensureHeadLink(
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Great+Vibes&family=Pacifico&family=Satisfy&family=Dancing+Script:wght@400;600&family=Caveat:wght@500;700&family=Allura&display=swap",
    { "data-google-fonts": "true" }
  );
  // Font Awesome (avoid duplicating)
  const hasFA = [...document.styleSheets].some(
    (s) =>
      (s?.href || "").includes("fontawesome") ||
      (s?.href || "").includes("font-awesome") ||
      (s?.href || "").includes("cdnjs.cloudflare.com/ajax/libs/font-awesome")
  );
  if (!hasFA) {
    ensureHeadLink(
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css",
      { integrity: "sha512-RXf+QSDCUQs6Q0h8I1Gm2PZ5yB7wC5bQWQ4z0l6X8t1K0kK9x6qxr6x2m2pcY9m5Yj3BBQ0h7V5n3zJrW9C4Ww==", crossOrigin: "anonymous", referrerPolicy: "no-referrer" }
    );
  }
};

/* ------------------------------------------
   Utilities
------------------------------------------- */
const uid = () =>
  `field_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const DEFAULT_SIZES = {
  signature: { w: 220, h: 50 },
  initials: { w: 120, h: 40 },
  date: { w: 140, h: 36 },
  text: { w: 200, h: 36 },
  name: { w: 220, h: 36 },
  // New field defaults
  phone: { w: 200, h: 36 },
  age: { w: 110, h: 36 },
  numberSelect: { w: 120, h: 36 },
  state: { w: 120, h: 36 },
  // New: small circular radio button
  radio: { w: 24, h: 24 }
};

/**
 * Store fields normalized to page size:
 * - nx, ny, nw, nh in [0..1]
 * - Allows zoom independent persistence
 */
const toNormalized = (abs, pageW, pageH) => {
  const { x, y, w, h } = abs;
  return {
    nx: x / pageW,
    ny: y / pageH,
    nw: w / pageW,
    nh: h / pageH
  };
};
const toAbsolute = (norm, pageW, pageH) => {
  const { nx, ny, nw, nh } = norm;
  return {
    x: nx * pageW,
    y: ny * pageH,
    w: nw * pageW,
    h: nh * pageH
  };
};

// Convert an ArrayBuffer (pdfBytes) to base64 (no data: prefix)
const abToBase64 = async (ab) =>
  new Promise((resolve, reject) => {
    const blob = new Blob([ab], { type: "application/pdf" });
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

// Convert base64 (no data: prefix) -> Uint8Array
const base64ToUint8 = (b64) => {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

// Best-effort first-page PNG preview (used when saving to library)
const getThumbPng = (canvasMap) => {
  const c = canvasMap?.[1]?.current;
  try {
    return c ? c.toDataURL("image/png") : undefined;
  } catch {
    return undefined;
  }
};

/* ------------------------------------------
   Field (draggable/resizable) box
------------------------------------------- */
const FieldBox = ({
  field,
  pageW,
  pageH,
  onUpdate,
  onDelete,
  isDraggingFieldRef,
  registerRef
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const nodeRef = useRef(null);

  // Register DOM node for scroll-to
  useEffect(() => {
    if (registerRef) registerRef(field.id, nodeRef.current);
    return () => registerRef && registerRef(field.id, null);
  }, [field.id, registerRef]);

  const abs = toAbsolute(field, pageW, pageH);

  const handleDragStart = useCallback(() => {
    isDraggingFieldRef.current = true;
    setIsDragging(true);
  }, [isDraggingFieldRef]);

  const handleDragStop = useCallback(
    (_e, d) => {
      setIsDragging(false);
      isDraggingFieldRef.current = false;
      const clampedX = Math.max(0, Math.min(d.x, pageW - abs.w));
      const clampedY = Math.max(0, Math.min(d.y, pageH - abs.h));
      const next = toNormalized(
        { x: clampedX, y: clampedY, w: abs.w, h: abs.h },
        pageW,
        pageH
      );
      onUpdate(field.id, next);
    },
    [abs.h, abs.w, field.id, onUpdate, pageH, pageW, isDraggingFieldRef]
  );

  const handleResizeStart = useCallback(() => {
    isDraggingFieldRef.current = true;
    setIsResizing(true);
  }, [isDraggingFieldRef]);

  const handleResizeStop = useCallback(
    (_e, _direction, ref, _delta, position) => {
      setIsResizing(false);
      isDraggingFieldRef.current = false;
      const w = parseFloat(ref.style.width);
      const h = parseFloat(ref.style.height);
      const x = Math.max(0, Math.min(position.x, pageW - w));
      const y = Math.max(0, Math.min(position.y, pageH - h));
      const next = toNormalized({ x, y, w, h }, pageW, pageH);
      onUpdate(field.id, next);
    },
    [field.id, onUpdate, pageH, pageW, isDraggingFieldRef]
  );

  const handleDelete = useCallback(
    (e) => {
      e.stopPropagation();
      onDelete(field.id);
    },
    [field.id, onDelete]
  );

  // Icon only (no label text)
  const icon = (
    <div className="field-icon" style={{ pointerEvents: "none" }}>
      {field.type === "signature" && <i className="fa-solid fa-pen" />}
      {field.type === "initials" && <i className="fa-solid fa-pen-nib" />}
      {field.type === "date" && <i className="fa-regular fa-calendar" />}
      {field.type === "text" && <i className="fa-solid fa-font" />}
      {field.type === "name" && <i className="fa-solid fa-user" />}
      {/* New icons */}
      {field.type === "phone" && <i className="fa-solid fa-phone" />}
      {field.type === "age" && <i className="fa-solid fa-hashtag" />}
      {field.type === "numberSelect" && <i className="fa-solid fa-list-ol" />}
      {field.type === "state" && <i className="fa-solid fa-map" />}
    </div>
  );

  return (
    <Rnd
      nodeRef={nodeRef}
      className={`field ${isDragging ? "dragging" : ""} ${isResizing ? "is-resizing" : ""}`}
      data-type={field.type}
      size={{ width: abs.w, height: abs.h }}
      position={{ x: abs.x, y: abs.y }}
      bounds="parent"
      dragHandleClassName="field-drag-handle"
      onDragStart={handleDragStart}
      onDragStop={handleDragStop}
      onResizeStart={handleResizeStart}
      onResizeStop={handleResizeStop}
      // Allow resizing from all edges/corners
      enableResizing={{
        top: true,
        right: true,
        bottom: true,
        left: true,
        topRight: true,
        bottomRight: true,
        bottomLeft: true,
        topLeft: true
      }}
      cancel=".delete-btn"
      minWidth={80}
      minHeight={28}
    >
      <div
        ref={nodeRef}
        className="field-drag-handle"
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 0,
          padding: "0 10px",
          cursor: isDragging ? "grabbing" : "grab",
          justifyContent: "center"
        }}
      >
        {icon}

        {/* Decorative corner dots and delete button */}
        <div className="corner-dot tl" />
        <div className="corner-dot tr" />
        <div className="corner-dot bl" />
        <div className="corner-dot br" />

        {/* delete */}
        <div className="delete-btn" onClick={handleDelete}>
          <i className="fa-solid fa-xmark" />
        </div>
      </div>
    </Rnd>
  );
};

// New: radio button field box (circular, non-resizable)
const RadioFieldBox = ({
  field,
  pageW,
  pageH,
  onUpdate,
  onDelete,
  isDraggingFieldRef,
  radioGroup,
  registerRef
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const nodeRef = useRef(null);
  useEffect(() => {
    if (registerRef) registerRef(field.id, nodeRef.current);
    return () => registerRef && registerRef(field.id, null);
  }, [field.id, registerRef]);

  const abs = toAbsolute(field, pageW, pageH);
  const color = radioGroup?.color || "#4a9eff";

  const handleDragStart = useCallback(() => {
    isDraggingFieldRef.current = true;
    setIsDragging(true);
  }, [isDraggingFieldRef]);

  const handleDragStop = useCallback(
    (_e, d) => {
      setIsDragging(false);
      isDraggingFieldRef.current = false;
      const clampedX = Math.max(0, Math.min(d.x, pageW - abs.w));
      const clampedY = Math.max(0, Math.min(d.y, pageH - abs.h));
      const next = toNormalized(
        { x: clampedX, y: clampedY, w: abs.w, h: abs.h },
        pageW,
        pageH
      );
      onUpdate(field.id, next);
    },
    [abs.h, abs.w, field.id, onUpdate, pageH, pageW, isDraggingFieldRef]
  );

  const handleResizeStart = useCallback(() => {
    isDraggingFieldRef.current = true;
    setIsResizing(true);
  }, [isDraggingFieldRef]);

  const handleResizeStop = useCallback(
    (_e, _direction, ref, _delta, position) => {
      setIsResizing(false);
      isDraggingFieldRef.current = false;
      const w = parseFloat(ref.style.width);
      const h = parseFloat(ref.style.height);
      const x = Math.max(0, Math.min(position.x, pageW - w));
      const y = Math.max(0, Math.min(position.y, pageH - h));
      const next = toNormalized({ x, y, w, h }, pageW, pageH);
      onUpdate(field.id, next);
    },
    [onUpdate, pageW, pageH, field.id, isDraggingFieldRef]
  );

  // New: delete handler
  const handleDelete = useCallback(
    (e) => {
      e.stopPropagation();
      onDelete(field.id);
    },
    [field.id, onDelete]
  );

  return (
    <Rnd
      nodeRef={nodeRef}
      className={`field radio-field ${isResizing ? "is-resizing" : ""}`}
      data-type="radio"
      size={{ width: abs.w, height: abs.h }}
      position={{ x: abs.x, y: abs.y }}
      bounds="parent"
      dragHandleClassName="radio-drag-handle"
      onDragStart={handleDragStart}
      onDragStop={handleDragStop}
      onResizeStart={handleResizeStart}
      onResizeStop={handleResizeStop}
      // Enable resize with locked 1:1 aspect (circle)
      lockAspectRatio={1}
      enableResizing={{
        top: true,
        right: true,
        bottom: true,
        left: true,
        topRight: true,
        bottomRight: true,
        bottomLeft: true,
        topLeft: true
      }}
      cancel=".delete-btn"
      minWidth={16}
      minHeight={16}
    >
      <div
        ref={nodeRef}
        className="radio-drag-handle"
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: isDragging ? "grabbing" : "grab",
          borderRadius: "50%",
          border: `2px solid ${color}`,
          background: `${color}20` /* ~12% opacity */
        }}
      >
        <div
          style={{
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            background: color,
            opacity: 0.5
          }}
        />
        {/* Removed radio label */}
        {/* <div
          className="radio-label"
          style={{
            position: "absolute",
            left: abs.w + 8,
            whiteSpace: "nowrap",
            fontSize: "11px",
            color: "#8b9dc3",
            pointerEvents: "none"
          }}
        >
          {(radioGroup?.name || "Radio")}: {field.optionText || ""}
        </div> */}
        <div
          className="delete-btn"
          onClick={handleDelete}
          style={{
            position: "absolute",
            top: -8,
            right: -8,
            width: "16px",
            height: "16px",
            borderRadius: "50%",
            background: "#ff4444",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: "10px",
            color: "white"
          }}
        >
          ×
        </div>
      </div>
    </Rnd>
  );
};

// Lightweight modal to define a radio group
const RadioGroupModal = ({ onClose, onSave }) => {
  const [groupName, setGroupName] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [color, setColor] = useState("#4a9eff");

  const addOption = () => setOptions((o) => [...o, ""]);
  const removeOption = (idx) => {
    setOptions((o) => (o.length > 2 ? o.filter((_, i) => i !== idx) : o));
  };
  const updateOption = (idx, value) => {
    setOptions((o) => o.map((v, i) => (i === idx ? value : v)));
  };
  const handleSave = () => {
    const validOptions = options.map((o) => o.trim()).filter(Boolean);
    if (groupName.trim() && validOptions.length >= 2) {
      onSave(groupName.trim(), validOptions, color);
      onClose();
    }
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999
      }}
    >
      <div
        className="modal-content"
        style={{
          background: "linear-gradient(135deg, #1a2547, #0f1a3a)",
          padding: "24px",
          borderRadius: "16px",
          width: "420px",
          border: "1px solid #2a3c6a"
        }}
      >
        <h3 style={{ color: "#fff", marginBottom: "16px" }}>Create Radio Group</h3>
        <input
          className="sc-input"
          placeholder="Group Name (e.g., Race/Ethnicity)"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          style={{ marginBottom: "12px", width: "100%" }}
        />
        <div style={{ marginBottom: "12px" }}>
          <div style={{ marginBottom: 6, color: "#8b9dc3", fontSize: 14 }}>Color:</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              title="Pick group color"
              style={{ width: 42, height: 32, border: "1px solid #2a3c6a", borderRadius: 6, background: "transparent", padding: 0 }}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["#4a9eff","#22c55e","#eab308","#ef4444","#a855f7","#14b8a6","#f97316","#3b82f6"].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{
                    width: 20, height: 20, borderRadius: 4, border: color === c ? "2px solid #fff" : "2px solid #2a3c6a",
                    background: c, cursor: "pointer"
                  }}
                  aria-label={`Choose ${c}`}
                />
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginBottom: "12px", color: "#8b9dc3", fontSize: 14 }}>Options (min 2):</div>
        {options.map((opt, idx) => (
          <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              className="sc-input"
              placeholder={`Option ${idx + 1}`}
              value={opt}
              onChange={(e) => updateOption(idx, e.target.value)}
              style={{ flex: 1 }}
            />
            {options.length > 2 && (
              <button className="btn danger small" onClick={() => removeOption(idx)}>
                ×
              </button>
            )}
          </div>
        ))}
        <button className="btn" onClick={addOption} style={{ marginTop: 8 }}>
          + Add Option
        </button>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleSave}>
            Create Group
          </button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------
   Main Admin Component
------------------------------------------- */
export default function AdminPdfEditor() {
  const { api } = useApp();
  const navigate = useNavigate();
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const [pdfMeta, setPdfMeta] = useState({ name: "", size: 0 });
  const [pdfUrl, setPdfUrl] = useState("");
  const pdfFileRef = useRef(null); // last selected PDF file (for reliable re-read)

  const [currentTool, setCurrentTool] = useState(null); // 'signature' | 'initials' | 'date' | 'text' | null
  const [scale, setScale] = useState(1);
  const viewerRef = useRef(null);
  const initialFitDoneRef = useRef(false);

  const [pdfBytes, setPdfBytes] = useState(null);
  const [doc, setDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pagesMeta, setPagesMeta] = useState([]); // [{w,h}] at scale 1

  const canvasRefs = useRef({});
  const renderTasksRef = useRef({});
  const [fields, setFields] = useState([]); // [{id, pageIndex, type, nx, ny, nw, nh}]
  const isDraggingFieldRef = useRef(false);
  // New: radio group state
  const [radioGroups, setRadioGroups] = useState({});
  const [activeRadioGroup, setActiveRadioGroup] = useState(null);
  const [showRadioGroupModal, setShowRadioGroupModal] = useState(false);
  const [radioListOpen, setRadioListOpen] = useState(true);

  const [toast, setToast] = useState(null);

  useEffect(() => {
    ensureExternalAssets();
    document.body.classList.remove("user-mode");
  }, []);

  // Load PDF bytes -> pdfjs doc
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    const ab = await file.arrayBuffer();
    setPdfBytes(ab);
    setPdfUrl(""); // local file takes precedence over url
  }, []);

  // File input change
  const onFileChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      if (file) setPdfMeta({ name: file.name, size: file.size });
      if (file) pdfFileRef.current = file;
    },
    [handleFile]
  );

  // Load pdf document
  useEffect(() => {
    // New PDF loaded: allow auto-fit to run once
    initialFitDoneRef.current = false;
    let cancelled = false;
    (async () => {
      if (!pdfBytes) {
        setDoc(null);
        setNumPages(0);
        setPagesMeta([]);
        setFields([]);
        return;
      }
      const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
      const pdf = await loadingTask.promise;
      if (cancelled) return;
      setDoc(pdf);
      setNumPages(pdf.numPages);
      // Get page sizes at scale 1
      const metas = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        metas.push({ w: vp.width, h: vp.height });
      }
      setPagesMeta(metas);
    })().catch((err) => {
      console.error(err);
      setToast({ kind: "error", msg: "Failed to load PDF." });
    });
    return () => {
      cancelled = true;
    };
  }, [pdfBytes]);

  // Auto-fit to page width once, when page metadata and viewer are ready
  useEffect(() => {
    try {
      if (initialFitDoneRef.current) return;
      if (!viewerRef.current) return;
      if (!pagesMeta || pagesMeta.length === 0) return;
      const pageW = Number(pagesMeta[0]?.w || 0);
      const vw = Number(viewerRef.current.clientWidth || 0);
      if (!pageW || !vw) return;
      // account for viewer padding (approx 36px = 18px left + right)
      const inner = Math.max(100, vw - 36);
      const target = Math.max(0.3, Math.min(3, +(inner / pageW).toFixed(2)));
      setScale(target);
      initialFitDoneRef.current = true;
    } catch {}
  }, [pagesMeta]);

  // Render all pages to canvases at current scale
  useEffect(() => {
    let cancelled = false;

    // Cancel any in-flight render tasks before starting new renders
    const existingTasks = Object.values(renderTasksRef.current || {});
    if (existingTasks.length) {
      existingTasks.forEach((task) => {
        try { task && task.cancel && task.cancel(); } catch (_) {}
      });
      renderTasksRef.current = {};
    }

    (async () => {
      if (!doc || !numPages || !pagesMeta.length) return;

      for (let i = 1; i <= numPages; i++) {
        if (cancelled) break;

        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale });

        const canvas = canvasRefs.current[i]?.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) continue;

        // Resize canvas for this scale
        canvas.width = vp.width;
        canvas.height = vp.height;

        // Start render and store task so we can cancel it if needed
        const renderTask = page.render({ canvasContext: ctx, viewport: vp });
        renderTasksRef.current[i] = renderTask;

        try {
          await renderTask.promise;
        } catch (err) {
          // Ignore cancellations; rethrow other errors
          if (!(err && err.name === "RenderingCancelledException")) {
            console.error(err);
          }
        }

        if (cancelled) break;
      }
    })();

    return () => {
      cancelled = true;
      const tasks = Object.values(renderTasksRef.current || {});
      tasks.forEach((task) => {
        try { task && task.cancel && task.cancel(); } catch (_) {}
      });
      renderTasksRef.current = {};
    };
  }, [doc, numPages, pagesMeta, scale]);

  // Create refs for canvases
  const ensureCanvasRef = useCallback((i) => {
    if (!canvasRefs.current[i]) canvasRefs.current[i] = React.createRef();
    return canvasRefs.current[i];
  }, []);

  // Define radio group helpers (fix no-undef)
  const createRadioGroup = useCallback((groupName, options, color) => {
    const groupId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setRadioGroups((prev) => ({
      ...prev,
      [groupId]: { id: groupId, name: groupName, options, color: color || "#4a9eff" }
    }));
    return groupId;
  }, []);

  const addRadioOption = useCallback(
    (groupId, optionText, pageIndex, nx, ny, pageW, pageH) => {
      const w = DEFAULT_SIZES.radio.w / pageW;
      const h = DEFAULT_SIZES.radio.h / pageH;
      setFields((prev) => [
        ...prev,
        {
          id: uid(),
          pageIndex,
          type: "radio",
          groupId,
          optionText,
          nx,
          ny,
          nw: w,
          nh: h
        }
      ]);
    },
    []
  );

  const placeRadioGroup = useCallback(
    (groupId, options, pageIndex, clickX, clickY) => {
      const base = pagesMeta[pageIndex - 1] || { w: 800, h: 1100 };
      const pageW = base.w * scale;
      const pageH = base.h * scale;
      const spacing = 30; // px between options
      const totalH = (options.length - 1) * spacing;
      const startY = Math.max(12, clickY - totalH / 2);
      options.forEach((opt, idx) => {
        const y = Math.min(pageH - 12, startY + idx * spacing);
        const nx = Math.max(0, Math.min(1, clickX / pageW));
        const ny = Math.max(0, Math.min(1, y / pageH));
        addRadioOption(groupId, opt, pageIndex, nx, ny, pageW, pageH);
      });
    },
    [pagesMeta, scale, addRadioOption]
  );

  // Place field by click when a tool is selected
  const onOverlayClick = useCallback(
    (e, pageIndex) => {
      if (!currentTool) return;
      if (isDraggingFieldRef.current) return; // ignore clicks while dragging
      const target = e.target;
      if (target && typeof target.closest === "function" && target.closest(".field")) return;
      const overlay = e.currentTarget;
      const rect = overlay.getBoundingClientRect();
      const pageW = overlay.clientWidth;
      const pageH = overlay.clientHeight;
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Radio group placement
      if (currentTool === "radio_group") {
        if (!activeRadioGroup || !radioGroups[activeRadioGroup]) return;
        const group = radioGroups[activeRadioGroup];
        placeRadioGroup(activeRadioGroup, group.options, pageIndex, clickX, clickY);
        setCurrentTool(null);
        setActiveRadioGroup(null);
        return;
      }

      const defaults = DEFAULT_SIZES[currentTool] || DEFAULT_SIZES.text;
      const w = Math.min(defaults.w, pageW * 0.9);
      const h = Math.min(defaults.h, pageH * 0.2);
      const x = Math.max(0, Math.min(clickX - w / 2, pageW - w));
      const y = Math.max(0, Math.min(clickY - h / 2, pageH - h));
      const nx = x / pageW;
      const ny = y / pageH;
      const nw = w / pageW;
      const nh = h / pageH;
      const f = { id: uid(), pageIndex, type: currentTool, nx, ny, nw, nh };
      setFields((prev) => [...prev, f]);
    },
    [currentTool, activeRadioGroup, radioGroups, placeRadioGroup] // include placeRadioGroup
  );

  const updateField = useCallback((id, patch) => {
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
    );
  }, []);

  const deleteField = useCallback((id) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearFields = useCallback(() => {
    setFields([]);
  }, []);

  // Common builder for template payload (JSON + embedded PDF, plus optional meta)
  const buildTemplatePayload = useCallback(async () => {
    if (!numPages) throw new Error("No pages to save yet.");
    const out = {
      version: 1,
      numPages,
      fields,
      radioGroups,
    };
    if (templateName?.trim()) out.name = templateName.trim();
    if (templateDesc?.trim()) out.description = templateDesc.trim();
    if (pdfBytes && pdfBytes.byteLength > 0) {
      try {
        out.pdfBase64 = await abToBase64(pdfBytes);
        out.pdfName = pdfMeta.name || "document.pdf";
        out.pdfSize = pdfMeta.size || pdfBytes.byteLength;
      } catch {}
    } else if (pdfFileRef.current) {
      try {
        const ab = await pdfFileRef.current.arrayBuffer();
        out.pdfBase64 = await abToBase64(ab);
        out.pdfName = pdfFileRef.current.name || pdfMeta.name || "document.pdf";
        out.pdfSize = pdfFileRef.current.size || ab.byteLength;
      } catch (e) {
        try { console.warn("[AdminPdfEditor] buildTemplatePayload: failed to re-read file:", e?.message || e); } catch {}
      }
    } else if (pdfUrl) {
      out.pdfUrl = pdfUrl;
    }
    return out;
  }, [numPages, fields, radioGroups, templateName, templateDesc, pdfBytes, pdfMeta, pdfUrl]);

  const downloadTemplateJson = useCallback((payload) => {
    try {
      const name = (payload?.name || "pdf-template")
        .toString()
        .replace(/[^a-z0-9._-]+/gi, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name || "pdf-template"}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {}
  }, []);

  // Save JSON (template) and, if named, also store in the shared library
  const saveTemplate = useCallback(async () => {
    try {
      const payload = await buildTemplatePayload();
      downloadTemplateJson(payload);
      // If the template has a name and a PDF is loaded, also save to library for reuse
      if (payload?.name && payload?.pdfBase64) {
        const libPayload = {
          ...payload,
          thumbPng: getThumbPng(canvasRefs.current),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await api.add("pdfTemplates", libPayload);
        setToast({ kind: "success", msg: "Template saved and added to library." });
      } else {
        setToast({ kind: "success", msg: "Template saved (JSON). Add a name + PDF to save to library." });
      }
    } catch (e) {
      setToast({ kind: "error", msg: e?.message || "Failed to save template." });
    }
  }, [buildTemplatePayload, downloadTemplateJson, api]);

  // Save to shared template library (PDF + fields + meta)
  const saveToLibrary = useCallback(async () => {
    if (!templateName.trim()) {
      setToast({ kind: "error", msg: "Enter a template name." });
      return;
    }
    try {
      // Debug: entry state
      try {
        console.log("[AdminPdfEditor] saveToLibrary: start", {
          templateName,
          hasPdfBytes: !!pdfBytes,
          pdfBytesSize: pdfBytes?.byteLength || 0,
          pdfUrl,
          numPages,
          fieldsCount: fields?.length || 0,
        });
      } catch {}

      const payload = await buildTemplatePayload();

      // Debug: payload summary (avoid logging large base64)
      try {
        console.log("[AdminPdfEditor] saveToLibrary: payload", {
          name: payload?.name,
          numPages: payload?.numPages,
          fieldsCount: payload?.fields?.length || 0,
          radioGroups: Object.keys(payload?.radioGroups || {}).length,
          hasPdfBase64: !!payload?.pdfBase64,
          pdfBase64Len: payload?.pdfBase64 ? payload.pdfBase64.length : 0,
          pdfUrl: payload?.pdfUrl || null,
        });
      } catch {}
      if (!payload?.pdfBase64 && !payload?.pdfUrl) {
        try { console.warn("[AdminPdfEditor] saveToLibrary: no PDF present (neither embedded base64 nor url)"); } catch {}
        setToast({ kind: "error", msg: "Load a PDF or include a pdfUrl in the template JSON." });
        return;
      }
      const libPayload = {
        ...payload,
        thumbPng: getThumbPng(canvasRefs.current),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const { pdfBase64, ...debugOut } = libPayload;
      try { console.log("[AdminPdfEditor] saveToLibrary: posting", { ...debugOut, hasPdfBase64: !!pdfBase64 }); } catch {}
      const saved = await api.add("pdfTemplates", libPayload);
      try { console.log("[AdminPdfEditor] saveToLibrary: success", { id: saved?.id || saved?._id || "(unknown)" }); } catch {}
      setToast({ kind: "success", msg: "Saved to template library." });
    } catch (e) {
      try { console.error("[AdminPdfEditor] saveToLibrary error:", e); } catch {}
      setToast({ kind: "error", msg: e?.message || "Failed to save to library." });
    }
  }, [api, buildTemplatePayload]);

  // Load JSON (template)
  const loadTemplateFile = useCallback(async (file) => {
    if (!file) return;
    try {
      const txt = await file.text();
      const json = JSON.parse(txt);
      if (!Array.isArray(json.fields)) throw new Error("Invalid template: missing fields");
      setFields(json.fields);
      // New: restore radio groups if present
      setRadioGroups(json.radioGroups || {});

      // If the template JSON includes the PDF, load it immediately
      if (json.pdfBase64) {
        try {
          let b64 = json.pdfBase64;
          const comma = String(b64).indexOf(',');
          if (String(b64).startsWith('data:') && comma >= 0) b64 = String(b64).slice(comma + 1);
          const bytes = base64ToUint8(b64);
          setPdfBytes(bytes.buffer);
          setPdfMeta({
            name: json.pdfName || "document.pdf",
            size: json.pdfSize || bytes.byteLength
          });
          setPdfUrl("");
        } catch {}
      } else if (json.pdfUrl) {
        setPdfBytes(null);
        setPdfMeta({ name: '', size: 0 });
        setPdfUrl(String(json.pdfUrl));
      }
      setToast({ kind: "success", msg: "Template loaded." });
    } catch (e) {
      console.error(e);
      setToast({ kind: "error", msg: "Invalid template JSON." });
    }
  }, []);

  const onTemplateChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) loadTemplateFile(file);
    },
    [loadTemplateFile]
  );

  const zoomOut = useCallback(() => setScale((s) => Math.max(0.3, +(s - 0.1).toFixed(2))), []);
  const zoomIn = useCallback(() => setScale((s) => Math.min(3, +(s + 0.1).toFixed(2))), []);
  const zoomReset = useCallback(() => setScale(1), []);

  // Small styles for radios
  const radioStyles = `
    .field.radio-field { min-width: 24px !important; min-height: 24px !important; }
    .radio-group-list { margin-top: 12px; padding: 10px; background: rgba(0,0,0,.25); border-radius: 8px; }
    .radio-group-item { padding: 8px; margin-bottom: 8px; background: rgba(74,158,255,.08); border: 1px solid #2a3c6a; border-radius: 6px; cursor: pointer; }
    .radio-group-item.active { background: rgba(74,158,255,.18); border-color: #4a9eff; }
  `;

  // New: DocuSign-style field styling (same as UserPdfSigner)
  const adminFieldStyles = `
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
    border: 1px solid #42b0d5;
  }

  .field:hover {
    border-color: #2b9ec3;
    box-shadow: 0 2px 8px rgba(66,176,213,.2);
  }

  .field.filled {
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
  `;

  // Map fieldId -> DOM node for scroll/highlight (move above useMemo)
  const fieldDomMap = useRef({});
  const registerFieldDom = useCallback((id, el) => {
    if (!id) return;
    if (el) fieldDomMap.current[id] = el;
    else delete fieldDomMap.current[id];
  }, []);
  const focusField = useCallback((id) => {
    const el = fieldDomMap.current[id];
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      el.classList.add("flash-highlight");
      setTimeout(() => el.classList && el.classList.remove("flash-highlight"), 1200);
    } catch {}
  }, []);

  // Render pages
  const pages = useMemo(() => {
    if (!numPages || !pagesMeta.length) return null;
    return Array.from({ length: numPages }, (_, idx) => {
      const i = idx + 1;
      const base = pagesMeta[idx] || { w: 0, h: 0 };
      const pageW = base.w * scale;
      const pageH = base.h * scale;
      const pageFields = fields.filter((f) => f.pageIndex === i);
      return (
        <div key={i} className="page-wrap" style={{ width: pageW, height: pageH }}>
          <canvas
            ref={ensureCanvasRef(i)}
            className="page-canvas"
            style={{ width: pageW, height: pageH }}
          />
          <div
            className={`overlay ${currentTool ? "placeable" : ""}`}
            style={{ position: "absolute", inset: 0 }}
            onClick={(e) => onOverlayClick(e, i)}
          >
            {pageFields.map((f) =>
              f.type === "radio" ? (
                <RadioFieldBox
                  key={f.id}
                  field={f}
                  pageW={pageW}
                  pageH={pageH}
                  onUpdate={updateField}
                  onDelete={deleteField}
                  isDraggingFieldRef={isDraggingFieldRef}
                  radioGroup={radioGroups[f.groupId]}
                  registerRef={registerFieldDom}
                />
              ) : (
                <FieldBox
                  key={f.id}
                  field={f}
                  pageW={pageW}
                  pageH={pageH}
                  onUpdate={updateField}
                  onDelete={deleteField}
                  isDraggingFieldRef={isDraggingFieldRef}
                  registerRef={registerFieldDom}
                />
              )
            )}
          </div>
        </div>
      );
    });
  }, [
    ensureCanvasRef,
    fields,
    numPages,
    onOverlayClick,
    pagesMeta,
    scale,
    currentTool,
    radioGroups,
    updateField,   // added
    deleteField,    // added
    registerFieldDom
  ]);

  return (
    <div className="layout">
      <style>{adminFieldStyles}</style>
      <style>{`
        .toolbox .tpl-input::placeholder{
          color: var(--text-dim);
          opacity: 0.95;
          font-weight: 600;
          letter-spacing: .2px;
        }
        .toolbox .tpl-input{
          border:1px solid #2a3c6a;
          border-radius:12px;
          height:40px;
        }
      `}</style>
      <style>{radioStyles}</style>
      {/* Force side panels to match viewer height and scroll as needed */}
      <style>{`
        .viewer { height: calc(100vh - 96px); }
        .toolbox, .right { height: calc(100vh - 96px) !important; overflow: auto; }
      `}</style>
      <style>{`
        /* Scroll list to ~7 items */
        .right .fill-list {
          max-height: calc(7 * 64px + 6 * 10px);
          overflow: auto;
          padding-right: 6px;
        }
        /* Flash highlight when focusing a field */
        .field.flash-highlight {
          box-shadow: 0 0 0 3px rgba(74,158,255,.7), 0 0 0 8px rgba(74,158,255,.25);
          transition: box-shadow .3s ease-out;
        }
      `}</style>
      {/* Left toolbox */}
      <aside className="toolbox">
        <div className="mini" style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
          <button className="btn" onClick={()=>navigate("/admin/docs-center")}>
            <i className="fa-solid fa-arrow-left" /> Back
          </button>
        </div>
        <h3>PDF Tools</h3>

        <label className="file-btn" style={{ display: "inline-block", marginBottom: 8 }}>
          <input type="file" accept="application/pdf" onChange={onFileChange} />
          <span><i className="fa-solid fa-file-arrow-up" /> Load PDF</span>
        </label>

        <div className="hint">
          Click a tool to place a field, then click on the page. Drag to move, resize from corners.
        </div>

        <div className="mini">
          <button
            className={currentTool === "signature" ? "btn primary" : "btn"}
            onClick={() => setCurrentTool((t) => (t === "signature" ? null : "signature"))}
          >
            <i className="fa-solid fa-pen" /> Signature
          </button>
          <button
            className={currentTool === "initials" ? "btn primary" : "btn"}
            onClick={() => setCurrentTool((t) => (t === "initials" ? null : "initials"))}
          >
            <i className="fa-solid fa-pen-nib" /> Initials
          </button>
          <button
            className={currentTool === "date" ? "btn primary" : "btn"}
            onClick={() => setCurrentTool((t) => (t === "date" ? null : "date"))}
          >
            <i className="fa-regular fa-calendar" /> Date
          </button>
          <button
            className={currentTool === "text" ? "btn primary" : "btn"}
            onClick={() => setCurrentTool((t) => (t === "text" ? null : "text"))}
          >
            <i className="fa-solid fa-font" /> Text
          </button>
          <button
            className={currentTool === "name" ? "btn primary" : "btn"}
            onClick={() => setCurrentTool((t) => (t === "name" ? null : "name"))}
          >
            <i className="fa-solid fa-user" /> Printed Name
          </button>
          {/* New tools */}
          <button
            className={currentTool === "phone" ? "btn primary" : "btn"}
            onClick={() => setCurrentTool((t) => (t === "phone" ? null : "phone"))}
          >
            <i className="fa-solid fa-phone" /> Phone
          </button>
          <button
            className={currentTool === "age" ? "btn primary" : "btn"}
            onClick={() => setCurrentTool((t) => (t === "age" ? null : "age"))}
          >
            <i className="fa-solid fa-hashtag" /> Age
          </button>
          <button
            className={currentTool === "numberSelect" ? "btn primary" : "btn"}
            onClick={() => setCurrentTool((t) => (t === "numberSelect" ? null : "numberSelect"))}
          >
            <i className="fa-solid fa-list-ol" /> 0–99
          </button>
          <button
            className={currentTool === "state" ? "btn primary" : "btn"}
            onClick={() => setCurrentTool((t) => (t === "state" ? null : "state"))}
          >
            <i className="fa-solid fa-map" /> State
          </button>
          {/* Radio group remains */}
          <button
            className={currentTool === "radio_group" ? "btn primary" : "btn"}
            onClick={() => {
              if (currentTool !== "radio_group") {
                setCurrentTool("radio_group");
                setShowRadioGroupModal(true);
              } else {
                setCurrentTool(null);
                setActiveRadioGroup(null);
              }
            }}
          >
            <i className="fa-regular fa-circle-dot" /> Radio Group
          </button>
        </div>

        {/* Optional: list of radio groups for quick selection (collapsible) */}
        {Object.keys(radioGroups).length > 0 && (
          <div className="radio-group-panel" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontWeight: 700, color: '#c9d5ff' }}>Radio Groups</div>
              <button className="btn" onClick={() => setRadioListOpen((v) => !v)} style={{ padding: '4px 8px', fontSize: 12 }}>
                {radioListOpen ? 'Hide' : 'Show'}
              </button>
            </div>
            {radioListOpen && (
              <div className="radio-group-list">
                {Object.values(radioGroups).map((g) => (
                  <div
                    key={g.id}
                    className={`radio-group-item ${activeRadioGroup === g.id ? "active" : ""}`}
                    onClick={() => {
                      setActiveRadioGroup(g.id);
                      setCurrentTool("radio_group");
                    }}
                    title="Select and click on a page to place options"
                  >
                    <span style={{
                      display: "inline-block", width: 10, height: 10, borderRadius: 3,
                      background: g.color || "#4a9eff", marginRight: 8, verticalAlign: "middle"
                    }}/>
                    {g.name} · {g.options.length} options
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mini" style={{ marginTop: 10 }}>
          <div className="zoom-val">Zoom: {(scale * 100).toFixed(0)}%</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={zoomOut}><i className="fa-solid fa-magnifying-glass-minus" /></button>
            <button className="btn" onClick={zoomReset}><i className="fa-solid fa-arrows-to-dot" /></button>
            <button className="btn" onClick={zoomIn}><i className="fa-solid fa-magnifying-glass-plus" /></button>
          </div>
        </div>

        <hr style={{ borderColor: "#22305a", margin: "12px 0" }} />

        <div className="mini">
          <label className="file-btn">
            <input type="file" accept="application/json" onChange={onTemplateChange} />
            <span><i className="fa-solid fa-file-import" /> Load Template</span>
          </label>
          <button className="btn" onClick={saveTemplate}>
            <i className="fa-solid fa-floppy-disk" /> Save Template (JSON+PDF)
          </button>
          <button className="btn danger" onClick={clearFields}>
            <i className="fa-solid fa-trash" /> Clear Fields
          </button>
        </div>
        <div className="mini" style={{ marginTop: 10 }}>
          <input
            id="tpl-name"
            className="sc-input tpl-input"
            placeholder="Template name *"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
          />
          <input
            id="tpl-desc"
            className="sc-input tpl-input"
            placeholder="Description (Optional)"
            value={templateDesc}
            onChange={(e) => setTemplateDesc(e.target.value)}
          />
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {pdfMeta.name
              ? `PDF: ${pdfMeta.name} · ${(pdfMeta.size / 1024 / 1024).toFixed(2)} MB`
              : (pdfUrl ? `PDF URL: ${pdfUrl}` : "No PDF loaded")}
          </div>
          {/* Quick attach right here so it's obvious when saving to library */}
          <label className="file-btn" style={{ display: "inline-block", marginTop: 6 }}>
            <input type="file" accept="application/pdf" onChange={onFileChange} />
            <span><i className="fa-solid fa-file-circle-plus" /> Attach PDF for Library</span>
          </label>
          <button className="btn" onClick={saveToLibrary}>
            <i className="fa-solid fa-cloud-arrow-up" /> Save to Library
          </button>
        </div>
      </aside>

      {/* Center viewer */}
      <main className="viewer" ref={viewerRef}>
        <div className="pages">{pages}</div>
      </main>

      {/* Right status panel */}
      <aside className="right">
        <h3>Fields</h3>
        <div className={`fill-list ${fields.length ? "" : "empty"}`}>
          {fields.length === 0 && <div>No fields placed yet.</div>}
          {fields.map((f, idx) => (
            <div
              key={f.id}
              className="fill-item"
              onClick={() => focusField(f.id)}
            >
              <div className="left">
                <div className="idx">{idx + 1}</div>
                <div>
                  <div className="label" style={{ textTransform: "capitalize" }}>
                    {f.type === "name"
                      ? "Printed Name"
                      : f.type === "radio"
                      ? `Radio: ${radioGroups[f.groupId]?.name || f.groupId}`
                      : f.type}
                  </div>
                  <div className="meta">
                    Page {f.pageIndex} · x{(f.nx * 100).toFixed(1)}% y{(f.ny * 100).toFixed(1)}% ·
                    w{(f.nw * 100).toFixed(1)}% h{(f.nh * 100).toFixed(1)}%
                    {f.type === "radio" && f.optionText ? ` · ${f.optionText}` : ""}
                  </div>
                  {/* New: Required toggle for Text fields */}
                  {f.type === "text" && (
                    <label style={{ fontSize: 12, color: "#9fb0e8", display: "inline-flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                      <input
                        type="checkbox"
                        checked={!!f.required}
                        onChange={() => updateField(f.id, { required: !f.required })}
                      />
                      Required
                    </label>
                  )}
                </div>
              </div>
              <div className="status">
                <button
                  className="btn small danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteField(f.id);
                  }}
                >
                  <i className="fa-solid fa-trash" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Toast */}
      <div className={`toast ${toast ? "show" : ""}`} role="status">
        {toast?.msg}
      </div>

      {/* New: Radio group creation modal */}
      {showRadioGroupModal && (
        <RadioGroupModal
          onClose={() => {
            setShowRadioGroupModal(false);
            if (!activeRadioGroup) setCurrentTool(null);
          }}
          onSave={(name, options, color) => {
            const id = createRadioGroup(name, options, color);
            setActiveRadioGroup(id);
            setCurrentTool("radio_group");
          }}
        />
      )}
    </div>
  );
}
