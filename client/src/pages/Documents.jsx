// src/components/PdfEditor.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

/** -------------------------------------------------------------
 *  From-scratch PDF Editor (React, pdf.js + pdf-lib)
 *  - Load PDF (file/dnd/demo)
 *  - Render pages with pdf.js (ESM worker; no CORS/fake-worker issues)
 *  - Tools: Text, Signature, Date, Checkbox, Highlight, Rectangle
 *  - Drag / Resize elements
 *  - Draw / Type / Upload signature
 *  - Export signed/annotated PDF via pdf-lib
 * --------------------------------------------------------------*/

export default function PdfEditor() {
  /* ---------- lazy libs & worker ---------- */
  const pdfjsRef = useRef(null);
  const pdfLibRef = useRef(null);
  const workerRef = useRef(null);

  /* ---------- editor state ---------- */
  const [scale, setScale] = useState(1.1);
  const [activeTool, setActiveTool] = useState("select"); // select|text|signature|date|checkbox|highlight|rect
  const [color, setColor] = useState("#111111");
  const [activeTab, setActiveTab] = useState("draw"); // draw|type|upload

  const stateRef = useRef({
    pdfBytes: null,
    pdfDoc: null,              // pdf.js document proxy
    currentPage: 1,
    pagesMeta: [],
    placed: new Map(),         // Map(pageNumber -> Array<Field>)
    sigDataUrl: null,          // current signature image
  });

  /* ---------- refs to DOM ---------- */
  const pagesRef = useRef(null);
  const rightRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const typedPreviewRef = useRef(null);

  /* ---------- typed signature UI ---------- */
  const [typedName, setTypedName] = useState("");
  const [sigKind, setSigKind] = useState("full"); // full|initials
  const [fontFamily, setFontFamily] = useState("'Brush Script MT', 'Lucida Handwriting', cursive");
  const [fontSize, setFontSize] = useState(48);
  const [typedColor, setTypedColor] = useState("#111111");

  /* ---------- helpers ---------- */
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const initialsOf = (n) =>
    n.trim().split(/\s+/).filter(Boolean).map(s => s[0]?.toUpperCase() || "").join("");
  const hexToRgb01 = (hex) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 };
  };
  
  const dataURLToUint8Array = (u) => {
    const b64 = (u.split(",")[1] || "");
    const bin = atob(b64);
    const len = bin.length;
    const a = new Uint8Array(len);
    for (let i = 0; i < len; i++) a[i] = bin.charCodeAt(i);
    return a;
  };
  const bytesToDataURL = (mime, bytes) =>
    new Promise((res) => {
      const blob = new Blob([bytes], { type: mime });
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.readAsDataURL(blob);
    });

  /* ---------- load libs & wire worker ---------- */
  useEffect(() => {
    let restoreWarn = null;

    (async () => {
      const pdfjs = await import("pdfjs-dist");
      const PDFLib = await import("pdf-lib");

      // Use same-origin ES module worker (no fake-worker or CDN)
      try {
        const w = new Worker(
          new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
          { type: "module" }
        );
        pdfjs.GlobalWorkerOptions.workerPort = w;
        workerRef.current = w;
      } catch {
        // Fallback: set workerSrc (still same-origin)
        try {
          pdfjs.GlobalWorkerOptions.workerSrc =
            new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        } catch {}
      }

      // Quiet noisy font warnings
      try {
        if (pdfjs?.VerbosityLevel) {
          pdfjs.setVerbosityLevel?.(pdfjs.VerbosityLevel.ERRORS);
          pdfjs.GlobalWorkerOptions.verbosity = pdfjs.VerbosityLevel.ERRORS;
        }
      } catch {}
      const __origWarn = console.warn;
      console.warn = (...args) => {
        const first = (args[0] ?? "").toString();
        if (/TT:\s*undefined function:/i.test(first)) return;
        __origWarn(...args);
      };
      restoreWarn = () => (console.warn = __origWarn);

      pdfjsRef.current = pdfjs;
      pdfLibRef.current = PDFLib;
    })();

    return () => {
      try { workerRef.current?.terminate(); } catch {}
      if (restoreWarn) restoreWarn();
    };
  }, []);

  

  /* ---------- draw pad ---------- */
  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    let ctx = canvas.getContext("2d");
    let drawing = false;
    let lastPt = null;

    const size = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(300, r.width);
      canvas.height = Math.max(160, r.height);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    };
    size();
    const onResize = () => size();
    window.addEventListener("resize", onResize);

    const getPt = (e) => {
      const b = canvas.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    const drawLine = (a, b) => {
      ctx.strokeStyle = typedColor; // reuse typedColor for draw color selector below this section
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };

    const down = (e) => { drawing = true; lastPt = getPt(e); };
    const move = (e) => { if (!drawing) return; const p = getPt(e); drawLine(lastPt, p); lastPt = p; e.preventDefault(); };
    const up = () => { drawing = false; lastPt = null; };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", up);

    return () => {
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", up);
    };
  }, [typedColor]);

  const clearDraw = () => {
    const c = drawCanvasRef.current; if (!c) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
  };
  const saveDrawSig = () => {
    const c = drawCanvasRef.current; if (!c) return;
    stateRef.current.sigDataUrl = c.toDataURL("image/png");
    renderCurrentSig();
  };

  /* ---------- typed sig ---------- */
  const refreshTypedPreview = useCallback(() => {
    const el = typedPreviewRef.current; if (!el) return;
    const text = sigKind === "initials" ? initialsOf(typedName) : (typedName || "Your Signature");
    el.style.fontFamily = fontFamily;
    el.style.fontSize = fontSize + "px";
    el.style.color = typedColor;
    el.textContent = text;
  }, [typedName, sigKind, fontFamily, fontSize, typedColor]);

  useEffect(() => { refreshTypedPreview(); }, [refreshTypedPreview]);

  const saveTypedSig = () => {
    const el = typedPreviewRef.current; if (!el) return;
    const text = el.textContent || "";
    const c = document.createElement("canvas");
    const tmp = document.createElement("canvas");
    const mCtx = tmp.getContext("2d");
    mCtx.font = `${fontSize}px ${fontFamily}`;
    const m = mCtx.measureText(text);
    const w = Math.max(10, Math.ceil(m.width + 24));
    const h = Math.ceil(fontSize + 24);
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = typedColor;
    ctx.textBaseline = "middle";
    const y = h / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    ctx.fillText(text, 12, y);
    stateRef.current.sigDataUrl = c.toDataURL("image/png");
    renderCurrentSig();
  };

  /* ---------- upload sig ---------- */
  const onPickSig = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const u = await new Promise((res, rej) => {
      const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f);
    });
    stateRef.current.sigDataUrl = u;
    renderCurrentSig();
  };

  const renderCurrentSig = () => {
    const v = document.getElementById("sigViewport");
    if (!v) return;
    v.innerHTML = "";
    const u = stateRef.current.sigDataUrl;
    if (!u) { v.innerHTML = '<span class="muted">No signature yet</span>'; return; }
    const img = new Image();
    img.src = u; img.style.maxHeight = "160px"; img.style.maxWidth = "100%";
    v.appendChild(img);
  };

  /* ---------- pdf.js rendering ---------- */
  const updateZoomLabel = () => {
    const el = document.getElementById("zoomPct"); if (el) el.textContent = Math.round(scale * 100) + "%";
  };
  useEffect(updateZoomLabel, [scale]);

  const renderAllPages = useCallback(async () => {
    const pdfjs = pdfjsRef.current; if (!pdfjs) return;
    const st = stateRef.current;
    const pagesDiv = pagesRef.current; if (!pagesDiv || !st.pdfDoc) return;

    pagesDiv.innerHTML = "";
    for (let i = 1; i <= st.pdfDoc.numPages; i++) {
      const page = await st.pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale });
      const c = document.createElement("canvas"); c.className = "pdf";
      const ctx = c.getContext("2d"); c.width = viewport.width; c.height = viewport.height;
      const pageWrap = document.createElement("div"); pageWrap.className = "pageWrap";
      pageWrap.style.width = viewport.width + "px"; pageWrap.style.height = viewport.height + "px";
      const overlay = document.createElement("div"); overlay.className = "overlay"; overlay.dataset.pageIndex = String(i);
      pageWrap.appendChild(c); pageWrap.appendChild(overlay); pagesDiv.appendChild(pageWrap);
      await page.render({ canvasContext: ctx, viewport }).promise;

      st.pagesMeta[i] = { width: viewport.width, height: viewport.height };

      // Reattach items for that page
      (st.placed.get(i) || []).forEach((f) => attachItemEl(overlay, f));
    }

    const n = document.getElementById("pageNum");
    if (n) n.textContent = String(st.currentPage);
  }, [scale]);

  const loadPdfFromBytes = useCallback(async (bytes) => {
    const pdfjs = pdfjsRef.current; if (!pdfjs) return;
    const st = stateRef.current;
    const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    st.pdfBytes = src.slice();              // for pdf-lib
    const viewerBytes = src.slice();        // for pdf.js
    st.pdfDoc = await pdfjs.getDocument({ data: viewerBytes }).promise;
    st.currentPage = 1;
    st.pagesMeta = [];
    st.placed.clear();
    const count = document.getElementById("pageCount");
    if (count) count.textContent = String(st.pdfDoc.numPages);
    await renderAllPages();
  }, [renderAllPages]);

  /* ---------- placing + elements ---------- */
  const chipIconSvg = () =>
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>`;
  const itemLabel = (t) =>
    ({ signature: "Signature", text: "Text", date: "Date", checkbox: "Checkbox", highlight: "Highlight", rect: "Rectangle" }[t] || t);

  function attachItemEl(overlayEl, f) {
    const W = overlayEl.clientWidth, H = overlayEl.clientHeight;
    const el = document.createElement("div"); el.className = "item-el";
    el.style.left = f.xp * W + "px"; el.style.top = f.yp * H + "px";
    el.style.width = f.wp * W + "px"; el.style.height = f.hp * H + "px";
    el.dataset.id = f.id;

    // visual styles for types
    if (f.type === "highlight") {
      el.style.background = "rgba(253, 224, 71, 0.35)";
      el.style.border = "1px dashed rgba(234, 179, 8, .8)";
    } else if (f.type === "rect") {
      el.style.border = "2px solid rgba(59, 130, 246, .8)";
      el.style.background = "transparent";
    } else {
      el.style.border = "1px dashed rgba(59,130,246,.65)";
      el.style.background = "transparent";
    }

    const chip = document.createElement("div"); chip.className = "item-chip";
    chip.innerHTML = chipIconSvg() + `<span>${itemLabel(f.type)}</span>`;
    el.appendChild(chip);

    const h = document.createElement("div"); h.className = "handle"; el.appendChild(h);
    overlayEl.appendChild(el);

    // Type-specific interactions
    if (f.type === "checkbox") {
      el.addEventListener("click", (e) => {
        if (e.target === h) return;
        f.checked = !f.checked;
        chip.style.background = f.checked ? "#fde047" : "#fde68a";
      });
    }
    if (f.type === "text") {
      el.addEventListener("dblclick", () => {
        const v = window.prompt("Enter text value:", f.value || "");
        if (v !== null) f.value = v;
      });
    }

    // Dragging
    let dragging = false, startX = 0, startY = 0, startL = 0, startT = 0;
    el.addEventListener("pointerdown", (e) => {
      if (e.target === h) return;
      dragging = true; el.classList.add("grabbing"); el.setPointerCapture(e.pointerId);
      startX = e.clientX; startY = e.clientY; startL = el.offsetLeft; startT = el.offsetTop;
    });
    el.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      const nx = clamp(startL + dx, 0, overlayEl.clientWidth - el.offsetWidth);
      const ny = clamp(startT + dy, 0, overlayEl.clientHeight - el.offsetHeight);
      el.style.left = nx + "px"; el.style.top = ny + "px";
    });
    el.addEventListener("pointerup", () => {
      if (!dragging) return;
      dragging = false; el.classList.remove("grabbing");
      const id = el.dataset.id;
      const arr = stateRef.current.placed.get(f.pageIndex) || [];
      const s = arr.find((x) => x.id === id);
      if (s) { s.xp = el.offsetLeft / overlayEl.clientWidth; s.yp = el.offsetTop / overlayEl.clientHeight; }
    });

    // Resizing
    let resizing = false, startW = 0, startH = 0, startRX = 0, startRY = 0;
    h.addEventListener("pointerdown", (e) => {
      e.stopPropagation(); resizing = true; el.setPointerCapture(e.pointerId);
      startRX = e.clientX; startRY = e.clientY; startW = el.offsetWidth; startH = el.offsetHeight;
    });
    el.addEventListener("pointermove", (e) => {
      if (!resizing) return;
      const dx = e.clientX - startRX, dy = e.clientY - startRY;
      let nw = startW + dx, nh = startH + dy;
      nw = clamp(nw, f.type === "checkbox" ? 18 : 30, overlayEl.clientWidth - el.offsetLeft);
      nh = clamp(nh, f.type === "checkbox" ? 18 : 24, overlayEl.clientHeight - el.offsetTop);
      el.style.width = nw + "px"; el.style.height = nh + "px";
    });
    el.addEventListener("pointerup", () => {
      if (!resizing) return;
      resizing = false;
      const id = el.dataset.id;
      const arr = stateRef.current.placed.get(f.pageIndex) || [];
      const s = arr.find((x) => x.id === id);
      if (s) { s.wp = el.offsetWidth / overlayEl.clientWidth; s.hp = el.offsetHeight / overlayEl.clientHeight; }
    });

    // Alt + double click to remove
    el.addEventListener("dblclick", (e) => {
      if (e.altKey) {
        const arr = stateRef.current.placed.get(f.pageIndex) || [];
        const idx = arr.findIndex((x) => x.id === f.id);
        if (idx > -1) { arr.splice(idx, 1); stateRef.current.placed.set(f.pageIndex, arr); }
        el.remove();
      }
    });
  }

  const addItem = (type) => {
    const st = stateRef.current;
    if (!st.pdfDoc) { alert("Load a PDF (or click Demo) first."); return; }
    const overlay = pagesRef.current?.querySelectorAll(".overlay")[st.currentPage - 1];
    const meta = st.pagesMeta[st.currentPage];
    const sizes = {
      signature: [Math.min(260, meta.width * 0.42), 80],
      text: [220, 40],
      date: [140, 40],
      checkbox: [26, 26],
      highlight: [220, 30],
      rect: [200, 120],
    };
    const [initW, initH] = sizes[type];
    const x = (meta.width - initW) / 2;
    const y = (meta.height - initH) / 2;
    const field = {
      id: crypto.randomUUID(),
      type,
      pageIndex: st.currentPage,
      xp: x / meta.width, yp: y / meta.height,
      wp: initW / meta.width, hp: initH / meta.height,
      value: type === "text" ? "" : null,
      checked: false,
      color, // current tool color (for rect/highlight)
    };
    const arr = st.placed.get(st.currentPage) || [];
    arr.push(field); st.placed.set(st.currentPage, arr);
    attachItemEl(overlay, field);
  };

  

  /* ---------- toolbar actions ---------- */
  const onPrev = () => {
    const st = stateRef.current;
    if (st.currentPage > 1) { st.currentPage--; document.getElementById("pageNum").textContent = String(st.currentPage); scrollToPage(); }
  };
  const onNext = () => {
    const st = stateRef.current;
    if (st.pdfDoc && st.currentPage < st.pdfDoc.numPages) {
      st.currentPage++; document.getElementById("pageNum").textContent = String(st.currentPage); scrollToPage();
    }
  };
  const scrollToPage = () => {
    const st = stateRef.current;
    const wraps = pagesRef.current?.querySelectorAll(".pageWrap");
    const t = wraps?.[st.currentPage - 1];
    if (t) t.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const onZoomIn = () => setScale((s) => clamp(s * 1.15, 0.5, 3));
  const onZoomOut = () => setScale((s) => clamp(s / 1.15, 0.5, 3));
  const onFitWidth = async () => {
    const st = stateRef.current; if (!st.pdfDoc) return;
    const containerW = rightRef.current?.clientWidth - 24; if (!containerW) return;
    const p = await st.pdfDoc.getPage(1); const vp = p.getViewport({ scale: 1 });
    setScale(clamp(containerW / vp.width, 0.5, 3));
  };

  /* ---------- open/upload/demo/download ---------- */
  const onFileChange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    await loadPdfFromBytes(bytes);
  };
  const onDemo = async () => {
    const { PDFDocument, StandardFonts, rgb } = pdfLibRef.current || {};
    if (!PDFDocument) return;
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const font = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const font2 = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    page.drawText("PDF Editor Demo", { x: 50, y: 740, size: 22, font, color: rgb(0.1, 0.2, 0.6) });
    page.drawText("Add fields & click Download", { x: 50, y: 712, size: 16, font: font2, color: rgb(0, 0, 0) });
    page.drawText("Signature: ____________________", { x: 50, y: 220, size: 14, font: font2 });
    page.drawText("Date: ____________", { x: 50, y: 180, size: 14, font: font2 });
    const bytes = await pdfDoc.save();
    await loadPdfFromBytes(bytes);
  };

  const onDownload = async () => {
    try {
      const { PDFDocument, StandardFonts, rgb } = pdfLibRef.current || {};
      if (!PDFDocument || !stateRef.current.pdfBytes) { alert("Load a PDF first"); return; }
      const pdfDoc = await PDFDocument.load(stateRef.current.pdfBytes);
      const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const toRgb = (hex) => {
        const c = hexToRgb01(hex); return rgb(c.r, c.g, c.b);
      };

      const cnt = pdfDoc.getPageCount();
      for (let i = 1; i <= cnt; i++) {
        const page = pdfDoc.getPage(i - 1);
        const arr = stateRef.current.placed.get(i) || [];
        for (const s of arr) {
          const pageW = page.getWidth(), pageH = page.getHeight();
          const w = s.wp * pageW, h = s.hp * pageH;
          const x = s.xp * pageW, y = (1 - s.yp - s.hp) * pageH;

          if (s.type === "signature") {
            if (!stateRef.current.sigDataUrl) continue;
            const pngBytes = dataURLToUint8Array(stateRef.current.sigDataUrl);
            const pngImg = await pdfDoc.embedPng(pngBytes);
            page.drawImage(pngImg, { x, y, width: w, height: h });
          } else if (s.type === "text") {
            const t = (s.value || "").toString();
            const size = Math.max(9, h * 0.55);
            page.drawText(t, { x: x + 2, y: y + h * 0.2, size, font: helv, color: toRgb(color) });
          } else if (s.type === "date") {
            const t = new Date().toLocaleDateString();
            const size = Math.max(9, h * 0.55);
            page.drawText(t, { x: x + 2, y: y + h * 0.2, size, font: helv, color: rgb(0, 0, 0) });
          } else if (s.type === "checkbox") {
            const side = Math.min(w, h);
            page.drawRectangle({ x, y, width: side, height: side, borderWidth: 1, borderColor: rgb(0, 0, 0) });
            if (s.checked) {
              const size = side * 0.9;
              page.drawText("X", { x: x + side * 0.12, y: y + side * 0.05, size, font: helv, color: rgb(0, 0, 0) });
            }
          } else if (s.type === "highlight") {
            const col = s.color || "#fde047";
            const { r, g, b } = hexToRgb01(col);
            page.drawRectangle({ x, y, width: w, height: h, color: rgb(r, g, b), opacity: 0.35, borderColor: rgb(r, g, b), borderOpacity: 0.35 });
          } else if (s.type === "rect") {
            const col = s.color || "#3b82f6";
            const { r, g, b } = hexToRgb01(col);
            page.drawRectangle({ x, y, width: w, height: h, borderWidth: 2, borderColor: rgb(r, g, b) });
          }
        }
      }

      const signedBytes = await pdfDoc.save();
      const blob = new Blob([signedBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "edited.pdf"; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Failed to generate PDF. See console for details.");
    }
  };

  /* ---------- drag & drop PDFs ---------- */
  useEffect(() => {
    const right = rightRef.current; if (!right) return;
    const prevent = (e) => e.preventDefault();
    const onDropPdf = async (e) => {
      e.preventDefault(); right.classList.remove("dragover");
      const f = e.dataTransfer.files?.[0];
      if (f && f.type === "application/pdf") {
        const bytes = new Uint8Array(await f.arrayBuffer());
        await loadPdfFromBytes(bytes);
      }
    };
    const onEnter = (e) => { e.preventDefault(); right.classList.add("dragover"); };
    const onLeave = () => right.classList.remove("dragover");
    right.addEventListener("dragover", prevent);
    right.addEventListener("drop", onDropPdf);
    right.addEventListener("dragenter", onEnter);
    right.addEventListener("dragleave", onLeave);
    return () => {
      right.removeEventListener("dragover", prevent);
      right.removeEventListener("drop", onDropPdf);
      right.removeEventListener("dragenter", onEnter);
      right.removeEventListener("dragleave", onLeave);
    };
  }, [loadPdfFromBytes]);

  /* ---------- when tool buttons are clicked ---------- */
  useEffect(() => {
    // Clicking a tool puts the editor into "add an element" mode for a single add
    if (!["text", "signature", "date", "checkbox", "highlight", "rect"].includes(activeTool)) return;
    addItem(activeTool);
    // After adding, revert to select so repeated clicks don't spam
    setActiveTool("select");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool]);

  /* ---------- UI ---------- */
  return (
    <section className="pdf-editor">
      <style>{CSS}</style>

      {/* Header */}
      <header className="pe-header">
        <div className="logo"><div className="logo-mark" />PDF Editor <span className="muted">· From Scratch</span></div>
        <div className="grow" />
        <label className="btn small" htmlFor="pdfFile">
          <UploadIcon /> Upload PDF
        </label>
        <input id="pdfFile" type="file" accept="application/pdf" className="hidden" onChange={onFileChange} />
        <button className="btn small" onClick={onDemo}><GridIcon /> Demo</button>
        <button className="btn primary small" onClick={onDownload}><DownloadIcon /> Download</button>
      </header>

      <div className="pe-wrap">
        {/* Left: tools & signature */}
        <aside className="panel left">
          <div className="section">
            <h3>Tools</h3>
            <div className="tool-row">
              <button className="pbtn" onClick={() => setActiveTool("text")}>Text</button>
              <button className="pbtn" onClick={() => setActiveTool("signature")}>Signature</button>
              <button className="pbtn" onClick={() => setActiveTool("date")}>Date</button>
              <button className="pbtn" onClick={() => setActiveTool("checkbox")}>Checkbox</button>
              <button className="pbtn" onClick={() => setActiveTool("highlight")}>Highlight</button>
              <button className="pbtn" onClick={() => setActiveTool("rect")}>Rectangle</button>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <label className="k">Color <input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
            </div>
            <div className="hint">Click a tool to add one item to the current page. Drag to move · resize with the corner · Alt+double-click to delete.</div>
          </div>

          <div className="section">
            <h3>Signature</h3>
            <div className="tabs">
              <button className={`tab ${activeTab === "draw" ? "active" : ""}`} onClick={() => setActiveTab("draw")}>Draw</button>
              <button className={`tab ${activeTab === "type" ? "active" : ""}`} onClick={() => setActiveTab("type")}>Type</button>
              <button className={`tab ${activeTab === "upload" ? "active" : ""}`} onClick={() => setActiveTab("upload")}>Upload</button>
            </div>

            {activeTab === "draw" && (
              <div>
                <div className="draw-wrap"><canvas ref={drawCanvasRef} className="checker" style={{ width: "100%", height: 200 }} /></div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn small bad" onClick={clearDraw}>Clear</button>
                  <button className="btn small good" onClick={saveDrawSig}>Save as Current</button>
                </div>
              </div>
            )}

            {activeTab === "type" && (
              <div>
                <div className="typedControls">
                  <input type="text" placeholder="Enter full name" value={typedName} onChange={(e) => setTypedName(e.target.value)} />
                  <div className="radio">
                    <label><input type="radio" name="sigKind" value="full" checked={sigKind === "full"} onChange={() => setSigKind("full")} /> Full</label>
                    <label><input type="radio" name="sigKind" value="initials" checked={sigKind === "initials"} onChange={() => setSigKind("initials")} /> Initials</label>
                  </div>
                  <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
                    <option value="'Brush Script MT', 'Lucida Handwriting', cursive">Brush Script / Cursive</option>
                    <option value="'Apple Chancery', 'URW Chancery L', cursive">Chancery</option>
                    <option value="'Segoe Script', 'Comic Sans MS', cursive">Script (Segoe)</option>
                    <option value="'Times New Roman', serif">Serif</option>
                  </select>
                  <label className="k">Size <input type="range" min={24} max={96} value={fontSize} onChange={(e) => setFontSize(+e.target.value)} /></label>
                  <label className="k">Color <input type="color" value={typedColor} onChange={(e) => setTypedColor(e.target.value)} /></label>
                </div>
                <div ref={typedPreviewRef} className="typedPreview checker">Your Signature</div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn small good" onClick={saveTypedSig}>Save as Current</button>
                </div>
              </div>
            )}

            {activeTab === "upload" && (
              <div>
                <label className="dropzone">
                  <div className="big">Pick a signature image (PNG w/ transparent bg)</div>
                  <input type="file" className="hidden" accept="image/*" onChange={onPickSig} />
                </label>
              </div>
            )}
          </div>

          <div className="section sigPreview">
            <h3>Current Signature</h3>
            <div className="viewport" id="sigViewport"><span className="muted">Create or load a signature ↑</span></div>
          </div>
        </aside>

        {/* Right: viewer */}
        <main className="panel right" ref={rightRef}>
          <div className="viewer">
            <div className="toolbar">
              <div className="row">
                <button className="btn small" onClick={onPrev}>◀ Prev</button>
                <div className="k">Page <span id="pageNum">-</span> / <span id="pageCount">-</span></div>
                <button className="btn small" onClick={onNext}>Next ▶</button>
              </div>
              <div className="grow" />
              <div className="row">
                <button className="btn small" onClick={onZoomOut}>−</button>
                <div className="k">Zoom <span id="zoomPct">100%</span></div>
                <button className="btn small" onClick={onZoomIn}>+</button>
                <button className="btn small" onClick={onFitWidth}>Fit Width</button>
              </div>
            </div>
            <div ref={pagesRef} className="pages" />
          </div>

          {/* Drag target instructions */}
          <div className="hint" style={{ marginTop: 8 }}>
            Tip: Drag & drop a PDF anywhere on this panel to open it.
          </div>
        </main>
      </div>
    </section>
  );
}

// inside Documents.jsx where you import the libs
let pdfjsLib, PDFLib;
try {
  pdfjsLib = await import("pdfjs-dist");
} catch (e) {
  console.error("Missing dependency: pdfjs-dist. Run `npm i pdfjs-dist` in /client");
  throw e;
}
try {
  PDFLib = await import("pdf-lib");
} catch (e) {
  console.error("Missing dependency: pdf-lib. Run `npm i pdf-lib` in /client");
  throw e;
}

/* ---------- lil icons ---------- */
function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 5 17 10" />
      <line x1="12" y1="5" x2="12" y2="21" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
      <path d="M19 21H5a2 2 0 0 1-2-2v-4" />
    </svg>
  );
}

/* ---------- styles ---------- */
const CSS = `
:root{--bg:#0e1320;--panel:#141a2a;--soft:#1b2440;--accent:#3b82f6;--muted:#a9b3c9;--text:#e8ecf3;--good:#22c55e;--warn:#f59e0b;--bad:#ef4444;--radius:14px;--shadow:0 10px 30px rgba(0,0,0,.35)}
*{box-sizing:border-box}
.pdf-editor{color:var(--text);font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,"Helvetica Neue",Arial,"Noto Sans",sans-serif}
.hidden{display:none !important}
.muted{color:var(--muted)} .grow{flex:1}
.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;border:1px solid #253055;background:#121a33;color:var(--text);cursor:pointer;user-select:none;transition:transform .06s ease,background .2s}
.btn:hover{transform:translateY(-1px);background:#182346}
.btn.primary{background:var(--accent);border-color:#2563eb;color:#fff}
.btn.primary:hover{background:#2563eb}
.btn.small{padding:8px 10px;border-radius:8px;font-size:.9rem}

.pe-header{height:64px;display:flex;align-items:center;gap:12px;padding:0 16px;border-bottom:1px solid #1f2a44;background:rgba(10,14,28,.8);backdrop-filter:blur(8px);position:sticky;top:0;z-index:5}
.logo{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.3px}
.logo-mark{width:18px;height:18px;border-radius:5px;background:conic-gradient(from 180deg at 50% 50%,#3b82f6,#22c55e,#06b6d4,#a855f7,#3b82f6)}

.pe-wrap{display:grid;grid-template-columns:360px 1fr;gap:14px;padding:14px}
@media (max-width:1000px){.pe-wrap{grid-template-columns:1fr}}
.panel{background:var(--panel);border:1px solid #202b4b;border-radius:var(--radius);box-shadow:var(--shadow)}
.left{padding:14px}
.right{padding:12px;min-height:calc(100vh - 64px - 28px)}
.right.dragover{ outline:2px dashed #3b82f6; outline-offset:6px; }

.section{padding:12px;border-radius:12px;background:linear-gradient(180deg,#151d36,#131a31);border:1px solid #22305a;margin-bottom:12px}
.section h3{margin:0 0 10px 0;font-size:1rem;letter-spacing:.3px;color:#dfe7fb}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}

.tool-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.pbtn{display:flex;align-items:center;justify-content:center;padding:10px;border-radius:10px;border:1px solid #22305a;background:#0f1730;color:#e8ecf3;cursor:pointer}
.pbtn:hover{background:#162352}
.k{background:#0f1730;border:1px solid #22305a;border-radius:8px;padding:4px 8px}
.hint{color:#9fb4df;font-size:.92rem;margin-top:8px}

.tabs{display:flex;gap:8px;margin-bottom:8px}
.tab{padding:6px 10px;border-radius:8px;border:1px solid #22305a;background:#0f1730;color:#cfe4ff;cursor:pointer}
.tab.active{background:#162352}
.draw-wrap{background:#0d142e;border:1px solid #22305a;border-radius:12px;padding:10px}
.checker{
  background:
    linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%),
    linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%);
  background-size:16px 16px; background-position:0 0,8px 8px; border-radius:10px;
}
.typedControls{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
.typedControls input[type="text"]{padding:10px 12px;border-radius:10px;border:1px solid #334166;background:#0f1730;color:#cfe4ff;outline:none}
.radio{display:flex;gap:8px;align-items:center}
select{padding:10px 12px;border-radius:10px;border:1px solid #334166;background:#0f1730;color:#cfe4ff}
.typedPreview{border-radius:10px;padding:10px 12px;min-height:80px;display:flex;align-items:center;justify-content:center;font-size:40px;user-select:none;border:1px dashed #cbd5e1;color:#000}

.sigPreview .viewport{background:#fff;border-radius:10px;min-height:90px;display:flex;align-items:center;justify-content:center}

.viewer{position:relative;display:flex;flex-direction:column;gap:12px}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
.pages{display:flex;flex-direction:column;gap:16px}
.pageWrap{position:relative;display:inline-block;background:#0b1026;border:1px solid #22305a;border-radius:10px;overflow:hidden}
canvas.pdf{display:block;background:#fff}
.overlay{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:auto;touch-action:none}

/* placed items */
.item-el{position:absolute;border:1px dashed rgba(59,130,246,.65);border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:grab;background:transparent;pointer-events:auto}
.item-el.grabbing{cursor:grabbing}
.item-chip{position:absolute;left:6px;top:6px;background:#fde68a;color:#1f2937;border:1px solid #f59e0b;border-radius:6px;padding:2px 6px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:6px;box-shadow:0 2px 6px rgba(0,0,0,.2)}
.item-chip svg{display:block}
.handle{position:absolute;width:14px;height:14px;border-radius:4px;background:#3b82f6;border:1px solid #1d4ed8;right:-8px;bottom:-8px;cursor:nwse-resize}
`;