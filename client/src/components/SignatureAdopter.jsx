import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FaTimes, FaSignature, FaPenNib, FaUpload, FaEraser, FaTrash } from 'react-icons/fa';

// Primary Cursive Font
const SIGNATURE_FONT = 'Dancing Script';

const ensureHeadLink = (href, attrs = {}) => {
  if (typeof document === 'undefined') return;
  if ([...document.styleSheets].some((s) => (s?.href || '').includes(href))) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  Object.entries(attrs).forEach(([k, v]) => link.setAttribute(k, v));
  document.head.appendChild(link);
};

const ensureSignatureFonts = () => {
  ensureHeadLink(
    'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;600;700&display=swap',
    { 'data-google-fonts': 'true' }
  );
};

// Measure helper to fit typed signature into box
const measureCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const measureCtx = measureCanvas ? measureCanvas.getContext('2d') : null;

function computeFittingFontSize({ text, fontFamily, maxWidth, maxHeight }) {
  if (!measureCtx) return 32;
  const pad = 20;
  let low = 12, high = 72;
  let best = 32;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    measureCtx.font = `${mid}px '${fontFamily}', cursive`;
    const w = measureCtx.measureText(text).width;
    const h = mid * 1.2; // roughly
    if (w <= maxWidth - pad && h <= maxHeight - pad) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

function SignatureAdopter({
  defaultName = '',
  onAdopt,
  onClose,
  color = '#111827',
  outputWidth = 800,
  outputHeight = 240,
}) {
  const [tab, setTab] = useState('type'); // 'type' | 'draw' | 'upload'
  const [name, setName] = useState(defaultName || '');
  const drawRef = useRef(null);
  const drawCtxRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPtRef = useRef(null);
  const [uploaded, setUploaded] = useState(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    ensureSignatureFonts();
  }, []);

  // Initialize Drawing Canvas
  useEffect(() => {
    if (tab !== 'draw' || !drawRef.current) return;
    const canvas = drawRef.current;
    const ctx = canvas.getContext('2d');
    drawCtxRef.current = ctx;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;

    const getPos = (e) => {
      const r = canvas.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: cx - r.left, y: cy - r.top };
    };

    const down = (e) => {
      e.preventDefault();
      drawingRef.current = true;
      lastPtRef.current = getPos(e);
      setHasDrawn(true);
    };

    const move = (e) => {
      if (!drawingRef.current) return;
      const { x, y } = getPos(e);
      const last = lastPtRef.current || { x, y };
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      lastPtRef.current = { x, y };
    };

    const up = () => { drawingRef.current = false; };

    canvas.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    canvas.addEventListener('touchstart', down, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);

    return () => {
      canvas.removeEventListener('mousedown', down);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      canvas.removeEventListener('touchstart', down);
      canvas.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, [tab, color]);

  const clearDrawing = () => {
    const canvas = drawRef.current;
    if (!canvas || !drawCtxRef.current) return;
    drawCtxRef.current.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const onUpload = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => setUploaded(e.target.result);
    reader.readAsDataURL(file);
  };

  const adopt = async () => {
    try {
      let finalDataUrl = null;

      if (tab === 'type') {
        if (!name.trim()) return;
        const canvas = document.createElement('canvas');
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const ctx = canvas.getContext('2d');
        const fit = computeFittingFontSize({ text: name, fontFamily: SIGNATURE_FONT, maxWidth: outputWidth, maxHeight: outputHeight });
        ctx.clearRect(0, 0, outputWidth, outputHeight);
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${fit}px '${SIGNATURE_FONT}', cursive`;
        ctx.fillText(name, outputWidth / 2, outputHeight / 2);
        finalDataUrl = canvas.toDataURL('image/png');
      } 
      else if (tab === 'draw') {
        if (!hasDrawn) return;
        finalDataUrl = drawRef.current.toDataURL('image/png');
      } 
      else if (tab === 'upload') {
        if (!uploaded) return;
        finalDataUrl = uploaded;
      }

      if (finalDataUrl) {
        onAdopt && onAdopt(finalDataUrl);
        onClose && onClose();
      }
    } catch (err) {
      console.error(err);
      alert("Failed to adopt signature. Please try again.");
    }
  };

  return (
    <div className="sig-adopter-wrap">
      <style>{`
        .sig-adopter-wrap { display: flex; flex-direction: column; gap: 20px; padding: 4px; }
        .sig-tabs { display: flex; background: #f3f4f6; padding: 4px; border-radius: 12px; }
        .sig-tab { flex: 1; padding: 8px 12px; border: none; background: transparent; border-radius: 8px; font-size: 14px; font-weight: 500; color: #6b7280; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .sig-tab.active { background: #fff; color: var(--primary); box-shadow: 0 2px 6px rgba(0,0,0,0.05); }
        .sig-input-area { margin-top: 10px; }
        .sig-name-input { width: 100%; padding: 12px 16px; border: 1px solid #e5e7eb; borderRadius: 12px; font-size: 15px; outline: none; transition: 0.2s; }
        .sig-name-input:focus { border-color: var(--primary); box-shadow: 0 0 0 4px rgba(var(--primary-rgb), 0.1); }
        .sig-preview-box { height: 180px; border: 1px solid #e5e7eb; border-radius: 12px; background: #fcfcfc; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; margin-top: 16px; }
        .sig-preview-text { font-family: '${SIGNATURE_FONT}', cursive; font-size: 42px; color: #111827; }
        .sig-draw-canvas { cursor: crosshair; touch-action: none; background: #fff; }
        .sig-draw-tools { position: absolute; top: 12px; right: 12px; display: flex; gap: 8px; }
        .sig-tool-btn { width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e5e7eb; background: #fff; color: #6b7280; display: grid; place-items: center; cursor: pointer; transition: 0.2s; }
        .sig-tool-btn:hover { background: #f9fafb; color: #ef4444; border-color: #fca5a5; }
        .sig-upload-area { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; cursor: pointer; }
        .sig-upload-area:hover { background: #f9fafb; }
        .sig-upload-icon { font-size: 24px; color: #9ca3af; }
        .sig-upload-text { font-size: 14px; color: #6b7280; font-weight: 500; }
        .sig-uploaded-img { max-width: 90%; max-height: 90%; object-fit: contain; }
        .sig-modal-footer { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; }
        .sig-btn { padding: 10px 20px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; transition: 0.2s; border: none; }
        .sig-btn-cancel { background: #f3f4f6; color: #4b5563; }
        .sig-btn-cancel:hover { background: #e5e7eb; }
        .sig-btn-adopt { background: var(--primary); color: #fff; }
        .sig-btn-adopt:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(var(--primary-rgb), 0.3); }
        .sig-btn-adopt:disabled { background: #d1d5db; cursor: not-allowed; transform: none; box-shadow: none; }
      `}</style>

      <div className="sig-tabs">
        <button className={`sig-tab ${tab === 'type' ? 'active' : ''}`} onClick={() => setTab('type')}>
          <FaPenNib /> Type
        </button>
        <button className={`sig-tab ${tab === 'draw' ? 'active' : ''}`} onClick={() => setTab('draw')}>
          <FaEraser /> Draw
        </button>
        <button className={`sig-tab ${tab === 'upload' ? 'active' : ''}`} onClick={() => setTab('upload')}>
          <FaUpload /> Upload
        </button>
      </div>

      <div className="sig-input-area">
        {tab === 'type' && (
          <>
            <input 
              type="text" 
              className="sig-name-input" 
              placeholder="Enter your full name" 
              value={name} 
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <div className="sig-preview-box">
              <span className="sig-preview-text">{name || 'Your Signature'}</span>
            </div>
          </>
        )}

        {tab === 'draw' && (
          <div className="sig-preview-box">
            <canvas ref={drawRef} className="sig-draw-canvas" style={{ width: '100%', height: '100%' }} />
            <div className="sig-draw-tools">
              <button className="sig-tool-btn" onClick={clearDrawing} title="Clear Drawing"><FaTrash /></button>
            </div>
          </div>
        )}

        {tab === 'upload' && (
          <div className="sig-preview-box" onClick={() => fileInputRef.current?.click()}>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept="image/*" 
              onChange={(e) => onUpload(e.target.files?.[0])} 
            />
            {uploaded ? (
              <img src={uploaded} alt="Signature" className="sig-uploaded-img" />
            ) : (
              <div className="sig-upload-area">
                <FaUpload className="sig-upload-icon" />
                <span className="sig-upload-text">Click to upload signature image</span>
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>Supports PNG, JPG (Max 2MB)</span>
              </div>
            )}
            {uploaded && (
              <div className="sig-draw-tools">
                <button className="sig-tool-btn" onClick={(e) => { e.stopPropagation(); setUploaded(null); }} title="Remove Image"><FaTrash /></button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="sig-modal-footer">
        <button className="sig-btn sig-btn-cancel" onClick={onClose}>Cancel</button>
        <button 
          className="sig-btn sig-btn-adopt" 
          onClick={adopt} 
          disabled={(tab === 'type' && !name.trim()) || (tab === 'draw' && !hasDrawn) || (tab === 'upload' && !uploaded)}
        >
          Adopt & Sign
        </button>
      </div>
    </div>
  );
}

export default SignatureAdopter;
