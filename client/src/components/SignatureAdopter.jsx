import React from 'react';

// Lightweight signature adopter (Type, Draw, Upload) for form fields
// Focused on signatures only (no initials).

const FONT_CHOICES = [
  'Dancing Script','Great Vibes','Pacifico','Satisfy','Caveat','Allura',
  'Sacramento','Kaushan Script','Amatic SC','Permanent Marker','Rock Salt',
  'Homemade Apple','Parisienne','Yellowtail','Marck Script','Alex Brush',
  'Cookie','Courgette',
  'Arizonia','Clicker Script','Mr Dafoe','Qwigley','Pinyon Script',
  'Tangerine','Herr Von Muellerhoff','La Belle Aurore','Bad Script',
  'Rouge Script','Bilbo Swash Caps','Meddon','Mea Culpa'
];

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
    'https://fonts.googleapis.com/css2' +
      '?family=Inter:wght@400;500;600;700' +
      '&family=Great+Vibes' +
      '&family=Pacifico' +
      '&family=Satisfy' +
      '&family=Dancing+Script:wght@400;600' +
      '&family=Caveat:wght@500;700' +
      '&family=Allura' +
      '&family=Sacramento' +
      '&family=Kaushan+Script' +
      '&family=Amatic+SC:wght@700' +
      '&family=Permanent+Marker' +
      '&family=Rock+Salt' +
      '&family=Homemade+Apple' +
      '&family=Parisienne' +
      '&family=Yellowtail' +
      '&family=Marck+Script' +
      '&family=Alex+Brush' +
      '&family=Cookie' +
      '&family=Courgette' +
      '&family=Arizonia' +
      '&family=Clicker+Script' +
      '&family=Mr+Dafoe' +
      '&family=Qwigley' +
      '&family=Pinyon+Script' +
      '&family=Tangerine:wght@400;700' +
      '&family=Herr+Von+Muellerhoff' +
      '&family=La+Belle+Aurore' +
      '&family=Bad+Script' +
      '&family=Rouge+Script' +
      '&family=Bilbo+Swash+Caps' +
      '&family=Meddon' +
      '&family=Mea+Culpa' +
      '&display=swap',
    { 'data-google-fonts': 'true' }
  );
};

// Measure helper to fit typed signature into box
const measureCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const measureCtx = measureCanvas ? measureCanvas.getContext('2d') : null;
function computeFittingFontSize({ text, fontFamily, maxWidth, maxHeight }) {
  if (!measureCtx) return 18;
  const pad = 6;
  let low = 8, high = Math.max(10, Math.floor(maxHeight - pad));
  let best = 8;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    measureCtx.font = `${mid}px '${fontFamily}', cursive`;
    const w = measureCtx.measureText(text).width;
    const h = mid;
    if (w <= Math.max(2, maxWidth - pad) && h <= Math.max(2, maxHeight - pad)) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return Math.max(8, best);
}

const ensureWebFontLoaded = async (fontFamily) => {
  try {
    if (document?.fonts?.load) {
      await document.fonts.load(`24px '${fontFamily}', cursive`);
      await document.fonts.ready;
    }
  } catch {}
};

function SignatureAdopter({
  defaultName = '',
  onAdopt,
  onClose,
  allowUpload = true,
  color = '#000000',
  outputWidth = 700,
  outputHeight = 180,
}) {
  const [tab, setTab] = React.useState('type'); // 'type' | 'draw' | 'upload'
  const [name, setName] = React.useState(defaultName || '');
  const [font, setFont] = React.useState('Dancing Script');
  const drawRef = React.useRef(null);
  const drawCtxRef = React.useRef(null);
  const drawingRef = React.useRef(false);
  const lastPtRef = React.useRef(null);
  const [penSize, setPenSize] = React.useState(2);
  const [uploaded, setUploaded] = React.useState(null);

  React.useEffect(() => {
    ensureSignatureFonts();
  }, []);

  React.useEffect(() => {
    if (tab !== 'draw') return;
    const canvas = drawRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    drawCtxRef.current = ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = outputWidth; const h = 200;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,w,h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = penSize;

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: cx - rect.left, y: cy - rect.top };
    };
    const down = (e) => { e.preventDefault(); drawingRef.current = true; lastPtRef.current = getPos(e); };
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
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    canvas.addEventListener('touchstart', down, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      canvas.removeEventListener('touchstart', down);
      canvas.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, [tab, penSize, color, outputWidth]);

  const clearDrawing = () => {
    const canvas = drawRef.current;
    const ctx = drawCtxRef.current;
    if (!canvas || !ctx) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,w,h);
  };

  const onUpload = async (file) => {
    if (!file || !file.type || !file.type.startsWith('image/')) return;
    const MAX_BYTES = 2 * 1024 * 1024;
    if (file.size > MAX_BYTES) { alert('Image too large (max 2MB)'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1200;
        let w = img.width, h = img.height;
        const scale = Math.min(1, MAX_DIM / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        const off = document.createElement('canvas');
        off.width = w; off.height = h;
        const octx = off.getContext('2d');
        octx.drawImage(img, 0, 0, w, h);
        setUploaded(off.toDataURL('image/png'));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const adopt = async () => {
    try {
      if (tab === 'type') {
        const t = (name || '').trim();
        if (!t) return;
        await ensureWebFontLoaded(font);
        const cssW = outputWidth, cssH = outputHeight;
        const fit = computeFittingFontSize({ text: t, fontFamily: font, maxWidth: cssW, maxHeight: cssH });
        const scale = 3; // high-res export for crispness
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(cssW * scale));
        canvas.height = Math.max(1, Math.floor(cssH * scale));
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `${fit}px '${font}', cursive`;
        ctx.fillText(t, cssW / 2, cssH / 2);
        const dataUrl = canvas.toDataURL('image/png');
        onAdopt && onAdopt(dataUrl);
        onClose && onClose();
        return;
      }
      if (tab === 'draw') {
        const canvas = drawRef.current; if (!canvas) return;
        // Re-render to target size with white bg
        const out = document.createElement('canvas');
        const dpr = window.devicePixelRatio || 1;
        const viewW = outputWidth, viewH = outputHeight;
        out.width = Math.floor(viewW * dpr); out.height = Math.floor(viewH * dpr);
        const octx = out.getContext('2d');
        octx.scale(dpr, dpr);
        octx.fillStyle = '#fff'; octx.fillRect(0,0,viewW,viewH);
        // draw current canvas scaled into output rect
        octx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, viewW, viewH);
        const dataUrl = out.toDataURL('image/png');
        onAdopt && onAdopt(dataUrl);
        onClose && onClose();
        return;
      }
      if (tab === 'upload') {
        if (!uploaded) return;
        onAdopt && onAdopt(uploaded);
        onClose && onClose();
        return;
      }
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert('Could not create signature. Please try again.');
    }
  };

  return (
    <div>
      <div style={{ display:'grid', gap:12 }}>
        <div>
          <label style={{ display:'block', fontSize:12, color:'#6b7280', marginBottom:6 }}>Full Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your full name"
            style={{ width:'100%', padding:'10px 12px', border:'1px solid #d1d5db', borderRadius:10 }}
          />
        </div>

        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button type="button" className={`btn ${tab==='type' ? 'primary' : ''}`} onClick={() => setTab('type')}>Type</button>
          <button type="button" className={`btn ${tab==='draw' ? 'primary' : ''}`} onClick={() => setTab('draw')}>Draw</button>
          {allowUpload && <button type="button" className={`btn ${tab==='upload' ? 'primary' : ''}`} onClick={() => setTab('upload')}>Upload</button>}
        </div>

        {tab === 'type' && (
          <div>
            <div style={{ marginBottom:8 }}>
              <label style={{ display:'block', fontSize:12, color:'#6b7280', marginBottom:6 }}>Style</label>
              <select value={font} onChange={(e) => setFont(e.target.value)} style={{ padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:8 }}>
                {FONT_CHOICES.map((f) => (<option key={f} value={f}>{f}</option>))}
              </select>
            </div>
            <div style={{ background:'#fff', border:'1px solid #d1d5db', borderRadius:10, padding:12, textAlign:'center' }}>
              <div style={{ fontFamily:`'${font}', cursive`, color:'#111', fontSize:32 }}>
                {name || 'Your Name'}
              </div>
            </div>
          </div>
        )}

        {tab === 'draw' && (
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <span style={{ fontSize:12, color:'#6b7280' }}>Pen size</span>
              {[2,3,4,5].map((s) => (
                <button type="button" key={s} className={`btn ${penSize===s ? 'primary' : ''}`} onClick={() => setPenSize(s)}>{s}px</button>
              ))}
              <div style={{ flex:1 }} />
              <button type="button" className="btn" onClick={clearDrawing}>Clear</button>
            </div>
            <div className="draw-wrap" style={{ background:'#fff', border:'1px dashed #cbd5e1', borderRadius:8 }}>
              <canvas ref={drawRef} style={{ width:'100%', height:200, display:'block', background:'#fff' }} />
            </div>
          </div>
        )}

        {tab === 'upload' && (
          <div>
            <input type="file" accept="image/*" onChange={(e) => onUpload(e.target.files?.[0])} />
            {uploaded && (
              <div style={{ marginTop:10, padding:8, background:'#fff', border:'1px solid #d1d5db', borderRadius:10, textAlign:'center' }}>
                <img alt="Uploaded signature" src={uploaded} style={{ maxWidth:'100%', maxHeight:140 }} />
              </div>
            )}
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={adopt} disabled={(tab==='type' && !name) || (tab==='upload' && !uploaded)}>
            Adopt Signature
          </button>
        </div>
      </div>
    </div>
  );
}

export default SignatureAdopter;
