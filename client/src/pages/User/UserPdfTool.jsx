// src/pages/User/UserPdfTool.jsx
// Envelope-aware PDF signer. Loads an envelope + its template, renders the
// admin-placed fields (using normalized coordinates from AdminPdfEditor),
// lets the recipient fill them in, then flattens the signed PDF and POSTs
// it back to /api/envelopes/:id/submit so the admin sees a "completed" envelope.
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import {
  FaFilePdf, FaPenNib, FaCheckCircle, FaTimes, FaArrowLeft,
  FaPen, FaCalendarAlt, FaFont, FaIdCard, FaPhone, FaHashtag,
  FaMapMarkerAlt, FaRegDotCircle, FaEraser, FaExclamationTriangle,
  FaShieldAlt, FaClock
} from "react-icons/fa";

// Configure PDF.js worker
const PDFJS_VERSION = pdfjsLib.version || "5.4.54";
const PDFJS_MAJOR = parseInt(String(PDFJS_VERSION).split(".")[0], 10) || 5;
const WORKER_EXT = PDFJS_MAJOR >= 4 ? "mjs" : "js";
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.${WORKER_EXT}`;

const RENDER_SCALE = 1.5;

const FIELD_TYPE_META = {
  signature:    { icon: FaPen,           label: "Signature",  color: "#6366f1", input: "signature" },
  initials:     { icon: FaPenNib,        label: "Initials",   color: "#8b5cf6", input: "initials" },
  date:         { icon: FaCalendarAlt,   label: "Date",       color: "#0ea5e9", input: "date" },
  text:         { icon: FaFont,          label: "Text",       color: "#10b981", input: "text" },
  name:         { icon: FaIdCard,        label: "Full Name",  color: "#f59e0b", input: "text" },
  phone:        { icon: FaPhone,         label: "Phone",      color: "#14b8a6", input: "text" },
  age:          { icon: FaHashtag,       label: "Age",        color: "#f97316", input: "text" },
  numberSelect: { icon: FaHashtag,       label: "Number",     color: "#ec4899", input: "text" },
  state:        { icon: FaMapMarkerAlt,  label: "State",      color: "#84cc16", input: "text" },
  radio:        { icon: FaRegDotCircle,     label: "Radio",      color: "#a855f7", input: "radio" },
  checkbox:     { icon: FaCheckCircle,   label: "Check",      color: "#10b981", input: "checkbox" },
  multiselect:  { icon: FaCheckCircle,   label: "Multi",      color: "#6366f1", input: "checkbox" }
};
const fieldMeta = (t) => FIELD_TYPE_META[t] || { icon: FaFont, label: t || "Field", color: "#64748b", input: "text" };

const b64ToUint8 = (b64) => {
  let s = String(b64 || "");
  const comma = s.indexOf(",");
  if (s.startsWith("data:") && comma >= 0) s = s.slice(comma + 1);
  s = s.replace(/\s+/g, "");
  const bin = window.atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const uint8ToB64 = (u8) => {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return window.btoa(bin);
};

export default function UserPdfTool() {
  const { api, user, setToast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const envelopeId = search.get("envelopeId");

  const [envelope, setEnvelope] = useState(null);
  const [template, setTemplate] = useState(null);
  const [pdfBytes, setPdfBytes] = useState(null);
  const [pagesMeta, setPagesMeta] = useState([]);
  const [fields, setFields] = useState([]);
  const [values, setValues] = useState({});      // { fieldId: string | dataURL | true }
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Signature adoption modal
  const [showSigModal, setShowSigModal] = useState(false);
  const [sigTab, setSigTab] = useState("type");
  const [sigName, setSigName] = useState("");
  const [signature, setSignature] = useState(null);    // { dataUrl, name }
  const [activeFieldId, setActiveFieldId] = useState(null); // which field we are filling
  const [me, setMe] = useState(null); // current recipient identity
  const drawCanvasRef = useRef(null);
  const drawingRef = useRef(false);

  // PDF rendering refs
  const pdfDocRef = useRef(null);
  const canvasRefs = useRef({});

  /* -------------------------- Load envelope + template -------------------------- */
  useEffect(() => {
    let cancelled = false;
    if (!envelopeId) {
      setError("Missing envelope ID");
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const env = await api.get("envelopes", envelopeId);
        if (!env) throw new Error("Envelope not found");
        if (cancelled) return;
        setEnvelope(env);

        // Identify current recipient
        const myRecip = (env.recipients || []).find(r =>
          String(r.userId) === String(user?.id) ||
          String(r.studentId) === String(user?.studentId) ||
          (String(r.role).toLowerCase() === 'admin' && user?.role?.toLowerCase() === 'admin')
        );
        if (myRecip && !cancelled) setMe(myRecip);

        // Mark recipient as "viewed" the first time we open it
        try {
          if (myRecip && String(myRecip.status || "").toLowerCase() === "pending") {
            await fetch(`/api/envelopes/${envelopeId}/recipient/${myRecip.id}/status`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ status: "viewed" })
            });
          }
        } catch (e) { /* non-fatal */ }

        if (!env.templateId) throw new Error("This envelope has no PDF template attached.");
        const tpl = await api.get("pdfTemplates", env.templateId);
        if (!tpl) throw new Error("Template not found");
        if (cancelled) return;
        setTemplate(tpl);
        setFields(Array.isArray(tpl.fields) ? tpl.fields : []);

        // Priority 1: Partially signed PDF from the envelope
        // Priority 2: Original template PDF
        let bytes = null;
        if (env.lastPdfUrl) {
          try {
            const res = await fetch(env.lastPdfUrl, { credentials: "include" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            bytes = new Uint8Array(await res.arrayBuffer());
          } catch (err) {
            console.warn("[UserPdfTool] Failed to fetch lastPdfUrl, falling back to template:", err);
          }
        }

        if (!bytes) {
          if (!tpl.pdfBase64) throw new Error("Template is missing its PDF source file.");
          bytes = b64ToUint8(tpl.pdfBase64);
        }

        if (!cancelled && bytes) setPdfBytes(bytes);
      } catch (e) {
        console.error("[UserPdfTool] load failed", e);
        if (!cancelled) setError(e?.message || "Failed to load document");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [envelopeId, api, user?.id, user?.studentId]);

  /* -------------------------- Render PDF pages -------------------------- */
  useEffect(() => {
    if (!pdfBytes) return;
    let cancelled = false;
    (async () => {
      try {
        // pdfjs mutates the buffer; pass a copy
        const data = pdfBytes.slice(0);
        const doc = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        const metas = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const vp1 = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: RENDER_SCALE });
          metas.push({ num: i, width: vp.width, height: vp.height, baseW: vp1.width, baseH: vp1.height });
        }
        if (!cancelled) setPagesMeta(metas);
      } catch (e) {
        console.error("[UserPdfTool] pdfjs load error", e);
        setError("Failed to render PDF preview");
      }
    })();
    return () => { cancelled = true; };
  }, [pdfBytes]);

  // Paint the canvases when pagesMeta changes
  useEffect(() => {
    if (!pdfDocRef.current || !pagesMeta.length) return;
    let cancelled = false;
    pagesMeta.forEach(async (meta) => {
      const canvas = canvasRefs.current[meta.num];
      if (!canvas) return;
      try {
        const page = await pdfDocRef.current.getPage(meta.num);
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = viewport.width + "px";
        canvas.style.height = viewport.height + "px";
        const ctx = canvas.getContext("2d", { alpha: false });
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (cancelled) return;
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (e) {
        if (e?.name !== "RenderingCancelledException") {
          console.warn("[UserPdfTool] page render error", meta.num, e);
        }
      }
    });
    return () => { cancelled = true; };
  }, [pagesMeta]);

  /* -------------------------- Signature canvas drawing -------------------------- */
  useEffect(() => {
    if (!showSigModal || sigTab !== "draw") return;
    const c = drawCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const pos = (e) => {
      const r = c.getBoundingClientRect();
      const t = e.touches?.[0] || e;
      return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) };
    };
    const down = (e) => { e.preventDefault(); drawingRef.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e) => { if (!drawingRef.current) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const up = () => { drawingRef.current = false; };
    c.addEventListener("mousedown", down);
    c.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    c.addEventListener("touchstart", down, { passive: false });
    c.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);
    return () => {
      c.removeEventListener("mousedown", down);
      c.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      c.removeEventListener("touchstart", down);
      c.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, [showSigModal, sigTab]);

  const clearDrawing = () => {
    const c = drawCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
  };

  const adoptSignature = () => {
    let dataUrl = null;
    let name = sigName.trim();
    if (sigTab === "type") {
      if (!name) { setToast?.({ type: "warn", text: "Please type your name" }); return; }
      // Render typed signature to canvas → dataURL
      const off = document.createElement("canvas");
      off.width = 600; off.height = 180;
      const ctx = off.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, off.width, off.height);
      ctx.fillStyle = "#0f172a";
      ctx.font = "italic 64px 'Dancing Script', 'Brush Script MT', cursive";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(name, off.width / 2, off.height / 2);
      dataUrl = off.toDataURL("image/png");
    } else {
      if (!drawCanvasRef.current) return;
      dataUrl = drawCanvasRef.current.toDataURL("image/png");
    }
    const sig = { dataUrl, name: name || (user?.name || "Signed") };
    setSignature(sig);
    // If a field triggered the modal, fill it now
    if (activeFieldId) {
      setValues(v => ({ ...v, [activeFieldId]: dataUrl }));
      setActiveFieldId(null);
    }
    setShowSigModal(false);
  };

  /* -------------------------- Field interaction -------------------------- */
  const handleFieldClick = (f) => {
    // If not a recipient, you are just viewing - no interaction allowed
    if (!me) return;

    // Only allow clicking if the field role matches current recipient role
    const fieldRole = f.recipientRole || 'student';
    const myRole = me.role || 'student';
    if (fieldRole !== myRole) return;

    const meta = fieldMeta(f.type);
    if (meta.input === "signature" || meta.input === "initials") {
      // Reuse adopted signature if present, otherwise prompt
      if (signature) {
        setValues(v => ({ ...v, [f.id]: signature.dataUrl }));
      } else {
        setActiveFieldId(f.id);
        setShowSigModal(true);
      }
    } else if (meta.input === "checkbox") {
      setValues(v => ({ ...v, [f.id]: !v[f.id] }));
    } else if (meta.input === "radio") {
      // Clear other fields in the same group (if group exists)
      if (f.group) {
        setValues(v => {
          const next = { ...v };
          fields.filter(x => x.group === f.group).forEach(x => {
            next[x.id] = false;
          });
          next[f.id] = true;
          return next;
        });
      } else {
        setValues(v => ({ ...v, [f.id]: true }));
      }
    } else if (meta.input === "date") {
      const today = new Date().toLocaleDateString();
      setValues(v => ({ ...v, [f.id]: today }));
    }
    // text inputs handled inline by their own <input>
  };

  const myRole = (me?.role || 'student').toLowerCase();
  const myFields = useMemo(() => fields.filter(f => (f.recipientRole || 'student').toLowerCase() === myRole), [fields, myRole]);

  const requiredCount = myFields.length;
  const filledCount = useMemo(
    () => myFields.filter(f => values[f.id] !== undefined && values[f.id] !== "" && values[f.id] !== false).length,
    [myFields, values]
  );
  
  const allFilled = useMemo(() => {
    if (myFields.length === 0) return true;
    
    // 1. Check standard individual fields (marked required but NOT part of a required group)
    const individualRequiredDone = myFields
      .filter(f => f.required && !f.groupRequired)
      .every(f => values[f.id] !== undefined && values[f.id] !== "" && values[f.id] !== false);

    // 2. Check group-required fields (at least one in each required group must be filled)
    const requiredGroups = [...new Set(myFields.filter(f => f.groupRequired).map(f => f.group))];
    const groupsDone = requiredGroups.every(groupId => {
      const groupFields = myFields.filter(f => f.group === groupId);
      return groupFields.some(f => values[f.id] !== undefined && values[f.id] !== "" && values[f.id] !== false);
    });

    return individualRequiredDone && groupsDone;
  }, [myFields, values]);

  /* -------------------------- Submit signed PDF -------------------------- */
  const handleSubmit = async () => {
    if (!pdfBytes || !envelope) return;
    if (!allFilled) {
      setToast?.({ type: "warn", text: `Please complete all ${requiredCount} field${requiredCount === 1 ? "" : "s"} first.` });
      return;
    }
    setSubmitting(true);
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes.slice(0));
      const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pages = pdfDoc.getPages();

      // Cache embedded sig images so we don't re-embed for every field
      const sigImageCache = new Map();
      const embedSig = async (dataUrl) => {
        if (sigImageCache.has(dataUrl)) return sigImageCache.get(dataUrl);
        const bytes = b64ToUint8(dataUrl);
        const img = await pdfDoc.embedPng(bytes);
        sigImageCache.set(dataUrl, img);
        return img;
      };

      for (const f of fields) {
        const pageIdx = (f.pageIndex || 1) - 1;
        const page = pages[pageIdx];
        if (!page) continue;
        const { width: pw, height: ph } = page.getSize();
        // Normalized → absolute PDF coords (PDF y is bottom-up)
        const x = (f.nx || 0) * pw;
        const w = (f.nw || 0) * pw;
        const h = (f.nh || 0) * ph;
        const yTop = (f.ny || 0) * ph;
        const y = ph - yTop - h;
        const val = values[f.id];
        const meta = fieldMeta(f.type);

        if ((meta.input === "signature" || meta.input === "initials") && typeof val === "string" && val.startsWith("data:image")) {
          try {
            const img = await embedSig(val);
            // Fit while preserving aspect
            const ratio = Math.min(w / img.width, h / img.height);
            const drawW = img.width * ratio;
            const drawH = img.height * ratio;
            page.drawImage(img, {
              x: x + (w - drawW) / 2,
              y: y + (h - drawH) / 2,
              width: drawW,
              height: drawH
            });
          } catch (e) { console.warn("Embed signature failed", e); }
        } else if ((meta.input === "checkbox" || meta.input === "radio") && val) {
          // Draw an X mark
          page.drawText("X", {
            x: x + w / 2 - 4,
            y: y + h / 2 - 5,
            size: Math.min(w, h) * 0.8,
            font: helvBold,
            color: rgb(0.06, 0.09, 0.16)
          });
        } else if (val) {
          const text = String(val);
          const fontSize = Math.max(8, Math.min(14, h * 0.55));
          page.drawText(text, {
            x: x + 4,
            y: y + (h - fontSize) / 2 + 2,
            size: fontSize,
            font: helv,
            color: rgb(0.06, 0.09, 0.16),
            maxWidth: w - 8
          });
        }
      }

      const finalBytes = await pdfDoc.save();
      const b64 = uint8ToB64(finalBytes);

      // Find recipient identity for this user
      const me = (envelope.recipients || []).find(r =>
        String(r.userId) === String(user?.id) ||
        String(r.studentId) === String(user?.studentId) ||
        (String(r.role).toLowerCase() === 'admin' && user?.role?.toLowerCase() === 'admin')
      );

      // Find ANY studentId in this envelope to use as context for admin signatures
      const envStudentId = (envelope.recipients || []).find(r => r.studentId)?.studentId;

      const res = await fetch(`/api/envelopes/${envelopeId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          recipientId: me?.id,
          studentId: me?.studentId || user?.studentId || envStudentId,
          fileName: `${(envelope.subject || "signed-document").replace(/[^a-z0-9_-]+/gi, "_")}.pdf`,
          pdfBase64: b64
        })
      });

      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.success === false) {
        throw new Error(out?.error || `Submit failed (${res.status})`);
      }

      setToast?.("Document submitted");
      if (user?.role?.toLowerCase() === 'admin' && envelope?.recipients) {
        const studentId = envelope.recipients.find(r => r.studentId)?.studentId;
        if (studentId) return navigate(`/admin/students/${studentId}`);
      }
      navigate("/dashboard");
    } catch (e) {
      console.error("[UserPdfTool] submit failed", e);
      setToast?.({ type: "error", text: e?.message || "Failed to submit document" });
    } finally {
      setSubmitting(false);
    }
  };

  /* -------------------------- Render -------------------------- */
  if (loading) return (
    <div className="upt-loading">
      <style>{PDF_CSS}</style>
      <div className="upt-spinner" />
      <p>Preparing your secure document…</p>
    </div>
  );

  if (error) return (
    <div className="upt-loading">
      <style>{PDF_CSS}</style>
      <FaExclamationTriangle style={{ fontSize: 40, color: "#f59e0b" }} />
      <h3>{error}</h3>
      <button className="pdf-btn secondary" onClick={() => {
        if (user?.role?.toLowerCase() === 'admin') {
          return navigate(-1);
        }
        navigate("/dashboard");
      }}><FaArrowLeft /> Back</button>
    </div>
  );

  const isAdmin = user?.role?.toLowerCase() === 'admin';

  return (
    <section className="pdf-page fade-in">
      <style>{PDF_CSS}</style>

      <header className="pdf-header">
        <div className="pdf-header-left">
          <button className="back-btn" onClick={() => navigate(-1)}><FaArrowLeft /></button>
          <div>
            <h1>{envelope?.subject || "Review & Sign"}</h1>
            <p>{template?.name || "Document"} · {filledCount}/{requiredCount} fields complete</p>
          </div>
        </div>
        <div className="pdf-header-actions">
          <button className="pdf-btn secondary" onClick={() => { setActiveFieldId(null); setShowSigModal(true); }}>
            <FaPenNib /> {signature ? "Change Signature" : "Adopt Signature"}
          </button>
          <button
            className="pdf-btn primary"
            onClick={handleSubmit}
            disabled={submitting || !allFilled}
            title={!allFilled ? `${requiredCount - filledCount} field(s) remaining` : "Submit signed document"}
          >
            <FaCheckCircle /> {submitting ? "Submitting…" : "Finish & Submit"}
          </button>
        </div>
      </header>

      <div className="pdf-workspace">
        <main className="pdf-viewer">
          <div className="pdf-scroller">
            {pagesMeta.map(meta => (
              <div key={meta.num} className="pdf-page-container" style={{ width: meta.width, height: meta.height }}>
                <canvas ref={el => (canvasRefs.current[meta.num] = el)} />
                <div className="pdf-overlay">
                  {fields.filter(f => (f.pageIndex ?? f.page) === meta.num).map(f => {
                    const m = fieldMeta(f.type);
                    const Icon = m.icon;
                    const filled = values[f.id] !== undefined && values[f.id] !== "" && values[f.id] !== false;
                    const left = (f.nx ?? 0) * meta.width;
                    const top = (f.ny ?? 0) * meta.height;
                    const width = (f.nw ?? 0) * meta.width;
                    const height = (f.nh ?? 0) * meta.height;
                    const isImage = (m.input === "signature" || m.input === "initials") && typeof values[f.id] === "string" && values[f.id].startsWith("data:image");

                    const fieldRole = f.recipientRole || 'student';
                    const myRole = me?.role || 'student';
                    // If no 'me', then viewing as admin/other - cannot edit anything
                    const isMine = me && fieldRole === myRole;

                    if (m.input === "text" || m.input === "date") {
                      return (
                        <div
                          key={f.id}
                          className={`pdf-field text ${filled ? "filled" : ""} ${isMine ? "is-mine" : "is-others"}`}
                          style={{ 
                            left, top, width, height, 
                            borderColor: isMine ? m.color : "#cbd5e1", 
                            color: isMine ? m.color : "#94a3b8",
                            background: isMine ? "transparent" : "rgba(241, 245, 249, 0.5)",
                            cursor: isMine ? "text" : "not-allowed"
                          }}
                          onClick={() => isMine && m.input === "date" && handleFieldClick(f)}
                        >
                          <input
                            type="text"
                            placeholder={m.label}
                            value={values[f.id] || ""}
                            onChange={e => isMine && setValues(v => ({ ...v, [f.id]: e.target.value }))}
                            onClick={e => e.stopPropagation()}
                            disabled={!isMine}
                            style={{ 
                              fontSize: Math.max(10, Math.min(16, height * 0.55)),
                              cursor: isMine ? "text" : "not-allowed"
                            }}
                          />
                        </div>
                      );
                    }

                    return (
                      <div
                        key={f.id}
                        className={`pdf-field ${filled ? "filled" : ""} ${isMine ? "is-mine" : "is-others"}`}
                        style={{ 
                          left, top, width, height, 
                          borderColor: isMine ? m.color : "#cbd5e1", 
                          color: isMine ? m.color : "#94a3b8", 
                          background: isMine ? (filled ? "#fff" : `${m.color}1f`) : "rgba(241, 245, 249, 0.5)",
                          cursor: isMine ? "pointer" : "not-allowed"
                        }}
                        onClick={() => isMine && handleFieldClick(f)}
                        title={isMine ? `${m.label} – click to ${m.input === "checkbox" ? "toggle" : "fill"}` : `Reserved for ${fieldRole}`}
                      >
                        {isImage ? (
                          <img src={values[f.id]} alt="signature" className="pdf-sig-img" style={{ opacity: isMine ? 1 : 0.6 }} />
                        ) : m.input === "checkbox" ? (
                          <span className="pdf-check" style={{ color: isMine ? m.color : "#94a3b8" }}>{filled ? "✓" : ""}</span>
                        ) : (
                          <>
                            <span className="pdf-field-badge" style={{ background: isMine ? m.color : "#cbd5e1" }}><Icon /></span>
                            <span className="pdf-field-label">{m.label}</span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </main>

        <aside className="pdf-sidebar">
          <div className="sidebar-head">Your Progress {filledCount}/{requiredCount}</div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${requiredCount ? (filledCount / requiredCount) * 100 : 0}%` }} /></div>

          <div className="field-list">
            {fields.length === 0 && (
              <div className="empty-fields">No fields placed by the sender. You can submit this document as-is.</div>
            )}
            {fields.map(f => {
              const m = fieldMeta(f.type);
              const filled = values[f.id] !== undefined && values[f.id] !== "" && values[f.id] !== false;
              const Icon = m.icon;
              const fieldRole = (f.recipientRole || 'student').toLowerCase();
              const isMine = me && fieldRole === myRole;

              return (
                <div 
                  key={f.id} 
                  className={`field-item ${filled ? "done" : ""} ${isMine ? "is-mine" : "is-others"}`} 
                  onClick={() => isMine && handleFieldClick(f)}
                >
                  <div className="field-icon" style={{ background: isMine ? `${m.color}1f` : "#f1f5f9", color: isMine ? m.color : "#94a3b8" }}><Icon /></div>
                  <div className="details">
                    <div className="label">
                      {m.label}{f.required && isMine && " *"}
                      {!isMine && <span className="other-tag">[{fieldRole}]</span>}
                    </div>
                    <div className="meta">Page {(f.pageIndex ?? f.page) || 1}</div>
                  </div>
                  {filled && <FaCheckCircle className="done-icon" />}
                  {!isMine && <FaShieldAlt className="lock-icon" />}
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {showSigModal && (
        <div className="sig-modal-overlay" onClick={() => setShowSigModal(false)}>
          <div className="sig-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Adopt Your Signature</h3>
              <button className="close-btn" onClick={() => setShowSigModal(false)}><FaTimes /></button>
            </div>
            <div className="modal-body">
              <div className="modal-tabs">
                <button className={sigTab === "type" ? "active" : ""} onClick={() => setSigTab("type")}>Type</button>
                <button className={sigTab === "draw" ? "active" : ""} onClick={() => setSigTab("draw")}>Draw</button>
              </div>
              <div className="sig-canvas-area">
                {sigTab === "type" ? (
                  <div className="type-area">
                    <input value={sigName} onChange={e => setSigName(e.target.value)} placeholder="Type full name…" />
                    <div className="sig-preview" style={{ fontFamily: "'Dancing Script', cursive" }}>{sigName || "Your Signature"}</div>
                  </div>
                ) : (
                  <div className="draw-area">
                    <canvas ref={drawCanvasRef} width={600} height={180} />
                    <button className="pdf-btn ghost small" onClick={clearDrawing}><FaEraser /> Clear</button>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-foot">
              <button className="pdf-btn ghost" onClick={() => setShowSigModal(false)}>Cancel</button>
              <button className="pdf-btn primary" onClick={adoptSignature}>Adopt & Sign</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const PDF_CSS = `
  .pdf-page { height: calc(100vh - 64px); display: flex; flex-direction: column; background: #525659; }
  .pdf-header { background: #fff; border-bottom: 1px solid #e2e8f0; padding: 12px 32px; display: flex; align-items: center; justify-content: space-between; z-index: 10; gap: 16px; flex-wrap: wrap; }
  .pdf-header-left { display: flex; align-items: center; gap: 20px; }
  .back-btn { width: 40px; height: 40px; border-radius: 12px; background: #f1f5f9; color: #64748b; display: grid; place-items: center; border: none; cursor: pointer; }
  .pdf-header-left h1 { font-size: 18px; font-weight: 800; margin: 0; color: #0f172a; }
  .pdf-header-left p { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin: 2px 0 0; }

  .pdf-header-actions { display: flex; gap: 12px; }
  .pdf-btn { height: 40px; padding: 0 20px; border-radius: 10px; font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 8px; transition: 0.2s; border: none; cursor: pointer; }
  .pdf-btn.primary { background: #4f46e5; color: white; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2); }
  .pdf-btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .pdf-btn.secondary { background: #f8fafc; border: 1px solid #e2e8f0; color: #475569; }
  .pdf-btn.ghost { background: transparent; color: #64748b; }
  .pdf-btn.small { height: 32px; padding: 0 12px; font-size: 12px; }

  .pdf-workspace { flex: 1; display: grid; grid-template-columns: 1fr 320px; min-height: 0; }
  .pdf-viewer { overflow-y: auto; padding: 40px; display: flex; justify-content: center; background: #525659; }
  .pdf-scroller { display: flex; flex-direction: column; gap: 32px; }
  .pdf-page-container { background: white; box-shadow: 0 10px 30px rgba(0,0,0,0.3); position: relative; }
  .pdf-page-container canvas { display: block; }
  .pdf-overlay { position: absolute; inset: 0; pointer-events: none; }

  .pdf-field { position: absolute; border: 2px dashed currentColor; border-radius: 4px; pointer-events: auto; cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 0 8px; font-size: 11px; font-weight: 700; transition: 0.15s; box-sizing: border-box; overflow: hidden; }
  .pdf-field:hover { box-shadow: 0 6px 18px rgba(0,0,0,0.25); transform: scale(1.02); z-index: 5; }
  .pdf-field.filled { border-style: solid; }
  .pdf-field.text { padding: 0; background: rgba(255,255,255,0.95) !important; }
  .pdf-field.text input { width: 100%; height: 100%; border: none; outline: none; background: transparent; padding: 0 6px; font-weight: 700; color: #0f172a; box-sizing: border-box; }
  .pdf-field-badge { width: 18px; height: 18px; border-radius: 5px; display: grid; place-items: center; color: #fff; font-size: 9px; flex-shrink: 0; }
  .pdf-field-label { text-transform: uppercase; letter-spacing: 0.4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pdf-sig-img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .pdf-check { font-size: 18px; font-weight: 900; }

  .pdf-sidebar { background: #fff; border-left: 1px solid #e2e8f0; padding: 24px; display: flex; flex-direction: column; overflow-y: auto; }
  .sidebar-head { font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
  .progress-bar { height: 6px; background: #f1f5f9; border-radius: 99px; margin-bottom: 20px; overflow: hidden; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, #6366f1, #8b5cf6); border-radius: 99px; transition: width 0.3s; }

  .field-list { display: flex; flex-direction: column; gap: 8px; }
  .empty-fields { padding: 16px; background: #f8fafc; border-radius: 12px; color: #94a3b8; font-size: 12px; font-weight: 600; text-align: center; }
  .field-item { padding: 12px; border-radius: 12px; border: 1px solid #f1f5f9; display: flex; align-items: center; gap: 12px; cursor: pointer; transition: 0.2s; }
  .field-item:hover { background: #f8fafc; border-color: #e2e8f0; }
  .field-item.done { border-color: #10b981; background: rgba(16, 185, 129, 0.05); }
  .field-icon { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; font-size: 13px; flex-shrink: 0; }
  .field-item .label { font-size: 13px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 6px; }
  .other-tag { font-size: 9px; color: #94a3b8; text-transform: uppercase; }
  .field-item .meta { font-size: 11px; color: #94a3b8; font-weight: 600; }
  .done-icon { margin-left: auto; color: #10b981; }
  .lock-icon { margin-left: auto; color: #cbd5e1; font-size: 11px; }
  .field-item.is-others { cursor: not-allowed; opacity: 0.8; }
  .field-item.is-others:hover { background: transparent; border-color: #f1f5f9; }

  .sig-modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.7); backdrop-filter: blur(8px); z-index: 1000; display: grid; place-items: center; }
  .sig-modal { width: 640px; background: white; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4); overflow: hidden; }
  .modal-head { padding: 24px 32px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; }
  .modal-head h3 { margin: 0; font-size: 16px; font-weight: 800; }
  .close-btn { width: 36px; height: 36px; border-radius: 10px; background: #f1f5f9; border: none; cursor: pointer; }
  .modal-body { padding: 32px; }
  .modal-tabs { display: flex; background: #f1f5f9; padding: 4px; border-radius: 12px; gap: 4px; margin-bottom: 24px; }
  .modal-tabs button { flex: 1; height: 40px; border-radius: 10px; border: none; font-weight: 700; font-size: 13px; color: #64748b; background: transparent; cursor: pointer; }
  .modal-tabs button.active { background: white; color: #4f46e5; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
  .type-area input { width: 100%; padding: 14px; border-radius: 14px; border: 1px solid #e2e8f0; font-size: 16px; outline: none; margin-bottom: 20px; }
  .sig-preview { height: 120px; border: 2px dashed #e2e8f0; border-radius: 16px; display: grid; place-items: center; font-size: 40px; color: #0f172a; }
  .draw-area { display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .draw-area canvas { width: 100%; max-width: 600px; height: 180px; border: 2px dashed #e2e8f0; border-radius: 16px; background: #fff; touch-action: none; }
  .modal-foot { padding: 16px 28px; border-top: 1px solid #f1f5f9; display: flex; gap: 10px; justify-content: flex-end; background: #f8fafc; }

  .upt-loading { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; font-weight: 800; color: white; background: #0f172a; }
  .upt-loading h3 { color: #fff; }
  .upt-spinner { width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.15); border-top-color: #6366f1; border-radius: 50%; animation: upt-spin 0.8s linear infinite; }
  @keyframes upt-spin { to { transform: rotate(360deg); } }

  /* ============================================================================
     Mobile: stack PDF viewer above sidebar so students can sign on phones
     ============================================================================ */
  @media (max-width: 900px) {
    .pdf-header { padding: 10px 16px; gap: 10px; }
    .pdf-header-left { gap: 12px; min-width: 0; }
    .pdf-header-left h1 { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pdf-header-left p { font-size: 10px; }
    .pdf-btn { height: 38px; padding: 0 14px; font-size: 12px; }

    .pdf-workspace {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr auto;
      min-height: 0;
    }
    .pdf-viewer { padding: 16px; }
    .pdf-scroller { gap: 18px; width: 100%; max-width: 100%; }
    .pdf-page-container { max-width: 100%; }
    .pdf-page-container canvas { max-width: 100%; height: auto !important; }

    /* Sidebar becomes a bottom panel that's collapsible by scrolling */
    .pdf-sidebar {
      border-left: none;
      border-top: 1px solid #e2e8f0;
      padding: 16px;
      max-height: 40vh;
      box-shadow: 0 -8px 24px rgba(0,0,0,0.15);
    }

    /* Touch-friendly field list rows */
    .field-item { padding: 14px; min-height: 56px; }
    .field-icon { width: 36px; height: 36px; font-size: 14px; }
    .field-item .label { font-size: 14px; }
  }

  @media (max-width: 640px) {
    .pdf-header { flex-wrap: wrap; }
    .pdf-header-actions { width: 100%; justify-content: stretch; gap: 8px; }
    .pdf-header-actions .pdf-btn { flex: 1; justify-content: center; }
    .back-btn { width: 36px; height: 36px; }

    /* Signature modal full-bleed on phones */
    .sig-modal-overlay { padding: 0; align-items: stretch; }
    .sig-modal {
      width: 100%;
      max-width: 100%;
      border-radius: 0;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .modal-head { padding: 16px 18px; }
    .modal-head h3 { font-size: 15px; }
    .modal-body { padding: 18px; flex: 1; overflow-y: auto; }
    .modal-tabs button { height: 44px; font-size: 13px; }
    .type-area input { padding: 14px; font-size: 16px; }
    .sig-preview { height: 100px; font-size: 32px; }
    .draw-area canvas { height: 200px; }
    .modal-foot { padding: 14px 18px; gap: 8px; }
    .modal-foot .pdf-btn { flex: 1; justify-content: center; min-height: 48px; }
  }
`;
