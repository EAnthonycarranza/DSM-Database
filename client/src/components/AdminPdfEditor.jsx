import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import * as pdfjsLib from "pdfjs-dist";
import { useApp } from "../context/AppContext";
import { useNavigate, useLocation } from "react-router-dom";
import { 
  FaPen, FaPenNib, FaCalendarAlt, FaFont, FaUser, 
  FaPhone, FaHashtag, FaListOl, FaMap, FaPlus, 
  FaSync, FaSave, FaTrash, FaCloudUploadAlt, FaChevronLeft,
  FaSearch, FaCheckCircle, FaExclamationTriangle, FaGripVertical,
  FaTimes, FaObjectGroup, FaExpand, FaMinus, FaEye, FaArrowLeft, FaFilePdf,
  FaColumns, FaListUl, FaShieldAlt, FaRegDotCircle
} from "react-icons/fa";

// Configure PDF.js worker
const PDFJS_VERSION = pdfjsLib.version || "5.4.54";
const PDFJS_MAJOR = parseInt((PDFJS_VERSION || "5").split(".")[0], 10) || 5;
const WORKER_EXT = PDFJS_MAJOR >= 4 ? "mjs" : "js";
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.${WORKER_EXT}`;

const DEFAULT_SIZES = {
  signature: { w: 220, h: 50 },
  initials: { w: 120, h: 40 },
  date: { w: 140, h: 36 },
  text: { w: 200, h: 36 },
  name: { w: 220, h: 36 },
  phone: { w: 200, h: 36 },
  age: { w: 110, h: 36 },
  numberSelect: { w: 120, h: 36 },
  state: { w: 120, h: 36 },
  radio: { w: 24, h: 24 },
  checkbox: { w: 24, h: 24 },
  multiselect: { w: 24, h: 24 }
};

const toNormalized = (abs, pageW, pageH) => ({
  nx: abs.x / pageW, ny: abs.y / pageH,
  nw: abs.w / pageW, nh: abs.h / pageH
});

const toAbsolute = (norm, pageW, pageH) => ({
  x: norm.nx * pageW, y: norm.ny * pageH,
  w: norm.nw * pageW, h: norm.nh * pageH
});

const abToBase64 = async (ab) => new Promise((resolve, reject) => {
  const blob = new Blob([ab], { type: "application/pdf" });
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result.split(",")[1]);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

/* ------------------------------------------
   Field Box Component
------------------------------------------- */
const FieldBox = ({ field, pageW, pageH, onUpdate, onDelete, isDraggingFieldRef, registerRef }) => {
  const [isDragging, setIsDragging] = useState(false);
  const nodeRef = useRef(null);

  useEffect(() => {
    if (registerRef) registerRef(field.id, nodeRef.current);
    return () => registerRef && registerRef(field.id, null);
  }, [field.id, registerRef]);

  const abs = toAbsolute(field, pageW, pageH);

  return (
    <Rnd
      nodeRef={nodeRef}
      className={`admin-field ${isDragging ? "dragging" : ""} ${field.recipientRole === 'admin' ? "admin-only" : ""}`}
      size={{ width: abs.w, height: abs.h }}
      position={{ x: abs.x, y: abs.y }}
      bounds="parent"
      dragHandleClassName="field-drag-handle"
      cancel=".field-del-btn"
      onDragStart={() => { isDraggingFieldRef.current = true; setIsDragging(true); }}
      onDragStop={(_e, d) => {
        setIsDragging(false);
        isDraggingFieldRef.current = false;
        onUpdate(field.id, toNormalized({ x: d.x, y: d.y, w: abs.w, h: abs.h }, pageW, pageH));
      }}
      onResizeStop={(_e, _dir, ref, _delta, pos) => {
        isDraggingFieldRef.current = false;
        onUpdate(field.id, toNormalized({ x: pos.x, y: pos.y, w: parseFloat(ref.style.width), h: parseFloat(ref.style.height) }, pageW, pageH));
      }}
      minWidth={20}
      minHeight={20}
    >
      <div className="field-drag-handle">
        <div className="field-type-icon">
          {field.type === "signature" && <FaPen />}
          {field.type === "initials" && <FaPenNib />}
          {field.type === "date" && <FaCalendarAlt />}
          {field.type === "text" && <FaFont />}
          {field.type === "name" && <FaUser />}
          {field.type === "radio" && <FaRegDotCircle />}
          {field.type === "checkbox" && <FaCheckCircle />}
          {field.type === "multiselect" && <FaCheckCircle />}
        </div>
        <button 
          className="field-del-btn" 
          onClick={(e) => { 
            e.preventDefault(); 
            e.stopPropagation(); 
            onDelete(field.id); 
          }}
        >
          <FaTimes />
        </button>
      </div>
    </Rnd>
  );
};

/* ------------------------------------------
   Main Component
------------------------------------------- */
export default function AdminPdfEditor() {
  const { api, setToast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const editId = location.state?.templateId;
  
  const [templateName, setTemplateName] = useState("");
  const [pdfBytes, setPdfBytes] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pagesMeta, setPagesMeta] = useState([]);
  const [scale, setScale] = useState(1.1);
  const [fields, setFields] = useState([]);
  const [currentTool, setCurrentTool] = useState(null);
  const [loading, setLoading] = useState(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!editId || hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    (async () => {
      setLoading(true);
      try {
        const tpl = await api.get("pdfTemplates", editId);
        if (tpl) {
          console.log(`[AdminPdfEditor] Loading template: ${tpl.name} (${tpl.fields?.length || 0} fields)`);
          setTemplateName(tpl.name || "");
          setFields(tpl.fields || []);
          if (tpl.pdfBase64) {
            let s = String(tpl.pdfBase64);
            const comma = s.indexOf(",");
            if (s.startsWith("data:") && comma >= 0) s = s.slice(comma + 1);
            s = s.replace(/\s+/g, "");
            const bin = window.atob(s);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            setPdfBytes(bytes.buffer);
          } else {
            setToast({ type: "warn", text: "This template is missing its PDF source. Please upload a new PDF." });
          }
        }
      } catch (err) {
        console.error("Failed to load template:", err);
        setToast({ type: "error", text: "Failed to load existing template" });
        hasLoadedRef.current = false; // Allow retry
      } finally {
        setLoading(false);
      }
    })();
  }, [editId, api, setToast]);

  // Panel state
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  const viewerRef = useRef(null);
  const isDraggingFieldRef = useRef(false);
  const fieldDomMap = useRef({});

  const registerFieldDom = useCallback((id, el) => {
    if (el) fieldDomMap.current[id] = el; else delete fieldDomMap.current[id];
  }, []);

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ab = await file.arrayBuffer();
    setPdfBytes(ab);
  };

  useEffect(() => {
    if (!pdfBytes) {
      setPdfDoc(null);
      setNumPages(0);
      setPagesMeta([]);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const pdf = await pdfjsLib.getDocument({ 
          data: pdfBytes.slice(0),
          cMapUrl: `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/standard_fonts/`
        }).promise;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        const metas = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          metas.push({ w: vp.width, h: vp.height });
        }
        setPagesMeta(metas);
      } catch (err) {
        console.error("PDF load error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [pdfBytes]);

  const onOverlayClick = (e, pageIndex) => {
    if (!currentTool || isDraggingFieldRef.current) return;
    if (e.target.closest(".admin-field")) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const pageW = e.currentTarget.clientWidth;
    const pageH = e.currentTarget.clientHeight;
    
    let type = currentTool;
    let role = 'student';

    if (currentTool === 'admin_sig') {
      type = 'signature';
      role = 'admin';
    } else if (currentTool === 'admin_date') {
      type = 'date';
      role = 'admin';
    } else if (currentTool === 'admin_name') {
      type = 'name';
      role = 'admin';
    }

    const defaults = DEFAULT_SIZES[type] || DEFAULT_SIZES.text;
    const nx = (e.clientX - rect.left - defaults.w / 2) / pageW;
    const ny = (e.clientY - rect.top - defaults.h / 2) / pageH;

    setFields(prev => [...prev, {
      id: `field_${Date.now()}`,
      pageIndex, type,
      label: `Field ${prev.length + 1}`,
      nx: Math.max(0, Math.min(1, nx)),
      ny: Math.max(0, Math.min(1, ny)),
      nw: defaults.w / pageW,
      nh: defaults.h / pageH,
      recipientRole: role,
      required: true
    }]);
  };

  const toggleFieldRole = (id) => {
    setFields(prev => prev.map(f => {
      if (f.id !== id) return f;
      return { ...f, recipientRole: f.recipientRole === 'admin' ? 'student' : 'admin' };
    }));
  };

  const handleSave = async () => {
    if (!templateName) return setToast({ type: "warn", text: "Template name required" });
    setLoading(true);
    try {
      const b64 = await abToBase64(pdfBytes);
      const payload = {
        id: editId,
        name: templateName,
        numPages, fields,
        pdfBase64: b64,
        updatedAt: Date.now()
      };
      
      if (editId) {
        await api.put("pdfTemplates", payload);
      } else {
        payload.createdAt = Date.now();
        await api.add("pdfTemplates", payload);
      }
      
      setToast("Template studio synchronized");
      navigate("/admin/docs-center");
    } catch (err) {
      setToast({ type: "error", text: "Studio synchronization failed" });
    } finally { setLoading(false); }
  };

  if (loading && !numPages) return <div className="studio-loading">Booting Template Studio...</div>;

  return (
    <div className={`studio-layout ${!leftPanelOpen ? 'left-collapsed' : ''} ${!rightPanelOpen ? 'right-collapsed' : ''}`}>
      <style>{STUDIO_CSS}</style>
      
      {/* Studio Header */}
      <header className="studio-toolbar">
        <div className="toolbar-left">
          <button className="back-btn" onClick={() => navigate("/admin/docs-center")}>
            <FaArrowLeft />
          </button>
          <div className="studio-title">
            <input 
              value={templateName} 
              onChange={e => setTemplateName(e.target.value)} 
              placeholder="Untitled Template..." 
            />
            <p>Admin Design Mode</p>
          </div>
        </div>

        <div className="zoom-controls">
          <button className={`panel-toggle ${leftPanelOpen ? 'active' : ''}`} onClick={() => setLeftPanelOpen(!leftPanelOpen)} title="Toggle Toolbox">
            <FaColumns />
          </button>
          <div className="zoom-group">
            <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))}><FaMinus /></button>
            <span>{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale(s => Math.min(3, s + 0.1))}><FaPlus /></button>
            <button onClick={() => setScale(1.1)} title="Reset Zoom"><FaExpand /></button>
          </div>
          <button className={`panel-toggle ${rightPanelOpen ? 'active' : ''}`} onClick={() => setRightPanelOpen(!rightPanelOpen)} title="Toggle Roster">
            <FaListUl />
          </button>
        </div>

        <div className="toolbar-right">
          <button className="studio-btn secondary" onClick={() => setFields([])}><FaTrash /> Clear</button>
          <button className="studio-btn primary" onClick={handleSave} disabled={!pdfBytes || loading}>
            <FaSave /> Publish
          </button>
        </div>
      </header>

      <div className="studio-workspace">
        {/* Left: Component Library */}
        <aside className="studio-sidebar left">
          <div className="sidebar-section">
            <div className="section-label">Identity</div>
            <div className="tool-grid">
              <ToolBtn active={currentTool === 'signature'} icon={FaPen} label="Signature" onClick={() => setCurrentTool('signature')} />
              <ToolBtn active={currentTool === 'initials'} icon={FaPenNib} label="Initials" onClick={() => setCurrentTool('initials')} />
              <ToolBtn active={currentTool === 'name'} icon={FaUser} label="Name" onClick={() => setCurrentTool('name')} />
            </div>
          </div>

          <div className="sidebar-section">
            <div className="section-label">Inputs</div>
            <div className="tool-grid">
              <ToolBtn active={currentTool === 'text'} icon={FaFont} label="Text" onClick={() => setCurrentTool('text')} />
              <ToolBtn active={currentTool === 'date'} icon={FaCalendarAlt} label="Date" onClick={() => setCurrentTool('date')} />
              <ToolBtn active={currentTool === 'phone'} icon={FaPhone} label="Phone" onClick={() => setCurrentTool('phone')} />
              <ToolBtn active={currentTool === 'checkbox'} icon={FaCheckCircle} label="Checkbox" onClick={() => setCurrentTool('checkbox')} />
              <ToolBtn active={currentTool === 'radio'} icon={FaRegDotCircle} label="Radio" onClick={() => setCurrentTool('radio')} />
            </div>
          </div>

          <div className="sidebar-section">
            <div className="section-label">Admin Specific</div>
            <div className="tool-grid">
              <ToolBtn 
                active={currentTool === 'admin_sig'} 
                icon={FaShieldAlt} 
                label="Admin Sig" 
                onClick={() => setCurrentTool('admin_sig')} 
                style={{ borderColor: '#f59e0b', color: '#d97706' }}
              />
              <ToolBtn 
                active={currentTool === 'admin_date'} 
                icon={FaCalendarAlt} 
                label="Admin Date" 
                onClick={() => setCurrentTool('admin_date')} 
                style={{ borderColor: '#f59e0b', color: '#d97706' }}
              />
              <ToolBtn 
                active={currentTool === 'admin_name'} 
                icon={FaUser} 
                label="Admin Name" 
                onClick={() => setCurrentTool('admin_name')} 
                style={{ borderColor: '#f59e0b', color: '#d97706' }}
              />
            </div>
          </div>

          <div className="sidebar-section">
            <div className="section-label">PDF Source</div>
            <label className="import-zone">
              <FaCloudUploadAlt />
              <span>Change PDF</span>
              <input type="file" hidden accept="application/pdf" onChange={onFileChange} />
            </label>
          </div>
        </aside>

        {/* Center: Canvas */}
        <main className="studio-canvas" ref={viewerRef}>
          <div className="canvas-scroll">
            {!pdfBytes ? (
              <div className="canvas-empty">
                <FaFilePdf />
                {editId ? (
                  <>
                    <h3 style={{ color: '#fbbf24' }}>Missing PDF Source</h3>
                    <p>This template's PDF file is missing. Please re-upload it to restore the background while keeping your <strong>{fields.length} fields</strong>.</p>
                  </>
                ) : (
                  <>
                    <h3>No Document Active</h3>
                    <p>Import a PDF to start placing dynamic fields.</p>
                  </>
                )}
                <label className="studio-btn primary" style={{ marginTop: '12px' }}>
                  {editId ? "Restore PDF File" : "Select File"}
                  <input type="file" hidden accept="application/pdf" onChange={onFileChange} />
                </label>
              </div>
            ) : (
              <div className="pages-stack">
                {Array.from({ length: numPages }, (_, idx) => {
                  const i = idx + 1;
                  const meta = pagesMeta[idx] || { w: 0, h: 0 };
                  const pw = meta.w * scale;
                  const ph = meta.h * scale;
                  return (
                    <div key={i} className="studio-page-wrap" style={{ width: pw, height: ph }}>
                      <CanvasPage pageNum={i} pdfDoc={pdfDoc} scale={scale} />
                      <div className={`studio-overlay ${currentTool ? 'active' : ''}`} onClick={(e) => onOverlayClick(e, i)}>
                        {fields.filter(f => f.pageIndex === i).map(f => (
                          <FieldBox 
                            key={f.id} field={f} pageW={pw} pageH={ph}
                            isDraggingFieldRef={isDraggingFieldRef}
                            registerRef={registerFieldDom}
                            onDelete={(id) => setFields(prev => prev.filter(x => x.id !== id))}
                            onUpdate={(id, patch) => setFields(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x))}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        {/* Right: Field Inspector */}
        <aside className="studio-sidebar right">
          <div className="section-label">Field Roster ({fields.length})</div>
          <div className="field-list">
            {fields.map((f, idx) => (
              <div key={f.id} className={`field-list-item ${f.recipientRole === 'admin' ? 'admin-only' : ''}`}>
                <div className="idx">{idx + 1}</div>
                <div className="info">
                  <input 
                    className="label-input"
                    value={f.label || ''}
                    onChange={(e) => setFields(prev => prev.map(x => x.id === f.id ? { ...x, label: e.target.value } : x))}
                    placeholder="Field Label..."
                  />
                  <div className="meta">
                    <span className="type-tag">{f.type}</span>
                    <span>Page {f.pageIndex}</span>
                  </div>

                  {/* Individual Required Toggle */}
                  <label className="roster-checkbox-label">
                    <input 
                      type="checkbox"
                      checked={!!f.required}
                      onChange={(e) => setFields(prev => prev.map(x => x.id === f.id ? { ...x, required: e.target.checked } : x))}
                    />
                    Required
                  </label>

                  {(f.type === 'radio' || f.type === 'checkbox') && (
                    <div className="group-settings">
                      <div className="group-input-wrap">
                        <FaObjectGroup />
                        <input 
                          placeholder="Group ID..."
                          value={f.group || ''}
                          onChange={(e) => setFields(prev => prev.map(x => x.id === f.id ? { ...x, group: e.target.value } : x))}
                        />
                      </div>
                      {f.group && (
                        <label className="roster-checkbox-label group">
                          <input 
                            type="checkbox"
                            checked={!!f.groupRequired}
                            onChange={(e) => {
                              const val = e.target.checked;
                              setFields(prev => prev.map(x => x.group === f.group ? { ...x, groupRequired: val } : x));
                            }}
                          />
                          Group Requirement
                        </label>
                      )}
                    </div>
                  )}
                </div>
                <div className="item-actions">
                  <button 
                    className="role-toggle"
                    onClick={() => toggleFieldRole(f.id)}
                    title={`Assigned to ${f.recipientRole || 'student'}`}
                  >
                    {f.recipientRole === 'admin' ? <FaShieldAlt /> : <FaUser />}
                  </button>
                  <button 
                    className="del" 
                    onClick={() => setFields(prev => prev.filter(x => x.id !== f.id))}
                    title="Remove Field"
                  >
                    <FaTimes />
                  </button>
                </div>
              </div>
            ))}
            {fields.length === 0 && <div className="empty-hint">Click on the document to place your first field.</div>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ToolBtn({ icon: Icon, label, active, onClick, style }) {
  return (
    <button className={`tool-btn ${active ? 'active' : ''}`} onClick={onClick} style={style}>
      <Icon />
      <span>{label}</span>
    </button>
  );
}

function CanvasPage({ pageNum, pdfDoc, scale }) {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);

  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;

    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;

        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * dpr });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: false });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = Math.floor(viewport.width / dpr) + "px";
        canvas.style.height = Math.floor(viewport.height / dpr) + "px";

        // Fill background white
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
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
          console.error("Page render error:", err);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) renderTaskRef.current.cancel();
    };
  }, [pdfDoc, pageNum, scale]);

  return <canvas ref={canvasRef} className="page-canvas" />;
}

const STUDIO_CSS = `
  .studio-layout { height: calc(100vh - 64px); display: flex; flex-direction: column; background: var(--bg); transition: all 0.3s ease; }
  .studio-toolbar { background: var(--surface); border-bottom: 1px solid var(--border); padding: 12px 32px; display: flex; align-items: center; justify-content: space-between; z-index: 100; }
  
  .toolbar-left { display: flex; align-items: center; gap: 20px; }
  .back-btn { width: 40px; height: 40px; border-radius: 12px; background: var(--bg); color: var(--text-muted); display: grid; place-items: center; cursor: pointer; }
  .back-btn:hover { background: var(--border); color: var(--text); }
  .studio-title input { background: none; border: none; font-size: 18px; font-weight: 800; color: var(--text); outline: none; width: 240px; }
  .studio-title p { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin: 2px 0 0; }

  .zoom-controls { display: flex; align-items: center; gap: 12px; }
  .zoom-group { display: flex; align-items: center; gap: 12px; background: var(--bg); padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 700; color: var(--text-muted); border: 1px solid var(--border); }
  .zoom-group button { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; transition: 0.2s; cursor: pointer; color: var(--text-muted); }
  .zoom-group button:hover { background: var(--surface); color: var(--primary); box-shadow: var(--shadow); }

  .panel-toggle { width: 36px; height: 36px; border-radius: 10px; background: var(--bg); color: var(--text-muted); display: grid; place-items: center; transition: 0.2s; border: 1px solid var(--border); cursor: pointer; }
  .panel-toggle:hover { background: var(--surface); color: var(--text); }
  .panel-toggle.active { color: var(--primary); background: rgba(99, 102, 241, 0.1); border-color: var(--primary); }

  .toolbar-right { display: flex; gap: 12px; }
  .studio-btn { height: 40px; padding: 0 20px; border-radius: 10px; font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 8px; transition: all 0.2s; border: none; cursor: pointer; }
  .studio-btn.primary { background: var(--primary); color: white; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2); }
  .studio-btn.secondary { background: var(--surface); border: 1px solid var(--border); color: var(--text-muted); }

  .studio-workspace { 
    flex: 1; display: grid; 
    grid-template-columns: 280px 1fr 320px; 
    min-height: 0; 
    transition: grid-template-columns 0.4s cubic-bezier(0.4, 0, 0.2, 1); 
  }
  .left-collapsed .studio-workspace { grid-template-columns: 0px 1fr 320px; }
  .right-collapsed .studio-workspace { grid-template-columns: 280px 1fr 0px; }
  .left-collapsed.right-collapsed .studio-workspace { grid-template-columns: 0px 1fr 0px; }

  @media (max-width: 1024px) {
    .studio-workspace { grid-template-columns: 1fr !important; position: relative; }
    .studio-sidebar { position: fixed; top: 128px; bottom: 0; z-index: 500; width: 280px; box-shadow: 20px 0 50px rgba(0,0,0,0.1); }
    .studio-sidebar.right { right: 0; left: auto; width: 320px; box-shadow: -20px 0 50px rgba(0,0,0,0.1); }
    
    .left-collapsed .studio-sidebar.left { transform: translateX(-100%); opacity: 0; pointer-events: none; }
    .right-collapsed .studio-sidebar.right { transform: translateX(100%); opacity: 0; pointer-events: none; }
    
    .studio-sidebar.left { left: 0; transform: translateX(0); opacity: 1; }
    .studio-sidebar.right { transform: translateX(0); opacity: 1; }
  }

  @media (max-width: 768px) {
    .studio-toolbar { padding: 8px 16px; flex-direction: column; gap: 12px; height: auto; }
    .toolbar-left { width: 100%; justify-content: space-between; }
    .studio-title input { width: 160px; font-size: 16px; }
    .zoom-controls { width: 100%; justify-content: center; background: var(--bg); padding: 8px; border-radius: 12px; }
    .toolbar-right { position: fixed; bottom: 20px; right: 20px; z-index: 1000; flex-direction: column-reverse; gap: 10px; }
    .studio-btn.primary { height: 50px; width: 50px; border-radius: 50%; padding: 0; display: grid; place-items: center; }
    .studio-btn.primary span { display: none; }
    .studio-btn.primary svg { font-size: 18px; }
    .studio-btn.secondary { display: none; }
    
    .studio-sidebar { top: 110px; width: 100%; }
    .studio-sidebar.right { width: 100%; }
    
    .canvas-scroll { padding: 20px 10px; }
  }

  .studio-sidebar { background: var(--surface); overflow-y: auto; display: flex; flex-direction: column; gap: 32px; visibility: visible; opacity: 1; transition: opacity 0.2s; }
  .left-collapsed .studio-sidebar.left, .right-collapsed .studio-sidebar.right { opacity: 0; visibility: hidden; padding: 0; border: none; }
  
  .studio-sidebar.left { border-right: 1px solid var(--border); padding: 24px; }
  .studio-sidebar.right { border-left: 1px solid var(--border); padding: 24px; }

  .section-label { font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; white-space: nowrap; }
  .tool-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .tool-btn { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 4px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; transition: 0.2s; cursor: pointer; color: var(--text); }
  .tool-btn:hover { border-color: var(--primary); background: rgba(99, 102, 241, 0.05); color: var(--primary); }
  .tool-btn.active { background: var(--primary); color: white; border-color: var(--primary); box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2); }
  .tool-btn svg { font-size: 16px; }
  .tool-btn span { font-size: 10px; font-weight: 700; }

  .import-zone { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 24px; border: 2px dashed var(--border); border-radius: 16px; cursor: pointer; transition: 0.2s; color: var(--text-muted); }
  .import-zone:hover { border-color: var(--primary); color: var(--primary); background: rgba(99, 102, 241, 0.05); }
  .import-zone svg { font-size: 24px; }
  .import-zone span { font-size: 12px; font-weight: 700; }

  .studio-canvas { background: #525659; display: flex; flex-direction: column; overflow: hidden; position: relative; }
  .canvas-scroll { flex: 1; overflow: auto; padding: 48px; display: flex; flex-direction: column; align-items: center; }
  .canvas-scroll .pages-stack { margin: auto; flex-shrink: 0; }
  .canvas-empty { text-align: center; color: rgba(255,255,255,0.3); max-width: 320px; }
  .canvas-empty svg { font-size: 64px; margin-bottom: 20px; }
  .canvas-empty h3 { color: white; margin: 0; font-size: 20px; }
  .canvas-empty p { margin: 12px 0 24px; font-size: 14px; }

  .pages-stack { display: flex; flex-direction: column; gap: 32px; }
  .studio-page-wrap { background: white; box-shadow: 0 20px 50px rgba(0,0,0,0.3); position: relative; }
  .studio-overlay { position: absolute; inset: 0; z-index: 5; }
  .studio-overlay.active { cursor: crosshair; }

  .admin-field { background: rgba(99, 102, 241, 0.1); border: 1.5px solid var(--primary); border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
  .admin-field.admin-only { background: rgba(245, 158, 11, 0.1); border-color: #f59e0b; }
  .admin-field.dragging { opacity: 0.6; box-shadow: 0 12px 24px rgba(0,0,0,0.2); }
  .field-drag-handle { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; position: relative; }
  .field-type-icon { font-size: 14px; color: var(--primary); }
  .admin-only .field-type-icon { color: #f59e0b; }
  .field-del-btn { position: absolute; top: -8px; right: -8px; width: 20px; height: 20px; border-radius: 50%; background: #ef4444; color: white; display: grid; place-items: center; font-size: 10px; border: 2px solid var(--surface); cursor: pointer; z-index: 10; transition: transform 0.1s; }
  .field-del-btn:hover { transform: scale(1.1); background: #dc2626; }

  .field-list { display: flex; flex-direction: column; gap: 8px; }
  .field-list-item { display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; transition: 0.2s; }
  .field-list-item.admin-only { border-color: #f59e0b; background: rgba(245, 158, 11, 0.05); }
  .field-list-item .idx { width: 24px; height: 24px; border-radius: 6px; background: var(--border); color: var(--text-muted); font-size: 11px; font-weight: 800; display: grid; place-items: center; }
  .field-list-item.admin-only .idx { background: #f59e0b; color: #fff; }
  .field-list-item .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .label-input { background: none; border: none; font-size: 13px; font-weight: 700; color: var(--text); outline: none; padding: 0; width: 100%; border-bottom: 1px solid transparent; transition: 0.2s; }
  .label-input:focus { border-color: var(--primary); }
  .field-list-item.admin-only .label-input:focus { border-color: #f59e0b; }

  .field-list-item .meta { display: flex; align-items: center; gap: 8px; font-size: 10px; font-weight: 600; color: var(--text-muted); }
  .type-tag { text-transform: uppercase; background: var(--border); padding: 2px 6px; border-radius: 4px; color: var(--text-muted); font-size: 9px; }
  .admin-only .type-tag { background: #fef3c7; color: #d97706; }

  .roster-checkbox-label { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: var(--text-muted); cursor: pointer; user-select: none; }
  .roster-checkbox-label input { width: 14px; height: 14px; cursor: pointer; }
  .roster-checkbox-label.group { font-size: 10px; color: var(--primary); }
  .admin-only .roster-checkbox-label.group { color: #d97706; }

  .group-settings { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .admin-only .group-settings { background: rgba(245, 158, 11, 0.05); border-color: rgba(245, 158, 11, 0.2); }
  .group-input-wrap { display: flex; align-items: center; gap: 8px; color: var(--text-muted); }
  .group-input-wrap svg { font-size: 12px; }
  .group-input-wrap input { flex: 1; background: none; border: none; font-size: 11px; font-weight: 600; color: var(--text); outline: none; padding: 0; }

  .item-actions { display: flex; flex-direction: column; gap: 8px; align-self: flex-start; }
  
  .role-toggle { width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text-muted); display: grid; place-items: center; cursor: pointer; transition: 0.2s; }
  .role-toggle:hover { border-color: var(--primary); color: var(--primary); }
  .field-list-item.admin-only .role-toggle { border-color: #f59e0b; color: #f59e0b; }

  .field-list-item .del { width: 28px; height: 28px; color: var(--text-muted); transition: 0.2s; background: none; border: 1px solid transparent; border-radius: 8px; cursor: pointer; display: grid; place-items: center; }
  .field-list-item .del:hover { background: #fff1f2; color: #ef4444; border-color: #fecdd3; }
  :root[data-theme="dark"] .field-list-item .del:hover { background: #451a1a; }

  .empty-hint { text-align: center; color: var(--text-muted); font-size: 13px; padding: 40px 20px; font-style: italic; }
  .studio-loading { height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--text); font-weight: 800; font-size: 18px; }
`;
