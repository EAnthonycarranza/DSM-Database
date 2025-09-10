// src/pages/DocsCenter.jsx
import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { useNavigate, useLocation } from "react-router-dom";
import { useApp } from "../context/AppContext";

// --- helpers for importing templates into the library ---
const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]); // strip data: prefix
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const parseTemplateJSON = async (file) => {
  const txt = await file.text();
  const json = JSON.parse(txt);
  if (!Array.isArray(json.fields)) throw new Error("Template JSON missing 'fields' array.");
  const numPages = Number(json.numPages || 0);
  // Accept optional extras produced by AdminPdfEditor
  return {
    fields: json.fields,
    radioGroups: json.radioGroups || {},
    numPages: isNaN(numPages) ? 0 : numPages,
    version: json.version ?? 1,
    pdfBase64: json.pdfBase64 || undefined,
    pdfName: json.pdfName || undefined,
    pdfSize: json.pdfSize || undefined,
    pdfUrl: json.pdfUrl || undefined,
    name: json.name || undefined,
    description: json.description || undefined,
  };
};

function uid() {
  return "env_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ---------- PDF Preview helpers (PDF.js) ---------- */
const PDFJS_VERSION = pdfjsLib.version || "5.4.54";
const PDFJS_MAJOR = parseInt((PDFJS_VERSION || "5").split(".")[0], 10) || 5;
const WORKER_EXT = PDFJS_MAJOR >= 4 ? "mjs" : "js";
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.${WORKER_EXT}`;

const b64ToUint8 = (b64) => {
  try {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
};

// Helper: normalize storage URLs (gs:// -> https) so we can fetch previews
function normalizeStorageUrl(u) {
  if (!u) return "";
  const s = String(u);
  if (s.startsWith("gs://")) {
    const m = s.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (m) return `https://storage.googleapis.com/${m[1]}/${m[2]}`;
  }
  return s;
}

/* ---------- Inline modal content: TemplatePreview ---------- */
function TemplatePreview({ template }) {
  const wrapRef = useRef(null);
  const canvasRefs = useRef({});
  const ensureCanvasRef = useCallback((i) => {
    if (!canvasRefs.current[i]) canvasRefs.current[i] = React.createRef();
    return canvasRefs.current[i];
  }, []);
  // Track in-flight PDF.js render tasks so we can cancel on resize/re-render
  const renderTasksRef = useRef({}); // pageIndex -> RenderTask

  const [doc, setDoc] = useState(null);
  const [pagesMeta, setPagesMeta] = useState([]); // [{w,h}]
  const [containerW, setContainerW] = useState(800);

  const [overrideB64, setOverrideB64] = useState(null);

  const onAttachLocalPdf = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const b64 = await fileToBase64(f); // uses helper defined above
      setOverrideB64(b64);
    } catch (err) {
      console.error(err);
    }
  };

  // Normalize GCS/https url to a fetchable public URL (basic helper)
  function normalizeUrl(u) {
    if (!u) return "";
    const s = String(u);
    if (s.startsWith("gs://")) {
      const m = s.match(/^gs:\/\/([^/]+)\/(.+)$/);
      if (m) return `https://storage.googleapis.com/${m[1]}/${m[2]}`;
    }
    return s;
  }

  // Load pdf (template-embedded, via URL, or locally attached for preview)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Prefer locally attached > embedded base64 > remote URL
      const srcB64 = overrideB64 || template?.pdfBase64;
      let dataBytes = null;
      if (srcB64) {
        dataBytes = b64ToUint8(srcB64);
      } else if (template?.pdfUrl) {
        try {
          const url = normalizeUrl(template.pdfUrl);
          const res = await fetch(url, { credentials: "include" });
          if (res.ok) {
            dataBytes = new Uint8Array(await res.arrayBuffer());
          }
        } catch {}
      }
      if (!dataBytes) { setDoc(null); setPagesMeta([]); return; }
      const loadingTask = pdfjsLib.getDocument({ data: dataBytes });
      const pdf = await loadingTask.promise;
      if (cancelled) return;
      setDoc(pdf);
      const metas = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        metas.push({ w: vp.width, h: vp.height });
      }
      setPagesMeta(metas);
    })().catch((e) => console.error(e));
    return () => { cancelled = true; };
  }, [template, overrideB64]);

  // Fit-to-width via ResizeObserver
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width || 800;
      setContainerW(Math.max(320, Math.floor(w)));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Render pages any time width/metas/doc change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!doc || pagesMeta.length === 0 || !containerW) return;

      // Cancel any previous renders using the same canvases
      try {
        const tasks = renderTasksRef.current || {};
        Object.values(tasks).forEach((t) => {
          try { t?.cancel?.(); } catch {}
        });
      } finally {
        renderTasksRef.current = {};
      }

      for (let i = 1; i <= pagesMeta.length; i++) {
        if (cancelled) break;
        const page = await doc.getPage(i);
        const meta = pagesMeta[i - 1];
        const scale = containerW / meta.w;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRefs.current[i]?.current;
        if (!canvas) continue;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";
        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Start a render task and remember it so we can cancel on the next pass
        const task = page.render({ canvasContext: ctx, viewport });
        renderTasksRef.current[i] = task;
        try {
          await task.promise;
        } catch (e) {
          // Ignore cancellation errors between resizes/updates
        }
      }
    })();

    return () => {
      cancelled = true;
      const tasks = renderTasksRef.current || {};
      Object.values(tasks).forEach((t) => {
        try { t?.cancel?.(); } catch {}
      });
      renderTasksRef.current = {};
    };
  }, [doc, pagesMeta, containerW]);

  if (!template?.pdfBase64 && !overrideB64) {
    return (
      <div style={{ padding: 12 }}>
        <div className="pill amber" style={{ marginBottom: 8 }}>
          This template was saved without an embedded PDF file.
        </div>
        <div style={{ marginBottom: 10 }}>
          Attach a PDF below to preview it now (this won't save it to the template).
        </div>
        <label className="file-btn" style={{ display: "inline-block" }}>
          <input type="file" accept="application/pdf" onChange={onAttachLocalPdf} />
          <span>Attach PDF for Preview</span>
        </label>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
          To permanently store a PDF with this template, re‑import it via <em>Import Template</em> in the Docs Center.
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} style={{ maxHeight: "70vh", overflow: "auto", padding: 8 }}>
      {pagesMeta.map((meta, idx) => {
        const i = idx + 1;
        const scale = containerW / meta.w;
        const w = Math.floor(meta.w * scale);
        const h = Math.floor(meta.h * scale);
        const fields = (template.fields || []).filter((f) => f.pageIndex === i);
        return (
          <div key={i} style={{ position: "relative", width: w, height: h, margin: "0 auto 12px", borderRadius: 12, overflow: "hidden", boxShadow: "0 10px 24px rgba(0,0,0,.35)", border: "1px solid #22305a" }}>
            <canvas ref={ensureCanvasRef(i)} />
            {/* Overlay fields (percent-based, pointerEvents none) */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              {fields.map((f) => (
                <div
                  key={f.id}
                  title={f.type || "field"}
                  style={{
                    position: "absolute",
                    left: (f.nx * 100) + "%",
                    top: (f.ny * 100) + "%",
                    width: (f.nw * 100) + "%",
                    height: (f.nh * 100) + "%",
                    border: "2px dashed rgba(76,102,255,.65)",
                    background: "rgba(76,102,255,.18)",
                    borderRadius: 8,
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,.06)"
                  }}
                >
                  <div style={{
                    position: "absolute",
                    top: -18,
                    left: 0,
                    fontSize: 11,
                    padding: "2px 6px",
                    background: "rgba(10,14,27,.7)",
                    borderRadius: 6,
                    color: "#cfe0ff"
                  }}>
                    {f.type || "field"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Inline modal content: FormPreview (read-only) ---------- */
function FormPreview({ form }) {
  if (!form) return null;
  const fields = Array.isArray(form.fields) ? form.fields : [];
  const Input = ({ placeholder = '', type = 'text', value = '' }) => (
    <input
      disabled
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={() => {}}
      className="input"
      style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 8, background: '#f9fafb' }}
    />
  );
  const Select = ({ options = [], value = '' }) => (
    <select
      disabled
      className="input"
      value={String(value ?? '')}
      onChange={() => {}}
      style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 8, background: '#f9fafb' }}
    >
      <option value="">Choose…</option>
      {(options || []).map((o, i) => {
        const isObj = o && typeof o === 'object';
        const val = String(isObj ? (o.value ?? o.label ?? `option_${i+1}`) : (o ?? `option_${i+1}`));
        const label = String(isObj ? (o.label ?? val) : val);
        return (<option key={i} value={val}>{label}</option>);
      })}
    </select>
  );

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{form.title || 'Untitled Form'}</div>
        {form.description && <div style={{ color: '#6b7280', marginTop: 4 }}>{form.description}</div>}
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {fields.map((f) => {
          const type = String(f.type || '').toLowerCase();
          return (
            <div key={f.id}>
              {type === 'heading' ? (
                <div style={{ fontWeight: 700, fontSize: 16, borderBottom: '1px solid #e5e7eb', paddingBottom: 4, margin: '6px 0' }}>{f.label}</div>
              ) : type === 'divider' ? (
                <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb' }} />
              ) : type === 'admintext' ? (
                <div style={{ border: '1px solid #e9ecef', padding: 12, borderRadius: 8 }}>
                  {(String(f.content || '')).split('\n').map((ln, i) => <p key={i} style={{ margin: 0, marginBottom: 8 }}>{ln}</p>)}
                </div>
              ) : (
                <div>
                  {!!f.label && (
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                      {f.label}{f.required ? ' *' : ''}
                    </label>
                  )}
                  {type === 'textarea' && (
                    <textarea
                      disabled
                      rows={4}
                      placeholder={f.placeholder || ''}
                      defaultValue={String(f.defaultValue ?? '')}
                      style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 8, background: '#f9fafb' }}
                    />
                  )}
                  {type === 'select' && (<Select options={f.options || []} value={f.defaultValue} />)}
                  {type === 'radio' && (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {(f.options || []).map((o, i) => {
                        const isObj = o && typeof o === 'object';
                        const val = String(isObj ? (o.value ?? o.label ?? `option_${i+1}`) : (o ?? `option_${i+1}`));
                        const label = String(isObj ? (o.label ?? val) : val);
                        return (
                          <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#374151' }}>
                            <input type="radio" disabled checked={String(f.defaultValue ?? '') === val} readOnly /> {label}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {type === 'checkbox' && Array.isArray(f.options) && (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {(f.options || []).map((o, i) => {
                        const isObj = o && typeof o === 'object';
                        const val = String(isObj ? (o.value ?? o.label ?? `option_${i+1}`) : (o ?? `option_${i+1}`));
                        const label = String(isObj ? (o.label ?? val) : val);
                        const dvals = Array.isArray(f.defaultValue) ? f.defaultValue.map(String) : [];
                        return (
                          <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#374151' }}>
                            <input type="checkbox" disabled checked={dvals.includes(val)} readOnly /> {label}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {type === 'checkbox' && !Array.isArray(f.options) && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#374151' }}>
                      <input type="checkbox" disabled checked={!!f.defaultValue} readOnly /> {f.checkboxText || f.label}
                    </label>
                  )}
                  {type === 'multiselect' && (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {(f.options || []).map((o, i) => {
                        const isObj = o && typeof o === 'object';
                        const val = String(isObj ? (o.value ?? o.label ?? `option_${i+1}`) : (o ?? `option_${i+1}`));
                        const label = String(isObj ? (o.label ?? val) : val);
                        const dvals = Array.isArray(f.defaultValue) ? f.defaultValue.map(String) : [];
                        return (
                          <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#374151' }}>
                            <input type="checkbox" disabled checked={dvals.includes(val)} readOnly /> {label}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {['text','email','phone','number','date','time','url','location'].includes(type) && (
                    <Input
                      type={type === 'phone' ? 'tel' : type}
                      placeholder={f.placeholder || ''}
                      value={String(f.defaultValue ?? '')}
                    />
                  )}
                  {type === 'file' && (<Input type="file" />)}
                  {type === 'rating' && (
                    (() => {
                      const max = Math.max(1, Math.min(10, Number(f.validation?.maxStars ?? 5)));
                      const val = Math.max(0, Math.min(max, Number(f.defaultValue ?? 0)));
                      const full = '★'.repeat(val);
                      const empty = '☆'.repeat(max - val);
                      return <div style={{ color: '#f59e0b', letterSpacing: 1 }}>{full}{empty}</div>;
                    })()
                  )}
                  {type === 'signature' && (
                    <div style={{ border: '2px dashed #cbd5e1', background: '#f8fafc', borderRadius: 10, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                      Signature
                    </div>
                  )}
                  {type === 'inlinetext' && Array.isArray(f.parts) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      {f.parts.map((p, i) => (
                        p.t === 'text'
                          ? <span key={i}>{p.v}</span>
                          : (
                            <input
                              key={i}
                              disabled
                              className="input"
                              style={{ minWidth: 120 }}
                              placeholder={p.label || p.name || ''}
                              type={p.inputType === 'phone' ? 'tel' : (p.inputType || 'text')}
                              value={String(p.defaultValue ?? '')}
                              onChange={() => {}}
                            />
                          )
                      ))}
                    </div>
                  )}
                  {f.helpText && (<div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{f.helpText}</div>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Small first-page thumbnail for a template, with field overlay (pageIndex 1)
function TemplateThumb({ templateId, width = 86, onClick }) {
  const { api } = useApp();
  const [tpl, setTpl] = useState(null);
  const canvasRef = useRef(null);
  const [dims, setDims] = useState({ w: width, h: Math.round(width * 1.3) });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!templateId) return;
        const t = await api.get("pdfTemplates", templateId).catch(() => null);
        if (!alive) return;
        setTpl(t);
      } catch {}
    })();
    return () => { alive = false; };
  }, [api, templateId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tpl) return;
      let bytes = null;
      if (tpl.pdfBase64) {
        try { bytes = b64ToUint8(String(tpl.pdfBase64).trim()); } catch {}
      }
      if (!bytes && tpl.pdfUrl) {
        try {
          const res = await fetch(normalizeStorageUrl(tpl.pdfUrl), { credentials: "include" });
          if (res.ok) bytes = new Uint8Array(await res.arrayBuffer());
        } catch {}
      }
      if (!bytes || cancelled) return;
      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      const pdf = await loadingTask.promise;
      if (cancelled) return;
      const page = await pdf.getPage(1);
      const vp = page.getViewport({ scale: 1 });
      const scale = width / vp.width;
      const w = Math.floor(vp.width * scale);
      const h = Math.floor(vp.height * scale);
      setDims({ w, h });
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale }) }).promise;
    })();
    return () => { cancelled = true; };
  }, [tpl, width]);

  const fields = (tpl?.fields || []).filter((f) => f.pageIndex === 1);
  return (
    <div
      onClick={onClick}
      title={tpl?.name || "Template"}
      style={{ position: "relative", width: dims.w, height: dims.h, border: "1px solid #22325a", borderRadius: 8, overflow: "hidden", background: "#0b1328", cursor: onClick ? "pointer" : "default" }}
    >
      <canvas ref={canvasRef} />
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {fields.map((f) => (
          <div
            key={f.id}
            style={{
              position: "absolute",
              left: `${(f.nx || 0) * 100}%`,
              top: `${(f.ny || 0) * 100}%`,
              width: `${(f.nw || 0) * 100}%`,
              height: `${(f.nh || 0) * 100}%`,
              border: "2px dashed rgba(76,102,255,.65)",
              background: "rgba(76,102,255,.15)",
              borderRadius: 4,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function DocsCenter() {
  const navigate = useNavigate();
  const location = useLocation();
  const { api, setToast, setModal, user } = useApp();

  // Initialize mode from navigation state (no query params)
  const initialMode = React.useMemo(() => {
    const s = (location && location.state && location.state.openMode) || null;
    if (s === "form-subs" || s === "send" || s === "track" || s === "tools") return s;
    return "send";
  }, [location]);
  const [mode, setMode] = useState(initialMode); // "send" | "track" | "tools" | "form-subs"
  const [loading, setLoading] = useState(true);

  // Data
  const [templates, setTemplates] = useState([]);
  const [forms, setForms] = useState([]);
  const [users, setUsers] = useState([]);
  const [studentsList, setStudentsList] = useState([]);
  const [students, setStudents] = useState([]);

  // Envelope state
  const [selectedKind, setSelectedKind] = useState('pdf'); // 'pdf' | 'form'
  const [selectedId, setSelectedId] = useState("");
  // New: optionally send notification emails (students may lack email access)
  const [emailRecipients, setEmailRecipients] = useState(false);
  // Start with no preselected form; admin chooses in the UI
  const [selectedFormForSubs, setSelectedFormForSubs] = useState("");
  const [formSubs, setFormSubs] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());

  // Import modal state (PDF + JSON from Admin editor)
  const [impName, setImpName] = useState("");
  const [impDesc, setImpDesc] = useState("");
  const [impPdf, setImpPdf] = useState(null);
  const [impJson, setImpJson] = useState(null);
  const [impSaving, setImpSaving] = useState(false);

  // Apply openMode from location.state once, then clear it so it won't force tabs again
  const appliedOpenModeRef = useRef(false);
  useEffect(() => {
    const desired = location && location.state && location.state.openMode;
    if (desired && !appliedOpenModeRef.current) {
      appliedOpenModeRef.current = true;
      setMode(desired);
      // Clear state so further tab switches aren't overridden
      navigate('/admin/docs-center', { replace: true });
    }
  }, [location, navigate]);

  // Tracking: envelopes list
  const [envLoading, setEnvLoading] = useState(false);
  const [envelopes, setEnvelopes] = useState([]);
  const [envQuery, setEnvQuery] = useState("");
  const [openEnvIds, setOpenEnvIds] = useState(() => new Set());

  const refreshEnvelopes = useCallback(async () => {
    try {
      setEnvLoading(true);
      const list = await api.getAll?.("envelopes").catch(() => []);
      setEnvelopes(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error(e);
      setToast?.("Failed to load envelopes.");
    } finally {
      setEnvLoading(false);
    }
  }, [api, setToast]);

  // Envelope preview modal: shows template preview with JSON fields overlay
  // and the recipient's student documents (including signed PDFs when present)
  const EnvelopeViewer = ({ env, recipient }) => {
    const [tpl, setTpl] = useState(null);
    const [docs, setDocs] = useState([]);
    const [pendingImages, setPendingImages] = useState([]); // data URLs or image URLs from pending submissions
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      let alive = true;
      (async () => {
        try {
          setLoading(true);
          // Load template
          const t = env?.templateId ? await api.get("pdfTemplates", env.templateId).catch(() => null) : null;
          // Load documents for this recipient/student if available
          let studentId = recipient?.studentId || recipient?.id || undefined;
          if (!studentId && Array.isArray(env?.recipients) && env.recipients.length) {
            studentId = env.recipients[0].studentId || env.recipients[0].id;
          }
          const list = studentId ? await api.getAll("documents", { studentId }).catch(() => []) : [];

          // Try to gather pending images from form submissions for this recipient
          let pImages = [];
          try {
            // Determine the userId associated with this student
            const u = Array.isArray(users) ? users.find((x) => String(x.studentId || "") === String(studentId || "")) : null;
            const userId = u?.id || null;
            if (userId) {
              let subs = [];
              if (env?.formId && api.getFormSubmissions) {
                subs = await api.getFormSubmissions(env.formId, {}).catch(() => []);
              } else {
                subs = await api.getAll?.("formSubmissions").catch(() => []);
              }
              subs = Array.isArray(subs) ? subs : [];
              const pendingSubs = subs.filter((s) => String(s.submittedBy || "") === String(userId) && String(s.status || "").toLowerCase() === "pending");
              for (const s of pendingSubs) {
                const data = s.submissionData || {};
                for (const k of Object.keys(data)) {
                  const v = data[k];
                  if (typeof v === "string" && v.startsWith("data:image")) {
                    pImages.push({ src: v, label: k });
                  } else if (Array.isArray(v)) {
                    for (const item of v) {
                      if (typeof item === "string" && item.startsWith("data:image")) pImages.push({ src: item, label: k });
                      else if (item && typeof item.url === "string" && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(item.url)) pImages.push({ src: item.url, label: k });
                    }
                  } else if (v && typeof v === "object" && typeof v.url === "string" && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(v.url)) {
                    pImages.push({ src: v.url, label: k });
                  }
                }
              }
            }
          } catch {}

          if (!alive) return;
          setTpl(t);
          setDocs(Array.isArray(list) ? list : []);
          setPendingImages(pImages);
        } finally {
          if (alive) setLoading(false);
        }
      })();
      return () => { alive = false; };
    }, [env?.id, env?.templateId, recipient?.studentId, recipient?.id]);

    const title = env?.subject || "Envelope";
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12, minHeight: 300 }}>
        <div style={{ border: '1px solid #22325a', borderRadius: 12, overflow: 'hidden'}}>
          <div style={{ padding: 10, borderBottom: '1px solid #22325a', fontWeight: 800 }}>Template Preview — {title}</div>
          <div>
            {loading && <div style={{ padding: 12, opacity: .8 }}>Loading…</div>}
            {!loading && !tpl && (
              <div style={{ padding: 12, opacity: .85 }}>No template found for this envelope.</div>
            )}
            {tpl && <TemplatePreview template={tpl} />}
          </div>
        </div>
        <div >
          {!!pendingImages.length && (
            <div style={{ marginBottom: 12, border: '1px solid #22325a', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: 10, borderBottom: '1px solid #22325a', fontWeight: 800 }}>Pending Images</div>
              <div style={{ padding: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
                  {pendingImages.map((img, i) => (
                    <a key={i} href={img.src} target="_blank" rel="noreferrer" title={img.label || `Image ${i+1}`} style={{ display: 'block', border: '1px solid #22325a', borderRadius: 8, overflow: 'hidden', background: '#0b1328' }}>
                      <img src={img.src} alt={img.label || `Pending image ${i+1}`} style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }} />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div style={{ padding: 10, borderBottom: '1px solid #22325a', fontWeight: 800 }}>Student Documents</div>
          <div style={{ padding: 10, maxHeight: '70vh', overflow: 'auto' }}>
            {Array.isArray(env?.recipients) && env.recipients.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, opacity: .85 }}>
                  Recipient: {recipient?.name || env.recipients[0].name || 'Student'}
                </div>
                {recipient?.url && (
                  <div style={{ marginTop: 6 }}>
                    <a className="link" href={recipient.url} target="_blank" rel="noreferrer">Open Signed PDF</a>
                  </div>
                )}
              </div>
            )}
            {!docs.length && <div style={{ opacity: .75 }}>No documents for this student yet.</div>}
            {!!docs.length && (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                {docs.map((d) => {
                  const isImg = /^image\//i.test(d?.mime || "") || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(String(d?.url || ""));
                  return (
                    <li key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', border: '1px solid #22325a', borderRadius: 10, padding: '8px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {isImg && d.url && (
                          <a href={d.url} target="_blank" rel="noreferrer" style={{ display: 'block', borderRadius: 6, overflow: 'hidden', border: '1px solid #22325a' }}>
                            <img src={d.url} alt={d.name || 'Image'} style={{ width: 56, height: 56, objectFit: 'cover', display: 'block' }} />
                          </a>
                        )}
                        <div>
                          <div style={{ fontWeight: 700 }}>{d.name || d.fileName || 'Document'}</div>
                          <div style={{ fontSize: 12, opacity: .8 }}>{new Date(d.at || d.updatedAt || d.createdAt || Date.now()).toLocaleString()}</div>
                        </div>
                      </div>
                      {d.url ? (
                        <a className="btn" href={d.url} target="_blank" rel="noreferrer">Open</a>
                      ) : (
                        <span style={{ opacity: .6 }}>No URL</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  };

  const openEnvelopeViewer = (env, recipient = null) => {
    setModal?.({
      open: true,
      type: 'node',
      title: 'Envelope Preview',
      node: <EnvelopeViewer env={env} recipient={recipient} />,
    });
  };

  // Open a modal to import a template (PDF + template JSON) and save into 'pdfTemplates'
  const openImportTemplateModal = () => {
    setImpName("");
    setImpDesc("");
    setImpPdf(null);
    setImpJson(null);
    setImpSaving(false);
    setModal?.({
      open: true,
      title: "Import PDF Template",
      content: (
        <form className="form-grid" onSubmit={(e) => e.preventDefault()}>
          <label className="wide">
            <span>Template Name</span>
            <input className="input" value={impName} onChange={(e) => setImpName(e.target.value)} placeholder="e.g., Admissions Packet" />
          </label>
          <label className="wide">
            <span>Description (optional)</span>
            <input className="input" value={impDesc} onChange={(e) => setImpDesc(e.target.value)} placeholder="Short description…" />
          </label>
          <label>
            <span>PDF File (optional if JSON includes embedded PDF)</span>
            <input className="input" type="file" accept="application/pdf" onChange={(e) => setImpPdf(e.target.files?.[0] || null)} />
          </label>
          <label>
            <span>Template JSON</span>
            <input className="input" type="file" accept="application/json" onChange={(e) => setImpJson(e.target.files?.[0] || null)} />
          </label>
          <div className="helper wide">The template JSON comes from the Admin PDF Editor’s “Save Template” action. If the JSON already includes an embedded PDF, attaching a PDF file here is optional.</div>
        </form>
      ),
      primary: (
        <button
          className="btn small primary"
          onClick={async () => {
            if (!impJson || !impName.trim()) {
              setToast?.("Provide a name and the Template JSON file.");
              return;
            }
            setImpSaving(true);
            try {
              const parsed = await parseTemplateJSON(impJson);
              // Determine PDF source: prefer explicit file > embedded in JSON > url (will be normalized by preview)
              let pdfBase64 = undefined;
              let pdfName = undefined;
              let pdfSize = undefined;
              if (impPdf) {
                pdfBase64 = await fileToBase64(impPdf);
                pdfName = impPdf.name;
                pdfSize = impPdf.size;
              } else if (parsed.pdfBase64) {
                pdfBase64 = parsed.pdfBase64;
                pdfName = parsed.pdfName || "document.pdf";
                pdfSize = parsed.pdfSize || 0;
              }

              const template = {
                // let backend assign id
                name: impName.trim() || parsed.name || "Template",
                description: (impDesc || parsed.description || "").trim() || undefined,
                version: parsed.version ?? 1,
                numPages: parsed.numPages || 0,
                fields: parsed.fields || [],
                radioGroups: parsed.radioGroups || {},
                pdfBase64,                 // may be undefined if user intends to host via url
                pdfUrl: !pdfBase64 ? parsed.pdfUrl : undefined,
                pdfName,
                pdfSize,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
              const created = await api.add?.("pdfTemplates", template);
              if (created) setTemplates((prev) => [created, ...prev]);
              setToast?.("Template imported.");
              setModal((m) => ({ ...m, open: false }));
            } catch (err) {
              console.error(err);
              setToast?.("Failed to import template.");
            } finally {
              setImpSaving(false);
            }
          }}
          disabled={impSaving}
        >
          {impSaving ? "Saving…" : "Save Template"}
        </button>
      ),
    });
  };

  // Load templates + students
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const [tpls, studz, frms, us] = await Promise.all([
          api.getAll?.("pdfTemplates").catch(() => []),
          api.getAll?.("students").catch(() => []),
          api.getAll?.("forms", { status: 'active' }).catch(() => []),
          api.getAll?.("users").catch(() => []),
        ]);

        // Filter to non-admin “students”; also ignore archived
        const cleanStudents = (studz || []).filter(
          (s) => !s.archived && s.role !== "admin"
        );

        if (!alive) return;
        setTemplates(tpls || []);
        setStudents(cleanStudents);
        setForms(Array.isArray(frms) ? frms : []);
        setUsers(Array.isArray(us) ? us : []);
        setStudentsList(cleanStudents);
      } catch (e) {
        console.error(e);
        setToast?.("Failed to load templates or students.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, setToast]);

  // Load envelopes when switching to tracking mode the first time
  useEffect(() => {
    if (mode === "track") refreshEnvelopes();
  }, [mode, refreshEnvelopes]);

  // Derived: filtered students
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => {
      const name = `${s.firstName || ""} ${s.lastName || ""}`.toLowerCase();
      const email = (s.email || "").toLowerCase();
      const mobile = (s.mobile || "").toLowerCase();
      return name.includes(q) || email.includes(q) || mobile.includes(q);
    });
  }, [students, query]);

  // Bulk select helpers
  const allFilteredIds = useMemo(() => new Set(filtered.map((s) => s.id)), [filtered]);

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    const allSelected = [...allFilteredIds].every((id) => selected.has(id));
    setSelected((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        for (const id of allFilteredIds) next.delete(id);
        return next;
      } else {
        const next = new Set(prev);
        for (const id of allFilteredIds) next.add(id);
        return next;
      }
    });
  };

  const countSelected = selected.size;

  // Send envelope
  const sendEnvelope = async () => {
    try {
      if (!selectedId) return setToast?.({ type: "warn", text: "Pick a template or form first." });
      if (countSelected === 0) return setToast?.({ type: "warn", text: "Pick at least one student." });
      const isForm = selectedKind === 'form';
      let tpl = null;
      let frm = null;
      if (isForm) {
        frm = forms.find((f) => f.id === selectedId);
        if (!frm) return setToast?.({ type: 'warn', text: 'Form not found.' });
      } else {
        tpl = templates.find((t) => t.id === selectedId);
        if (!tpl) return setToast?.({ type: "warn", text: "Template not found." });
        if (!tpl.pdfBase64 && !tpl.pdfUrl) {
          return setToast?.({ type: "warn", text: "Template has no PDF. Import with PDF or set a pdfUrl." });
        }
      }

      // Build recipients; include studentId for server-side matching.
      // Do NOT filter out recipients without email —
      // the student can sign in-app via Dashboard even without email.
      const recips = students
        .filter((s) => selected.has(s.id))
        .map((s) => ({
          id: s.id,                 // server treats this as studentId if studentId not provided
          studentId: s.id,
          name: `${s.firstName || ""} ${s.lastName || ""}`.trim() || "Student",
          email: s.email || null,
        }));

      if (recips.length === 0) {
        return setToast?.({ type: "warn", text: "Select at least one student with a valid record." });
      }

      const envelope = {
        id: uid(),
        ...(isForm ? { formId: frm.id, kind: 'form' } : { templateId: tpl.id }),
        recipients: recips,
        subject: subject?.trim() || (isForm ? `Form: ${frm.title || 'Untitled'}` : "Document from DSM"),
        message: message?.trim() || "",
        status: "queued",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sentBy: user?.id || undefined,
  emailRecipients: !!emailRecipients,
      };

      await api.add?.("envelopes", envelope);
      setToast?.({ type: "success", text: `Envelope queued to ${recips.length} recipient(s).` });
      // Switch to tracking and refresh list
      try { setMode("track"); } catch {}
      try { await refreshEnvelopes(); } catch {}
      setSelected(new Set());
      setSubject("");
      setMessage("");
    } catch (e) {
      console.error(e);
      setToast?.({ type: "error", text: "Failed to create envelope." });
    }
  };

  // UX helpers
  const openTemplateInfo = () => {
    if (!selectedId || selectedKind !== 'pdf') return setToast?.("Pick a PDF template first.");
    const tpl = templates.find((t) => t.id === selectedId);
    setModal?.({
      open: true,
      title: tpl?.name || "Template Preview",
      content: <TemplatePreview template={tpl} />,
      primary: (
        <button
          className="btn small primary"
          onClick={() => setModal((m) => ({ ...m, open: false }))}
        >
          Close
        </button>
      ),
    });
  };

  const openFormInfo = () => {
    if (!selectedId || selectedKind !== 'form') return setToast?.('Pick a form first.');
    const form = forms.find((f) => f.id === selectedId);
    setModal?.({
      open: true,
      title: form?.title || 'Form Preview',
      content: <FormPreview form={form} />,
      primary: (
        <button className="btn small primary" onClick={() => setModal((m) => ({ ...m, open: false }))}>
          Close
        </button>
      ),
    });
  };

  // ----- Form Submissions helpers -----
  const loadFormSubs = async (formId) => {
    if (!formId) { setFormSubs([]); return; }
    setSubsLoading(true);
    try {
      const subs = await api.getFormSubmissions(formId, {});
      setFormSubs(Array.isArray(subs) ? subs : []);
    } catch { setFormSubs([]); } finally { setSubsLoading(false); }
  };

  const nameForUser = (uid) => {
    const u = users.find(x => String(x.id) === String(uid));
    return u?.name || u?.email || 'User';
  };
  const studentIdForUser = (uid) => {
    const u = users.find(x => String(x.id) === String(uid));
    return u?.studentId || null;
  };

  const generateSubmissionPdf = async (form, submission) => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const PAGE_SIZE = [595.28, 841.89]; // A4 (pts)
    const margin = 40;

    let page = pdfDoc.addPage(PAGE_SIZE);
    let { width, height } = page.getSize();
    let y = height - margin;

    const addPage = () => {
      page = pdfDoc.addPage(PAGE_SIZE);
      ({ width, height } = page.getSize());
      y = height - margin;
    };

    const drawText = (text, size = 12) => {
      const lines = String(text || '').split(/\n+/);
      for (const line of lines) {
        const fontSize = size;
        // New page if needed
        if (y - (fontSize + 6) < margin) addPage();
        page.drawText(line, { x: margin, y, size: fontSize, font });
        y -= fontSize + 6;
      }
    };

    // Title + metadata
    drawText(form.title || 'Form Submission', 16);
    drawText(`Submitted: ${new Date(submission.submittedAt || Date.now()).toLocaleString()}`, 10);
    drawText(`Submitted By: ${nameForUser(submission.submittedBy)}`, 10);
    drawText('');

    const fields = Array.isArray(form.fields) ? form.fields : [];
    const data = submission.submissionData || {};

    // Helper to draw a signature image if present
    const drawSignature = async (dataUrl) => {
      try {
        if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) return false;
        const bin = atob(dataUrl.split(',')[1] || '');
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        // Try PNG first, fallback to JPG
        let img;
        try { img = await pdfDoc.embedPng(bytes); } catch { img = await pdfDoc.embedJpg(bytes); }
        const imgW = img.width;
        const imgH = img.height;
        const maxW = width - margin * 2;
        const maxH = 140;
        const scale = Math.min(maxW / imgW, maxH / imgH, 1);
        const w = imgW * scale;
        const h = imgH * scale;
        if (y - (h + 16) < margin) addPage();
        page.drawImage(img, { x: margin, y: y - h, width: w, height: h });
        y -= h + 12;
        return true;
      } catch {
        return false;
      }
    };

    for (const f of fields) {
      const label = f.label || f.name;
      const t = String(f.type || '').toLowerCase();
      const val = data[f.name];

      if (t === 'heading') {
        drawText(label, 14);
        continue;
      }
      if (t === 'divider') {
        // simple spacer
        drawText('');
        continue;
      }
      if (t === 'admintext') {
        drawText(label ? `${label}:` : '');
        if (f.content) drawText(String(f.content), 12);
        continue;
      }
      if (t === 'signature') {
        drawText(`${label}:`);
        // Attempt to draw signature image
        const ok = await drawSignature(val);
        if (!ok) drawText('—', 12);
        continue;
      }
      if (t === 'inlinetext' && Array.isArray(f.parts)) {
        const combined = f.parts.map(p => (p.t === 'text' ? p.v : (data[p.name] ?? ''))).join(' ');
        drawText(`${label ? label + ': ' : ''}${combined}`);
        continue;
      }

      const printable = Array.isArray(val)
        ? val.join(', ')
        : (val === true ? 'Yes' : val === false ? 'No' : (val ?? ''));
      drawText(`${label}: ${printable}`, 12);
    }

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
  };

  const approveSubmission = async (form, sub) => {
    try {
      const blob = await generateSubmissionPdf(form, sub);
      const file = new File([blob], `${(form.title || 'form')}-${sub.id}.pdf`, { type: 'application/pdf' });
      // Resolve studentId for the submitter (prefer direct mapping; fallback by email match)
      let sid = studentIdForUser(sub.submittedBy);
      if (!sid) {
        try {
          // Try from loaded users list
          let u = users.find(x => String(x.id) === String(sub.submittedBy));
          // Fallback: fetch user directly if not in memory yet
          if (!u) {
            try { u = await api.get('users', sub.submittedBy); } catch {}
          }
          const email = (u?.email || '').toLowerCase();
          if (email) {
            // Try from loaded students list
            let s = students.find(st => String(st.email || '').toLowerCase() === email);
            // Fallback: fetch students if not in memory yet
            if (!s) {
              try {
                const all = await api.getAll('students');
                s = (Array.isArray(all) ? all : []).find(st => String(st.email || '').toLowerCase() === email);
              } catch {}
            }
            if (s?.id) sid = s.id;
          }
        } catch {}
      }

      const up = await api.upload([file], { studentId: sid, by: user?.id });
      const doc = (up?.docs && up.docs[0]) || null;
      // Mark submission as completed so it becomes view-only for the student
      const patch = { ...sub, status: 'completed' };
      if (doc) { patch.documentId = doc.id; patch.documentUrl = doc.url; }
      await api.put('formSubmissions', patch);
      await loadFormSubs(form.id);
      setToast?.({ type: 'success', text: 'Submission approved and saved to Documents.' });
    } catch (e) {
      console.error(e);
      setToast?.({ type: 'error', text: 'Failed to approve submission.' });
    }
  };

  // No deep-link modal opening or preloading based on query params

  return (
    <section className="page active" aria-label="Docs Center">
      {/* Header */}
      <div className="toolbar" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
          Documents & PDFs
        </h2>
        <div className="spacer" />
        <div className="btn-group" role="tablist" aria-label="Docs Center modes" style={{ marginRight: 8 }}>
          <button
            className={`btn small ${mode === "send" ? "primary" : ""}`}
            onClick={() => setMode("send")}
            role="tab"
            aria-selected={mode === "send"}
          >
            Send
          </button>
          <button
            className={`btn small ${mode === "track" ? "primary" : ""}`}
            onClick={() => setMode("track")}
            role="tab"
            aria-selected={mode === "track"}
          >
            Envelopes
          </button>
          <button
            className={`btn small ${mode === "form-subs" ? "primary" : ""}`}
            onClick={() => setMode("form-subs")}
            role="tab"
            aria-selected={mode === "form-subs"}
          >
            Form Submissions
          </button>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            setMode("tools");
            navigate("/admin/documents");
          }}
        >
          Open PDF Tools
        </button>
        <button
          className="btn"
          style={{ marginLeft: 8 }}
          onClick={() => navigate("/admin/form-builder")}
        >
          Open Form Builder
        </button>
      </div>



      {/* SEND MODE */}
      {mode === "send" && (
        <div className="tabpanel" role="tabpanel">
          <div className="grid">
            {/* Left: envelope builder */}
            <div className="card">
              <h3>Create Envelope</h3>

              {loading ? (
                <div>Loading…</div>
              ) : (
                <>
                  {templates.length === 0 && (
                    <div className="pill amber" style={{ marginBottom: 10 }}>
                      No templates found. Use “Open PDF Tools” to create one.
                    </div>
                  )}

                  <form className="form-grid" onSubmit={(e) => e.preventDefault()}>
                    <label>
                      <span>Template or Form</span>
                      <select
                        className="select"
                        value={`${selectedKind}:${selectedId}`}
                        onChange={(e) => {
                          const [kind, id] = e.target.value.split(":");
                          setSelectedKind(kind);
                          setSelectedId(id || "");
                        }}
                      >
                        <option value=":">Choose…</option>
                        <optgroup label="PDF Templates">
                          {templates.map((t) => (
                            <option key={t.id} value={`pdf:${t.id}`}>PDF • {t.name || '(Untitled Template)'}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Forms">
                          {forms.map((f) => (
                            <option key={f.id} value={`form:${f.id}`}>Form • {f.title || '(Untitled Form)'}</option>
                          ))}
                        </optgroup>
                      </select>
                    </label>

                    <label>
                      <span>Subject</span>
                      <input
                        className="input"
                        placeholder="Subject for email"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                      />
                    </label>

                    <label className="wide">
                      <span>Message (optional)</span>
                      <textarea
                        className="textarea"
                        placeholder="Add a short message to recipients…"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                      />
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }} className="wide">
                      <input
                        type="checkbox"
                        checked={emailRecipients}
                        onChange={(e) => setEmailRecipients(e.target.checked)}
                        aria-label="Also send email notifications to recipients"
                      />
                      <span style={{ fontSize: 13 }}>
                        Email recipients (if they have an email). Leave unchecked for in-app notification only.
                      </span>
                    </label>
                  </form>

                  <div className="toolbar" style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                    {selectedKind === 'pdf' ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={openTemplateInfo}
                        disabled={!selectedId}
                      >
                        View Template Info
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        onClick={openFormInfo}
                        disabled={!selectedId}
                      >
                        View Form Info
                      </button>
                    )}
                    <div className="spacer" />
                    <span className="pill blue">
                      Selected: {countSelected}
                    </span>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={sendEnvelope}
                      disabled={!selectedId || countSelected === 0}
                      title={
                        !selectedId
                          ? "Pick a template or form first"
                          : countSelected === 0
                          ? "Select at least one student"
                          : "Send envelope"
                      }
                    >
                      Send Envelope
                    </button>
                  </div>
                  {selectedId && selectedKind === 'pdf' && (
                    <>
                      <div className="divider" style={{ margin: "12px 0" }} />
                      <h4 style={{ margin: "0 0 8px", fontWeight: 800 }}>Live Preview</h4>
                      <TemplatePreview template={templates.find((t) => t.id === selectedId)} />
                    </>
                  )}
                  {selectedId && selectedKind === 'form' && (
                    <>
                      <div className="divider" style={{ margin: "12px 0" }} />
                      <h4 style={{ margin: "0 0 8px", fontWeight: 800 }}>Form Preview</h4>
                      <div className="card" style={{ padding: 12 }}>
                        {(() => {
                          const f = forms.find((x) => x.id === selectedId);
                          if (!f) return null;
                          return <FormPreview form={f} />;
                        })()}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Right: recipients table */}
            <div className="card">
              <h3>Recipients (Students)</h3>

              <div className="toolbar" style={{ margin: "6px 0 10px" }}>
                <input
                  className="input"
                  placeholder="Search name, email, or mobile…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ width: 280, maxWidth: "60%" }}
                />
                <div className="spacer" />
                <button
                  className="btn"
                  type="button"
                  onClick={toggleAllFiltered}
                  disabled={filtered.length === 0}
                >
                  {filtered.length > 0 &&
                  [...allFilteredIds].every((id) => selected.has(id))
                    ? "Clear Filtered"
                    : "Select Filtered"}
                </button>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>
                        <input
                          type="checkbox"
                          className="checkbox"
                          onChange={toggleAllFiltered}
                          checked={
                            filtered.length > 0 &&
                            [...allFilteredIds].every((id) => selected.has(id))
                          }
                          aria-label="Select all filtered"
                        />
                      </th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Mobile</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 12, opacity: 0.8 }}>
                          No matching students.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((s) => {
                        const name =
                          `${s.firstName || ""} ${s.lastName || ""}`.trim() ||
                          "(No name)";
                        return (
                          <tr
                            key={s.id}
                            className="row-clickable"
                            onClick={() => toggleOne(s.id)}
                          >
                            <td>
                              <input
                                type="checkbox"
                                className="checkbox"
                                onChange={() => toggleOne(s.id)}
                                checked={selected.has(s.id)}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Select ${name}`}
                              />
                            </td>
                            <td style={{ whiteSpace: "nowrap" }}>{name}</td>
                            <td>{s.email || "—"}</td>
                            <td>{s.mobile || "—"}</td>
                            <td>
                              <span className="pill">
                                {s.status || s.recordType || "Student"}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FORM SUBMISSIONS MODE */}
      {mode === "form-subs" && (
        <div className="tabpanel" role="tabpanel">
          <div className="card" style={{ marginBottom: 12 }}>
            <h3>Review Form Submissions</h3>
            <div className="toolbar" style={{ gap: 8 }}>
              <select
                className="select"
                value={selectedFormForSubs}
                onChange={(e)=>{ setSelectedFormForSubs(e.target.value); loadFormSubs(e.target.value); }}
                style={{ minWidth: 260 }}
              >
                <option value="">Choose a form…</option>
                {forms.map(f => (<option key={f.id} value={f.id}>{f.title || 'Untitled Form'}</option>))}
              </select>
              <div className="spacer"/>
              {selectedFormForSubs && (
                <button className="btn" onClick={()=>loadFormSubs(selectedFormForSubs)} disabled={subsLoading}>
                  {subsLoading ? 'Loading…' : 'Refresh'}
                </button>
              )}
            </div>
          </div>

          {!selectedFormForSubs ? (
            <div className="card"><p>Select a form to view its submissions.</p></div>
          ) : subsLoading ? (
            <div className="card"><p>Loading submissions…</p></div>
          ) : formSubs.length === 0 ? (
            <div className="card"><p>No submissions yet.</p></div>
          ) : (
            <div className="card">
              <table className="submissions-table">
                <thead>
                  <tr>
                    <th>Submitted At</th>
                    <th>Submitted By</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {formSubs.map((s)=>{
                    const form = forms.find(f => f.id === selectedFormForSubs);
                    return (
                      <tr key={s.id}>
                        <td>{new Date(s.submittedAt||0).toLocaleString()}</td>
                        <td>{nameForUser(s.submittedBy)}</td>
                        <td><span className={`form-status status-${s.status||'pending'}`}>{s.status||'pending'}</span></td>
                        <td>
                          <button className="btn small" onClick={()=> setModal({ open:true, title:'Submission Preview', content:(
                            <div style={{ maxWidth: 640 }}>
                              <h4>{form?.title || 'Form'}</h4>
                              <div style={{ marginTop: 8 }}>
                                {(form?.fields||[]).map((f)=>{
                                  const t = String(f.type || '').toLowerCase();
                                  const v = s.submissionData?.[f.name];
                                  if (t === 'heading') {
                                    const H = `h${f.level || 3}`;
                                    return (
                                      <div key={f.id} style={{ padding:'8px 0', borderBottom:'1px solid #eee' }}>
                                        {React.createElement(H, { style: { margin: 0 } }, f.label || '')}
                                      </div>
                                    );
                                  }
                                  if (t === 'divider') {
                                    return (<hr key={f.id} style={{ border:'none', borderTop:'1px solid #eee', margin:'8px 0' }} />);
                                  }
                                  if (t === 'admintext') {
                                    return (
                                      <div key={f.id} style={{ padding:'8px 0', borderBottom:'1px solid #eee'}}>
                                        {(String(f.content || '')).split('\n').map((ln, i) => <p key={i} style={{ margin:'0 0 6px' }}>{ln}</p>)}
                                      </div>
                                    );
                                  }
                                  // Signature image preview (data URL)
                                  if (t === 'signature') {
                                    const isImg = typeof v === 'string' && v.startsWith('data:image');
                                    return (
                                      <div key={f.id} style={{ padding:'8px 0', borderBottom:'1px solid #eee' }}>
                                        <strong>{f.label || f.name}:</strong>
                                        <div style={{ marginTop: 6, border:'1px dashed #cbd5e1', background:'#f8fafc', borderRadius:10, minHeight:120, display:'flex', alignItems:'center', justifyContent:'center' }}>
                                          {isImg ? <img alt="signature" src={v} style={{ maxHeight:120, maxWidth:'100%' }} /> : <span style={{ color:'#6b7280' }}>—</span>}
                                        </div>
                                      </div>
                                    );
                                  }
                                  // Inline text parts preview
                                  if (t === 'inlinetext' && Array.isArray(f.parts)) {
                                    return (
                                      <div key={f.id} style={{ padding:'8px 0', borderBottom:'1px solid #eee' }}>
                                        {!!f.label && (<strong>{f.label}:</strong>)}
                                        <div style={{ marginTop: 6, display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
                                          {f.parts.map((p, i) => {
                                            if (p.t === 'text') return <span key={i}>{p.v}</span>;
                                            const raw = String((s.submissionData||{})[p.name] || '');
                                            const masked = raw ? (p.mask ? '•'.repeat(Math.max(4, raw.length)) : raw) : '—';
                                            return <span key={i} style={{ fontWeight:600 }}>{masked}</span>;
                                          })}
                                        </div>
                                      </div>
                                    );
                                  }
                                  // Default pretty value
                                  const pv = Array.isArray(v)
                                    ? v.join(', ')
                                    : (v===true?'Yes':v===false?'No':(v||''));
                                  return (
                                    <div key={f.id} style={{ padding:'6px 0', borderBottom:'1px solid #eee' }}>
                                      <strong>{f.label||f.name}:</strong> <span>{pv}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) })}>
                            Preview
                          </button>
                          <button className="btn small primary" disabled={(s.status||'pending')!=='pending'} onClick={()=> approveSubmission(form, s)} style={{ marginLeft: 8 }}>
                            Approve & Save PDF
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TRACK MODE */}
      {mode === "track" && (
        <div className="tabpanel" role="tabpanel">
          <div className="card">
            <div className="toolbar" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Envelopes</h3>
              <div className="spacer" />
              <input
                className="input"
                placeholder="Search subject, message, recipient…"
                value={envQuery}
                onChange={(e) => setEnvQuery(e.target.value)}
                style={{ width: 280 }}
              />
              <button className="btn" onClick={refreshEnvelopes} disabled={envLoading}>
                {envLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Status</th>
                    <th>Recipients</th>
                    <th>Created</th>
                    <th>Updated</th>
                    <th style={{ width: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {envelopes
                    .filter((e) => {
                      const q = envQuery.trim().toLowerCase();
                      if (!q) return true;
                      const rnames = (e.recipients || [])
                        .map((r) => `${r.name || ""} ${r.email || ""}`)
                        .join(" ")
                        .toLowerCase();
                      return (
                        (e.subject || "").toLowerCase().includes(q) ||
                        (e.message || "").toLowerCase().includes(q) ||
                        rnames.includes(q)
                      );
                    })
                    .map((env) => {
                      const recips = Array.isArray(env.recipients) ? env.recipients : [];
                      const total = recips.length;
                      const done = recips.filter((r) => String(r.status || "").toLowerCase() === "completed").length;
                      const isOpen = openEnvIds.has(env.id);
                      const toggle = () =>
                        setOpenEnvIds((prev) => {
                          const next = new Set(prev);
                          next.has(env.id) ? next.delete(env.id) : next.add(env.id);
                          return next;
                        });
                      const dt = (t) => (t ? new Date(t).toLocaleString() : "—");
                      const pill = (s) => {
                        const val = String(s || "").toLowerCase();
                        const cls = val === "completed" ? "green" : val === "in-progress" ? "blue" : "";
                        return <span className={`pill ${cls}`}>{env.status || "queued"}</span>;
                      };
                      return (
                        <React.Fragment key={env.id}>
                          <tr>
                            <td style={{ fontWeight: 600 }}>{env.subject || "(No subject)"}</td>
                            <td>{pill(env.status)}</td>
                            <td>
                              <span className="pill">{done}/{total} done</span>
                            </td>
                            <td>{dt(env.createdAt)}</td>
                            <td>{dt(env.updatedAt)}</td>
                            <td>
                              <button className="btn small" onClick={toggle}>
                                {isOpen ? "Hide" : "View"}
                              </button>
                              <button className="btn small" style={{ marginLeft: 8 }} onClick={() => openEnvelopeViewer(env)}>
                                Preview
                              </button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr>
                              <td colSpan={6}>
                                <div className="subtable">
                                  <table>
                                    <thead>
                                      <tr>
                                        <th>Recipient</th>
                                        <th>Email</th>
                                        <th>Status</th>
                                        <th>Updated</th>
                                        <th>Document</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {recips.length === 0 ? (
                                        <tr>
                                          <td colSpan={5} style={{ padding: 8, opacity: 0.8 }}>No recipients</td>
                                        </tr>
                                      ) : (
                                        recips.map((r) => {
                                          const rStatus = String(r.status || "pending").toLowerCase();
                                          const rc = rStatus === "completed" ? "green" : rStatus === "viewed" ? "blue" : "";
                                          return (
                                            <tr key={r.id || r.studentId}>
                                              <td>{r.name || "Recipient"}</td>
                                              <td>{r.email || "—"}</td>
                                              <td><span className={`pill ${rc}`}>{r.status || "pending"}</span></td>
                                              <td>{dt(r.updatedAt || r.completedAt || r.invitedAt)}</td>
                                              <td>
                                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                                  {r.url ? (
                                                    <a className="link" href={r.url} target="_blank" rel="noreferrer">Open PDF</a>
                                                  ) : (
                                                    <TemplateThumb templateId={env.templateId} width={70} onClick={() => openEnvelopeViewer(env, r)} />
                                                  )}
                                                  <button className="btn small" onClick={() => openEnvelopeViewer(env, r)}>Preview</button>
                                                </div>
                                              </td>
                                              </tr>
                                          );
                                        })
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  {(!envelopes || envelopes.length === 0) && !envLoading && (
                    <tr>
                      <td colSpan={6} style={{ padding: 12, opacity: 0.8 }}>No envelopes yet.</td>
                    </tr>
                  )}
                  {envLoading && (
                    <tr>
                      <td colSpan={6} style={{ padding: 12 }}>Loading…</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TOOLS MODE (we immediately navigate to /documents, but keep a tiny hint) */}
      {mode === "tools" && (
        <div className="tabpanel" role="tabpanel">
          <div className="card">
            <h3>PDF Tools</h3>
            <p style={{ marginTop: 6 }}>
              Redirecting to the PDF editor. If nothing happened,&nbsp;
              <button className="link" onClick={() => navigate("/documents")}>
                click here
              </button>
              .
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
