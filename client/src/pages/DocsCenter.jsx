// src/pages/DocsCenter.jsx
import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { useNavigate, useLocation } from "react-router-dom";
import { useApp } from "../context/AppContext";
import {
  FaPaperPlane, FaHistory, FaClipboardList, FaFilePdf,
  FaTools, FaSearch, FaCheckCircle, FaClock, FaEye,
  FaDownload, FaPlus, FaFilter, FaSync, FaChevronDown, FaChevronRight, FaUsers,
  FaBookOpen, FaTimes, FaWpforms, FaEdit, FaExternalLinkAlt, FaExclamationTriangle,
  FaTrash, FaPen, FaPenNib, FaCalendarAlt, FaFont, FaSignature, FaIdCard,
  FaPhone, FaHashtag, FaMapMarkerAlt, FaRegDotCircle, FaUser, FaShieldAlt,
  FaStar, FaQuoteLeft, FaAsterisk, FaCircle, FaInfoCircle, FaSearchPlus, FaSearchMinus,
  FaExpand, FaFileAlt, FaLayerGroup, FaBell
} from "react-icons/fa";

/* ---------- Field Type Metadata (matches AdminPdfEditor) ---------- */
const FIELD_TYPE_META = {
  signature:    { icon: FaPen,           label: "Signature",  color: "#6366f1" },
  initials:     { icon: FaPenNib,        label: "Initials",   color: "#8b5cf6" },
  date:         { icon: FaCalendarAlt,   label: "Date",       color: "#0ea5e9" },
  text:         { icon: FaFont,          label: "Text",       color: "#10b981" },
  name:         { icon: FaIdCard,        label: "Name",       color: "#f59e0b" },
  phone:        { icon: FaPhone,         label: "Phone",      color: "#14b8a6" },
  age:          { icon: FaHashtag,       label: "Age",        color: "#f97316" },
  numberSelect: { icon: FaHashtag,       label: "Number",     color: "#ec4899" },
  state:        { icon: FaMapMarkerAlt,  label: "State",      color: "#84cc16" },
  radio:        { icon: FaRegDotCircle,  label: "Radio",      color: "#a855f7" }
};
const fieldMeta = (t) => FIELD_TYPE_META[t] || { icon: FaFont, label: t || "Field", color: "#64748b" };

/* ---------- PDF Preview Helpers ---------- */
const PDFJS_VERSION = "5.4.54";
const WORKER_EXT = "mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.${WORKER_EXT}`;

const b64ToUint8 = (b64) => {
  try {
    let s = String(b64 || "");
    const comma = s.indexOf(",");
    if (s.startsWith("data:") && comma >= 0) s = s.slice(comma + 1);
    s = s.replace(/\s+/g, "");
    const binaryString = window.atob(s);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  } catch (e) {
    console.warn("[DocsCenter] base64 decode failed", e);
    return new Uint8Array();
  }
};

function normalizeStorageUrl(u) {
  if (!u) return "";
  const s = String(u);
  if (s.startsWith("gs://")) {
    const m = s.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (m) return `https://storage.googleapis.com/${m[1]}/${m[2]}`;
  }
  return s;
}

/* ---------- Logic Helpers ---------- */
const isRecipientAdmin = (r) => r?.role === 'admin' || (r?.name && String(r.name).toLowerCase().includes('admin'));
const isRecipientStudent = (r) => !isRecipientAdmin(r);

const evaluateLogic = (field, data) => {
  if (!field.logic || !field.logic.conditions || field.logic.conditions.length === 0) return true;
  const { conditions, operator = 'and' } = field.logic;
  const results = conditions.map(c => {
    const val = data[c.parentName];
    return Array.isArray(val) ? val.includes(c.value) : val === c.value;
  });
  return operator === 'or' ? results.some(r => r) : results.every(r => r);
};

/* ---------- Sub-Components ---------- */

function PreviewPage({ doc, pageNum, containerW, meta, fields = [], zoom, activeRole }) {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);

  useEffect(() => {
    if (!doc || !containerW || !meta) return;
    let cancelled = false;

    (async () => {
      try {
        const page = await doc.getPage(pageNum);
        if (cancelled) return;

        const dpr = window.devicePixelRatio || 1;
        const baseScale = (containerW / meta.w) * 0.98 * zoom;
        const viewport = page.getViewport({ scale: baseScale * dpr });

        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const displayW = Math.floor(viewport.width / dpr);
        const displayH = Math.floor(viewport.height / dpr);
        canvas.style.width = displayW + "px";
        canvas.style.height = displayH + "px";

        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (renderTaskRef.current) {
          try { renderTaskRef.current.cancel(); } catch (e) {}
        }

        const renderTask = page.render({
          canvasContext: ctx,
          viewport: viewport,
          intent: 'display'
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err) {
        if (err.name !== "RenderingCancelledException") {
          console.error(`[DocsCenter] Page ${pageNum} render error:`, err);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (e) {}
      }
    };
  }, [doc, pageNum, containerW, meta, zoom]);

  const pageFields = fields.filter(f => (f.pageIndex ?? f.page) === pageNum);

  return (
    <div className="preview-page" style={{ position: 'relative', display: 'inline-block', margin: '0 auto 12px' }}>
      <canvas ref={canvasRef} style={{ display: 'block', borderRadius: '4px', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }} />
      <div className="preview-field-layer" style={{ position: 'absolute', inset: 0 }}>
        {pageFields.map(f => {
          const m = fieldMeta(f.type);
          const Icon = m.icon;
          const isSigned = f.status === 'completed' || !!f.value;
          const isAdmin = f.recipientRole === 'admin';
          const fieldRole = isAdmin ? 'admin' : 'student';
          const isActiveForRole = !activeRole || activeRole === fieldRole;
          const dim = activeRole && !isActiveForRole && !isSigned;
          return (
            <div
              key={f.id}
              className={`preview-field-marker ${isSigned ? 'signed' : ''} ${dim ? 'inactive' : ''} ${isActiveForRole && !isSigned ? 'active-role' : ''}`}
              style={{
                position: 'absolute',
                left: `${(f.nx ?? 0) * 100}%`,
                top: `${(f.ny ?? 0) * 100}%`,
                width: `${(f.nw ?? 0) * 100}%`,
                height: `${(f.nh ?? 0) * 100}%`,
                borderColor: isSigned ? '#10b981' : isAdmin ? '#f59e0b' : m.color,
                background: isSigned ? 'rgba(16, 185, 129, 0.1)' : isAdmin ? 'rgba(245,158,11,0.1)' : `${m.color}1f`,
                color: isSigned ? '#10b981' : isAdmin ? '#f59e0b' : m.color,
                border: `2px ${isSigned ? 'solid' : 'dashed'} currentColor`,
                borderRadius: '4px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                fontSize: '10px', fontWeight: 700, overflow: 'hidden',
                opacity: dim ? 0.25 : 1,
                filter: dim ? 'saturate(0.3)' : 'none',
                transition: 'opacity 0.2s ease, filter 0.2s ease'
              }}
              title={`${m.label} (${f.recipientRole || 'student'}) - ${isSigned ? 'SIGNED' : 'PENDING'}`}
            >
              <span className="pfm-badge" style={{
                background: isSigned ? '#10b981' : isAdmin ? '#f59e0b' : m.color,
                width: '16px', height: '16px', borderRadius: '50%',
                display: 'grid', placeItems: 'center', color: '#fff', fontSize: '8px', flexShrink: 0
              }}>
                {isSigned ? <FaCheckCircle /> : isAdmin ? <FaShieldAlt /> : <Icon />}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TemplatePreview({ template, onDelete, envelopeContext = null }) {
  const { api } = useApp();
  const wrapRef = useRef(null);
  const [doc, setDoc] = useState(null);
  const [pagesMeta, setPagesMeta] = useState([]);
  const [containerW, setContainerW] = useState(800);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState([]);
  const [zoom, setZoom] = useState(1.0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDoc(null);
    setPagesMeta([]);
    setFields([]);

    (async () => {
      if (!template) { setLoading(false); return; }

      let currentTemplate = { ...template };
      const needsFull = (!currentTemplate.pdfBase64 && !currentTemplate.pdfUrl) || !Array.isArray(currentTemplate.fields);
      if (needsFull && currentTemplate.id) {
        try {
          const fetched = await api.get("pdfTemplates", currentTemplate.id);
          if (fetched && (fetched.pdfBase64 || fetched.pdfUrl)) currentTemplate = fetched;
        } catch (e) {
          console.warn("[DocsCenter] Full template refetch failed", e);
        }
      }

      if (!cancelled) {
        let fds = Array.isArray(currentTemplate.fields) ? currentTemplate.fields : [];
        if (envelopeContext?.submissionData) {
          fds = fds.map(f => ({ ...f, value: envelopeContext.submissionData[f.name || f.id] }));
        }
        setFields(fds);
      }

      try {
        let pdf = null;
        const loadOpts = {
          cMapUrl: `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/standard_fonts/`
        };

        if (currentTemplate?.pdfBase64) {
          const bytes = b64ToUint8(currentTemplate.pdfBase64);
          if (!bytes.length) throw new Error("PDF data is empty or invalid (0 bytes)");
          pdf = await pdfjsLib.getDocument({ data: bytes, ...loadOpts }).promise;
        } else if (currentTemplate?.pdfUrl) {
          const url = normalizeStorageUrl(currentTemplate.pdfUrl);
          try {
            pdf = await pdfjsLib.getDocument({ url, withCredentials: false, ...loadOpts }).promise;
          } catch (err) {
            const res = await fetch(url, { credentials: "include" });
            if (!res.ok) throw new Error(`Fetch ${res.status}`);
            const bytes = new Uint8Array(await res.arrayBuffer());
            pdf = await pdfjsLib.getDocument({ data: bytes, ...loadOpts }).promise;
          }
        } else {
          throw new Error("Missing PDF source.");
        }

        if (cancelled) return;
        setDoc(pdf);
        const metas = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          metas.push({ w: vp.width, h: vp.height });
        }
        if (!cancelled) setPagesMeta(metas);
      } catch (err) {
        if (!cancelled) {
          console.error("[DocsCenter] Preview load error:", err);
          setError(err?.message || "Failed to load PDF");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [template, api, envelopeContext]);

  const setWrapRef = useCallback((node) => {
    wrapRef.current = node;
    if (!node) return;
    const updateWidth = () => {
      if (wrapRef.current) setContainerW(Math.max(320, wrapRef.current.clientWidth - 48));
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(node);
    if (wrapRef._ro) { try { wrapRef._ro.disconnect(); } catch {} }
    wrapRef._ro = ro;
  }, []);

  // Count admin vs student fields
  const adminFieldCount = fields.filter(f => f.recipientRole === 'admin').length;
  const studentFieldCount = fields.filter(f => f.recipientRole !== 'admin').length;

  if (error) return (
    <div className="preview-error">
      <FaExclamationTriangle />
      <p>{error}</p>
      <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="dsm-btn-ghost" onClick={() => window.location.reload()}>Retry</button>
      </div>
    </div>
  );

  if (loading) return <div className="preview-loading"><div className="dc-spinner" /><span>Loading PDF...</span></div>;
  if (!doc) return <div className="preview-loading">Initializing viewer...</div>;

  return (
    <div className="template-preview-container">
      <div className="preview-zoom-toolbar">
        <button onClick={() => setZoom(z => Math.max(0.25, z - 0.15))} title="Zoom Out"><FaSearchMinus /></button>
        <span className="zoom-val">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(3, z + 0.15))} title="Zoom In"><FaSearchPlus /></button>
        <div className="sep" />
        <button onClick={() => setZoom(1.0)} title="Fit to Width"><FaExpand /></button>
        {(adminFieldCount > 0 || studentFieldCount > 0) && (
          <>
            <div className="sep" />
            <div className="field-counts">
              {studentFieldCount > 0 && <span className="fc-tag student"><FaUser size={9} /> {studentFieldCount}</span>}
              {adminFieldCount > 0 && <span className="fc-tag admin"><FaShieldAlt size={9} /> {adminFieldCount}</span>}
            </div>
          </>
        )}
      </div>
      <div ref={setWrapRef} className="template-preview-scroll">
        {pagesMeta.map((meta, idx) => (
          <PreviewPage
            key={idx} doc={doc} pageNum={idx + 1}
            containerW={containerW} meta={meta} fields={fields}
            zoom={zoom}
            activeRole={envelopeContext?.previewRole}
          />
        ))}
      </div>
    </div>
  );
}

function EnvelopeDetailView({ envelope, templates, forms, onUpdate }) {
  const { api, user, setToast } = useApp();
  const [submitting, setSubmitting] = useState(false);
  const [submissionData, setSubmissionData] = useState(envelope.submissionData || {});

  const recipients = envelope?.recipients || [];
  const pendingStudents = useMemo(() => {
    return recipients.filter(r => isRecipientStudent(r) && r.status !== 'completed');
  }, [recipients]);

  const myAdminRecip = useMemo(() => {
    return recipients.find(r => 
      isRecipientAdmin(r) && 
      r.status !== 'completed' &&
      (user?.role?.toLowerCase() === 'admin' || String(r.userId) === String(user?.id))
    );
  }, [recipients, user]);

  const canAdminSignNow = pendingStudents.length === 0;

  const selectedItem = useMemo(() => {
    return envelope.kind === 'pdf' 
      ? templates.find(t => t.id === (envelope.templateId || envelope.id))
      : forms.find(f => f.id === (envelope.formId || envelope.id));
  }, [envelope, templates, forms]);

  const adminFields = useMemo(() => {
    return (selectedItem?.fields || []).filter(f => f.recipientRole === 'admin');
  }, [selectedItem]);

  const [previewRole, setPreviewRole] = useState(myAdminRecip && canAdminSignNow ? 'admin' : 'student');

  const handleAdminSubmit = async () => {
    const missing = adminFields.filter(f => f.required && !submissionData[f.name || f.id]);
    if (missing.length > 0) {
      setToast({ type: 'warn', text: `Required: ${missing.map(f => f.label || f.name).join(', ')}` });
      return;
    }

    setSubmitting(true);
    try {
      const updatedRecipients = envelope.recipients.map(r => 
        (r.id === myAdminRecip.id || (isRecipientAdmin(r) && (String(r.userId) === String(user?.id) || !r.userId))) 
          ? { ...r, status: 'completed' } 
          : r
      );
      
      const allDone = updatedRecipients.every(r => r.status === 'completed');
      const updatedEnvelope = {
        ...envelope,
        recipients: updatedRecipients,
        submissionData: { ...(envelope.submissionData || {}), ...submissionData },
        status: allDone ? 'completed' : 'partially_signed',
        updatedAt: Date.now()
      };

      await api.put('envelopes', updatedEnvelope);
      setToast("Your fields have been submitted.");
      if (onUpdate) onUpdate();
    } catch (err) {
      setToast({ type: 'error', text: "Failed to submit actions" });
    } finally {
      setSubmitting(false);
    }
  };

  const total = envelope?.recipients?.length || 0;
  const done = envelope?.recipients?.filter(r => r.status === 'completed').length || 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="envelope-detail-view">
      <div className="env-detail-header">
        <div className="env-progress-row">
          <div className="env-progress-meta">
            <div className="env-progress-title">Signing Progress</div>
            <div className="env-progress-sub">{done} of {total} recipients completed</div>
          </div>
          <div className="env-progress-bar">
            <div className="env-progress-fill" style={{ width: `${pct}%` }} />
            <span className="env-progress-pct">{pct}%</span>
          </div>
          {myAdminRecip && canAdminSignNow && (
            <button className="dsm-btn-primary" onClick={handleAdminSubmit} disabled={submitting}>
              <FaPenNib /> {submitting ? 'Submitting...' : 'Submit My Fields'}
            </button>
          )}
        </div>

        {recipients.length > 0 && (
          <div className="recip-status-grid">
            {recipients.map(r => {
              const isDone = r.status === 'completed';
              const isAdmin = isRecipientAdmin(r);
              return (
                <div key={r.id} className={`recip-status-card ${r.status || 'pending'}`}>
                  <div className={`recip-av ${isAdmin ? 'admin' : 'student'}`}>
                    {isAdmin ? <FaShieldAlt /> : <FaUser />}
                  </div>
                  <div className="recip-info">
                    <div className="name">{r.name || 'Unnamed'}</div>
                    <div className="role">{(r.role || (isAdmin ? 'admin' : 'student')).toUpperCase()}</div>
                  </div>
                  <div className={`status-badge ${isDone ? 'done' : 'pending'}`}>
                    {isDone ? <FaCheckCircle /> : <FaClock />}
                    <span>{(r.status || 'pending').toUpperCase()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {myAdminRecip && canAdminSignNow && previewRole === 'admin' && (
        <div className="admin-action-panel">
          <div className="aap-head">
            <FaShieldAlt /> <span>Your Required Admin Fields</span>
          </div>
          <div className="aap-body">
            {adminFields.map(f => (
              <PreviewField 
                key={f.id}
                field={f}
                value={submissionData[f.name || f.id]}
                role="admin"
                onChange={(val) => setSubmissionData(p => ({ ...p, [f.name || f.id]: val }))}
              />
            ))}
          </div>
        </div>
      )}

      {!canAdminSignNow && myAdminRecip && (
        <div className="admin-wait-notice">
          <FaClock />
          <span>Waiting for student signature(s) before you can fill admin fields.</span>
        </div>
      )}

      <div className="env-detail-preview">
        <div className="preview-label-bar env-preview-bar">
          <div className="plb-left">
            <FaEye /> <span>DOCUMENT PREVIEW</span>
            <span className="read-only-chip">{myAdminRecip && canAdminSignNow ? 'ACTIVE SIGNING' : 'READ ONLY'}</span>
          </div>
          <div className="role-toggle" role="tablist" aria-label="Perspective">
            <span
              className="role-toggle-thumb"
              style={{ transform: previewRole === 'admin' ? 'translateX(100%)' : 'translateX(0)' }}
              aria-hidden
            />
            <button
              role="tab"
              aria-selected={previewRole === 'student'}
              className={`rt-btn ${previewRole === 'student' ? 'active' : ''}`}
              onClick={() => setPreviewRole('student')}
            >
              <FaUser /> <span>Student</span>
            </button>
            <button
              role="tab"
              aria-selected={previewRole === 'admin'}
              className={`rt-btn ${previewRole === 'admin' ? 'active' : ''}`}
              onClick={() => setPreviewRole('admin')}
            >
              <FaShieldAlt /> <span>Admin</span>
            </button>
          </div>
        </div>

        <div className={`env-preview-body perspective-${previewRole}`}>
          {envelope.kind === 'pdf' ? (
            <TemplatePreview
              template={templates.find(t => t.id === (envelope.templateId || envelope.id))}
              envelopeContext={{ ...envelope, previewRole, submissionData }}
            />
          ) : (
            <FormPreview
              form={forms.find(f => f.id === (envelope.formId || envelope.id))}
              envelopeContext={{ ...envelope, previewRole, submissionData }}
              initialRole={previewRole}
              lockedRole={previewRole}
              onDataChange={setSubmissionData}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FormPreview({ form, envelopeContext = null, initialRole, lockedRole, submissionData, onDataChange }) {
  const [previewData, setPreviewData] = useState(submissionData || envelopeContext?.submissionData || {});

  useEffect(() => {
    if (submissionData) setPreviewData(submissionData);
  }, [submissionData]);

  const [previewRole, setPreviewRole] = useState(initialRole || 'student');

  // Sync with parent toggle when locked
  useEffect(() => {
    if (lockedRole) setPreviewRole(lockedRole);
  }, [lockedRole]);

  if (!form) return null;

  return (
    <div className="form-preview-wrap">
      {!lockedRole && (
        <header className="form-preview-header">
          <div className="compact-switcher dark">
            <button className={previewRole === 'student' ? 'active' : ''} onClick={() => setPreviewRole('student')} title="Student Perspective"><FaUser /></button>
            <button className={previewRole === 'admin' ? 'active' : ''} onClick={() => setPreviewRole('admin')} title="Admin Perspective"><FaShieldAlt /></button>
          </div>
          <p className="perspective-hint">Testing as: <strong>{previewRole.toUpperCase()}</strong></p>
        </header>
      )}
      <div className="preview-body">
        {form.fields?.map(f => {
          if (!evaluateLogic(f, previewData)) return null;
          return (
            <PreviewField
              key={f.id}
              field={f}
              value={previewData[f.name]}
              role={previewRole}
              onChange={(val) => {
                const next = { ...previewData, [f.name]: val };
                setPreviewData(next);
                onDataChange && onDataChange(next);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function PreviewField({ field, value, onChange, role }) {
  const isReserved = field.recipientRole && field.recipientRole !== role;
  const [showSigModal, setShowSigModal] = useState(false);
  const [sigName, setSigName] = useState('');

  if (field.type === 'heading') {
    const Level = `h${field.level || 1}`;
    return <div className="preview-field-row"><Level className="pv-heading">{field.label}</Level></div>;
  }
  if (field.type === 'divider') return <div className="preview-field-row"><hr className="pv-divider" /></div>;
  if (field.type === 'adminText') return <div className="preview-field-row"><div className="pv-text-block">{field.content}</div></div>;

  const renderInput = () => {
    const safeRole = (field.recipientRole || 'student').toUpperCase();
    switch (field.type) {
      case 'signature':
        return (
          <>
            <div className={`pv-sig-box ${value ? 'filled' : ''}`} onClick={() => !isReserved && setShowSigModal(true)}>
              {value ? (
                <>
                  <div className="pv-sig-display">{value}</div>
                  <div className="pv-sig-meta">Digitally Signed by {value} &bull; {new Date().toLocaleDateString()}</div>
                </>
              ) : (
                <>
                  <FaPenNib style={{ fontSize: '24px', marginBottom: '8px' }} />
                  <span>Click to Adopt Signature</span>
                </>
              )}
            </div>
            {showSigModal && (
              <div className="sig-modal-overlay" onClick={() => setShowSigModal(false)}>
                <div className="sig-modal" onClick={e => e.stopPropagation()}>
                  <h3>Adopt Signature ({safeRole})</h3>
                  <p>Type your full name exactly as it appears on official documents.</p>
                  <div className="sig-input-wrap">
                    <input autoFocus placeholder="Type your name..." value={sigName} onChange={e => setSigName(e.target.value)} />
                  </div>
                  <div className="sig-preview-box">
                    <div className="sig-preview-text">{sigName || 'Your Signature'}</div>
                  </div>
                  <div className="sig-actions">
                    <button className="dsm-btn-ghost" onClick={() => setShowSigModal(false)}>Cancel</button>
                    <button className="dsm-btn-primary" disabled={!sigName} onClick={() => { onChange(sigName); setShowSigModal(false); }}>Adopt and Sign</button>
                  </div>
                </div>
              </div>
            )}
          </>
        );
      case 'inlineText':
        return (
          <div className="pv-inline-text-wrap">
            {field.parts?.map((p, i) => (
              <React.Fragment key={i}>
                {p.t === 'text' ? <span>{p.v}</span> : (
                  <input className="pv-inline-field" placeholder={p.placeholder} disabled={isReserved}
                    value={value?.[p.name] || ''} onChange={e => onChange({ ...value, [p.name]: e.target.value })}
                    style={{ width: (p.placeholder?.length || 10) * 10 + 'px' }} />
                )}
              </React.Fragment>
            ))}
          </div>
        );
      case 'textarea':
        return <textarea className="pv-input" disabled={isReserved} rows={field.rows || 3} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} />;
      case 'select':
        return (
          <select className="pv-input" disabled={isReserved} value={value || ''} onChange={e => onChange(e.target.value)}>
            <option value="">Select...</option>
            {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      case 'radio':
        return (
          <div className="pv-radio-group">
            {field.options?.map(o => (
              <label key={o.value} className="pv-opt-label">
                <input type="radio" disabled={isReserved} name={field.id} checked={value === o.value} onChange={() => onChange(o.value)} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        );
      case 'checkbox':
        return (
          <div className="pv-checkbox-group">
            <label className="pv-opt-label">
              <input type="checkbox" disabled={isReserved} checked={!!value} onChange={e => onChange(e.target.checked)} />
              <span>{field.placeholder || 'Confirm / Accept'}</span>
            </label>
          </div>
        );
      case 'multiselect':
        const selected = Array.isArray(value) ? value : [];
        return (
          <div className="pv-checkbox-group">
            {field.options?.map(o => (
              <label key={o.value} className="pv-opt-label">
                <input type="checkbox" disabled={isReserved} checked={selected.includes(o.value)}
                  onChange={() => onChange(selected.includes(o.value) ? selected.filter(v => v !== o.value) : [...selected, o.value])} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        );
      case 'date':
        return <input className="pv-input" disabled={isReserved} type="date" value={value || ''} onChange={e => onChange(e.target.value)} />;
      case 'number':
        return <input className="pv-input" disabled={isReserved} type="number" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} />;
      case 'rating':
        return (
          <div className="pv-rating" style={{ pointerEvents: isReserved ? 'none' : 'auto' }}>
            {[1, 2, 3, 4, 5].map(star => (
              <FaStar key={star} className={star <= (value || 0) ? 'active' : ''} onClick={() => onChange(star)} />
            ))}
          </div>
        );
      default:
        return <input className="pv-input" disabled={isReserved} type="text" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} />;
    }
  };

  return (
    <div className={`preview-field-row ${field.width || 'full'} ${isReserved ? 'disabled' : ''}`} data-recipient={field.recipientRole || 'student'}>
      {field.type !== 'inlineText' && <label className="pv-label">{field.label}{field.required && ' *'}</label>}
      {renderInput()}
    </div>
  );
}

function SubmissionDetailView({ data, onUpdate }) {
  const { api, setToast } = useApp();
  const { submission, form } = data;
  const [submitting, setSubmitting] = useState(false);
  const [submissionData, setSubmissionData] = useState(submission.submissionData || submission.data || {});

  const adminFields = useMemo(() => {
    return (form?.fields || []).filter(f => f.recipientRole === 'admin');
  }, [form]);

  const handleAdminSubmit = async () => {
    const missing = adminFields.filter(f => f.required && !submissionData[f.name]);
    if (missing.length > 0) {
      setToast({ type: 'warn', text: `Required: ${missing.map(f => f.label || f.name).join(', ')}` });
      return;
    }

    setSubmitting(true);
    try {
      const updatedSubmission = {
        ...submission,
        submissionData: { ...(submission.submissionData || {}), ...submissionData },
        updatedAt: Date.now()
      };
      await api.put('formSubmissions', updatedSubmission);
      setToast("Admin signatures saved.");
      if (onUpdate) onUpdate();
    } catch (err) {
      setToast({ type: 'error', text: "Failed to save signatures" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="submission-detail-view">
      <div className="sub-meta-bar">
        <div className="smb-info">
          <div className="label">Submitted By</div>
          <div className="value">{submission.submitterName || "Anonymous"}</div>
        </div>
        <div className="smb-info">
          <div className="label">Submitted At</div>
          <div className="value">{new Date(submission.submittedAt).toLocaleString()}</div>
        </div>
        {adminFields.length > 0 && (
          <button className="dsm-btn-primary" onClick={handleAdminSubmit} disabled={submitting}>
            <FaCheckCircle /> {submitting ? 'Saving...' : 'Save Admin Signatures'}
          </button>
        )}
      </div>

      {adminFields.length > 0 && (
        <div className="admin-action-panel">
          <div className="aap-head">
            <FaShieldAlt /> <span>Admin Verification Fields</span>
          </div>
          <div className="aap-body">
            {adminFields.map(f => (
              <PreviewField 
                key={f.id}
                field={f}
                value={submissionData[f.name]}
                role="admin"
                onChange={(val) => setSubmissionData(p => ({ ...p, [f.name]: val }))}
              />
            ))}
          </div>
        </div>
      )}

      <div className="submission-content-grid">
        <div className="plb-left" style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>
          <FaFileAlt /> <span>SUBMITTED DATA</span>
        </div>
        <div className="sub-fields-viewer">
          {Object.entries(submission.submissionData || submission.data || {}).map(([k, v]) => {
            const fieldDef = form?.fields?.find(f => f.name === k);
            if (fieldDef?.recipientRole === 'admin') return null;
            return (
              <div key={k} className="sub-field">
                <label>{fieldDef?.label || k}</label>
                <div className="sub-value">{typeof v === "object" ? JSON.stringify(v) : String(v)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ========== MAIN COMPONENT ========== */
export default function DocsCenter() {
  const navigate = useNavigate();
  const location = useLocation();
  const { api, setToast, data, user } = useApp();

  const [mode, setMode] = useState(location.state?.openMode || "send");
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [forms, setForms] = useState([]);
  const [students, setStudents] = useState([]);
  const [envelopes, setEnvelopes] = useState([]);
  const [submissions, setSubmissions] = useState([]);

  // Selection State
  const [selectedKind, setSelectedKind] = useState('pdf');
  const [selectedId, setSelectedId] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState(new Set());
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [previewVisible, setPreviewVisible] = useState(false);

  // Library State
  const [libraryFilter, setLibraryFilter] = useState("all");
  const [librarySearch, setLibrarySearch] = useState("");
  const [previewItem, setPreviewItem] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteModal, setDeleteModal] = useState({ open: false, items: [] });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      setSelectedIds(new Set());
      const [tpls, stdz, frms, envs, subs] = await Promise.all([
        api.getAll("pdfTemplates").catch(() => []),
        api.getAll("students").catch(() => []),
        api.getAll("forms").catch(() => []),
        api.getAll("envelopes").catch(() => []),
        api.getAll("formSubmissions").catch(() => []),
      ]);
      setTemplates(Array.isArray(tpls) ? tpls : []);
      setStudents((Array.isArray(stdz) ? stdz : []).filter(s => !s.archived));
      setForms((Array.isArray(frms) ? frms : []).filter(f => f.status === 'active'));
      setEnvelopes(Array.isArray(envs) ? envs : []);
      setSubmissions(Array.isArray(subs) ? subs : []);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { loadData(); }, [loadData]);

  const getAdminFields = useCallback((item, kind) => {
    if (kind === 'pdf') return (item?.fields || []).filter(f => f.recipientRole === 'admin');
    if (kind === 'form') return (item?.fields || []).filter(f => f.recipientRole === 'admin');
    return [];
  }, []);

  const selectedItem = selectedKind === 'pdf' ? templates.find(t => t.id === selectedId) : forms.find(f => f.id === selectedId);
  const selectedAdminFields = selectedItem ? getAdminFields(selectedItem, selectedKind) : [];
  const hasAdminFields = selectedAdminFields.length > 0;

  const filteredStudents = useMemo(() => {
    const q = searchQ.toLowerCase();
    return students.filter(s => `${s.firstName} ${s.lastName} ${s.email} ${s.username}`.toLowerCase().includes(q));
  }, [students, searchQ]);

  const toggleSelection = (kind, id) => {
    const key = `${kind}:${id}`;
    const next = new Set(selectedIds);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelectedIds(next);
  };

  const handleBulkDeleteReq = () => {
    const itemsToDelete = [];
    selectedIds.forEach(key => {
      const [kind, id] = key.split(':');
      const data = kind === 'pdf' ? templates.find(t => t.id === id) : forms.find(f => f.id === id);
      if (data) itemsToDelete.push({ id, kind, name: data.name || data.title || 'Untitled' });
    });
    if (itemsToDelete.length > 0) setDeleteModal({ open: true, items: itemsToDelete });
  };

  const executeDelete = async () => {
    const { items } = deleteModal;
    setLoading(true);
    try {
      await Promise.all(items.map(item => api.del(item.kind === 'pdf' ? 'pdfTemplates' : 'forms', item.id)));
      setToast(`${items.length} item(s) deleted successfully`);
      setSelectedIds(new Set());
      setDeleteModal({ open: false, items: [] });
      loadData();
    } catch {
      setToast({ type: "error", text: "Failed to delete some items" });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTemplate = (id) => {
    const t = templates.find(x => x.id === id);
    setDeleteModal({ open: true, items: [{ id, kind: 'pdf', name: t?.name || 'Template' }] });
  };

  const handleDeleteForm = (id) => {
    const f = forms.find(x => x.id === id);
    setDeleteModal({ open: true, items: [{ id, kind: 'form', name: f?.title || 'Form' }] });
  };

  const handleDeleteEnvelope = async (id) => {
    if (!window.confirm("Permanently delete this envelope?")) return;
    try {
      await api.del("envelopes", id);
      setEnvelopes(prev => prev.filter(e => e.id !== id));
      setToast("Envelope deleted successfully");
    } catch {
      setToast({ type: 'error', text: "Failed to delete envelope" });
    }
  };

  const handleDeleteSubmission = async (id) => {
    if (!window.confirm("Permanently delete this submission?")) return;
    try {
      await api.del("formSubmissions", id);
      setSubmissions(prev => prev.filter(s => s.id !== id));
      setToast("Submission deleted successfully");
    } catch {
      setToast({ type: 'error', text: "Failed to delete submission" });
    }
  };

  const handleSend = async () => {
    if (!selectedId || selectedRecipients.size === 0) return setToast("Select a template and at least one student.");
    const isForm = selectedKind === 'form';
    const recips = students.filter(s => selectedRecipients.has(s.id)).map(s => ({
      id: s.id, studentId: s.id, name: `${s.firstName} ${s.lastName}`, email: s.email, status: 'pending', role: 'student'
    }));

    if (hasAdminFields && user) {
      recips.push({
        id: `admin_${Date.now()}`,
        userId: user.id,
        name: user.name || 'Administrator',
        email: user.email,
        role: 'admin',
        status: 'pending'
      });
    }

    const envelope = {
      id: `env_${Date.now()}`,
      [isForm ? 'formId' : 'templateId']: selectedId,
      kind: selectedKind,
      recipients: recips,
      subject: subject || (isForm ? "Form to complete" : "Document to sign"),
      message,
      status: "queued",
      createdAt: Date.now(),
      sentBy: user?.id || 'admin',
      adminFieldCount: selectedAdminFields.length
    };

    await api.add("envelopes", envelope);

    if (hasAdminFields && user) {
      await api.add("notifications", {
        id: `notif-admin-fields-${Date.now()}`,
        to: user.id,
        from: 'system',
        title: "Admin Fields Required",
        text: `${selectedAdminFields.length} admin field(s) need your input on "${subject || (isForm ? 'Form' : 'Document')}"`,
        type: "admin_action",
        link: "/admin/docs-center",
        read: false,
        createdAt: Date.now()
      });
    }

    setToast("Envelope queued for delivery");
    setMode("track");
    loadData();
  };

  const handleDownloadSubmission = (sub, form) => {
    const data = JSON.stringify({
      form: form?.title,
      submittedBy: sub.submitterName,
      submittedAt: new Date(sub.submittedAt).toLocaleString(),
      data: sub.submissionData || sub.data
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `submission_${(form?.title || 'form').replace(/\s+/g, '_')}_${sub.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setToast("Submission data exported");
  };

  const handleDownloadEnvelope = (env) => {
    if (!env.lastPdfUrl) return setToast({ type: 'warn', text: "Final document not generated yet." });
    const link = document.createElement('a');
    link.href = normalizeStorageUrl(env.lastPdfUrl);
    link.target = "_blank";
    link.download = `${(env.subject || 'document').replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setToast("Document download triggered");
  };

  const allSubmissions = useMemo(() => {
    const list = [];
    
    // 1. Regular form submissions (Standalone)
    submissions.forEach(sub => {
      const form = forms.find(f => f.id === sub.formId);
      list.push({
        type: 'form_submission',
        id: sub.id,
        subject: form?.title || "Form Submission",
        at: sub.submittedAt,
        submitter: sub.submitterName || "Anonymous",
        item: sub,
        form
      });
    });

    // 2. Submitted Envelopes (where all students are done)
    envelopes.forEach(env => {
      const studentsPending = env.recipients?.some(r => isRecipientStudent(r) && r.status !== 'completed');
      const hasStudentSigned = env.recipients?.some(r => isRecipientStudent(r) && r.status === 'completed');
      
      if (!studentsPending && hasStudentSigned) {
        list.push({
          type: 'envelope_submission',
          id: env.id,
          subject: env.subject,
          at: env.updatedAt || env.createdAt,
          submitter: env.recipients?.filter(r => isRecipientStudent(r)).map(r => r.name).join(', '),
          item: env
        });
      }
    });

    return list.sort((a, b) => b.at - a.at);
  }, [submissions, envelopes, forms]);

  const pendingAdminActions = useMemo(() => {
    const actions = [];
    envelopes.forEach(env => {
      const adminRecip = env.recipients?.find(r => (isRecipientAdmin(r) || r.userId === user?.id) && r.status === 'pending');
      const studentsPending = env.recipients?.some(r => isRecipientStudent(r) && r.status !== 'completed');
      if (adminRecip && !studentsPending) actions.push({ type: 'envelope', id: env.id, subject: env.subject, kind: env.kind, count: env.adminFieldCount || 0 });
    });
    submissions.forEach(sub => {
      const form = forms.find(f => f.id === sub.formId);
      const adminFields = form?.fields?.filter(f => f.recipientRole === 'admin') || [];
      const subData = sub.submissionData || sub.data || {};
      const unsigned = adminFields.filter(f => !subData[f.name]);
      if (unsigned.length > 0) actions.push({ type: 'submission', id: sub.id, subject: form?.title || 'Form', count: unsigned.length });
    });
    return actions;
  }, [envelopes, submissions, forms, user]);

  return (
    <section className="docs-page fade-in">
      <style>{DOCS_CSS}</style>

      <header className="docs-header">
        <div>
          <h1 className="docs-title">Docs Center</h1>
          <p className="docs-subtitle">Manage automated forms and PDF signing workflows.</p>
        </div>
        <div className="docs-nav-tabs">
          <button className={mode === "library" ? "active" : ""} onClick={() => setMode("library")}>
            <FaLayerGroup /> Library
          </button>
          <button className={mode === "send" ? "active" : ""} onClick={() => setMode("send")}>
            <FaPaperPlane /> Send
          </button>
          <button className={mode === "track" ? "active" : ""} onClick={() => setMode("track")}>
            <FaHistory /> Tracking
            {pendingAdminActions.filter(a => a.type === 'envelope').length > 0 && (
              <span className="tab-badge">{pendingAdminActions.filter(a => a.type === 'envelope').length}</span>
            )}
          </button>
          <button className={mode === "form-subs" ? "active" : ""} onClick={() => setMode("form-subs")}>
            <FaClipboardList /> Submissions
            {pendingAdminActions.filter(a => a.type === 'submission').length > 0 && (
              <span className="tab-badge">{pendingAdminActions.filter(a => a.type === 'submission').length}</span>
            )}
          </button>
          <button onClick={() => navigate("/admin/pdf-editor")}>
            <FaEdit /> PDF Editor
          </button>
        </div>
      </header>

      {/* ── Send Mode ── */}
      {mode === "send" && (
        <div className="docs-workspace">
          <div className="docs-builder">
            <div className="docs-card">
              <div className="card-head">
                <h3><FaPaperPlane /> Create New Envelope</h3>
              </div>
              <div className="builder-form">
                <div className="form-group">
                  <div className="label-row" style={{ marginBottom: '8px' }}>
                    <label>Document Source</label>
                    {selectedId && (
                      <button className={`dsm-btn-ghost sm prominent-preview ${previewVisible ? 'active' : ''}`} onClick={() => setPreviewVisible(!previewVisible)}>
                        <FaEye /> {previewVisible ? 'Hide Preview' : 'Show Preview'}
                      </button>
                    )}
                  </div>
                  <select value={`${selectedKind}:${selectedId}`} onChange={e => {
                    const [k, id] = e.target.value.split(':');
                    setSelectedKind(k); setSelectedId(id);
                    if (id) setPreviewVisible(true);
                  }}>
                    <option value="pdf:">Select a Template...</option>
                    <optgroup label="PDF Templates">
                      {templates.map(t => {
                        const af = getAdminFields(t, 'pdf').length;
                        return <option key={t.id} value={`pdf:${t.id}`}>PDF {af > 0 ? `[${af} admin]` : ''} {t.name}</option>;
                      })}
                    </optgroup>
                    <optgroup label="Web Forms">
                      {forms.map(f => {
                        const af = getAdminFields(f, 'form').length;
                        return <option key={f.id} value={`form:${f.id}`}>Form {af > 0 ? `[${af} admin]` : ''} {f.title}</option>;
                      })}
                    </optgroup>
                  </select>
                </div>
                <div className="form-group">
                  <label>Subject Line</label>
                  <input placeholder="e.g. Admissions Agreement" value={subject} onChange={e => setSubject(e.target.value)} />
                </div>

                {hasAdminFields && (
                  <div className="form-group wide">
                    <div className="admin-fields-notice">
                      <div className="afn-icon"><FaShieldAlt /></div>
                      <div className="afn-text">
                        <strong>{selectedAdminFields.length} Admin Field{selectedAdminFields.length > 1 ? 's' : ''} Detected</strong>
                        <span>You will be automatically added as a signer.</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="form-group wide">
                  <label>Message to Recipients</label>
                  <textarea rows={3} placeholder="Add instructions..." value={message} onChange={e => setMessage(e.target.value)} />
                </div>
              </div>

              {/* Integrated Inline Preview (Vertical Scroll) */}
              {selectedId && previewVisible && (
                <div className="inline-preview-wrap">
                  <header className="preview-label-bar">
                    <div className="title-info">
                      <FaEye /> 
                      <span>Live Document Preview</span>
                    </div>
                    <div className="preview-actions">
                      <button className="dsm-btn-primary sm expand-preview-btn" onClick={() => setPreviewItem({ kind: selectedKind, data: selectedItem })} title="View Full Screen">
                        <FaExpand /> Full Screen Preview
                      </button>
                      <button className="collapse-btn" onClick={() => setPreviewVisible(false)} title="Hide Preview">
                        <FaTimes /> Hide
                      </button>
                    </div>
                  </header>
                  <div className="preview-scroll-area">
                    {selectedKind === 'pdf' ? (
                      <TemplatePreview template={templates.find(t => t.id === selectedId)} onDelete={handleDeleteTemplate} />
                    ) : (
                      <FormPreview form={forms.find(f => f.id === selectedId)} />
                    )}
                  </div>
                </div>
              )}

              <div className="builder-footer">
                <button className="dsm-btn-primary" onClick={handleSend} disabled={!selectedId || selectedRecipients.size === 0}>
                  <FaPaperPlane /> Send to {selectedRecipients.size} Student{selectedRecipients.size !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>

          <div className="docs-recipients">
            <div className="docs-card">
              <div className="card-head">
                <h3><FaUsers /> Recipient List</h3>
                <div className="search-mini">
                  <FaSearch />
                  <input placeholder="Filter students..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
                </div>
              </div>
              <div className="recipient-table">
                {filteredStudents.map(s => (
                  <div key={s.id} className={`recipient-row ${selectedRecipients.has(s.id) ? 'selected' : ''}`} onClick={() => {
                    const next = new Set(selectedRecipients);
                    next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                    setSelectedRecipients(next);
                  }}>
                    <div className="check-box">{selectedRecipients.has(s.id) && <FaCheckCircle />}</div>
                    <div className="info">
                      <div className="name">{s.firstName} {s.lastName}</div>
                      <div className="username">@{s.username || 'user'}</div>
                      <div className="meta">{s.email || 'No email'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Library Mode ── */}
      {mode === "library" && (
        <div className="docs-card library-card">
          <div className="card-head">
            <h3><FaLayerGroup /> Document Library</h3>
            <div className="library-tools">
              {selectedIds.size > 0 && (
                <button className="dsm-btn-ghost" style={{ color: '#ef4444', borderColor: '#ef4444' }} onClick={handleBulkDeleteReq}>
                  <FaTrash /> Delete ({selectedIds.size})
                </button>
              )}
              <div className="search-mini">
                <FaSearch />
                <input placeholder="Search library..." value={librarySearch} onChange={e => setLibrarySearch(e.target.value)} />
              </div>
              <div className="lib-filter">
                {["all", "pdf", "form"].map(f => (
                  <button key={f} className={libraryFilter === f ? "active" : ""} onClick={() => setLibraryFilter(f)}>
                    {f === "all" ? "All" : f === "pdf" ? "PDFs" : "Forms"}
                  </button>
                ))}
              </div>
              <button className="dsm-btn-ghost icon-only" onClick={loadData} title="Refresh"><FaSync /></button>
            </div>
          </div>
          <div className="library-grid">
            {loading && <div className="lib-empty"><div className="dc-spinner" /><span>Loading library...</span></div>}

            {!loading && (libraryFilter === "all" || libraryFilter === "pdf") && templates
              .filter(t => (t.name || "").toLowerCase().includes(librarySearch.toLowerCase()))
              .map(t => {
                const adminFields = getAdminFields(t, 'pdf');
                return (
                  <div key={`pdf-${t.id}`} className={`lib-card ${selectedIds.has(`pdf:${t.id}`) ? 'selected' : ''}`} onClick={() => toggleSelection('pdf', t.id)}>
                    <div className="lib-select-check">
                      <div className={`check-box ${selectedIds.has(`pdf:${t.id}`) ? 'checked' : ''}`}>
                        {selectedIds.has(`pdf:${t.id}`) && <FaCheckCircle />}
                      </div>
                    </div>
                    <div className="lib-thumb pdf">
                      <FaFilePdf />
                      {adminFields.length > 0 && <span className="lib-admin-badge"><FaShieldAlt /> {adminFields.length}</span>}
                    </div>
                    <div className="lib-meta">
                      <div className="lib-title">{t.name || "Untitled PDF"}</div>
                      <div className="lib-sub">
                        <span className="lib-badge pdf">PDF</span>
                        <span>{t.numPages || 1} page{(t.numPages || 1) !== 1 ? "s" : ""}</span>
                        <span>{(t.fields || []).length} fields</span>
                        {t.createdAt && <span>{new Date(t.createdAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <div className="lib-actions" onClick={e => e.stopPropagation()}>
                      <button title="Preview" onClick={(e) => { e.stopPropagation(); setPreviewItem({ kind: "pdf", data: t }); }}><FaEye /></button>
                      <button title="Edit" onClick={(e) => { e.stopPropagation(); navigate("/admin/template-studio", { state: { templateId: t.id } }); }}><FaEdit /></button>
                      <button title="Send" onClick={(e) => { e.stopPropagation(); setSelectedKind("pdf"); setSelectedId(t.id); setMode("send"); setPreviewVisible(true); }}><FaPaperPlane /></button>
                      <button title="Delete" className="del-btn" onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t.id); }}><FaTrash /></button>
                    </div>
                  </div>
                );
              })}

            {!loading && (libraryFilter === "all" || libraryFilter === "form") && forms
              .filter(f => (f.title || "").toLowerCase().includes(librarySearch.toLowerCase()) || (f.description || "").toLowerCase().includes(librarySearch.toLowerCase()))
              .map(f => {
                const adminFields = getAdminFields(f, 'form');
                return (
                  <div key={`form-${f.id}`} className={`lib-card ${selectedIds.has(`form:${f.id}`) ? 'selected' : ''}`} onClick={() => toggleSelection('form', f.id)}>
                    <div className="lib-select-check">
                      <div className={`check-box ${selectedIds.has(`form:${f.id}`) ? 'checked' : ''}`}>
                        {selectedIds.has(`form:${f.id}`) && <FaCheckCircle />}
                      </div>
                    </div>
                    <div className="lib-thumb form">
                      <FaWpforms />
                      {adminFields.length > 0 && <span className="lib-admin-badge"><FaShieldAlt /> {adminFields.length}</span>}
                    </div>
                    <div className="lib-meta">
                      <div className="lib-title">{f.title || "Untitled Form"}</div>
                      <div className="lib-sub">
                        <span className="lib-badge form">Form</span>
                        <span>{(f.fields || []).length} field{(f.fields || []).length !== 1 ? "s" : ""}</span>
                        {f.status && <span>{f.status}</span>}
                      </div>
                      {f.description && <div className="lib-desc">{f.description}</div>}
                    </div>
                    <div className="lib-actions" onClick={e => e.stopPropagation()}>
                      <button title="Preview" onClick={(e) => { e.stopPropagation(); setPreviewItem({ kind: "form", data: f }); }}><FaEye /></button>
                      <button title="Edit" onClick={(e) => { e.stopPropagation(); navigate(`/admin/form-builder?id=${f.id}`); }}><FaEdit /></button>
                      <button title="Open" onClick={(e) => { e.stopPropagation(); window.open(`/form/${f.id}`, "_blank"); }}><FaExternalLinkAlt /></button>
                      <button title="Delete" className="del-btn" onClick={(e) => { e.stopPropagation(); handleDeleteForm(f.id); }}><FaTrash /></button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Submissions Mode ── */}
      {mode === "form-subs" && (
        <div className="docs-card tracking-card">
          <div className="card-head">
            <h3><FaClipboardList /> Form & Document Submissions</h3>
            <button className="dsm-btn-ghost sm" onClick={loadData}><FaSync /> Refresh</button>
          </div>
          <div className="tracking-list">
            {allSubmissions.length === 0 && <div className="lib-empty">No submissions yet.</div>}
            {allSubmissions.map(item => {
              if (item.type === 'form_submission') {
                const sub = item.item;
                const form = item.form;
                const subData = sub.submissionData || sub.data || {};
                const adminFields = form?.fields?.filter(f => f.recipientRole === 'admin') || [];
                const adminSignedCount = adminFields.filter(f => !!subData[f.name]).length;
                const adminPending = adminFields.length - adminSignedCount;

                return (
                  <div key={item.id} className="env-item">
                    <div className="env-main">
                      <div className={`env-icon ${adminPending > 0 ? 'pulse-orange' : ''}`}><FaWpforms /></div>
                      <div className="env-info">
                        <div className="subject">{item.subject}</div>
                        <div className="date">{item.submitter} &bull; {new Date(item.at).toLocaleString()}</div>
                        {adminFields.length > 0 && (
                          <div className={`admin-sig-status ${adminPending > 0 ? 'pending' : 'complete'}`}>
                            <FaShieldAlt />
                            <span>Admin: <strong>{adminSignedCount}/{adminFields.length}</strong> {adminPending > 0 ? 'fields pending' : 'complete'}</span>
                          </div>
                        )}
                      </div>
                      <div className="env-stats">
                        <div className="progress-text">{Object.keys(subData).length} fields submitted</div>
                      </div>
                      <div className="env-actions">
                        <button className="row-btn" title="View" onClick={() => setPreviewItem({ kind: "submission", data: { submission: sub, form } })}><FaEye /></button>
                        {adminPending === 0 && (
                          <button className="row-btn save" title="Save / Download" onClick={() => handleDownloadSubmission(sub, form)}><FaDownload /></button>
                        )}
                        <button className="row-btn del" title="Delete" onClick={() => handleDeleteSubmission(sub.id)}><FaTrash /></button>
                      </div>
                    </div>
                  </div>
                );
              } else {
                // Envelope Submission
                const env = item.item;
                const done = env.recipients?.filter(r => r.status === 'completed').length || 0;
                const total = env.recipients?.length || 0;
                const adminRecip = env.recipients?.find(r => r.role === 'admin' || r.userId === user?.id);
                const needsYourSig = adminRecip && adminRecip.status === 'pending';

                return (
                  <div key={item.id} className={`env-item ${needsYourSig ? 'needs-action' : ''}`}>
                    <div className="env-main">
                      <div className={`env-icon ${needsYourSig ? 'pulse-orange' : ''}`}>
                        {env.kind === 'pdf' ? <FaFilePdf /> : <FaWpforms />}
                      </div>
                      <div className="env-info">
                        <div className="subject">{item.subject}</div>
                        <div className="student-names"><FaUsers /> {item.submitter}</div>
                        <div className="date">{new Date(item.at).toLocaleString()}</div>
                        {needsYourSig && (
                          <div className="needs-sig-badge">
                            <FaShieldAlt />
                            <span>Ready for Admin Signature</span>
                          </div>
                        )}
                      </div>
                      <div className="env-stats">
                        <div className="progress-text">{done} / {total} Completed</div>
                        <div className="progress-bar"><div className="fill" style={{ width: `${total > 0 ? (done/total)*100 : 0}%` }} /></div>
                      </div>
                      <div className="env-actions">
                        <button className="row-btn" title="Details" onClick={() => setPreviewItem({ kind: 'envelope', data: env })}><FaEye /></button>
                        {done === total && (
                          <button className="row-btn save" title="Save / Download" onClick={() => handleDownloadEnvelope(env)}><FaDownload /></button>
                        )}
                        <button className="row-btn del" title="Delete" onClick={() => handleDeleteEnvelope(env.id)}><FaTrash /></button>
                      </div>
                    </div>
                  </div>
                );
              }
            })}
          </div>
        </div>
      )}

      {/* ── Tracking Mode ── */}
      {mode === "track" && (
        <div className="docs-card tracking-card">
          <div className="card-head">
            <h3><FaHistory /> Active Envelopes</h3>
            <button className="dsm-btn-ghost sm" onClick={loadData}><FaSync /> Refresh</button>
          </div>
          <div className="tracking-list">
            {envelopes.length === 0 && <div className="lib-empty">No active envelopes.</div>}
            {envelopes.map(env => {
              const done = env.recipients?.filter(r => r.status === 'completed').length || 0;
              const total = env.recipients?.length || 0;
              const adminRecip = env.recipients?.find(r => isRecipientAdmin(r) || r.userId === user?.id);
              const studentsPending = env.recipients?.some(r => isRecipientStudent(r) && r.status !== 'completed');
              const needsYourSig = adminRecip && adminRecip.status === 'pending' && !studentsPending;
              const studentNames = env.recipients?.filter(r => isRecipientStudent(r)).map(r => r.name).join(', ');

              return (
                <div key={env.id} className={`env-item ${needsYourSig ? 'needs-action' : ''}`}>
                  <div className="env-main">
                    <div className={`env-icon ${needsYourSig ? 'pulse-orange' : ''}`}>
                      {env.kind === 'pdf' ? <FaFilePdf /> : <FaWpforms />}
                    </div>
                    <div className="env-info">
                      <div className="subject">{env.subject}</div>
                      <div className="student-names"><FaUsers /> {studentNames || 'No students assigned'}</div>
                      <div className="date">{new Date(env.createdAt).toLocaleString()}</div>
                      {needsYourSig && (
                        <div className="needs-sig-badge">
                          <FaShieldAlt />
                          <span>{env.adminFieldCount || 'Admin'} field{(env.adminFieldCount || 0) > 1 ? 's' : ''} awaiting your input</span>
                        </div>
                      )}
                    </div>
                    <div className="env-stats">
                      <div className="progress-text">{done} / {total} Completed</div>
                      <div className="progress-bar"><div className="fill" style={{ width: `${total > 0 ? (done/total)*100 : 0}%` }} /></div>
                    </div>
                    <div className="env-actions">
                      <button className="row-btn del" title="Delete" onClick={() => handleDeleteEnvelope(env.id)}><FaTrash /></button>
                      <button className="row-btn" title="Details" onClick={() => setPreviewItem({ kind: 'envelope', data: env })}><FaChevronRight /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Modal Area ── */}
      {previewItem && (
        <div className="docs-modal-overlay" onClick={(e) => e.target.className === "docs-modal-overlay" && setPreviewItem(null)}>
          <div className="docs-modal">
            <header className="docs-modal-head">
              <h3>
                {previewItem.kind === "pdf" && <><FaFilePdf /> <span>{previewItem.data.name}</span></>}
                {previewItem.kind === "form" && <><FaWpforms /> <span>{previewItem.data.title || "Form"}</span></>}
                {previewItem.kind === "submission" && <><FaClipboardList /> <span>Submission &bull; {previewItem.data.form?.title || "Form"}</span></>}
                {previewItem.kind === "envelope" && <><FaHistory /> <span>{previewItem.data.subject}</span></>}
              </h3>
              <button className="close-btn" onClick={() => setPreviewItem(null)}><FaTimes /></button>
            </header>
            <div className="docs-modal-body">
              {previewItem.kind === "pdf" && <TemplatePreview template={previewItem.data} onDelete={async (id) => { await handleDeleteTemplate(id); setPreviewItem(null); }} />}
              {previewItem.kind === "form" && <FormPreview form={previewItem.data} />}
              {previewItem.kind === "submission" && (
                <SubmissionDetailView data={previewItem.data} onUpdate={() => { setPreviewItem(null); loadData(); }} />
              )}
              {previewItem.kind === "envelope" && (
                <EnvelopeDetailView
                  envelope={previewItem.data}
                  templates={templates}
                  forms={forms}
                  onUpdate={() => { setPreviewItem(null); loadData(); }}
                />
              )}
            </div>
            <footer className="docs-modal-foot">
              <button className="dsm-btn-ghost" onClick={() => setPreviewItem(null)}>Close</button>
            </footer>
          </div>
        </div>
      )}

      {deleteModal.open && (
        <div className="docs-modal-overlay">
          <div className="docs-modal delete-confirm-modal">
            <div className="warn-icon"><FaExclamationTriangle /></div>
            <h2>Confirm Deletion</h2>
            <p>Are you sure you want to permanently delete these <strong>{deleteModal.items.length}</strong> item(s)?</p>
            <div className="items-list">
              {deleteModal.items.map(item => (
                <div key={`${item.kind}-${item.id}`} className="item-entry">
                  {item.kind === 'pdf' ? <FaFilePdf /> : <FaWpforms />}
                  <span>{item.name}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button className="dsm-btn-ghost" onClick={() => setDeleteModal({ open: false, items: [] })}>Cancel</button>
              <button className="dsm-btn-primary" style={{ background: '#ef4444', borderColor: '#ef4444' }} onClick={executeDelete}>Confirm Delete</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const DOCS_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400..700&display=swap');

  .docs-page { min-height: 100%; display: flex; flex-direction: column; width: 100%; }
  .docs-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; padding: 0 4px; flex-wrap: wrap; gap: 16px; }
  .docs-title { font-size: 26px; font-weight: 800; margin: 0; letter-spacing: -0.5px; }
  .docs-subtitle { color: var(--text-muted); margin: 4px 0 0; font-size: 14px; font-weight: 500; }

  .docs-nav-tabs { display: flex; background: var(--bg); padding: 4px; border-radius: 14px; gap: 2px; flex-wrap: wrap; }
  .docs-nav-tabs button {
    display: flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 10px;
    font-size: 13px; font-weight: 700; color: var(--text-muted); transition: 0.2s;
    border: none; cursor: pointer; background: transparent; white-space: nowrap; position: relative;
  }
  .docs-nav-tabs button:hover { color: var(--text); background: rgba(0,0,0,0.03); }
  .docs-nav-tabs button.active { background: var(--surface); color: var(--primary); box-shadow: var(--shadow); }
  .tab-badge {
    position: absolute; top: 4px; right: 4px;
    min-width: 18px; height: 18px; border-radius: 9px;
    background: #ef4444; color: #fff; font-size: 10px; font-weight: 800;
    display: grid; place-items: center; padding: 0 4px;
  }

  .docs-workspace { display: grid; grid-template-columns: 1fr 340px; gap: 24px; flex: 1; }
  .docs-builder { display: flex; flex-direction: column; gap: 24px; padding-bottom: 24px; }

  .docs-card { background: var(--surface); border-radius: 20px; border: 1px solid var(--border); box-shadow: var(--shadow); display: flex; flex-direction: column; height: fit-content; }
  .card-head { padding: 20px 28px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .card-head h3 { font-size: 15px; font-weight: 800; margin: 0; display: flex; align-items: center; gap: 10px; white-space: nowrap; }

  .builder-form { padding: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .form-group { display: flex; flex-direction: column; gap: 8px; }
  .form-group.wide { grid-column: 1 / -1; }
  .form-group label { font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px; }
  .form-group input, .form-group select, .form-group textarea {
    padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border);
    background: var(--bg); font-weight: 600; font-size: 14px; outline: none; transition: 0.2s; color: var(--text);
  }
  .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
    border-color: var(--primary); box-shadow: 0 0 0 4px var(--primary-soft);
  }

  .label-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
  .view-preview-btn { background: none; border: none; color: var(--primary); font-size: 10px; font-weight: 800; text-transform: uppercase; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: 0.2s; }
  .view-preview-btn:hover { color: var(--primary-hover); transform: translateX(-2px); }

  /* Integrated Inline Preview */
  .inline-preview-wrap { border-top: 1px solid var(--border); background: var(--bg); display: flex; flex-direction: column; }
  .preview-label-bar {
    padding: 12px 28px; background: rgba(0,0,0,0.03); border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
  }
  :root[data-theme="dark"] .preview-label-bar { background: rgba(255,255,255,0.03); }
  .preview-label-bar .title-info { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
  
  .preview-actions { display: flex; align-items: center; gap: 12px; }
  .preview-actions button { font-size: 11px; font-weight: 800; text-transform: uppercase; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s; }
  .expand-preview-btn { background: var(--primary); color: white !important; border-radius: 8px; padding: 6px 14px; box-shadow: 0 4px 12px rgba(99,102,241,0.25); }
  .expand-preview-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(99,102,241,0.35); }
  .preview-actions .collapse-btn { color: #64748b; background: none; border: none; }
  .preview-actions .collapse-btn:hover { color: #ef4444; }

  .preview-scroll-area { padding: 20px; max-height: 600px; overflow-y: auto; background: rgba(0,0,0,0.02); }
  :root[data-theme="dark"] .preview-scroll-area { background: rgba(0,0,0,0.2); }
  
  .prominent-preview { border-color: var(--primary) !important; color: var(--primary) !important; background: var(--primary-soft) !important; }

  .admin-fields-notice {
    display: flex; align-items: flex-start; gap: 14px;
    padding: 14px 18px; border-radius: 12px;
    background: linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.04));
    border: 1px solid rgba(245,158,11,0.2);
  }
  .afn-icon { width: 36px; height: 36px; border-radius: 10px; background: rgba(245,158,11,0.15); color: #f59e0b; display: grid; place-items: center; flex-shrink: 0; font-size: 14px; }
  .afn-text { display: flex; flex-direction: column; gap: 2px; }
  .afn-text strong { font-size: 13px; color: #d97706; }
  .afn-text span { font-size: 12px; color: #92400e; font-weight: 500; }
  :root[data-theme="dark"] .afn-text strong { color: #fbbf24; }
  :root[data-theme="dark"] .afn-text span { color: #fcd34d; }

  .builder-footer { padding: 18px 28px; background: var(--bg); border-top: 1px solid var(--border); display: flex; justify-content: flex-end; }

  /* Form Preview */
  .form-preview-wrap { background: #fff; border-radius: 16px; border: 1px solid var(--border); overflow: hidden; box-shadow: 0 8px 20px rgba(0,0,0,0.04); }
  .form-preview-header { padding: 16px 28px; background: var(--bg); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
  .perspective-hint { font-size: 12px; font-weight: 700; color: var(--text-muted); margin: 0; }
  .preview-body { padding: 28px; display: flex; flex-direction: column; gap: 20px; }

  .preview-field-row { display: flex; flex-direction: column; gap: 6px; }
  .pv-label { font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
  .pv-input {
    padding: 11px 14px; border-radius: 10px; border: 2px solid #f1f5f9; background: #f8fafc;
    font-size: 14px; font-weight: 600; outline: none; transition: 0.2s; width: 100%; color: var(--text);
  }
  .pv-input:focus { border-color: #4f46e5; background: #fff; }

  .pv-radio-group, .pv-checkbox-group { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .pv-opt-label { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600; color: #475569; cursor: pointer; }

  .pv-rating { display: flex; gap: 6px; color: #cbd5e1; font-size: 22px; }
  .pv-rating svg.active { color: #f59e0b; }

  .pv-heading { margin: 28px 0 8px; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 18px; font-weight: 800; }
  .pv-text-block { background: #f8fafc; padding: 16px; border-radius: 10px; border: 1px solid #e2e8f0; color: #475569; line-height: 1.6; font-size: 13px; }
  .pv-divider { border: none; border-top: 1px solid #e2e8f0; margin: 20px 0; }

  /* Signature */
  .pv-sig-box {
    width: 100%; min-height: 90px; background: #f8fafc; border: 2px dashed #cbd5e1;
    border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: #94a3b8; cursor: pointer; transition: 0.2s; padding: 16px; position: relative;
  }
  .pv-sig-box:hover { border-color: #4f46e5; background: #eef2ff; color: #4f46e5; }
  .pv-sig-box.filled { border-style: solid; background: #fff; border-color: #10b981; color: #0f172a; }
  .pv-sig-display { font-family: 'Dancing Script', cursive; font-size: 34px; text-align: center; }
  .pv-sig-meta { font-size: 9px; font-weight: 800; text-transform: uppercase; color: #94a3b8; margin-top: 6px; letter-spacing: 1px; }

  .sig-modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.8); z-index: 4000; display: grid; place-items: center; padding: 20px; backdrop-filter: blur(4px); }
  .sig-modal { 
    background: #fff; border-radius: 20px; width: 100%; max-width: 480px; padding: 28px; 
    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); 
    display: flex; flex-direction: column;
  }
  .sig-preview-box { height: 100px; background: #f8fafc; border-radius: 14px; border: 1px solid #e2e8f0; display: grid; place-items: center; margin: 16px 0; }
  .sig-preview-text { font-family: 'Dancing Script', cursive; font-size: 38px; color: #4f46e5; }
  .sig-input-wrap input { width: 100%; padding: 12px; border-radius: 10px; border: 2px solid #e2e8f0; font-size: 16px; font-weight: 600; outline: none; }

  /* Recipients */
  .recipient-table { padding: 10px; overflow-y: auto; max-height: 600px; }
  .recipient-row {
    display: flex; align-items: center; gap: 14px; padding: 10px 14px;
    border-radius: 12px; cursor: pointer; transition: all 0.2s; margin-bottom: 4px; border: 1px solid transparent;
  }
  .recipient-row:hover { background: rgba(0,0,0,0.02); border-color: var(--border); }
  :root[data-theme="dark"] .recipient-row:hover { background: rgba(255,255,255,0.02); }
  .recipient-row.selected { background: rgba(99, 102, 241, 0.08); border-color: var(--primary); }
  .recipient-row .check-box {
    width: 20px; height: 20px; border-radius: 6px; border: 2px solid #cbd5e1;
    display: grid; place-items: center; color: var(--primary); background: #fff; transition: 0.2s; font-size: 11px;
  }
  .recipient-row.selected .check-box { border-color: var(--primary); background: var(--primary); color: white; }
  .recipient-row .info { flex: 1; display: flex; flex-direction: column; gap: 1px; }
  .recipient-row .info .name { font-size: 13px; font-weight: 800; color: var(--text); }
  .recipient-row .info .username { font-size: 11px; font-weight: 700; color: var(--primary); }
  .recipient-row .info .meta { font-size: 11px; color: var(--text-muted); font-weight: 600; }

  /* Library */
  .library-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .library-grid { padding: 20px; display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); overflow-y: auto; flex: 1; }
  .lib-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    padding: 16px; display: flex; flex-direction: column; gap: 12px;
    cursor: pointer; transition: all 0.2s; position: relative;
  }
  .lib-card:hover { border-color: var(--primary); transform: translateY(-2px); box-shadow: 0 8px 20px rgba(99, 102, 241, 0.1); }
  .lib-card.selected { border-color: var(--primary); background: rgba(99, 102, 241, 0.04); }
  .lib-select-check { position: absolute; top: 12px; left: 12px; z-index: 2; }
  .lib-thumb {
    width: 100%; aspect-ratio: 16 / 9; border-radius: 10px;
    display: grid; place-items: center; font-size: 36px; color: white; position: relative; overflow: hidden;
  }
  .lib-thumb.pdf { background: linear-gradient(135deg, #ef4444 0%, #f97316 100%); }
  .lib-thumb.form { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); }
  .lib-admin-badge {
    position: absolute; top: 8px; right: 8px;
    display: flex; align-items: center; gap: 4px;
    padding: 3px 8px; border-radius: 6px;
    background: rgba(0,0,0,0.5); color: #fbbf24; font-size: 10px; font-weight: 800;
    backdrop-filter: blur(4px);
  }
  .lib-meta { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .lib-title { font-size: 14px; font-weight: 800; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lib-sub { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted); font-weight: 600; flex-wrap: wrap; }
  .lib-desc { font-size: 12px; color: var(--text-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4; }
  .lib-badge { padding: 2px 7px; border-radius: 5px; font-size: 9px; font-weight: 800; text-transform: uppercase; }
  .lib-badge.pdf { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
  .lib-badge.form { background: rgba(99, 102, 241, 0.1); color: #6366f1; }
  .lib-actions { display: flex; gap: 4px; }
  .lib-actions button {
    width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--border);
    background: var(--surface); color: var(--text-muted); display: grid; place-items: center;
    cursor: pointer; transition: 0.15s; font-size: 12px;
  }
  .lib-actions button:hover { color: var(--primary); border-color: var(--primary); background: rgba(99,102,241,0.05); }
  .lib-actions .del-btn:hover { color: #ef4444; border-color: #ef4444; background: rgba(239,68,68,0.05); }

  /* Search */
  .search-mini { position: relative; display: flex; align-items: center; }
  .search-mini svg { position: absolute; left: 12px; color: var(--text-muted); font-size: 12px; pointer-events: none; }
  .search-mini input {
    width: 160px; padding: 9px 12px 9px 34px; border-radius: 10px;
    border: 1px solid var(--border); background: var(--bg); font-size: 12px; font-weight: 600; outline: none; transition: 0.2s; color: var(--text);
  }
  .search-mini input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08); }

  .lib-filter { display: flex; background: var(--bg); padding: 4px; border-radius: 12px; gap: 2px; }
  .lib-filter button {
    padding: 8px 16px; border-radius: 10px; font-size: 12px; font-weight: 700;
    color: var(--text-muted); border: none; cursor: pointer; background: none; transition: 0.2s;
    white-space: nowrap;
  }
  .lib-filter button.active { background: var(--surface); color: var(--primary); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }

  /* Tracking & Submissions List */
  .tracking-list { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; -webkit-overflow-scrolling: touch; }
  .env-item {
    padding: 12px 16px; border-radius: 12px; border: 1px solid var(--border);
    background: var(--surface); transition: all 0.2s ease;
    display: flex; flex-direction: column; gap: 8px;
  }
  .env-item:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); border-color: color-mix(in srgb, var(--primary) 20%, var(--border)); }
  .env-item.needs-action { border-left: 4px solid #f59e0b; }
  
  .env-main { display: flex; align-items: center; gap: 12px; }
  .env-icon {
    width: 38px; height: 38px; border-radius: 10px;
    background: rgba(99, 102, 241, 0.1); color: var(--primary);
    display: grid; place-items: center; font-size: 16px; flex-shrink: 0;
  }
  .env-icon.pulse-orange { background: rgba(245, 158, 11, 0.1); color: #f59e0b; animation: sigPulse 2s infinite; }

  .env-info { flex: 1; min-width: 0; }
  .env-info .subject { font-size: 13px; font-weight: 800; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .env-info .student-names { font-size: 11px; font-weight: 700; color: var(--primary); margin-top: 1px; display: flex; align-items: center; gap: 4px; }
  .env-info .date { font-size: 10px; color: var(--text-muted); font-weight: 600; margin-top: 1px; opacity: 0.8; }

  .env-stats { flex: 0 0 120px; padding: 0 8px; }
  .progress-text { font-size: 9px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; letter-spacing: 0.5px; }
  .progress-bar { height: 4px; background: var(--bg); border-radius: 4px; overflow: hidden; }
  .progress-bar .fill { height: 100%; background: var(--primary); border-radius: 4px; transition: width 0.3s; }

  .env-actions { display: flex; gap: 4px; }
  .row-btn {
    width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border);
    background: var(--surface); color: var(--text-muted); display: grid; place-items: center;
    transition: all 0.2s; cursor: pointer; font-size: 12px;
  }
  .row-btn:hover { border-color: var(--primary); color: var(--primary); background: rgba(99, 102, 241, 0.04); }

  /* PDF Viewer Improvement */
  .template-preview-container { display: flex; flex-direction: column; height: 100%; position: relative; background: #f1f5f9; }
  :root[data-theme="dark"] .template-preview-container { background: #0f172a; }
  
  .preview-zoom-toolbar {
    position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 100;
    display: flex; align-items: center; gap: 6px;
    padding: 6px 12px; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px);
    border-radius: 999px; border: 1px solid rgba(255,255,255,0.1); color: white;
    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);
    transition: 0.2s;
  }
  .preview-zoom-toolbar:hover { background: rgba(15, 23, 42, 0.95); }
  
  .preview-zoom-toolbar button {
    width: 32px; height: 32px; border-radius: 50%; border: none;
    background: transparent; color: white; display: grid; place-items: center;
    cursor: pointer; transition: 0.2s; font-size: 14px;
  }
  .preview-zoom-toolbar button:hover { background: rgba(255,255,255,0.15); }
  .preview-zoom-toolbar .zoom-val { font-size: 12px; font-weight: 800; min-width: 48px; text-align: center; font-family: 'Inter', sans-serif; }
  .preview-zoom-toolbar .sep { width: 1px; height: 16px; background: rgba(255,255,255,0.2); margin: 0 4px; }
  .field-counts { display: flex; gap: 6px; }
  .fc-tag { display: flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 5px; }
  .fc-tag.student { background: rgba(99,102,241,0.2); color: #a5b4fc; }
  .fc-tag.admin { background: rgba(245,158,11,0.2); color: #fbbf24; }

  .template-preview-scroll {
    flex: 1; overflow: auto; padding: 32px 16px;
    display: flex; flex-direction: column;
    gap: 24px;
    align-items: center; /* This works fine with flex-column as long as children have a consistent start */
  }
  .template-preview-scroll > * { margin-left: auto; margin-right: auto; flex-shrink: 0; }

  /* Buttons */
  .dsm-btn-primary {
    background: var(--primary); color: white; border: none; padding: 10px 18px;
    border-radius: 10px; font-weight: 700; cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px; font-size: 13px; transition: 0.2s;
  }
  .dsm-btn-primary:hover { filter: brightness(1.1); }
  .dsm-btn-primary:disabled { opacity: 0.5; cursor: default; filter: none; }
  .dsm-btn-ghost {
    background: var(--bg); color: var(--text); border: 1px solid var(--border);
    padding: 9px 16px; border-radius: 10px; font-weight: 700; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px; font-size: 12px; transition: 0.2s;
  }
  .dsm-btn-ghost:hover { border-color: var(--primary); color: var(--primary); }
  .dsm-btn-ghost.sm { padding: 6px 12px; font-size: 11px; border-radius: 8px; }
  .dsm-btn-ghost.icon-only { padding: 8px; width: 34px; height: 34px; display: grid; place-items: center; }

  /* Modal */
  .docs-modal-overlay { 
    position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); 
    backdrop-filter: blur(4px); z-index: 3000; display: grid; 
    place-items: center; padding: 20px; 
  }
  .docs-modal {
    width: 100%; max-width: 960px; max-height: 92vh; background: var(--surface);
    border-radius: 24px; overflow: hidden; display: flex; flex-direction: column;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    position: relative;
  }
  .docs-modal-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 24px; border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .docs-modal-head h3 { 
    margin: 0; font-size: 14px; font-weight: 800; 
    display: flex; align-items: center; gap: 10px; 
    color: var(--text); 
    flex: 1; min-width: 0; 
  }
  .docs-modal-head h3 span {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .close-btn { width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg); color: var(--text-muted); display: grid; place-items: center; cursor: pointer; transition: 0.2s; flex-shrink: 0; margin-left: 12px; }
  .close-btn:hover { color: #ef4444; border-color: #ef4444; }
  .docs-modal-body { flex: 1; overflow-y: auto; background: var(--bg-soft, var(--bg)); }
  .docs-modal-foot { padding: 16px 24px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; background: var(--surface); flex-shrink: 0; }

  /* Envelope Detail (Tracking preview) */
  .envelope-detail-view { display: flex; flex-direction: column; min-width: 0; }
  .env-detail-header {
    padding: 20px 24px 20px;
    background: linear-gradient(180deg, rgba(99,102,241,0.04), transparent);
    border-bottom: 1px solid var(--border);
    display: flex; flex-direction: column; gap: 16px;
  }
  .admin-action-panel {
    background: #fffbeb; border-bottom: 1px solid #fde68a; padding: 24px;
    display: flex; flex-direction: column; gap: 16px;
  }
  :root[data-theme="dark"] .admin-action-panel { background: #1c1917; border-color: #451a03; }
  .aap-head { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 800; color: #92400e; text-transform: uppercase; }
  :root[data-theme="dark"] .aap-head { color: #fbbf24; }
  .aap-body { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }

  .admin-wait-notice {
    background: #f8fafc; border-bottom: 1px solid var(--border); padding: 16px 24px;
    display: flex; align-items: center; gap: 10px; color: var(--text-muted); font-size: 13px; font-weight: 600;
  }
  .admin-wait-notice svg { color: #f59e0b; }

  .env-progress-row {
    display: flex; align-items: center; justify-content: space-between; gap: 20px;
    flex-wrap: wrap;
  }
  .env-progress-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .env-progress-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); }
  .env-progress-sub { font-size: 14px; font-weight: 700; color: var(--text); }
  .env-progress-bar {
    position: relative; flex: 1; min-width: 0; max-width: 420px;
    height: 10px; background: var(--bg); border-radius: 999px;
    border: 1px solid var(--border); overflow: hidden;
  }
  .env-progress-fill {
    position: absolute; inset: 0 auto 0 0;
    background: linear-gradient(90deg, #10b981, #34d399);
    border-radius: 999px; transition: width 0.4s cubic-bezier(0.4,0,0.2,1);
    box-shadow: 0 0 12px rgba(16,185,129,0.35);
  }
  .env-progress-pct {
    font-size: 11px; font-weight: 800; color: var(--text);
    margin-left: 8px;
  }

  .recip-status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 10px;
    padding-bottom: 16px;
  }
  .recip-status-card {
    display: grid;
    grid-template-columns: 40px 1fr auto;
    align-items: center; gap: 12px;
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    transition: 0.2s;
    min-width: 0;
  }
  .recip-status-card:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(15,23,42,0.06); border-color: color-mix(in srgb, var(--primary) 35%, var(--border)); }
  .recip-status-card.completed { background: linear-gradient(135deg, rgba(16,185,129,0.06), rgba(16,185,129,0.02)); border-color: rgba(16,185,129,0.25); }
  .recip-status-card.pending { background: linear-gradient(135deg, rgba(245,158,11,0.06), rgba(245,158,11,0.02)); border-color: rgba(245,158,11,0.25); }

  .recip-av {
    width: 40px; height: 40px; border-radius: 12px;
    display: grid; place-items: center;
    background: var(--bg); color: var(--text-muted);
    font-size: 16px; flex-shrink: 0;
  }
  .recip-av.admin { background: rgba(245,158,11,0.12); color: #f59e0b; }
  .recip-av.student { background: rgba(99,102,241,0.12); color: var(--primary); }

  .recip-info { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .recip-info .name { font-size: 13px; font-weight: 800; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .recip-info .role { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: var(--text-muted); }

  .status-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 10px; border-radius: 999px;
    font-size: 10px; font-weight: 800; letter-spacing: 0.5px;
    white-space: nowrap;
  }
  .status-badge.done { background: rgba(16,185,129,0.12); color: #059669; }
  .status-badge.pending { background: rgba(245,158,11,0.12); color: #b45309; }

  /* Preview bar with role toggle */
  .env-detail-preview { display: flex; flex-direction: column; min-width: 0; }
  .env-preview-bar {
    padding: 14px 24px;
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    flex-wrap: wrap;
    position: sticky; top: 0; z-index: 2;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .env-preview-bar .plb-left {
    display: flex; align-items: center; gap: 10px;
    font-size: 11px; font-weight: 800; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 1px;
  }
  .read-only-chip {
    padding: 3px 8px; border-radius: 999px;
    background: rgba(148,163,184,0.18);
    color: var(--text-muted);
    font-size: 9px; font-weight: 800; letter-spacing: 1px;
  }

  .role-toggle {
    position: relative;
    display: inline-flex;
    padding: 4px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 999px;
    isolation: isolate;
  }
  .role-toggle-thumb {
    position: absolute; top: 4px; bottom: 4px; left: 4px;
    width: calc(50% - 4px);
    border-radius: 999px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    box-shadow: 0 4px 12px rgba(99,102,241,0.35);
    transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 0;
  }
  .rt-btn {
    position: relative; z-index: 1;
    display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 18px;
    border: none; background: transparent; cursor: pointer;
    font-size: 12px; font-weight: 800;
    color: var(--text-muted);
    border-radius: 999px;
    transition: color 0.2s ease;
    min-width: 110px; justify-content: center;
  }
  .rt-btn svg { font-size: 12px; }
  .rt-btn:hover:not(.active) { color: var(--text); }
  .rt-btn.active { color: #fff; }

  .env-preview-body { padding: 20px 24px 24px; background: var(--bg); min-height: 200px; }
  .env-preview-body.perspective-admin { box-shadow: inset 0 0 0 2px rgba(245,158,11,0.12); }
  .env-preview-body.perspective-student { box-shadow: inset 0 0 0 2px rgba(99,102,241,0.12); }

  .preview-field-marker.active-role {
    animation: roleHighlight 1.2s ease-out;
    box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
  }
  @keyframes roleHighlight {
    0% { box-shadow: 0 0 0 0 rgba(99,102,241,0.55); }
    100% { box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
  }

  /* Compact switcher (used inside FormPreview when not locked) */
  .compact-switcher {
    display: inline-flex; padding: 3px; gap: 2px;
    background: var(--bg); border: 1px solid var(--border);
    border-radius: 10px;
  }
  .compact-switcher button {
    width: 32px; height: 28px; border-radius: 7px;
    border: none; background: transparent; color: var(--text-muted);
    cursor: pointer; display: grid; place-items: center;
    font-size: 12px; transition: 0.15s;
  }
  .compact-switcher button:hover { color: var(--primary); background: rgba(99,102,241,0.08); }
  .compact-switcher button.active { background: var(--primary); color: #fff; box-shadow: 0 2px 6px rgba(99,102,241,0.25); }

  @media (max-width: 640px) {
    .docs-modal-overlay { padding: 12px; }
    .docs-modal { max-height: 96vh; border-radius: 20px; }
    .env-progress-row { flex-direction: column; align-items: stretch; gap: 8px; }
    .env-progress-bar { max-width: none; flex: none; height: 12px; margin: 4px 0; }
    .env-progress-pct { margin-left: 0; margin-top: 4px; text-align: right; }
    .env-detail-header { padding: 16px; gap: 12px; }
    .recip-status-grid { grid-template-columns: 1fr; gap: 8px; }
    .recip-status-card { padding: 8px 12px; border-radius: 12px; width: 100%; box-sizing: border-box; }
    
    .env-preview-bar { padding: 12px; flex-direction: column; align-items: center; gap: 12px; }
    .env-preview-bar .plb-left { width: 100%; justify-content: center; }
    .role-toggle { width: 100%; max-width: 320px; }
    .rt-btn { flex: 1; min-width: 0; padding: 10px 4px; font-size: 11px; }

    .env-preview-body { padding: 12px; width: 100%; box-sizing: border-box; }
    .admin-action-panel { padding: 16px; }
    .aap-body { grid-template-columns: 1fr; gap: 12px; }
  }

  .delete-confirm-modal { max-width: 440px; padding: 32px; text-align: center; }
  .warn-icon { font-size: 40px; color: #f59e0b; margin-bottom: 12px; }
  .delete-confirm-modal h2 { font-size: 18px; font-weight: 800; margin: 0 0 8px; }
  .delete-confirm-modal p { font-size: 13px; color: var(--text-muted); margin: 0 0 16px; }
  .items-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; }
  .item-entry { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg); border-radius: 8px; font-size: 13px; font-weight: 600; }

  .submission-detail-view { display: flex; flex-direction: column; }
  .sub-meta-bar { padding: 20px 24px; background: var(--bg); border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 32px; flex-wrap: wrap; }
  .smb-info { display: flex; flex-direction: column; gap: 2px; }
  .smb-info .label { font-size: 10px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
  .smb-info .value { font-size: 14px; font-weight: 700; color: var(--text); }
  .sub-fields-viewer { padding: 24px; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; background: rgba(0,0,0,0.02); }
  :root[data-theme="dark"] .sub-fields-viewer { background: rgba(255,255,255,0.02); }

  .sub-meta { display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; font-size: 13px; }
  .sub-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .sub-field { padding: 12px; background: var(--bg); border-radius: 10px; border: 1px solid var(--border); }
  .sub-field label { font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); display: block; margin-bottom: 4px; }
  .sub-value { font-size: 14px; font-weight: 600; color: var(--text); word-break: break-word; }

  .check-box { width: 20px; height: 20px; border-radius: 6px; border: 2px solid #cbd5e1; display: grid; place-items: center; transition: 0.2s; font-size: 11px; }
  .check-box.checked { border-color: var(--primary); background: var(--primary); color: white; }

  /* Responsive */
  /* Responsive Excellence */
  @media (max-width: 1024px) {
    .docs-workspace { grid-template-columns: 1fr; }
    .docs-header { gap: 12px; }
  }

  @media (max-width: 768px) {
    .docs-page { padding: 0; height: auto; display: block; }
    .docs-header { padding: 16px; margin-bottom: 12px; }
    .docs-title { font-size: 24px; }
    
    .docs-workspace { display: flex; flex-direction: column; padding: 12px; gap: 16px; }
    
    .docs-nav-tabs { width: 100%; overflow-x: auto; padding: 6px; gap: 4px; }
    .docs-nav-tabs button { flex: 0 0 auto; padding: 10px 16px; font-size: 14px; }

    .docs-modal-head { padding: 12px 16px; }
    .docs-modal-head h3 { font-size: 13px; }
    .close-btn { width: 32px; height: 32px; border-radius: 8px; margin-left: 8px; }

    .library-card .card-head { flex-direction: column; align-items: stretch; padding: 20px 16px; gap: 16px; }
    .library-tools { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .library-tools .search-mini { grid-column: 1 / -1; }
    .library-tools .search-mini input { width: 100%; font-size: 16px; height: 44px; }
    .library-tools .lib-filter { flex: 1; }

    .library-grid { grid-template-columns: 1fr 1fr; gap: 14px; padding: 16px; }
    .lib-card { padding: 12px; }
    .lib-thumb { aspect-ratio: 4 / 3; }

    .env-detail-header { padding: 16px; }
    .recip-status-grid { grid-template-columns: 1fr; }
    .recip-status-card { padding: 10px; }
    
    .env-preview-bar { padding: 12px 16px; }
    .rt-btn { min-width: 90px; padding: 8px 12px; }

    .docs-modal { width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; }
    .docs-modal-head { padding: 16px; }
    .docs-modal-foot { padding: 12px 16px; }

    .sig-modal { width: 100%; height: 100%; max-height: 100%; border-radius: 0; display: flex; flex-direction: column; }
    .sig-modal h3 { font-size: 20px; }
    .sig-preview-box { flex: 1; min-height: 200px; }
    .sig-preview-text { font-size: 48px; }
    .sig-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: auto; }
    .sig-actions button { padding: 16px; font-size: 15px; }

    .builder-form { grid-template-columns: 1fr; padding: 16px; gap: 16px; }
    .form-group input, .form-group select, .form-group textarea { font-size: 16px; min-height: 48px; }

    .recipient-table { max-height: 400px; }
    .recipient-row { padding: 12px; }
    .recipient-row .info .name { font-size: 14px; }

    .inline-preview-wrap { border-radius: 0; margin-top: 8px; }
    .preview-label-bar { padding: 12px 16px; flex-direction: column; gap: 12px; align-items: center; text-align: center; }
    .preview-actions { width: 100%; justify-content: center; }
    .expand-preview-btn { width: 100%; justify-content: center; height: 44px; }

    .sub-meta-bar { padding: 16px; gap: 20px; }
    .sub-fields-viewer { grid-template-columns: 1fr; padding: 12px; }
  }

  @media (max-width: 600px) {
    .library-grid { grid-template-columns: 1fr !important; }
    .lib-card { padding: 16px; }
    .lib-thumb { aspect-ratio: 16 / 9; }
    
    .lib-filter { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .lib-filter button { flex: 1; padding: 12px 10px; font-size: 14px; }
  }

  @media (max-width: 480px) {
    .env-main { flex-direction: column; align-items: flex-start; gap: 12px; }
    .env-icon { width: 40px; height: 40px; font-size: 16px; }
    .env-stats { width: 100%; padding: 0; }
    .env-actions { width: 100%; display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 4px; }
    .row-btn { width: 100%; height: 44px; }

    .aap-body { grid-template-columns: 1fr; }
    .pv-label { font-size: 11px; }
    .pv-input { font-size: 16px; min-height: 48px; }
    .pv-sig-box { min-height: 120px; }
    .pv-sig-display { font-size: 28px; }

    .delete-confirm-modal { padding: 24px 18px; max-width: 100%; }
    .compact-switcher { flex: 1; }
    .compact-switcher button { flex: 1; padding: 10px 8px; min-height: 40px; }
  }
`;
