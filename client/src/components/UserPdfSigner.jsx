// src/components/UserPdfSigner.jsx
import React, { useEffect, useRef, useState } from "react";
import SignatureAdopter from "./SignatureAdopter";
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


/* ------------------------------------------
   DSM Verification Suite Design System
------------------------------------------- */
const styles = `
.verification-suite {
  height: calc(100vh - 64px);
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
}

.header-left { display: flex; align-items: center; gap: 20px; }
.back-btn { width: 40px; height: 40px; border-radius: 10px; background: var(--bg); color: var(--text-muted); display: grid; place-items: center; cursor: pointer; border: none; }
.back-btn:hover { background: var(--border); color: var(--text); }
.header-title h1 { font-size: 18px; font-weight: 800; margin: 0; color: var(--text); }
.header-title p { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin: 2px 0 0; }

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
  transition: all 0.2s;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
}

.suite-btn:hover { background: var(--bg); color: var(--text); border-color: var(--text-muted); }
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
  background: rgba(99, 102, 241, 0.1);
  border: 1.5px solid var(--primary);
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
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.signer-field:hover { background: rgba(99, 102, 241, 0.2); }
.signer-field.filled { background: white; border-color: var(--success); color: var(--success); }
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

.toast-msg { position: fixed; bottom: 32px; right: 32px; padding: 12px 24px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); z-index: 2000; font-weight: 700; animation: slideUp 0.3s ease; }

@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

@media (max-width: 1024px) {
  .suite-workspace { grid-template-columns: 1fr; }
  .suite-sidebar { display: none; }
}

@media (max-width: 768px) {
  .suite-header { padding: 8px 16px; flex-direction: column; gap: 12px; height: auto; }
  .header-left { width: 100%; justify-content: space-between; }
  .header-actions { 
    position: fixed; bottom: 20px; right: 20px; z-index: 1000; 
    flex-direction: column-reverse; gap: 10px; align-items: flex-end;
  }
  .suite-btn { height: 50px; width: 50px; border-radius: 50%; padding: 0; display: grid; place-items: center; box-shadow: 0 8px 25px rgba(0,0,0,0.2); }
  .suite-btn span { display: none; }
  .suite-btn svg { font-size: 18px; }
  .suite-btn.primary { background: var(--primary); }
  
  .suite-viewer { padding: 20px 10px; }
  .document-stack { gap: 16px; }
  
  .suite-modal { width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; }
  .modal-body { flex: 1; overflow-y: auto; padding: 20px; }
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

  const canvasRefs = useRef({});
  const pdfDocRef = useRef(null);

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

  const handleAdopt = (dataUrl) => {
    setSignature(dataUrl);
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
              <SignatureAdopter 
                onAdopt={handleAdopt} 
                onClose={() => setShowSigModal(false)} 
                defaultName={user?.name || ""}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
