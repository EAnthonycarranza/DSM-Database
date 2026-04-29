// src/components/UserPdfSigner.jsx
import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { useApp } from "../context/AppContext";
import { 
  FaFilePdf, FaSignature, FaPenNib, FaCheckCircle, FaTrash, 
  FaFileImport, FaSave, FaSearch, FaChevronLeft, FaTimes,
  FaArrowLeft, FaEye, FaDownload, FaMousePointer, FaKeyboard,
  FaUndo, FaEraser, FaCheck, FaPen, FaUpload, FaFont, FaCircle
} from "react-icons/fa";

// Configure PDF.js worker
const PDFJS_VERSION = pdfjsLib.version || "5.4.54";
const PDFJS_MAJOR = parseInt(PDFJS_VERSION.split(".")[0], 10) || 5;
const WORKER_EXT = PDFJS_MAJOR >= 4 ? "mjs" : "js";
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.${WORKER_EXT}`;

const FONT_CHOICES = [
  "Dancing Script","Great Vibes","Pacifico","Satisfy","Caveat","Allura",
  "Sacramento","Kaushan Script","Amatic SC","Permanent Marker","Rock Salt",
  "Homemade Apple","Parisienne","Yellowtail","Marck Script","Alex Brush"
];

/* ------------------------------------------
   DSM Verification Suite Design System
------------------------------------------- */
const styles = `
:root {
  --primary: #4f46e5;
  --primary-hover: #4338ca;
  --surface: #ffffff;
  --bg: #f8fafc;
  --panel: #ffffff;
  --border: #e2e8f0;
  --text: #0f172a;
  --text-muted: #64748b;
  --success: #10b981;
  --warn: #f59e0b;
  --danger: #ef4444;
  --shadow: 0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05);
  --radius: 16px;
}

[data-theme='dark'] {
  --primary: #6366f1;
  --primary-hover: #818cf8;
  --surface: #0f172a;
  --bg: #020617;
  --panel: #1e293b;
  --border: #334155;
  --text: #f1f5f9;
  --text-muted: #94a3b8;
  --shadow: 0 20px 50px rgba(0,0,0,0.3);
}

.verification-suite {
  min-height: calc(100vh - 64px);
  background: var(--bg);
  color: var(--text);
  display: flex;
  flex-direction: column;
}

.suite-header {
  height: 64px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(12px);
}

.header-left { display: flex; align-items: center; gap: 20px; }
.header-title h1 { font-size: 18px; font-weight: 800; margin: 0; letter-spacing: -0.5px; }
.header-title p { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin: 2px 0 0; }

.header-actions { display: flex; gap: 12px; }
.suite-btn {
  height: 40px;
  padding: 0 20px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}

.suite-btn:hover { background: var(--bg); border-color: var(--text-muted); }
.suite-btn.primary { background: var(--primary); color: white; border: none; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2); }
.suite-btn.primary:hover { background: var(--primary-hover); transform: translateY(-1px); }

.suite-workspace {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 320px;
  min-height: 0;
}

.suite-viewer {
  background: #525659;
  overflow: auto;
  padding: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.suite-viewer .document-stack { margin: auto; flex-shrink: 0; }

.document-stack { display: flex; flex-direction: column; gap: 32px; }
.page-container {
  background: white;
  box-shadow: 0 20px 50px rgba(0,0,0,0.3);
  position: relative;
}

.field-overlay { position: absolute; inset: 0; z-index: 5; }
.signer-field {
  position: absolute;
  background: rgba(79, 70, 229, 0.1);
  border: 1.5px dashed var(--primary);
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--primary);
  font-weight: 700;
  font-size: 12px;
}

.signer-field:hover { background: rgba(79, 70, 229, 0.2); border-style: solid; }
.signer-field.filled { background: white; border: 1.5px solid var(--success); color: var(--success); }
.field-icon-badge { width: 24px; height: 24px; background: var(--warn); border-radius: 4px; display: grid; place-items: center; color: #000; font-size: 12px; }

.suite-sidebar {
  background: var(--surface);
  border-left: 1px solid var(--border);
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.sidebar-label { font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 20px; }
.progress-list { display: flex; flex-direction: column; gap: 8px; }
.progress-item {
  padding: 12px;
  border-radius: 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: 0.2s;
}

.progress-item:hover { border-color: var(--primary); }
.progress-item.done { border-color: var(--success); background: rgba(16, 185, 129, 0.05); }
.progress-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border); }
.progress-item.done .progress-dot { background: var(--success); }
.progress-item .label { font-size: 13px; font-weight: 700; color: var(--text); }
.progress-item .meta { font-size: 10px; font-weight: 600; color: var(--text-muted); }

.suite-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(8px);
  display: grid;
  place-items: center;
  z-index: 1000;
}

.suite-modal {
  width: min(640px, 95vw);
  background: var(--surface);
  border-radius: 24px;
  box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4);
  overflow: hidden;
}

.modal-head { padding: 24px 32px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
.modal-body { padding: 32px; }
.modal-foot { padding: 20px 32px; background: var(--bg); border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 12px; }

.sig-tabs { display: flex; background: var(--bg); padding: 4px; border-radius: 12px; gap: 4px; margin-bottom: 24px; }
.sig-tabs button { flex: 1; height: 40px; border-radius: 9px; border: none; font-weight: 700; font-size: 13px; color: var(--text-muted); background: transparent; transition: 0.2s; cursor: pointer; }
.sig-tabs button.active { background: var(--surface); color: var(--primary); box-shadow: 0 2px 4px rgba(0,0,0,0.05); }

.type-area { display: flex; flex-direction: column; gap: 20px; }
.type-input { width: 100%; padding: 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 16px; outline: none; }
.sig-live-preview { height: 120px; background: white; border: 1px solid var(--border); border-radius: 12px; display: grid; place-items: center; font-size: 40px; color: #0f172a; }

.draw-area { display: flex; flex-direction: column; gap: 16px; }
.draw-canvas-wrap { border: 2px dashed var(--border); border-radius: 16px; background: white; overflow: hidden; }
.draw-actions { display: flex; gap: 12px; }

.toast-msg { position: fixed; bottom: 32px; right: 32px; padding: 12px 24px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); z-index: 2000; font-weight: 700; animation: slideUp 0.3s ease; }

@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

@media (max-width: 1024px) {
  .suite-workspace { grid-template-columns: 1fr; }
  .suite-sidebar { display: none; }
}

@media (max-width: 768px) {
  .suite-header { padding: 0 16px; height: auto; padding-top: 12px; padding-bottom: 12px; flex-direction: column; align-items: stretch; gap: 12px; position: relative; }
  .header-left { width: 100%; justify-content: flex-start; }
  .header-actions { 
    position: fixed; bottom: 24px; right: 20px; z-index: 1000; 
    flex-direction: column-reverse; gap: 12px; align-items: flex-end;
  }
  .suite-btn { height: 50px; width: auto; min-width: 50px; padding: 0 20px; border-radius: 25px; box-shadow: 0 8px 25px rgba(0,0,0,0.2); }
  .suite-btn span { font-size: 14px; }
  .suite-btn.primary { background: var(--primary); }
  
  .suite-viewer { padding: 20px 10px; }
  .document-stack { gap: 16px; }
  
  .suite-modal { width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; }
  .modal-body { flex: 1; overflow-y: auto; padding: 20px; }
  .modal-foot { padding: 16px 20px; }
  
  .sig-live-preview { height: 100px; font-size: 30px; }
  .font-grid { grid-template-columns: repeat(2, 1fr) !important; }
}
`;

export default function UserPdfSigner() {
  const { api, setToast, user } = useApp();
  const [pdfBytes, setPdfBytes] = useState(null);
  const [pagesMeta, setPagesMeta] = useState([]);
  const [fields, setFields] = useState([]);
  const [placements, setPlacements] = useState({});
  const [loading, setLoading] = useState(false);
  const [signature, setSignature] = useState(null);
  const [showSigModal, setShowSigModal] = useState(false);
  const [sigTab, setSigTab] = useState("type");
  const [fullName, setFullName] = useState("");
  const [selectedFont, setSelectedFont] = useState(FONT_CHOICES[0]);

  const canvasRefs = useRef({});
  const pdfDocRef = useRef(null);
  const drawCanvasRef = useRef(null);

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const ab = await file.arrayBuffer();
      setPdfBytes(ab);
    }
  };

  useEffect(() => {
    if (!pdfBytes) return;
    (async () => {
      setLoading(true);
      try {
        const doc = await pdfjsLib.getDocument({ 
          data: pdfBytes.slice(0),
          cMapUrl: `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/standard_fonts/`
        }).promise;
        pdfDocRef.current = doc;
        const metas = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: 1.2 });
          metas.push({ num: i, width: vp.width, height: vp.height });
        }
        setPagesMeta(metas);
      } finally { setLoading(false); }
    })();
  }, [pdfBytes]);

  const renderPage = async (num, canvas) => {
    if (!pdfDocRef.current || !canvas) return;
    try {
      const page = await pdfDocRef.current.getPage(num);
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: 1.2 * dpr });
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = Math.floor(viewport.width / dpr) + "px";
      canvas.style.height = Math.floor(viewport.height / dpr) + "px";
      
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ 
        canvasContext: ctx, 
        viewport: viewport,
        intent: 'display'
      }).promise;
    } catch (err) {
      console.error(`Error rendering page ${num}:`, err);
    }
  };

  const handleAdopt = () => {
    setSignature({ name: fullName, font: selectedFont });
    setShowSigModal(false);
    setToast("Signature verification active");
  };

  const onFinish = async () => {
    setToast("Verification process completed");
    try {
      const allUsers = await api.getAll("users");
      const admins = allUsers.filter(u => String(u.role || "").toLowerCase() === "admin");
      
      for (const admin of admins) {
        await api.add("notifications", {
          id: `notif-${Date.now()}-${admin.id}`,
          to: admin.id,
          from: user?.id,
          title: "Document Signed",
          text: `${user?.name || "A student"} has finished signing their document.`,
          type: "document_signed",
          read: false,
          createdAt: Date.now()
        });
      }
    } catch (e) {
      console.error("Failed to notify admins", e);
    }
  };

  if (loading && !pagesMeta.length) return <div className="pdf-loading">Booting Verification Suite...</div>;

  return (
    <section className="verification-suite">
      <style>{styles}</style>
      
      <header className="suite-header">
        <div className="header-left">
          <button className="back-btn" onClick={() => window.history.back()}><FaArrowLeft /></button>
          <div className="header-title">
            <h1>Verification & Signing</h1>
            <p>Secure Document Workspace</p>
          </div>
        </div>
        <div className="header-actions">
          <label className="suite-btn">
            <FaFileImport /> Import PDF
            <input type="file" hidden accept="application/pdf" onChange={onFileChange} />
          </label>
          <button className="suite-btn" onClick={() => setShowSigModal(true)}>
            <FaPenNib /> {signature ? 'Update Signature' : 'Adopt Signature'}
          </button>
          <button className="suite-btn primary" onClick={onFinish}>
            <FaCheckCircle /> Finalize & Submit
          </button>
        </div>
      </header>

      <div className="suite-workspace">
        <main className="suite-viewer">
          {!pdfBytes ? (
            <div className="viewer-empty">
              <FaFilePdf size={64} style={{ opacity: 0.2, marginBottom: 20 }} />
              <h3>No Document Active</h3>
              <p>Import a document to begin the signing process.</p>
            </div>
          ) : (
            <div className="document-stack">
              {pagesMeta.map(meta => (
                <div key={meta.num} className="page-container">
                  <canvas ref={el => { if (el) renderPage(meta.num, el); }} />
                  <div className="field-overlay">
                    {fields.filter(f => f.page === meta.num).map(f => (
                      <div 
                        key={f.id} 
                        className={`signer-field ${placements[f.id] ? 'filled' : ''}`}
                        style={{ left: f.x, top: f.y, width: f.width, height: f.height }}
                        onClick={() => setPlacements(p => ({ ...p, [f.id]: true }))}
                      >
                        <div className="field-icon-badge"><FaPenNib /></div>
                        <span>{f.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        <aside className="suite-sidebar">
          <div className="sidebar-label">Verification Progress</div>
          <div className="progress-list">
            {fields.map((f, i) => (
              <div key={f.id} className={`progress-item ${placements[f.id] ? 'done' : ''}`}>
                <div className="progress-dot" />
                <div className="info">
                  <div className="label">{f.type}</div>
                  <div className="meta">Page {f.page}</div>
                </div>
                {placements[f.id] && <FaCheckCircle style={{ marginLeft: 'auto', color: 'var(--success)' }} />}
              </div>
            ))}
            {fields.length === 0 && <div className="empty-hint">Fields will appear here once a template is active.</div>}
          </div>
        </aside>
      </div>

      {showSigModal && (
        <div className="suite-modal-overlay">
          <div className="suite-modal">
            <div className="modal-head">
              <h3>Adopt Your Signature</h3>
              <button className="close-btn" onClick={() => setShowSigModal(false)}><FaTimes /></button>
            </div>
            <div className="modal-body">
              <div className="sig-tabs">
                <button className={sigTab === 'type' ? 'active' : ''} onClick={() => setSigTab('type')}>Type</button>
                <button className={sigTab === 'draw' ? 'active' : ''} onClick={() => setSigTab('draw')}>Draw</button>
                <button className={sigTab === 'upload' ? 'active' : ''} onClick={() => setSigTab('upload')}>Upload</button>
              </div>

              {sigTab === 'type' && (
                <div className="type-area">
                  <input 
                    className="type-input" 
                    value={fullName} 
                    onChange={e => setFullName(e.target.value)} 
                    placeholder="Enter your full name..."
                  />
                  <div className="sig-live-preview" style={{ fontFamily: selectedFont }}>
                    {fullName || "Your Signature"}
                  </div>
                  <div className="font-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {FONT_CHOICES.slice(0, 6).map(f => (
                      <button 
                        key={f} 
                        className={`suite-btn ${selectedFont === f ? 'primary' : ''}`}
                        onClick={() => setSelectedFont(f)}
                        style={{ fontFamily: f, fontSize: 16 }}
                      >
                        Aa
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {sigTab === 'draw' && (
                <div className="draw-area">
                  <div className="draw-canvas-wrap">
                    <canvas ref={drawCanvasRef} width={580} height={200} />
                  </div>
                  <div className="draw-actions">
                    <button className="suite-btn"><FaEraser /> Clear</button>
                    <button className="suite-btn"><FaUndo /> Undo</button>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="suite-btn" onClick={() => setShowSigModal(false)}>Cancel</button>
              <button className="suite-btn primary" onClick={handleAdopt}>Adopt & Sign</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
