// src/pages/Documents.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { 
  FaFilePdf, FaSignature, FaFont, FaCalendarAlt, FaCheckSquare, 
  FaHighlighter, FaSquare, FaDownload, FaUpload, FaMagic,
  FaChevronLeft, FaChevronRight, FaPlus, FaMinus, FaExpand,
  FaEraser, FaCheck, FaTimes, FaGripLines, FaTrash, FaMousePointer
} from "react-icons/fa";
import { useApp } from "../context/AppContext";

/** -------------------------------------------------------------
 *  DSM Document Studio (React + pdf.js + pdf-lib)
 *  - Professional PDF Editing & Signing
 * --------------------------------------------------------------*/

export default function PdfEditor() {
  const { api, setToast } = useApp();
  
  /* ---------- lazy libs & worker ---------- */
  const pdfjsRef = useRef(null);
  const pdfLibRef = useRef(null);
  const workerRef = useRef(null);

  /* ---------- editor state ---------- */
  const [scale, setScale] = useState(1.1);
  const [activeTool, setActiveTool] = useState("select");
  const [color, setColor] = useState("#4f46e5"); // Brand Primary
  const [activeTab, setActiveTab] = useState("draw");
  const [loading, setLoading] = useState(true);

  const stateRef = useRef({
    pdfBytes: null,
    pdfDoc: null,
    currentPage: 1,
    pagesMeta: [],
    placed: new Map(),
    sigDataUrl: null,
  });

  const pagesRef = useRef(null);
  const rightRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const typedPreviewRef = useRef(null);

  /* ---------- signature state ---------- */
  const [typedName, setTypedName] = useState("");
  const [sigKind, setSigKind] = useState("full");
  const [fontFamily, setFontFamily] = useState("'Brush Script MT', cursive");
  const [typedColor, setTypedColor] = useState("#0f172a");

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const initialsOf = (n) => n.trim().split(/\s+/).filter(Boolean).map(s => s[0]?.toUpperCase() || "").join("");

  /* ---------- load libs ---------- */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const pdfjs = await import("pdfjs-dist");
        const PDFLib = await import("pdf-lib");
        
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
        
        pdfjsRef.current = pdfjs;
        pdfLibRef.current = PDFLib;
      } catch (err) {
        console.error("PDF Library load failed", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ---------- draw pad logic ---------- */
  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas || activeTab !== "draw") return;
    let ctx = canvas.getContext("2d");
    let drawing = false;
    let lastPt = null;

    const size = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(300, r.width);
      canvas.height = 200;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = typedColor;
      ctx.lineWidth = 3;
    };
    size();

    const getPt = (e) => {
      const b = canvas.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };

    const down = (e) => { drawing = true; lastPt = getPt(e); };
    const move = (e) => { 
      if (!drawing) return; 
      const p = getPt(e); 
      ctx.beginPath(); ctx.moveTo(lastPt.x, lastPt.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      lastPt = p; e.preventDefault(); 
    };
    const up = () => { drawing = false; lastPt = null; };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);

    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [activeTab, typedColor]);

  const clearDraw = () => {
    const ctx = drawCanvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, drawCanvasRef.current.width, drawCanvasRef.current.height);
  };

  const saveSig = (dataUrl) => {
    stateRef.current.sigDataUrl = dataUrl;
    setToast("Signature adopted");
  };

  /* ---------- pdf.js logic ---------- */
  const renderAllPages = useCallback(async () => {
    const pdfjs = pdfjsRef.current; if (!pdfjs) return;
    const st = stateRef.current;
    const pagesDiv = pagesRef.current; if (!pagesDiv || !st.pdfDoc) return;

    pagesDiv.innerHTML = "";
    for (let i = 1; i <= st.pdfDoc.numPages; i++) {
      const page = await st.pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale });
      const c = document.createElement("canvas"); c.className = "pdf-canvas";
      const ctx = c.getContext("2d"); c.width = viewport.width; c.height = viewport.height;
      const pageWrap = document.createElement("div"); pageWrap.className = "page-wrap";
      pageWrap.style.width = viewport.width + "px"; pageWrap.style.height = viewport.height + "px";
      const overlay = document.createElement("div"); overlay.className = "overlay-layer"; overlay.dataset.pageIndex = String(i);
      pageWrap.appendChild(c); pageWrap.appendChild(overlay); pagesDiv.appendChild(pageWrap);
      await page.render({ canvasContext: ctx, viewport }).promise;
      st.pagesMeta[i] = { width: viewport.width, height: viewport.height };
      (st.placed.get(i) || []).forEach((f) => attachItemEl(overlay, f));
    }
  }, [scale]);

  const loadPdfFromBytes = useCallback(async (bytes) => {
    const pdfjs = pdfjsRef.current; if (!pdfjs) return;
    const st = stateRef.current;
    const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    st.pdfBytes = src.slice();
    st.pdfDoc = await pdfjs.getDocument({ data: src }).promise;
    st.currentPage = 1;
    st.placed.clear();
    await renderAllPages();
  }, [renderAllPages]);

  /* ---------- Element Attachment ---------- */
  function attachItemEl(overlayEl, f) {
    const W = overlayEl.clientWidth, H = overlayEl.clientHeight;
    const el = document.createElement("div"); el.className = "field-item";
    el.style.left = f.xp * W + "px"; el.style.top = f.yp * H + "px";
    el.style.width = f.wp * W + "px"; el.style.height = f.hp * H + "px";
    el.dataset.id = f.id;

    if (f.type === "highlight") el.style.background = "rgba(253, 224, 71, 0.35)";
    else if (f.type === "rect") el.style.border = `2px solid ${f.color || '#4f46e5'}`;
    else el.style.border = "1px dashed var(--primary)";

    const badge = document.createElement("div"); badge.className = "field-badge";
    badge.innerHTML = `<span>${f.type}</span>`;
    el.appendChild(badge);

    const handle = document.createElement("div"); handle.className = "resize-handle"; el.appendChild(handle);
    overlayEl.appendChild(el);

    // Basic interactions
    el.addEventListener("pointerdown", (e) => {
      if (e.target === handle) return;
      let startX = e.clientX, startY = e.clientY, startL = el.offsetLeft, startT = el.offsetTop;
      const onMove = (mv) => {
        const nx = clamp(startL + mv.clientX - startX, 0, overlayEl.clientWidth - el.offsetWidth);
        const ny = clamp(startT + mv.clientY - startY, 0, overlayEl.clientHeight - el.offsetHeight);
        el.style.left = nx + "px"; el.style.top = ny + "px";
        f.xp = nx / W; f.yp = ny / H;
      };
      const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
      window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
    });

    handle.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      let startW = el.offsetWidth, startH = el.offsetHeight, startX = e.clientX, startY = e.clientY;
      const onMove = (mv) => {
        const nw = clamp(startW + mv.clientX - startX, 20, overlayEl.clientWidth - el.offsetLeft);
        const nh = clamp(startH + mv.clientY - startY, 20, overlayEl.clientHeight - el.offsetTop);
        el.style.width = nw + "px"; el.style.height = nh + "px";
        f.wp = nw / W; f.hp = nh / H;
      };
      const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
      window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
    });

    el.addEventListener("dblclick", () => {
      if (window.confirm("Remove this field?")) {
        const arr = stateRef.current.placed.get(f.pageIndex);
        stateRef.current.placed.set(f.pageIndex, arr.filter(x => x.id !== f.id));
        el.remove();
      }
    });
  }

  const addItem = (type) => {
    const st = stateRef.current;
    if (!st.pdfDoc) return setToast("Load a PDF first");
    const overlays = pagesRef.current.querySelectorAll(".overlay-layer");
    const overlay = overlays[st.currentPage - 1];
    const meta = st.pagesMeta[st.currentPage];
    
    const field = {
      id: crypto.randomUUID(), type, pageIndex: st.currentPage,
      xp: 0.1, yp: 0.1, wp: 0.2, hp: 0.05, color
    };
    const arr = st.placed.get(st.currentPage) || [];
    arr.push(field); st.placed.set(st.currentPage, arr);
    attachItemEl(overlay, field);
  };

  /* ---------- Export ---------- */
  const onDownload = async () => {
    const PDFLib = pdfLibRef.current;
    if (!PDFLib || !stateRef.current.pdfBytes) return;
    setLoading(true);
    try {
      const pdfDoc = await PDFLib.PDFDocument.load(stateRef.current.pdfBytes);
      // Logic would go here to burn the annotations into the PDF
      const bytes = await pdfDoc.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "studio_export.pdf"; a.click();
    } finally { setLoading(false); }
  };

  if (loading && !pdfjsRef.current) return <div className="studio-loading">Booting Document Studio...</div>;

  return (
    <section className="document-studio fade-in">
      <style>{STUDIO_CSS}</style>

      {/* Primary Toolbar */}
      <header className="studio-header">
        <div className="brand">
          <div className="brand-icon"><FaFilePdf /></div>
          <div>
            <h1>Document Studio</h1>
            <p>PDF Precision Editor</p>
          </div>
        </div>

        <div className="header-actions">
          <label className="action-btn file">
            <FaUpload /> Import PDF
            <input type="file" hidden accept="application/pdf" onChange={async e => {
              const file = e.target.files[0];
              if (file) loadPdfFromBytes(new Uint8Array(await file.arrayBuffer()));
            }} />
          </label>
          <button className="action-btn primary" onClick={onDownload}><FaDownload /> Export</button>
        </div>
      </header>

      <div className="studio-workspace">
        {/* Left: Component Library */}
        <aside className="studio-sidebar">
          <div className="sidebar-section">
            <div className="section-head">Toolbox</div>
            <div className="tool-grid">
              <ToolItem icon={FaFont} label="Text" onClick={() => addItem("text")} />
              <ToolItem icon={FaSignature} label="Sign" onClick={() => addItem("signature")} />
              <ToolItem icon={FaCalendarAlt} label="Date" onClick={() => addItem("date")} />
              <ToolItem icon={FaCheckSquare} label="Check" onClick={() => addItem("checkbox")} />
              <ToolItem icon={FaHighlighter} label="Highlight" onClick={() => addItem("highlight")} />
              <ToolItem icon={FaSquare} label="Shape" onClick={() => addItem("rect")} />
            </div>
            <div className="color-picker">
              <label>Ink Color</label>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} />
            </div>
          </div>

          <div className="sidebar-section signature">
            <div className="section-head">Signature Suite</div>
            <div className="sig-tabs">
              <button className={activeTab === 'draw' ? 'active' : ''} onClick={() => setActiveTab('draw')}>Draw</button>
              <button className={activeTab === 'type' ? 'active' : ''} onClick={() => setActiveTab('type')}>Type</button>
            </div>

            <div className="sig-canvas-container">
              {activeTab === 'draw' ? (
                <div className="draw-pane">
                  <canvas ref={drawCanvasRef} />
                  <div className="pane-actions">
                    <button onClick={clearDraw}><FaEraser /> Clear</button>
                    <button className="done" onClick={() => saveSig(drawCanvasRef.current.toDataURL())}><FaCheck /> Adopt</button>
                  </div>
                </div>
              ) : (
                <div className="type-pane">
                  <input placeholder="Type name..." value={typedName} onChange={e => setTypedName(e.target.value)} />
                  <div className="sig-preview" style={{ fontFamily }}>{typedName || "Your Signature"}</div>
                  <button className="done" onClick={() => saveSig("typed")}><FaCheck /> Adopt</button>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main: Viewer Canvas */}
        <main className="studio-viewer" ref={rightRef}>
          <div className="viewer-toolbar">
            <div className="page-nav">
              <button onClick={() => {
                const st = stateRef.current;
                if (st.currentPage > 1) {
                  st.currentPage--;
                  const wraps = pagesRef.current.querySelectorAll(".page-wrap");
                  wraps[st.currentPage-1].scrollIntoView({ behavior: 'smooth' });
                }
              }}><FaChevronLeft /></button>
              <span className="page-count">Page 1 / {stateRef.current.pdfDoc?.numPages || 1}</span>
              <button onClick={() => {
                const st = stateRef.current;
                if (st.currentPage < st.pdfDoc.numPages) {
                  st.currentPage++;
                  const wraps = pagesRef.current.querySelectorAll(".page-wrap");
                  wraps[st.currentPage-1].scrollIntoView({ behavior: 'smooth' });
                }
              }}><FaChevronRight /></button>
            </div>
            <div className="zoom-controls">
              <button onClick={() => setScale(s => s - 0.1)}><FaMinus /></button>
              <span>{Math.round(scale * 100)}%</span>
              <button onClick={() => setScale(s => s + 0.1)}><FaPlus /></button>
              <button onClick={() => setScale(1.1)}><FaExpand /></button>
            </div>
          </div>

          <div className="viewer-scroll">
            {stateRef.current.pdfDoc ? (
              <div className="pages-container" ref={pagesRef} />
            ) : (
              <div className="viewer-empty">
                <FaFilePdf />
                <h3>No Document Loaded</h3>
                <p>Import a PDF file to begin precision editing.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </section>
  );
}

function ToolItem({ icon: Icon, label, onClick }) {
  return (
    <button className="tool-item" onClick={onClick}>
      <Icon />
      <span>{label}</span>
    </button>
  );
}

const STUDIO_CSS = `
  .document-studio { height: calc(100vh - 64px); display: flex; flex-direction: column; background: #f1f5f9; }
  .studio-header { background: #fff; border-bottom: 1px solid #e2e8f0; padding: 12px 32px; display: flex; align-items: center; justify-content: space-between; z-index: 100; }
  
  .brand { display: flex; align-items: center; gap: 16px; }
  .brand-icon { width: 40px; height: 40px; border-radius: 12px; background: #ef4444; color: white; display: grid; place-items: center; font-size: 20px; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2); }
  .brand h1 { font-size: 18px; font-weight: 800; margin: 0; color: #0f172a; letter-spacing: -0.5px; }
  .brand p { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin: 2px 0 0; }

  .header-actions { display: flex; gap: 12px; }
  .action-btn { height: 40px; padding: 0 20px; border-radius: 10px; font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s; border: 1px solid #e2e8f0; background: #fff; color: #475569; }
  .action-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
  .action-btn.primary { background: #4f46e5; border: none; color: white; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2); }
  .action-btn.primary:hover { background: #4338ca; transform: translateY(-1px); }

  .studio-workspace { flex: 1; display: grid; grid-template-columns: 320px 1fr; min-height: 0; }
  
  .studio-sidebar { background: #fff; border-right: 1px solid #e2e8f0; padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 32px; }
  .section-head { font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; }
  
  .tool-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .tool-item { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px 4px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; transition: 0.2s; cursor: pointer; }
  .tool-item:hover { border-color: #4f46e5; background: #eef2ff; color: #4f46e5; }
  .tool-item svg { font-size: 16px; opacity: 0.7; }
  .tool-item span { font-size: 10px; font-weight: 700; }

  .color-picker { margin-top: 20px; display: flex; align-items: center; justify-content: space-between; padding: 12px; background: #f8fafc; border-radius: 12px; }
  .color-picker label { font-size: 11px; font-weight: 700; color: #64748b; }
  .color-picker input { width: 32px; height: 32px; border: none; background: none; cursor: pointer; }

  .sig-tabs { display: flex; background: #f1f5f9; padding: 4px; border-radius: 10px; gap: 4px; margin-bottom: 16px; }
  .sig-tabs button { flex: 1; height: 32px; border-radius: 7px; border: none; font-weight: 700; font-size: 12px; color: #64748b; background: transparent; transition: 0.2s; }
  .sig-tabs button.active { background: white; color: #0f172a; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }

  .sig-canvas-container { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; min-height: 240px; }
  .draw-pane canvas { background: white; border: 1px solid #e2e8f0; border-radius: 8px; width: 100%; height: 160px; cursor: crosshair; }
  .pane-actions { display: flex; justify-content: space-between; margin-top: 12px; }
  .pane-actions button { padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 700; border: 1px solid #e2e8f0; background: white; cursor: pointer; }
  .pane-actions button.done { background: #10b981; color: white; border: none; }

  .type-pane { display: flex; flex-direction: column; gap: 12px; }
  .type-pane input { padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; outline: none; }
  .sig-preview { height: 100px; background: white; border: 1px solid #e2e8f0; border-radius: 8px; display: grid; place-items: center; font-size: 24px; color: #0f172a; }

  .studio-viewer { background: #525659; display: flex; flex-direction: column; position: relative; }
  .viewer-toolbar { position: sticky; top: 0; background: rgba(255,255,255,0.9); backdrop-filter: blur(10px); height: 48px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; z-index: 50; }
  
  .page-nav, .zoom-controls { display: flex; align-items: center; gap: 16px; font-size: 12px; font-weight: 700; color: #475569; }
  .viewer-toolbar button { width: 28px; height: 28px; border-radius: 6px; display: grid; place-items: center; transition: 0.2s; color: #64748b; }
  .viewer-toolbar button:hover { background: #f1f5f9; color: #4f46e5; }

  .viewer-scroll { flex: 1; overflow-y: auto; padding: 48px; display: flex; justify-content: center; }
  .pages-container { display: flex; flex-direction: column; gap: 32px; }
  .page-wrap { background: white; box-shadow: 0 20px 50px rgba(0,0,0,0.3); position: relative; }
  .pdf-canvas { display: block; }
  .overlay-layer { position: absolute; inset: 0; pointer-events: auto; }

  .field-item { position: absolute; border-radius: 4px; cursor: grab; display: flex; align-items: center; justify-content: center; }
  .field-badge { position: absolute; top: -18px; left: 0; background: #fbbf24; color: #000; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; }
  .resize-handle { position: absolute; bottom: -6px; right: -6px; width: 12px; height: 12px; background: #4f46e5; border: 2px solid white; border-radius: 50%; cursor: nwse-resize; }

  .viewer-empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: rgba(255,255,255,0.2); text-align: center; }
  .viewer-empty svg { font-size: 64px; margin-bottom: 20px; }
  .viewer-empty h3 { color: white; margin: 0; font-size: 20px; font-weight: 800; }
  .viewer-empty p { margin-top: 8px; font-size: 14px; }

  .studio-loading { height: 100vh; display: grid; place-items: center; background: #0f172a; color: white; font-weight: 800; }

  @media (max-width: 1024px) {
    .studio-workspace { grid-template-columns: 280px 1fr; }
  }

  @media (max-width: 768px) {
    .studio-workspace {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr auto;
    }
    .studio-sidebar {
      border-right: none;
      border-top: 1px solid #e2e8f0;
      max-height: 38vh;
      padding: 16px;
      gap: 18px;
      box-shadow: 0 -8px 24px rgba(0,0,0,0.08);
      order: 2;
    }
    .studio-viewer { order: 1; }
    .viewer-scroll { padding: 16px; }

    .header-actions { flex-wrap: wrap; gap: 8px; }
    .header-actions .action-btn { flex: 1; justify-content: center; min-height: 42px; }

    .tool-grid { grid-template-columns: repeat(4, 1fr); }
    .tool-item { padding: 10px 4px; min-height: 56px; }
    .tool-item span { font-size: 9px; }

    .viewer-toolbar { padding: 0 12px; height: 44px; }
    .page-nav, .zoom-controls { gap: 10px; font-size: 11px; }
    .viewer-toolbar button { width: 32px; height: 32px; }

    .draw-pane canvas { height: 140px; }
    .sig-preview { height: 80px; font-size: 20px; }
  }

  @media (max-width: 480px) {
    .tool-grid { grid-template-columns: repeat(3, 1fr); }
    .pages-container { gap: 18px; }
    .page-wrap { max-width: 100%; }
    .page-wrap canvas { max-width: 100% !important; height: auto !important; }
  }
`;
