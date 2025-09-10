import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { 
  Plus, Save, Eye, X, ChevronUp, ChevronDown, GripVertical, 
  Trash2, Copy, Settings, FileText, Mail, Phone, Calendar,
  Hash, ToggleLeft, Type, AlignLeft, CheckSquare, Circle, 
  List, Upload, Link, AlertCircle, Check, Edit2, Archive, 
  Send, Users, Download, Clock, Lock, Globe, BarChart,
  Database, Zap, Shield, Star, ArrowLeft, FilePlus, FileUp,
  Loader, Info, Wand2
} from 'lucide-react';

// Note: In production, install and import these properly:
// We use pdfjs-dist from CDN for the worker to avoid bundler config.
import * as pdfjsLib from 'pdfjs-dist';
const PDFJS_VERSION = pdfjsLib.version || '5.4.54';
const PDFJS_MAJOR = parseInt((PDFJS_VERSION || '5').split('.')?.[0] || '5', 10) || 5;
const WORKER_EXT = PDFJS_MAJOR >= 4 ? 'mjs' : 'js';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.${WORKER_EXT}`;

const FormBuilder = ({ api }) => {
  const navigate = useNavigate();
  const { api: appApi, setModal } = useApp?.() || {};
  const getApi = () => api || appApi;
  
  // Main state
  const [forms, setForms] = useState([]);
  const [currentForm, setCurrentForm] = useState({
    title: '',
    description: '',
    fields: [],
    settings: {
      requireAuth: false,
      multipleSubmissions: false,
      notifyEmail: '',
      successMessage: 'Thank you for your submission!',
      submitButtonText: 'Submit',
      maxSubmissions: null,
      startDate: null,
      endDate: null,
      redirectUrl: '',
      isPublic: true
    },
    status: 'draft'
  });

  const [selectedField, setSelectedField] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showFieldConfig, setShowFieldConfig] = useState(false);
  const [draggedField, setDraggedField] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [activeTab, setActiveTab] = useState('builder');
  const [savedMessage, setSavedMessage] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [selectedFormId, setSelectedFormId] = useState(null);
  
  // PDF Import states
  const [showPdfImport, setShowPdfImport] = useState(false);
  const [pdfProcessing, setPdfProcessing] = useState(false);
  const [pdfFields, setPdfFields] = useState([]);
  const [pdfError, setPdfError] = useState('');
  const fileInputRef = useRef(null);
  // JSON template import/export
  const jsonFileInputRef = useRef(null);

  // Field types configuration
  const fieldTypes = [
    { type: 'text', label: 'Text Input', icon: Type, color: 'blue' },
    { type: 'email', label: 'Email', icon: Mail, color: 'purple' },
    { type: 'phone', label: 'Phone', icon: Phone, color: 'green' },
    { type: 'number', label: 'Number', icon: Hash, color: 'indigo' },
    { type: 'date', label: 'Date', icon: Calendar, color: 'pink' },
    { type: 'inlineText', label: 'Inline Text + Inputs', icon: Type, color: 'blue' },
    { type: 'textarea', label: 'Text Area', icon: AlignLeft, color: 'teal' },
    { type: 'adminText', label: 'Admin Text (Read-only)', icon: Lock, color: 'gray' },
    { type: 'signature', label: 'Signature', icon: Edit2, color: 'indigo' },
    { type: 'select', label: 'Dropdown', icon: List, color: 'orange' },
    { type: 'radio', label: 'Radio Group', icon: Circle, color: 'red' },
    { type: 'checkbox', label: 'Checkbox', icon: CheckSquare, color: 'green' },
    { type: 'multiselect', label: 'Multi-Select', icon: List, color: 'purple' },
    { type: 'file', label: 'File Upload', icon: Upload, color: 'gray' },
    { type: 'url', label: 'URL/Link', icon: Link, color: 'cyan' },
    { type: 'heading', label: 'Section Heading', icon: FileText, color: 'yellow' },
    { type: 'divider', label: 'Divider', icon: Settings, color: 'gray' },
    { type: 'time', label: 'Time', icon: Clock, color: 'blue' },
    { type: 'rating', label: 'Star Rating', icon: Star, color: 'yellow' },
    { type: 'location', label: 'Location (Google)', icon: Globe, color: 'cyan' }
  ];

  // Load forms on mount
  useEffect(() => {
    const client = getApi();
    if (client) loadForms();
  }, [appApi, api]);

  // Also refresh when switching to the My Forms tab
  useEffect(() => {
    if (activeTab === 'forms') {
      const client = getApi();
      if (client) loadForms();
    }
  }, [activeTab]);

  // API Functions
  const loadForms = async () => {
    const client = getApi();
    if (!client) return;
    setLoading(true);
    try {
      const data = await client.getAll('forms');
      setForms(data || []);
    } catch (error) {
      console.error('Failed to load forms:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveForm = async () => {
    // Client-side validation
    const vErrors = {};
    if (!currentForm.title || String(currentForm.title).trim() === '') {
      vErrors.title = 'Form title is required';
    }
    if (Object.keys(vErrors).length > 0) {
      setErrors(vErrors);
      setSavedMessage('');
      setActiveTab('builder');
      return;
    }
    setErrors({});
    const client = getApi();
    if (!client) {
      console.log('API not available, form data:', currentForm);
      setSavedMessage('Form saved locally!');
      setTimeout(() => setSavedMessage(''), 3000);
      return;
    }

    setLoading(true);
    try {
      if (currentForm.id) {
        await client.updateForm(currentForm.id, currentForm);
      } else {
        const saved = await client.createForm(currentForm);
        setCurrentForm({ ...currentForm, id: saved.id });
      }
      setSavedMessage('Form saved to server');
      setTimeout(() => setSavedMessage(''), 3000);
      await loadForms();
    } catch (error) {
      console.error('Failed to save form:', error);
      setSavedMessage('Failed to save form');
      setTimeout(() => setSavedMessage(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const deleteForm = async (formId) => {
    const client = getApi();
    if (!client) return;
    
    setLoading(true);
    try {
      await client.deleteForm(formId);
      await loadForms();
    } catch (error) {
      const message = String(
        (error && (error.message || error.reason || error.error)) ||
        error ||
        'Unknown error'
      );
      try {
        // Prefer a rich modal with retry action
        setModal?.({
          open: true,
          type: 'node',
          title: 'Delete Failed',
          node: (
            <div>
              <p style={{ marginTop: 0 }}>
                We couldn’t delete this form right now.
              </p>
              <p style={{ color: '#6b7280' }}>Details: {message}</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn-secondary" onClick={() => setModal((m) => ({ ...m, open: false }))}>Close</button>
                <button
                  className="btn-primary"
                  onClick={async () => {
                    try {
                      await client.deleteForm(formId);
                      setModal((m) => ({ ...m, open: false }));
                      await loadForms();
                    } catch (e2) {
                      const msg2 = String(e2?.message || e2 || 'Unknown error');
                      // Replace modal content with latest error
                      setModal((m) => ({ ...m, title: 'Delete Failed', open: true, type: 'text', content: `Still couldn\'t delete. ${msg2}` }));
                    }
                  }}
                >
                  Retry
                </button>
              </div>
            </div>
          )
        });
      } catch {
        // Fallback: minimal text modal
        setModal?.({ open: true, type: 'text', title: 'Delete Failed', content: message });
      }
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------------------
  // PDF Import Functions (extract AcroForm fields + nearby labels)
  // ------------------------------------------------------------
  const toTitle = (s = '') =>
    String(s || '')
      .replace(/[._]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (m) => m.toUpperCase());

  const slug = (s = '') =>
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

  const guessTypeFromLabel = (label = '') => {
    const t = String(label || '').toLowerCase();
    if (/email/.test(t)) return 'email';
    if (/(phone|tel|cell|mobile|contact number)/.test(t)) return 'phone';
    if (/(date|dob|birth)/.test(t)) return 'date';
    if (/(time)/.test(t)) return 'time';
    if (/(url|link|website)/.test(t)) return 'url';
    if (/(zip|postal|age|ssn|count|qty|amount|number)/.test(t)) return 'number';
    return 'text';
  };

  // ---------------------- Template JSON import/export ----------------------
  const ACCEPT_TYPES = new Set([
    'text','email','phone','number','date','time','textarea','select','radio','checkbox','multiselect','file','url','heading','divider','rating','adminText','inlineText','signature','location'
  ]);

  const normalizeOptionsForField = (opts) => {
    if (!Array.isArray(opts)) return [];
    return opts.map((o, i) => {
      if (o && typeof o === 'object') {
        const value = String(o.value ?? o.label ?? `option_${i+1}`).trim();
        const label = String(o.label ?? value).trim();
        return { value, label };
      }
      const value = String(o ?? `option_${i+1}`).trim();
      return { value, label: value };
    });
  };

  const applyTemplateJson = (tpl) => {
    try {
      const next = {
        title: String(tpl?.title || 'Imported Form'),
        description: String(tpl?.description || ''),
        status: String(tpl?.status || 'draft'),
        settings: {
          requireAuth: !!tpl?.settings?.requireAuth,
          multipleSubmissions: !!tpl?.settings?.multipleSubmissions,
          notifyEmail: String(tpl?.settings?.notifyEmail || ''),
          successMessage: String(tpl?.settings?.successMessage || 'Thank you for your submission!'),
          submitButtonText: String(tpl?.settings?.submitButtonText || 'Submit'),
          maxSubmissions: tpl?.settings?.maxSubmissions ?? null,
          startDate: tpl?.settings?.startDate ?? null,
          endDate: tpl?.settings?.endDate ?? null,
          redirectUrl: String(tpl?.settings?.redirectUrl || ''),
          isPublic: tpl?.settings?.isPublic !== false,
        },
        fields: []
      };

      const srcFields = Array.isArray(tpl?.fields) ? tpl.fields : [];
      const idPairs = [];
      const nameCounts = {};
      const uniq = (base) => {
        const b = (base || 'field').replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g,'') || 'field';
        nameCounts[b] = (nameCounts[b] || 0) + 1;
        return nameCounts[b] > 1 ? `${b}_${nameCounts[b]}` : b;
      };

      srcFields.forEach((f, idx) => {
        const type = String(f?.type || '').trim();
        if (!ACCEPT_TYPES.has(type)) return; // skip unknown
        const label = String(f?.label || `Field ${idx+1}`);
        const preservedId = String(f?.id || '').trim();
        const id = preservedId || `field_${Date.now()}_${idx}_${Math.random().toString(36).slice(2,9)}`;
        const name = uniq(String(f?.name || label).toLowerCase());
        const base = {
          id,
          type,
          name,
          label,
          placeholder: String(f?.placeholder || ''),
          helpText: String(f?.helpText || ''),
          defaultValue: f?.defaultValue ?? '',
          required: !!f?.required,
          width: f?.width || 'full',
          validation: { ...(f?.validation || {}) },
          conditional: f?.conditional || undefined,
        };
        if (type === 'select' || type === 'radio' || type === 'multiselect') {
          base.options = normalizeOptionsForField(f?.options || []);
        }
        if (type === 'heading') base.level = Number(f?.level || 3);
        if (type === 'checkbox') base.checkboxText = String(f?.checkboxText || label);
        if (type === 'adminText') base.content = String(f?.content || '');
        if (type === 'inlineText') base.parts = Array.isArray(f?.parts) ? f.parts : [];
        // Preserve new properties
        if (type === 'text' || type === 'number') base.mask = !!f?.mask;
        if (type === 'date') base.autoToday = !!f?.autoToday;
        idPairs.push({ origId: preservedId, origName: String(f?.name || '').toLowerCase(), newId: id });
        // signature has no extra properties
        next.fields.push(base);
      });

      // Rewire conditional fieldId(s) to the newly generated ids
      const mapToNewId = (orig) => {
        if (!orig) return '';
        const key = String(orig);
        const byId = idPairs.find(p => p.origId && p.origId === key);
        if (byId) return byId.newId;
        const byName = idPairs.find(p => p.origName && p.origName === key.toLowerCase());
        return byName ? byName.newId : key;
      };
      next.fields = next.fields.map((fld) => {
        const c = fld.conditional;
        if (!c || !c.enabled) return fld;
        const newCond = { ...c };
        if (c.fieldId) newCond.fieldId = mapToNewId(c.fieldId);
        if (Array.isArray(c.anyOf)) {
          newCond.anyOf = c.anyOf.map(tr => ({
            fieldId: mapToNewId(tr?.fieldId || ''),
            operator: tr?.operator || 'equals',
            value: tr?.value ?? ''
          }));
        }
        return { ...fld, conditional: newCond };
      });

      setCurrentForm((prev) => ({ ...prev, ...next }));
      setActiveTab('preview');
      setSavedMessage('Template JSON imported');
      setTimeout(() => setSavedMessage(''), 2500);
    } catch (e) {
      setSavedMessage('Failed to import template JSON');
      setTimeout(() => setSavedMessage(''), 3000);
    }
  };

  const handleTemplateJsonUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!json || (!Array.isArray(json.fields) && !Array.isArray(json?.form?.fields))) throw new Error('Invalid template JSON');
      applyTemplateJson(Array.isArray(json.fields) ? json : (json.form || json));
    } catch (e) {
      console.error('Template JSON import failed:', e);
      setSavedMessage('Invalid JSON template');
      setTimeout(() => setSavedMessage(''), 3000);
    } finally {
      try { event.target.value = ''; } catch {}
    }
  };

  const exportCurrentFormJson = () => {
    try {
      const out = {
        title: currentForm.title || 'Untitled Form',
        description: currentForm.description || '',
        status: currentForm.status || 'draft',
        settings: currentForm.settings || {},
        // Keep field ids so imported conditionals (fieldId/anyOf) can be reliably rewired
        fields: (currentForm.fields || []).map((f) => ({ ...f })),
      };
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${String(out.title || 'form-template').replace(/[^a-z0-9._-]+/gi,'-')}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setSavedMessage('Failed to export JSON');
      setTimeout(() => setSavedMessage(''), 3000);
    }
  };

  // Group text items into rows for crude proximity-based label detection
  const buildTextRows = (items = []) => {
    const rows = {};
    for (const it of items) {
      const x = it.transform?.[4] ?? 0;
      const y = it.transform?.[5] ?? 0;
      const str = it.str || '';
      const key = Math.round(y); // bucket by Y
      if (!rows[key]) rows[key] = [];
      rows[key].push({ x, y, str });
    }
    Object.values(rows).forEach((arr) => arr.sort((a, b) => a.x - b.x));
    return rows; // { yRounded: [{x,y,str}, ...] }
  };

  const findNearbyLabel = (textRows, fieldRect) => {
    try {
      if (!fieldRect || fieldRect.length < 4) return '';
      const minX = Math.min(fieldRect[0], fieldRect[2]);
      const minY = Math.min(fieldRect[1], fieldRect[3]);
      const maxY = Math.max(fieldRect[1], fieldRect[3]);
      const cy = (minY + maxY) / 2;
      const candidates = [];
      // search a small Y band around the field center
      for (let dy = -6; dy <= 6; dy++) {
        const row = textRows[Math.round(cy) + dy];
        if (!row) continue;
        // items to the left of the field
        const leftItems = row.filter((t) => t.x < minX);
        if (!leftItems.length) continue;
        // take last N items whose x are closest to minX
        const near = leftItems.slice(-6);
        const label = near.map((n) => n.str).join(' ').trim();
        if (label) candidates.push({ score: minX - near[near.length - 1].x, label });
      }
      if (!candidates.length) return '';
      candidates.sort((a, b) => a.score - b.score);
      // sanitize label (strip trailing punctuation)
      return candidates[0].label.replace(/[:*\-\s]+$/, '').trim();
    } catch {
      return '';
    }
  };

  const normalizeOptions = (opts) => {
    if (!Array.isArray(opts)) return [];
    const out = [];
    for (const o of opts) {
      if (Array.isArray(o) && o.length >= 1) {
        const value = String(o[0]);
        const label = String(o[1] ?? o[0]);
        out.push({ value, label });
      } else if (typeof o === 'object' && o) {
        const value = String(o.value ?? o.exportValue ?? o.name ?? '');
        const label = String(o.label ?? o.displayValue ?? value);
        if (value) out.push({ value, label });
      } else if (typeof o === 'string' || typeof o === 'number') {
        const value = String(o);
        out.push({ value: value, label: value });
      }
    }
    // dedupe
    const seen = new Set();
    return out.filter((o) => {
      const k = `${o.value}\u0000${o.label}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const parsePdfForm = async (file) => {
    const ab = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: ab }).promise;

    const collected = [];
    const radioGroups = new Map(); // name -> { label, options: [{value,label}] }

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const annotations = await page.getAnnotations({ intent: 'display' });
      const text = await page.getTextContent();
      const rows = buildTextRows(text.items || []);

      for (const a of annotations) {
        if ((a?.subtype || '').toLowerCase() !== 'widget') continue;
        const ft = a.fieldType || a.ft || '';
        const rect = a.rect || [];
        const required = !!(a.required || ((a.fieldFlags ?? 0) & (1 << 14)));
        const nearby = findNearbyLabel(rows, rect);
        const baseName = a.fieldName || a.fullName || '';
        const baseLabel = toTitle(nearby || baseName || 'Field');

        if (ft === 'Tx') {
          const multi = !!a.multiLine;
          const guessed = guessTypeFromLabel(baseLabel);
          collected.push({
            type: multi ? 'textarea' : guessed,
            label: baseLabel,
            pdfType: multi ? 'multiline' : 'text',
            required
          });
        } else if (ft === 'Ch') {
          const multiple = !!a.multipleSelection;
          const options = normalizeOptions(a.options || a.opt || []);
          collected.push({
            type: multiple ? 'multiselect' : 'select',
            label: baseLabel,
            options: options.length ? options : undefined,
            pdfType: multiple ? 'listbox' : (a.combo ? 'combobox' : 'select'),
            required
          });
        } else if (ft === 'Btn') {
          // checkbox or radio; ignore pure push buttons
          const isRadio = !!a.radioButton || /radio/i.test(String(a?.buttonType || ''));
          const isCheck = !!a.checkBox || /check/i.test(String(a?.buttonType || ''));
          if (isRadio) {
            const groupName = baseName || 'RadioGroup';
            const exportVal = a.exportValue || a.appearanceState || a.value || 'on';
            const optLabel = nearby || toTitle(String(exportVal));
            const g = radioGroups.get(groupName) || { label: toTitle(groupName), options: [] };
            if (!g.options.some((o) => o.value === exportVal)) g.options.push({ value: String(exportVal), label: optLabel });
            radioGroups.set(groupName, g);
          } else if (isCheck) {
            collected.push({
              type: 'checkbox',
              label: baseLabel || 'Checkbox',
              checkboxText: baseLabel || 'Checkbox',
              pdfType: 'checkbox',
              required
            });
          }
        } else if (ft === 'Sig') {
          collected.push({
            type: 'signature',
            label: baseLabel || 'Signature',
            pdfType: 'signature',
            required
          });
        }
      }
    }

    // finalize radio groups as single fields with options
    for (const [name, group] of radioGroups.entries()) {
      collected.push({
        type: 'radio',
        label: group.label || toTitle(name),
        options: group.options,
        pdfType: 'radio',
        required: false
      });
    }

    // Fallback: ensure unique labels
    const seen = new Map();
    for (const f of collected) {
      const key = f.label || f.type;
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      if (n > 1) f.label = `${f.label} ${n}`;
    }
    return collected;
  };

  // ---------------- OCR fallback (for scanned PDFs without AcroForms) ----------------
  const ensureHeadScript = (src) => new Promise((resolve, reject) => {
    try {
      if (typeof document === 'undefined') return resolve();
      const existing = [...document.scripts].some((s) => (s?.src || '').includes(src));
      if (existing) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    } catch (e) {
      resolve();
    }
  });

  const ensureTesseract = async () => {
    if (typeof window !== 'undefined' && window.Tesseract) return window.Tesseract;
    const cdns = [
      'https://unpkg.com/tesseract.js@5.0.3/dist/tesseract.min.js',
      'https://unpkg.com/tesseract.js@4.1.1/dist/tesseract.min.js'
    ];
    for (const url of cdns) {
      try { // eslint-disable-next-line no-await-in-loop
        await ensureHeadScript(url);
        if (window.Tesseract) break;
      } catch (_) {}
    }
    return window.Tesseract;
  };

  const renderPageToCanvas = async (page, scale = 2) => {
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = vp.width;
    c.height = vp.height;
    const ctx = c.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return c;
  };

  const extractFieldsFromLines = (lines = []) => {
    const fields = [];
    const pushUnique = (f) => {
      if (f?.type === 'inlineText') {
        fields.push(f);
        return;
      }
      const key = (f.label || '').toLowerCase();
      if (!key) return;
      if (fields.some((x) => x.label?.toLowerCase() === key && x.type === f.type)) return;
      fields.push(f);
    };

    const buildInlineFromLine = (raw) => {
      const line = raw.replace(/\u2014|\u2015|\u2500/g, '_');
      if (/signature/i.test(line)) return null; // let signature-specific logic handle these
      if (!/_\s*_/.test(line) && !/_{3,}/.test(line)) return null;
      const parts = [];
      const nameCounts = {};
      let lastIndex = 0;
      // Find sequences of 3+ underscores
      const re = /(_{3,})/g;
      let m;
      while ((m = re.exec(line))) {
        const before = line.slice(lastIndex, m.index);
        if (before) parts.push({ t: 'text', v: before });
        // Determine label just before the blank to guess type/name
        const left = before.trim().split(/\s+/).slice(-3).join(' ');
        const labelMatch = left.match(/([A-Za-z][A-Za-z\s\/\-#]+)$/);
        const labelRaw = labelMatch ? labelMatch[1].trim() : 'Field';
        const label = toTitle(labelRaw.replace(/[:]+$/, ''));
        const type = /date/i.test(label) ? 'date' : (/phone|tel/i.test(label) ? 'phone' : (/name/i.test(label) ? 'text' : 'text'));
        let base = slug(label) || `inline_${parts.length}`;
        nameCounts[base] = (nameCounts[base] || 0) + 1;
        const name = nameCounts[base] > 1 ? `${base}_${nameCounts[base]}` : base;
        parts.push({ t: 'input', inputType: type, name });
        lastIndex = re.lastIndex;
      }
      const tail = line.slice(lastIndex);
      if (tail) parts.push({ t: 'text', v: tail });
      // Trim purely whitespace-only text parts and collapse spaces
      const clean = parts.map((p) => p.t === 'text' ? { t:'text', v: p.v.replace(/\s{2,}/g,' ') } : p).filter((p) => !(p.t==='text' && !p.v.trim()));
      const hasInput = clean.some((p) => p.t === 'input');
      if (!hasInput) return null;
      return { type: 'inlineText', label: '', parts: clean, pdfType: 'ocr-inline' };
    };

    // Group consecutive checkbox lines like "☐ Option"
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      // Inline blanks like "I, ______ understand …" or multi-blanks row
      const inline = buildInlineFromLine(line);
      if (inline) {
        pushUnique(inline);
        i++;
        continue;
      }
      // Split common dual-label lines e.g., "Phone: ____   Alternate Phone: ____"
      if (/\bPhone\s*:\b/i.test(line) && /\bAlternate\s+Phone\s*:\b/i.test(line)) {
        pushUnique({ type: 'phone', label: 'Phone', pdfType: 'ocr-label' });
        pushUnique({ type: 'phone', label: 'Alternate Phone', pdfType: 'ocr-label' });
        i++;
        continue;
      }
      // Signature/Date pair on one line
      if (/signature/i.test(line) && /date/i.test(line)) {
        // Try to capture specific roles (Student/Witness)
        if (/witness\s*signature/i.test(line)) {
          pushUnique({ type: 'signature', label: 'Witness Signature', pdfType: 'ocr-signature' });
        } else if (/student.*signature/i.test(line)) {
          pushUnique({ type: 'signature', label: 'Student Signature', pdfType: 'ocr-signature' });
        } else {
          pushUnique({ type: 'signature', label: 'Signature', pdfType: 'ocr-signature' });
        }
        pushUnique({ type: 'date', label: 'Date', pdfType: 'ocr-date' });
        i++;
        continue;
      }
      // Printed Name on one line
      if (/printed\s+name/i.test(line)) {
        const who = /student/i.test(line) ? "Student Printed Name" : (/witness|director/i.test(line) ? "Witness/Director Printed Name" : "Printed Name");
        pushUnique({ type: 'text', label: who, pdfType: 'ocr-label' });
        i++;
        continue;
      }
      // Generic Signature alone
      if (/\b(signature)\b/i.test(line) && !/\bdesign|policy|waiver/i.test(line)) {
        const who = /witness/i.test(line) ? 'Witness Signature' : (/student/i.test(line) ? 'Student Signature' : 'Signature');
        pushUnique({ type: 'signature', label: who, pdfType: 'ocr-signature' });
        i++;
        continue;
      }
      // Yes/No questions
      if (/\bYes\b.*\bNo\b/i.test(line)) {
        const beforeYes = line.split(/\bYes\b/i)[0].replace(/^[\(\d\)\.\s]+/, '').trim();
        if (beforeYes.length >= 3) {
          pushUnique({ type: 'radio', label: beforeYes.replace(/[:?]+$/, ''), options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' }
          ], pdfType: 'ocr-yesno' });
          i++;
          continue;
        }
      }
      const isCheckboxLine = /(^|\s)(\[\s?\]|☐|■|□|◻|⧠)\s*\S/.test(line);
      if (isCheckboxLine) {
        const options = [];
        let j = i;
        while (j < lines.length) {
          const l = lines[j].trim();
          if (!/(^|\s)(\[\s?\]|☐|■|□|◻|⧠)\s*\S/.test(l)) break;
          const opt = l.replace(/(^|\s)(\[\s?\]|☐|■|□|◻|⧠)\s*/g, '').trim();
          if (opt) options.push({ value: opt.toLowerCase().replace(/\s+/g, '_'), label: opt });
          j++;
        }
        if (options.length >= 2) {
          pushUnique({ type: 'multiselect', label: 'Select Options', options, pdfType: 'ocr-checkboxes' });
          i = j;
          continue;
        }
      }

      // Label:  or Label ________ patterns
      let m;
      if ((m = line.match(/^\s*([A-Za-z0-9][^:]{1,80}?)\s*:\s*(.*)$/))) {
        const label = toTitle(m[1]);
        const guessed = /signature/i.test(label) ? 'signature' : guessTypeFromLabel(label);
        pushUnique({ type: guessed, label, pdfType: 'ocr-label' });
        i++;
        continue;
      }
      if ((m = line.match(/^\s*([A-Za-z0-9][^_\-]{1,80}?)\s*[_\-]{4,}\s*$/))) {
        const label = toTitle(m[1]);
        const guessed = /signature/i.test(label) ? 'signature' : guessTypeFromLabel(label);
        pushUnique({ type: guessed, label, pdfType: 'ocr-underline' });
        i++;
        continue;
      }

      // Gender-like radios: "Gender" followed by line containing options
      if (/\b(gender|sex)\b/i.test(line)) {
        const next = lines[i + 1]?.trim() || '';
        const opts = next.split(/[\s\/|]+/).filter(Boolean);
        const candidates = opts.filter((o) => /^(male|female|other|non\-?binary)$/i.test(o));
        if (candidates.length >= 2) {
          pushUnique({
            type: 'radio',
            label: 'Gender',
            options: candidates.map((o) => ({ value: o.toLowerCase(), label: toTitle(o) })),
            pdfType: 'ocr-radio'
          });
          i += 2;
          continue;
        }
      }

      // Section headings: UPPERCASE words
      if (/^[A-Z0-9][A-Z0-9\s,&\-]{6,}$/.test(line) && !/[.:]/.test(line)) {
        const text = line.trim().replace(/\s{2,}/g, ' ');
        if (text.length <= 48) pushUnique({ type: 'heading', label: toTitle(text), pdfType: 'ocr-heading' });
        i++;
        continue;
      }

      i++;
    }
    return fields;
  };

  const parsePdfByOcr = async (file) => {
    const Tesseract = await ensureTesseract();
    if (!Tesseract) throw new Error('OCR engine failed to load');
    const ab = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: ab }).promise;

    const allFields = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const canvas = await renderPageToCanvas(page, 2);
      const { data } = await Tesseract.recognize(canvas, 'eng');
      const lines = data?.lines?.map((ln) => ln.text) || (data?.text || '').split(/\n+/);
      const fields = extractFieldsFromLines(lines || []);
      allFields.push(...fields);
    }

    // Deduplicate labels across pages
    const dedup = [];
    const seen = new Set();
    for (const f of allFields) {
      const inlineKey = f.type === 'inlineText' ? `inline|${(JSON.stringify(f.parts || []).slice(0,80))}` : '';
      const key = inlineKey || `${f.type}|${(f.label || '').toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dedup.push(f);
    }
    return dedup;
  };
  const handlePdfUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || file.type !== 'application/pdf') {
      setPdfError('Please upload a valid PDF file');
      return;
    }

    setPdfProcessing(true);
    setPdfError('');
    setShowPdfImport(true);

    try {
      let fields = await parsePdfForm(file);
      if (!fields || fields.length === 0) {
        // Fallback to OCR if no AcroForm fields detected
        try {
          fields = await parsePdfByOcr(file);
          if (!fields || fields.length === 0) {
            setPdfError('No fields detected. Try a different PDF or adjust OCR.');
          }
        } catch (ocrErr) {
          console.error('OCR failed:', ocrErr);
          setPdfError('OCR failed to extract fields.');
        }
      }
      setPdfFields(fields || []);
    } catch (error) {
      setPdfError('Failed to process PDF. Please try again.');
      console.error('PDF processing error:', error);
    } finally {
      setPdfProcessing(false);
    }
  };

  const importPdfFields = () => {
    const importedFields = pdfFields
      .filter((f) => f.import !== false)
      .map((field, index) => {
        const baseField = {
          id: `field_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
        name: (field.name || field.label || 'field').toLowerCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, ''),
          label: field.label,
          type: field.type,
          placeholder: '',
          required: field.required || false,
          validation: {},
          width: 'full',
          helpText: '',
          defaultValue: ''
        };

        // Add type-specific properties
        if (field.type === 'select' || field.type === 'radio' || field.type === 'multiselect') {
          baseField.options = (field.options && field.options.length > 0)
            ? field.options
            : [{ value: 'option1', label: 'Option 1' }];
        }

        if (field.type === 'heading') {
          baseField.level = 3;
        }

        if (field.type === 'checkbox') {
          baseField.checkboxText = field.checkboxText || field.label;
        }

        if (field.type === 'inlineText' && Array.isArray(field.parts)) {
          baseField.parts = field.parts;
        }

        return baseField;
      });

    setCurrentForm({
      ...currentForm,
      title: currentForm.title || 'Imported Form',
      description: currentForm.description || 'Form imported from PDF',
      fields: [...currentForm.fields, ...importedFields]
    });

    setShowPdfImport(false);
    setPdfFields([]);
    setSavedMessage('PDF form imported successfully!');
    setTimeout(() => setSavedMessage(''), 3000);
  };

  const togglePdfField = (index) => {
    const newFields = [...pdfFields];
    newFields[index].import = !(newFields[index].import !== false);
    setPdfFields(newFields);
  };

  const changePdfFieldType = (index, newType) => {
    const newFields = [...pdfFields];
    newFields[index].type = newType;
    setPdfFields(newFields);
  };

  // Field manipulation functions
  const addField = (fieldType) => {
    const newField = {
      id: `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: fieldType.type,
      name: `field_${currentForm.fields.length + 1}`,
      label: fieldType.label,
      placeholder: fieldType.type === 'location' ? 'Search address' : '',
      required: false,
      validation: {},
      options: fieldType.type === 'select' || fieldType.type === 'radio' || fieldType.type === 'multiselect' 
        ? [{ value: 'option1', label: 'Option 1' }] 
        : undefined,
      width: 'full',
      helpText: '',
      defaultValue: ''
    };

    if (fieldType.type === 'adminText') {
      newField.content = '';
      // Admin text blocks don’t need a data name; keep for uniqueness, but not used in preview
      newField.name = `admin_text_${currentForm.fields.length + 1}`;
    }
    if (fieldType.type === 'inlineText') {
      newField.parts = [
        { t: 'text', v: 'I, ' },
        { t: 'input', inputType: 'text', name: `inline_${currentForm.fields.length + 1}_name` },
        { t: 'text', v: ' understand that …' },
      ];
      newField.name = `inline_${currentForm.fields.length + 1}`; // container name not used for values
    }

    setCurrentForm({
      ...currentForm,
      fields: [...currentForm.fields, newField]
    });
    setSelectedField(newField.id);
    setShowFieldConfig(true);
  };

  const updateField = (fieldId, updates) => {
    setCurrentForm({
      ...currentForm,
      fields: currentForm.fields.map(field => 
        field.id === fieldId ? { ...field, ...updates } : field
      )
    });
  };

  const deleteField = (fieldId) => {
    setCurrentForm({
      ...currentForm,
      fields: currentForm.fields.filter(field => field.id !== fieldId)
    });
    setSelectedField(null);
    setShowFieldConfig(false);
  };

  const duplicateField = (fieldId) => {
    const fieldToDupe = currentForm.fields.find(f => f.id === fieldId);
    if (fieldToDupe) {
      const newField = {
        ...fieldToDupe,
        id: `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: `${fieldToDupe.name}_copy`,
        label: `${fieldToDupe.label} (Copy)`
      };
      const index = currentForm.fields.findIndex(f => f.id === fieldId);
      const newFields = [...currentForm.fields];
      newFields.splice(index + 1, 0, newField);
      setCurrentForm({ ...currentForm, fields: newFields });
    }
  };

  const moveField = (fieldId, direction) => {
    const index = currentForm.fields.findIndex(f => f.id === fieldId);
    if ((direction === 'up' && index > 0) || (direction === 'down' && index < currentForm.fields.length - 1)) {
      const newFields = [...currentForm.fields];
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
      setCurrentForm({ ...currentForm, fields: newFields });
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e, index) => {
    setDraggedField(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (draggedField !== null && draggedField !== dropIndex) {
      const newFields = [...currentForm.fields];
      const draggedItem = newFields[draggedField];
      newFields.splice(draggedField, 1);
      newFields.splice(dropIndex, 0, draggedItem);
      setCurrentForm({ ...currentForm, fields: newFields });
    }
    setDraggedField(null);
    setDragOverIndex(null);
  };

  // Field configuration panel component
  const FieldConfigPanel = ({ field }) => {
    const [draft, setDraft] = useState({
      label: field?.label || '',
      name: field?.name || '',
      placeholder: field?.placeholder || '',
      defaultValue: field?.defaultValue || '',
      helpText: field?.helpText || ''
    });
    const [opts, setOpts] = useState(Array.isArray(field?.options) ? field.options : []);
    const [valid, setValid] = useState(field?.validation || {});
    const [cond, setCond] = useState(field?.conditional || { enabled: false, fieldId: '', operator: 'checked', value: '', thenRequired: 'inherit' });
    const [localRequired, setLocalRequired] = useState(!!field?.required);
    const [localWidth, setLocalWidth] = useState(field?.width || 'full');
    const [localLevel, setLocalLevel] = useState(field?.level || 3);
    const [localCheckboxText, setLocalCheckboxText] = useState(field?.checkboxText || '');
    const [localContent, setLocalContent] = useState(field?.content || '');
    // InlineText parts editor state
    const [inlineParts, setInlineParts] = useState(Array.isArray(field?.parts) ? field.parts : []);
    const [triggerDraft, setTriggerDraft] = useState({ targetId: '', operator: (field?.type === 'checkbox' ? 'checked' : (field?.type === 'multiselect' ? 'contains' : 'equals')), value: '' });
    const [localMask, setLocalMask] = useState(!!field?.mask);
    const [localAutoToday, setLocalAutoToday] = useState(!!field?.autoToday);
    const [extraTriggers, setExtraTriggers] = useState(Array.isArray(field?.conditional?.anyOf) ? field.conditional.anyOf : []);
    
    useEffect(() => {
      if (!field) return;
      setDraft({
        label: field.label || '',
        name: field.name || '',
        placeholder: field.placeholder || '',
        defaultValue: field.defaultValue || '',
        helpText: field.helpText || ''
      });
      setOpts(Array.isArray(field.options) ? field.options : []);
      setValid(field.validation || {});
      setCond(field.conditional || { enabled: false, fieldId: '', operator: 'checked', value: '', thenRequired: 'inherit' });
      setTriggerDraft({ targetId: '', operator: (field?.type === 'checkbox' ? 'checked' : (field?.type === 'multiselect' ? 'contains' : 'equals')), value: '' });
      setLocalRequired(!!field.required);
      setLocalWidth(field.width || 'full');
      setLocalLevel(field.level || 3);
      setLocalCheckboxText(field.checkboxText || '');
      setLocalContent(field.content || '');
      setInlineParts(Array.isArray(field.parts) ? field.parts : []);
      setLocalMask(!!field.mask);
      setLocalAutoToday(!!field.autoToday);
      setExtraTriggers(Array.isArray(field?.conditional?.anyOf) ? field.conditional.anyOf : []);
    }, [field?.id]);
    
    if (!field) return null;

    return (
      <div className="field-config-panel">
        <div className="config-header">
          <h3>Field Configuration</h3>
          <button onClick={() => setShowFieldConfig(false)} className="btn-icon">
            <X size={20} />
          </button>
        </div>

        <div className="config-body">
          <div className="config-group">
            <label>{field.type === 'heading' ? 'Heading Text' : 'Field Label'}</label>
            <input
              type="text"
              value={draft.label}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              className="config-input"
            />
          </div>

          {field.type !== 'heading' && field.type !== 'divider' && field.type !== 'adminText' && field.type !== 'inlineText' && (
            <div className="config-group">
              <label>Field Name (for data)</label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') }))}
                className="config-input"
                pattern="[a-zA-Z0-9_]+"
              />
            </div>
          )}

          {field.type !== 'heading' && field.type !== 'divider' && field.type !== 'adminText' && field.type !== 'inlineText' && (
            <>
              <div className="config-group">
                <label>Placeholder</label>
                <input
                  type="text"
                  value={draft.placeholder}
                  onChange={(e) => setDraft((d) => ({ ...d, placeholder: e.target.value }))}
                  className="config-input"
                />
              </div>

              {field.type === 'date' && (
                <div className="config-group">
                  <label className="toggle" title={localAutoToday ? 'Auto-fill current date on' : 'Auto-fill current date off'}>
                    <input
                      type="checkbox"
                      checked={!!localAutoToday}
                      onChange={(e) => setLocalAutoToday(e.target.checked)}
                    />
                    <span className="toggle-track" aria-hidden>
                      <span className="toggle-thumb" />
                    </span>
                    <span className="toggle-text">Current Date on click</span>
                  </label>
                </div>
              )}

              {(field.type === 'text' || field.type === 'number') && (
                <div className="config-group">
                  <label className="toggle" title={localMask ? 'Masked' : 'Visible'}>
                    <input
                      type="checkbox"
                      checked={!!localMask}
                      onChange={(e) => setLocalMask(e.target.checked)}
                    />
                    <span className="toggle-track" aria-hidden>
                      <span className="toggle-thumb" />
                    </span>
                    <span className="toggle-text">Mask value</span>
                  </label>
                </div>
              )}

              <div className="config-group">
                <label>Default Value</label>
                <input
                  type="text"
                  value={draft.defaultValue}
                  onChange={(e) => setDraft((d) => ({ ...d, defaultValue: e.target.value }))}
                  className="config-input"
                />
              </div>

              <div className="config-group">
                <label>Help Text</label>
                <input
                  type="text"
                  value={draft.helpText}
                  onChange={(e) => setDraft((d) => ({ ...d, helpText: e.target.value }))}
                  className="config-input"
                  placeholder="Additional instructions for users"
                />
              </div>

              <div className="config-group">
                <label className="toggle" title={localRequired ? 'Required on' : 'Required off'}>
                  <input
                    type="checkbox"
                    checked={!!localRequired}
                    onChange={(e) => setLocalRequired(e.target.checked)}
                  />
                  <span className="toggle-track" aria-hidden>
                    <span className="toggle-thumb" />
                  </span>
                  <span className="toggle-text">Required</span>
                </label>
              </div>

              <div className="config-group">
                <label>Field Width</label>
                <select
                  value={localWidth}
                  onChange={(e) => setLocalWidth(e.target.value)}
                  className="config-input"
                >
                  <option value="full">Full Width</option>
                  <option value="half">Half Width</option>
                  <option value="third">Third Width</option>
                  <option value="quarter">Quarter Width</option>
                </select>
              </div>

              <div className="config-group">
                <label className="toggle" title={cond?.enabled ? 'Conditional on' : 'Conditional off'}>
                  <input
                    type="checkbox"
                    checked={!!cond?.enabled}
                    onChange={(e) => setCond((c) => ({ ...(c||{}), enabled: e.target.checked }))}
                  />
                  <span className="toggle-track" aria-hidden>
                    <span className="toggle-thumb" />
                  </span>
                  <span className="toggle-text">Enable Conditional Logic</span>
                </label>
              </div>

              {cond?.enabled && (
                <>
                  <div className="config-group">
                    <label>Trigger Field</label>
                    <select
                      className="config-input"
                      value={cond.fieldId || ''}
                      onChange={(e) => {
                        const newFieldId = e.target.value;
                        // Reset operator/value based on selected trigger type
                        const trig = (currentForm.fields || []).find(x => x.id === newFieldId);
                        let op = 'equals';
                        if (trig?.type === 'checkbox') op = 'checked';
                        if (trig?.type === 'multiselect') op = 'contains';
                        setCond((c) => ({ ...(c||{}), fieldId: newFieldId, operator: op, value: '' }));
                      }}
                    >
                      <option value="">— Select a field —</option>
                      {(currentForm.fields || [])
                        .filter(f => f.id !== field.id && !['heading','divider','adminText','inlineText','signature'].includes(f.type))
                        .map(f => (
                          <option key={f.id} value={f.id}>
                            {(f.label || f.name || f.type)} — {f.type}
                          </option>
                        ))}
                    </select>
                  </div>

                  {cond.fieldId && (
                    <>
                      <div className="config-row">
                        <div className="config-group">
                          <label>Operator</label>
                          <select
                            className="config-input"
                            value={cond.operator || 'equals'}
                            onChange={(e) => setCond((c) => ({ ...(c||{}), operator: e.target.value }))}
                          >
                            {(() => {
                              const trig = (currentForm.fields || []).find(x => x.id === cond.fieldId);
                              const t = trig?.type || '';
                              const opts = [];
                              if (t === 'checkbox') {
                                opts.push({ v: 'checked', l: 'is checked' });
                                opts.push({ v: 'unchecked', l: 'is unchecked' });
                              } else if (t === 'multiselect') {
                                opts.push({ v: 'contains', l: 'contains' });
                                opts.push({ v: 'not_contains', l: "doesn't contain" });
                              } else {
                                opts.push({ v: 'equals', l: 'equals' });
                                opts.push({ v: 'not_equals', l: "does not equal" });
                              }
                              return opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>);
                            })()}
                          </select>
                        </div>
                        {(() => {
                          const trig = (currentForm.fields || []).find(x => x.id === cond.fieldId);
                          const needsValue = !['checked','unchecked'].includes(String(cond.operator||''));
                          if (!needsValue) return null;
                          if (trig && (trig.type === 'select' || trig.type === 'radio' || trig.type === 'multiselect') && Array.isArray(trig.options)) {
                            return (
                              <div className="config-group">
                                <label>Value</label>
                                <select
                                  className="config-input"
                                  value={cond.value || ''}
                                  onChange={(e) => setCond((c) => ({ ...(c||{}), value: e.target.value }))}
                                >
                                  <option value="">— Choose —</option>
                                  {trig.options.map((o, idx) => (
                                    <option key={idx} value={String(o.value ?? o.label ?? '')}>
                                      {String(o.label ?? o.value ?? '')}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          }
                          return (
                            <div className="config-group">
                              <label>Value</label>
                              <input
                                type="text"
                                className="config-input"
                                value={cond.value || ''}
                                onChange={(e) => setCond((c) => ({ ...(c||{}), value: e.target.value }))}
                                placeholder="Enter compare value"
                              />
                            </div>
                          );
                        })()}
                      </div>

                      <div className="config-group">
                        <label>When true</label>
                        <select
                          className="config-input"
                          value={cond.thenRequired || 'inherit'}
                          onChange={(e) => setCond((c) => ({ ...(c||{}), thenRequired: e.target.value }))}
                        >
                          <option value="inherit">Show field (keep required as set)</option>
                          <option value="required">Show field and make required</option>
                          <option value="optional">Show field and make optional</option>
                        </select>
                      </div>

                      <div className="config-group">
                        <label>Additional triggers (ANY)</label>
                        <div style={{ display: 'grid', gap: 8 }}>
                          {(extraTriggers || []).map((tr, i) => {
                            const trig = (currentForm.fields || []).find(x => x.id === tr.fieldId);
                            const t = trig?.type || '';
                            const opOpts = t === 'checkbox'
                              ? [{v:'checked',l:'is checked'},{v:'unchecked',l:'is unchecked'}]
                              : (t === 'multiselect'
                                  ? [{v:'contains',l:'contains'},{v:'not_contains',l:"doesn't contain"}]
                                  : [{v:'equals',l:'equals'},{v:'not_equals',l:'does not equal'}]);
                            const needsValue = !['checked','unchecked'].includes(String(tr.operator||''));
                            return (
                              <div key={i} className="config-row" style={{ alignItems:'end' }}>
                                <div className="config-group">
                                  <label>Field</label>
                                  <select className="config-input" value={tr.fieldId || ''} onChange={(e)=> setExtraTriggers(list => list.map((x,idx)=> idx===i? { ...x, fieldId:e.target.value, operator: 'equals', value: '' } : x))}>
                                    <option value="">— Select —</option>
                                    {(currentForm.fields || []).filter(f => f.id !== field.id && !['heading','divider','adminText','inlineText','signature'].includes(f.type)).map(f => (
                                      <option key={f.id} value={f.id}>{(f.label || f.name || f.type)} — {f.type}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="config-group">
                                  <label>Op</label>
                                  <select className="config-input" value={tr.operator || 'equals'} onChange={(e)=> setExtraTriggers(list => list.map((x,idx)=> idx===i? { ...x, operator:e.target.value } : x))}>
                                    {opOpts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                                  </select>
                                </div>
                                <div className="config-group">
                                  <label>Value</label>
                                  {trig && (trig.type === 'select' || trig.type === 'radio' || trig.type === 'multiselect') && Array.isArray(trig.options) && needsValue ? (
                                    <select className="config-input" value={tr.value || ''} onChange={(e)=> setExtraTriggers(list => list.map((x,idx)=> idx===i? { ...x, value:e.target.value } : x))}>
                                      <option value="">— Choose —</option>
                                      {trig.options.map((o, idx2) => (
                                        <option key={idx2} value={String(o.value ?? o.label ?? '')}>{String(o.label ?? o.value ?? '')}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input className="config-input" value={tr.value || ''} onChange={(e)=> setExtraTriggers(list => list.map((x,idx)=> idx===i? { ...x, value:e.target.value } : x))} placeholder={needsValue? 'Compare value' : '(n/a)'} disabled={!needsValue} />
                                  )}
                                </div>
                                <button className="btn small" onClick={(e)=>{ e.preventDefault(); setExtraTriggers(list => list.filter((_,idx)=> idx!==i)); }}>Remove</button>
                              </div>
                            );
                          })}
                          <button className="btn" onClick={(e)=>{ e.preventDefault(); setExtraTriggers(list => [...list, { fieldId: '', operator: 'equals', value: '' }]); }}>+ Add Trigger</button>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {field.type === 'adminText' && (
            <>
              <div className="config-group">
                <label>Content</label>
                <textarea
                  className="config-input"
                  rows={6}
                  value={localContent}
                  onChange={(e) => setLocalContent(e.target.value)}
                  placeholder="Enter text visible to users (read-only)"
                />
              </div>
              <div className="config-group">
                <label>Block Width</label>
                <select
                  value={localWidth}
                  onChange={(e) => setLocalWidth(e.target.value)}
                  className="config-input"
                >
                  <option value="full">Full Width</option>
                  <option value="half">Half Width</option>
                  <option value="third">Third Width</option>
                  <option value="quarter">Quarter Width</option>
                </select>
              </div>

              {/* Conditional logic for adminText (read-only) */}
              <div className="config-group">
                <label className="toggle" title={cond?.enabled ? 'Conditional on' : 'Conditional off'}>
                  <input
                    type="checkbox"
                    checked={!!cond?.enabled}
                    onChange={(e) => setCond((c) => ({ ...(c||{}), enabled: e.target.checked }))}
                  />
                  <span className="toggle-track" aria-hidden>
                    <span className="toggle-thumb" />
                  </span>
                  <span className="toggle-text">Enable Conditional Logic</span>
                </label>
              </div>

              {cond?.enabled && (
                <>
                  <div className="config-group">
                    <label>Trigger Field</label>
                    <select
                      className="config-input"
                      value={cond.fieldId || ''}
                      onChange={(e) => {
                        const newFieldId = e.target.value;
                        const trig = (currentForm.fields || []).find(x => x.id === newFieldId);
                        let op = 'equals';
                        if (trig?.type === 'checkbox') op = 'checked';
                        if (trig?.type === 'multiselect') op = 'contains';
                        setCond((c) => ({ ...(c||{}), fieldId: newFieldId, operator: op, value: '' }));
                      }}
                    >
                      <option value="">— Select a field —</option>
                      {(currentForm.fields || [])
                        .filter(f => f.id !== field.id && !['heading','divider','adminText','inlineText','signature'].includes(f.type))
                        .map(f => (
                          <option key={f.id} value={f.id}>
                            {(f.label || f.name || f.type)} — {f.type}
                          </option>
                        ))}
                    </select>
                  </div>

                  {cond.fieldId && (
                    <>
                      <div className="config-row">
                        <div className="config-group">
                          <label>Operator</label>
                          <select
                            className="config-input"
                            value={cond.operator || 'equals'}
                            onChange={(e) => setCond((c) => ({ ...(c||{}), operator: e.target.value }))}
                          >
                            {(() => {
                              const trig = (currentForm.fields || []).find(x => x.id === cond.fieldId);
                              const t = trig?.type || '';
                              const opts = [];
                              if (t === 'checkbox') {
                                opts.push({ v: 'checked', l: 'is checked' });
                                opts.push({ v: 'unchecked', l: 'is unchecked' });
                              } else if (t === 'multiselect') {
                                opts.push({ v: 'contains', l: 'contains' });
                                opts.push({ v: 'not_contains', l: "doesn't contain" });
                              } else {
                                opts.push({ v: 'equals', l: 'equals' });
                                opts.push({ v: 'not_equals', l: 'does not equal' });
                              }
                              return opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>);
                            })()}
                          </select>
                        </div>
                        {(() => {
                          const trig = (currentForm.fields || []).find(x => x.id === cond.fieldId);
                          const needsValue = !['checked','unchecked'].includes(String(cond.operator||''));
                          if (!needsValue) return null;
                          if (trig && (trig.type === 'select' || trig.type === 'radio' || trig.type === 'multiselect') && Array.isArray(trig.options)) {
                            return (
                              <div className="config-group">
                                <label>Value</label>
                                <select
                                  className="config-input"
                                  value={cond.value || ''}
                                  onChange={(e) => setCond((c) => ({ ...(c||{}), value: e.target.value }))}
                                >
                                  <option value="">— Choose —</option>
                                  {trig.options.map((o, idx) => (
                                    <option key={idx} value={String(o.value ?? o.label ?? '')}>
                                      {String(o.label ?? o.value ?? '')}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          }
                          return (
                            <div className="config-group">
                              <label>Value</label>
                              <input
                                type="text"
                                className="config-input"
                                value={cond.value || ''}
                                onChange={(e) => setCond((c) => ({ ...(c||{}), value: e.target.value }))}
                                placeholder="Enter compare value"
                              />
                            </div>
                          );
                        })()}
                      </div>

                      <div className="config-group">
                        <label>When true</label>
                        <select
                          className="config-input"
                          value={cond.thenRequired || 'inherit'}
                          onChange={(e) => setCond((c) => ({ ...(c||{}), thenRequired: e.target.value }))}
                        >
                          <option value="inherit">Show block</option>
                          <option value="required">Show block</option>
                          <option value="optional">Show block</option>
                        </select>
                      </div>

                      <div className="config-group">
                        <label>Additional triggers (ANY)</label>
                        <div style={{ display: 'grid', gap: 8 }}>
                          {(extraTriggers || []).map((tr, i) => {
                            const trig = (currentForm.fields || []).find(x => x.id === tr.fieldId);
                            const t = trig?.type || '';
                            const opOpts = t === 'checkbox'
                              ? [{v:'checked',l:'is checked'},{v:'unchecked',l:'is unchecked'}]
                              : (t === 'multiselect'
                                  ? [{v:'contains',l:'contains'},{v:'not_contains',l:"doesn't contain"}]
                                  : [{v:'equals',l:'equals'},{v:'not_equals',l:'does not equal'}]);
                            const needsValue = !['checked','unchecked'].includes(String(tr.operator||''));
                            return (
                              <div key={i} className="config-row" style={{ alignItems:'end' }}>
                                <div className="config-group">
                                  <label>Field</label>
                                  <select className="config-input" value={tr.fieldId || ''} onChange={(e)=> setExtraTriggers(list => list.map((x,idx)=> idx===i? { ...x, fieldId:e.target.value, operator: 'equals', value: '' } : x))}>
                                    <option value="">— Select —</option>
                                    {(currentForm.fields || []).filter(f => f.id !== field.id && !['heading','divider','adminText','inlineText','signature'].includes(f.type)).map(f => (
                                      <option key={f.id} value={f.id}>{(f.label || f.name || f.type)} — {f.type}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="config-group">
                                  <label>Op</label>
                                  <select className="config-input" value={tr.operator || 'equals'} onChange={(e)=> setExtraTriggers(list => list.map((x,idx)=> idx===i? { ...x, operator:e.target.value } : x))}>
                                    {opOpts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                                  </select>
                                </div>
                                <div className="config-group">
                                  <label>Value</label>
                                  {trig && (trig.type === 'select' || trig.type === 'radio' || trig.type === 'multiselect') && Array.isArray(trig.options) && needsValue ? (
                                    <select className="config-input" value={tr.value || ''} onChange={(e)=> setExtraTriggers(list => list.map((x,idx)=> idx===i? { ...x, value:e.target.value } : x))}>
                                      <option value="">— Choose —</option>
                                      {trig.options.map((o, idx2) => (
                                        <option key={idx2} value={String(o.value ?? o.label ?? '')}>{String(o.label ?? o.value ?? '')}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input className="config-input" value={tr.value || ''} onChange={(e)=> setExtraTriggers(list => list.map((x,idx)=> idx===i? { ...x, value:e.target.value } : x))} placeholder={needsValue? 'Compare value' : '(n/a)'} disabled={!needsValue} />
                                  )}
                                </div>
                                <button className="btn small" onClick={(e)=>{ e.preventDefault(); setExtraTriggers(list => list.filter((_,idx)=> idx!==i)); }}>Remove</button>
                              </div>
                            );
                          })}
                          <button className="btn" onClick={(e)=>{ e.preventDefault(); setExtraTriggers(list => [...list, { fieldId: '', operator: 'equals', value: '' }]); }}>+ Add Trigger</button>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {field.type === 'inlineText' && (
            <div className="config-group">
              <label>Inline Parts</label>
              <div style={{ display: 'grid', gap: 8 }}>
                {(inlineParts || []).map((p, idx) => (
                  <div key={idx} style={{ border: '1px solid #e9ecef', borderRadius: 8, padding: 8, background: '#fafbff' }}>
                    {p.t === 'text' ? (
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>Static text</div>
                        <input
                          type="text"
                          className="config-input"
                          value={p.v || ''}
                          onChange={(e) => setInlineParts(parts => parts.map((pp, i) => i === idx ? { ...pp, v: e.target.value } : pp))}
                          placeholder="Inline text…"
                        />
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>Input type</div>
                            <select
                              className="config-input"
                              value={p.inputType || 'text'}
                              onChange={(e) => setInlineParts(parts => parts.map((pp, i) => i === idx ? { ...pp, inputType: e.target.value } : pp))}
                            >
                              <option value="text">Text</option>
                              <option value="phone">Phone</option>
                              <option value="email">Email</option>
                              <option value="number">Number</option>
                              <option value="date">Date</option>
                            </select>
                          </div>
                          <div>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>Data name</div>
                            <input
                              type="text"
                              className="config-input"
                              value={p.name || ''}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '_');
                                setInlineParts(parts => parts.map((pp, i) => i === idx ? { ...pp, name: val } : pp));
                              }}
                              placeholder="e.g., ssn"
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                            <label className="toggle" title={(p.mask ? 'Masked' : 'Visible') + ' input'}>
                              <input
                                type="checkbox"
                                checked={!!p.mask}
                                onChange={(e) => setInlineParts(parts => parts.map((pp, i) => i === idx ? { ...pp, mask: e.target.checked } : pp))}
                              />
                              <span className="toggle-track" aria-hidden>
                                <span className="toggle-thumb" />
                              </span>
                              <span className="toggle-text">Mask value</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(field.type === 'select' || field.type === 'radio' || field.type === 'multiselect') && (
            <div className="config-group">
              <label>Options</label>
              <div className="options-list">
                {(opts || []).map((option, idx) => (
                  <div key={idx} className="option-item">
                    <input
                      type="text"
                      value={option.label}
                      onChange={(e) => {
                        const newOptions = [...opts];
                        newOptions[idx] = {
                          ...option, 
                          label: e.target.value, 
                          value: e.target.value.toLowerCase().replace(/\s+/g, '_') 
                        };
                        setOpts(newOptions);
                      }}
                      className="option-input"
                      placeholder="Option label"
                    />
                    <button
                      onClick={() => {
                        const newOptions = (opts || []).filter((_, i) => i !== idx);
                        setOpts(newOptions);
                      }}
                      className="btn-icon small danger"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const count = (opts?.length || 0) + 1;
                    const newOptions = [...(opts || []), { 
                      value: `option${count}`, 
                      label: `Option ${count}` 
                    }];
                    setOpts(newOptions);
                  }}
                  className="btn-secondary small full-width"
                >
                  <Plus size={16} /> Add Option
                </button>
              </div>
            </div>
          )}

          {field.type === 'number' && (
            <div className="config-row">
              <div className="config-group">
                <label>Min Value</label>
                <input
                  type="number"
                  value={valid.min ?? ''}
                  onChange={(e) => setValid((v) => ({ ...v, min: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  className="config-input"
                />
              </div>
              <div className="config-group">
                <label>Max Value</label>
                <input
                  type="number"
                  value={valid.max ?? ''}
                  onChange={(e) => setValid((v) => ({ ...v, max: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  className="config-input"
                />
              </div>
            </div>
          )}

          {(field.type === 'text' || field.type === 'textarea') && (
            <div className="config-row">
              <div className="config-group">
                <label>Min Length</label>
                <input
                  type="number"
                  value={valid.minLength ?? ''}
                  onChange={(e) => setValid((v) => ({ ...v, minLength: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  className="config-input"
                />
              </div>
              <div className="config-group">
                <label>Max Length</label>
                <input
                  type="number"
                  value={valid.maxLength ?? ''}
                  onChange={(e) => setValid((v) => ({ ...v, maxLength: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  className="config-input"
                />
              </div>
            </div>
          )}

          {field.type === 'file' && (
            <>
              <div className="config-group">
                <label>Accepted File Types</label>
                <input
                  type="text"
                  value={valid.accept || ''}
                  onChange={(e) => setValid((v) => ({ ...v, accept: e.target.value }))}
                  className="config-input"
                  placeholder=".pdf,.doc,.docx,.jpg,.png"
                />
              </div>
              <div className="config-group">
                <label>Max File Size (MB)</label>
                <input
                  type="number"
                  value={valid.maxSize ?? ''}
                  onChange={(e) => setValid((v) => ({ ...v, maxSize: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  className="config-input"
                  placeholder="5"
                />
              </div>
            </>
          )}

          {field.type === 'rating' && (
            <div className="config-group">
              <label>Max Stars</label>
              <input
                type="number"
                value={valid.maxStars ?? 5}
                min="3"
                max="10"
                onChange={(e) => setValid((v) => ({ ...v, maxStars: Number(e.target.value) || 5 }))}
                className="config-input"
              />
            </div>
          )}

          {field.type === 'heading' && (
            <div className="config-group">
              <label>Heading Level</label>
              <select
                className="config-input"
                value={localLevel}
                onChange={(e) => setLocalLevel(Number(e.target.value))}
              >
                <option value={1}>H1</option>
                <option value={2}>H2</option>
                <option value={3}>H3</option>
                <option value={4}>H4</option>
                <option value={5}>H5</option>
                <option value={6}>H6</option>
              </select>
            </div>
          )}

          {field.type === 'checkbox' && (
            <div className="config-group">
              <label>Checkbox Text (shown beside checkbox)</label>
              <input
                type="text"
                value={localCheckboxText}
                onChange={(e) => setLocalCheckboxText(e.target.value)}
                className="config-input"
                placeholder="Do you agree to the terms?"
              />
            </div>
          )}
        </div>

        <div className="config-footer" style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              const sanitizedName = (draft.name || '').replace(/[^a-zA-Z0-9_]/g, '_');
              const updates = {
                label: draft.label,
                name: sanitizedName,
                placeholder: draft.placeholder,
                defaultValue: draft.defaultValue,
                helpText: draft.helpText,
                required: !!localRequired,
                width: localWidth,
                validation: { ...valid },
                conditional: { ...cond },
              };
              // attach anyOf triggers (OR) if present
              if (updates.conditional) {
                const any = (extraTriggers || []).filter(t => t && t.fieldId);
                if (any.length) updates.conditional.anyOf = any;
                else if ('anyOf' in updates.conditional) delete updates.conditional.anyOf;
              }
              if (['select','radio','multiselect'].includes(field.type)) {
                updates.options = Array.isArray(opts) ? opts : [];
              }
              if (field.type === 'heading') updates.level = localLevel;
              if (field.type === 'checkbox') updates.checkboxText = localCheckboxText;
              if (field.type === 'adminText') {
                updates.content = localContent;
                updates.required = false; // read-only block
              }
              if (field.type === 'date') {
                updates.autoToday = !!localAutoToday;
              }
              if (field.type === 'text' || field.type === 'number') {
                updates.mask = !!localMask;
              }
              if (field.type === 'inlineText') {
                updates.parts = Array.isArray(inlineParts) ? inlineParts : [];
              }
              updateField(field.id, updates);
              setDraft(d => ({ ...d, name: sanitizedName }));
            }}
            className="btn-primary"
          >
            <Save size={14} /> Save Field
          </button>
          <button
            onClick={() => {
              setDraft({
                label: field.label || '',
                name: field.name || '',
                placeholder: field.placeholder || '',
                defaultValue: field.defaultValue || '',
                helpText: field.helpText || ''
              });
              setOpts(Array.isArray(field.options) ? field.options : []);
              setValid(field.validation || {});
              setCond(field.conditional || { enabled: false, fieldId: '', operator: 'checked', value: '', thenRequired: 'inherit' });
              setLocalRequired(!!field.required);
              setLocalWidth(field.width || 'full');
              setLocalLevel(field.level || 3);
              setLocalCheckboxText(field.checkboxText || '');
              setLocalContent(field.content || '');
              try { setLocalMask(!!field.mask); } catch {}
              try { setLocalAutoToday(!!field.autoToday); } catch {}
              try { setExtraTriggers(Array.isArray(field?.conditional?.anyOf) ? field.conditional.anyOf : []); } catch {}
            }}
            className="btn-secondary"
          >
            <X size={14} /> Cancel
          </button>
          <button onClick={() => deleteField(field.id)} className="btn-danger" style={{ marginLeft: 'auto' }}>
            <Trash2 size={16} /> Delete Field
          </button>
        </div>
      </div>
    );
  };

  // Form preview component
  const FormPreview = () => {
    const [previewData, setPreviewData] = useState({});
    const locationRefs = useRef({});
    const ensureRef = (id) => {
      if (!locationRefs.current[id]) locationRefs.current[id] = React.createRef();
      return locationRefs.current[id];
    };

    // Attempt to load Google Places JS API if a Location field exists and an API key is available.
    const ensureGooglePlaces = async () => {
      try {
        if (typeof window === 'undefined') return false;
        if (window.google?.maps?.places) return true;
        // Fetch the key from server so it isn't bundled client-side
        let key = '';
        try {
          const res = await fetch('/api/config/maps-key', { credentials: 'include' });
          if (res.ok) {
            const j = await res.json();
            key = String(j?.key || '').trim();
          }
        } catch {}
        if (!key) return false;
        const existing = document.querySelector('script[data-google-places]');
        if (existing) {
          // wait briefly for it to be ready
          return new Promise((resolve) => {
            const t = setInterval(() => {
              if (window.google?.maps?.places) { clearInterval(t); resolve(true); }
            }, 200);
            setTimeout(() => { clearInterval(t); resolve(!!(window.google?.maps?.places)); }, 5000);
          });
        }
        const s = document.createElement('script');
        // Load Maps JS with Places library. The server supplies the key at runtime.
        // Note: This uses the legacy Places Library. Ensure "Places API (Legacy)" and
        // "Maps JavaScript API" are enabled for this key in Google Cloud Console.
        s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async&v=weekly`;
        s.async = true;
        s.defer = true;
        s.dataset.googlePlaces = 'true';
        document.head.appendChild(s);
        return new Promise((resolve) => {
          s.onload = () => resolve(!!(window.google?.maps?.places));
          s.onerror = () => resolve(false);
        });
      } catch {
        return false;
      }
    };

    const handlePreviewChange = (fieldName, value) => {
      setPreviewData({ ...previewData, [fieldName]: value });
    };

    const handleMultiChange = (fieldName, optionValue, checked) => {
      const current = Array.isArray(previewData[fieldName]) ? previewData[fieldName] : [];
      const next = checked ? [...new Set([...current, optionValue])] : current.filter(v => v !== optionValue);
      setPreviewData({ ...previewData, [fieldName]: next });
    };

    const evalTrig = (tr) => {
      if (!tr || !tr.fieldId) return false;
      const trigger = currentForm.fields.find(x => x.id === tr.fieldId);
      if (!trigger) return false;
      const trigVal = previewData[trigger.name];
      switch (tr.operator) {
        case 'checked': return !!trigVal === true;
        case 'unchecked': return !!trigVal === false;
        case 'equals': return (trigVal ?? '') == (tr.value ?? '');
        case 'not_equals': return (trigVal ?? '') != (tr.value ?? '');
        case 'contains': return Array.isArray(trigVal) && trigVal.includes(tr.value);
        case 'not_contains': return Array.isArray(trigVal) && !trigVal.includes(tr.value);
        default: return false;
      }
    };

    const isFieldVisible = (f) => {
      const c = f.conditional;
      if (!c || !c.enabled || !c.fieldId) return true;
      const single = evalTrig({ fieldId: c.fieldId, operator: c.operator, value: c.value });
      const any = Array.isArray(c.anyOf) ? c.anyOf.some(evalTrig) : false;
      return single || any;
    };

    const isFieldRequired = (f) => {
      const base = !!f.required;
      const c = f.conditional;
      if (!c || !c.enabled || !c.fieldId) return base;
      // Only apply thenRequired if condition is true
      if (!isFieldVisible(f)) return base;
      if (c.thenRequired === 'required') return true;
      if (c.thenRequired === 'optional') return false;
      return base;
    };

    useEffect(() => {
      const initial = {};
      (currentForm.fields || []).forEach(f => {
        if (f.type === 'checkbox') {
          initial[f.name] = (f.defaultValue === true || f.defaultValue === 'true');
        } else if (f.type === 'radio' || f.type === 'select') {
          if (f.defaultValue) initial[f.name] = f.defaultValue;
        } else if (f.type === 'multiselect') {
          initial[f.name] = Array.isArray(f.defaultValue) ? f.defaultValue : [];
        } else if (f.type === 'rating') {
          initial[f.name] = Number(f.defaultValue || 0);
        } else if (f.defaultValue) {
          initial[f.name] = f.defaultValue;
        }
      });
      setPreviewData(prev => Object.keys(prev).length ? prev : initial);
    }, [currentForm.fields]);

    // Initialize Google Autocomplete on any visible Location fields
    useEffect(() => {
      const hasLocation = (currentForm.fields || []).some(f => f.type === 'location');
      if (!hasLocation) return;
      let canceled = false;
      (async () => {
        const ok = await ensureGooglePlaces();
        if (!ok || canceled) return;

        // Import the Places library namespace (for new widgets)
        let placesNs = null;
        try { placesNs = await window.google.maps.importLibrary('places'); } catch {}

        (currentForm.fields || [])
          .filter(f => f.type === 'location')
          .forEach((f) => {
            const input = locationRefs.current[f.id]?.current;
            if (!input) return;

            // Avoid double-init
            if (input._placesBound) return;
            input._placesBound = true;

            // Prefer the new PlaceAutocompleteElement for new projects
            const PAE = window.google?.maps?.places?.PlaceAutocompleteElement;
            if (placesNs && PAE) {
              try {
                const el = new PAE({
                  // Limit to address-like results for forms
                  includedPrimaryTypes: ['street_address', 'premise', 'subpremise']
                });
                el.style.display = 'block';
                el.style.width = '100%';
                // Try to mirror common input attrs
                if (input.placeholder) el.setAttribute('placeholder', input.placeholder);
                if (input.name) el.name = input.name;

                // Insert just before the fallback input and hide the original
                input.parentNode?.insertBefore(el, input);
                input.style.display = 'none';

                // Selection handler (new API)
                const onSelect = async (ev) => {
                  try {
                    const pred = ev?.placePrediction;
                    if (pred && pred.toPlace) {
                      const place = await pred.toPlace();
                      // Fetch only what we need
                      const fetched = await place.fetchFields({ fields: ['formattedAddress'] });
                      const addr = fetched?.formattedAddress || pred.text || '';
                      handlePreviewChange(f.name, addr);
                    }
                  } catch {
                    try { handlePreviewChange(f.name, el.value || ''); } catch {}
                  }
                };
                // Current (release) event name
                el.addEventListener('gmp-select', onSelect);
                // Back-compat for beta channel
                el.addEventListener('gmp-placeselect', (e) => {
                  try {
                    const place = e?.place;
                    const addr = place?.formattedAddress || '';
                    if (addr) handlePreviewChange(f.name, addr);
                  } catch {}
                });

                // In case Places API (New) is disabled on the key/project, fall back to legacy
                const fallbackToLegacy = () => {
                  try {
                    el.replaceWith(input);
                  } catch {}
                  input.style.display = '';
                  try {
                    const ac = new window.google.maps.places.Autocomplete(input, {
                      types: ['address'],
                      fields: ['formatted_address', 'address_components', 'geometry']
                    });
                    input._autocomplete = ac;
                    ac.addListener('place_changed', () => {
                      try {
                        const place = ac.getPlace();
                        const addr = place?.formatted_address || input.value || '';
                        handlePreviewChange(f.name, addr);
                      } catch {}
                    });
                  } catch {}
                };
                el.addEventListener('gmp-error', fallbackToLegacy, { once: true });
                el.addEventListener('gmp-requesterror', fallbackToLegacy, { once: true });

                input._autocomplete = el; // for symmetry
                return; // done with new element path
              } catch {}
            }

            // Fallback: legacy Autocomplete if available (older keys/projects)
            try {
              const ac = new window.google.maps.places.Autocomplete(input, {
                types: ['address'],
                fields: ['formatted_address', 'address_components', 'geometry']
              });
              input._autocomplete = ac;
              ac.addListener('place_changed', () => {
                try {
                  const place = ac.getPlace();
                  const addr = place?.formatted_address || input.value || '';
                  handlePreviewChange(f.name, addr);
                } catch {}
              });
            } catch {}
          });
      })();
      return () => { canceled = true; };
    }, [currentForm.fields]);

    return (
      <div className="form-preview">
        <div className="preview-header">
          <h2>{currentForm.title || 'Untitled Form'}</h2>
          {currentForm.description && <p>{currentForm.description}</p>}
        </div>
        
        <div className="preview-fields">
          {currentForm.fields.map(field => (
            isFieldVisible(field) && (
            <div key={field.id} className={`preview-field width-${field.width}`}>
              {field.type === 'heading' ? (
                (() => { const HeadingTag = `h${field.level || 3}`; return <HeadingTag className="field-heading">{field.label}</HeadingTag>; })()
              ) : field.type === 'divider' ? (
                <hr className="field-divider" />
              ) : field.type === 'adminText' ? (
                <div className="admin-text-block">
                  {(field.content || '').split('\n').map((ln, idx) => (
                    <p key={idx} className="admin-text-line">{ln}</p>
                  ))}
                </div>
              ) : field.type === 'location' ? (
                <div>
                  {!!field.label && (
                    <label className="field-label">{field.label}{isFieldRequired(field) ? ' *' : ''}</label>
                  )}
                  <input
                    ref={ensureRef(field.id)}
                    type="text"
                    placeholder={field.placeholder || 'Search address'}
                    defaultValue={previewData[field.name] || ''}
                    onChange={(e) => handlePreviewChange(field.name, e.target.value)}
                    className="field-input"
                  />
                  {field.helpText && (<small className="field-help">{field.helpText}</small>)}
                  {!window.google?.maps?.places && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
                      Google Places not configured. Add GOOGLE_MAPS_API_KEY on the server to enable dropdown.
                    </div>
                  )}
                </div>
              ) : field.type === 'inlineText' ? (
                <div className="inline-text-block">
                  {(field.parts || []).map((p, idx) =>
                    p.t === 'text' ? (
                      <span key={idx}>{p.v}</span>
                    ) : (
                      <input
                        key={idx}
                        type={p.mask ? 'password' : (p.inputType === 'date' ? 'date' : (p.inputType === 'phone' ? 'tel' : (p.inputType || 'text')))}
                        className="inline-input"
                        defaultValue={previewData[p.name] || ''}
                        onFocus={(e) => { if (p.mask) try { e.currentTarget.type = 'text'; } catch {} }}
                        onBlur={(e) => { if (p.mask) try { e.currentTarget.type = 'password'; } catch {} }}
                        onChange={(e) => handlePreviewChange(p.name, e.target.value)}
                        placeholder={p.inputType === 'date' ? '' : (p.mask ? '••••' : 'Enter text')}
                      />
                    )
                  )}
                </div>
              ) : (
                <>
                  <label className="field-label">
                    {field.label}
                    {isFieldRequired(field) && <span className="required">*</span>}
                  </label>
                  
                  {field.type === 'text' && (
                    <input 
                      type={field.mask ? 'password' : 'text'} 
                      placeholder={field.placeholder || (field.mask ? '••••••' : '')} 
                      defaultValue={field.defaultValue}
                      onFocus={(e) => { if (field.mask) try { e.currentTarget.type = 'text'; } catch {} }}
                      onBlur={(e) => { if (field.mask) try { e.currentTarget.type = 'password'; } catch {} }}
                      onChange={(e) => handlePreviewChange(field.name, e.target.value)}
                      className="field-input" 
                    />
                  )}

                  {field.type === 'signature' && (
                    <div className="signature-preview">
                      <div className="signature-box">Signature will be captured by the user at submission time.</div>
                    </div>
                  )}
                  
                  {field.type === 'email' && (
                    <input 
                      type="email" 
                      placeholder={field.placeholder || 'email@example.com'} 
                      defaultValue={field.defaultValue}
                      onChange={(e) => handlePreviewChange(field.name, e.target.value)}
                      className="field-input" 
                    />
                  )}
                  
                  {field.type === 'phone' && (
                    <input 
                      type="tel" 
                      placeholder={field.placeholder || '(555) 123-4567'} 
                      defaultValue={field.defaultValue}
                      onChange={(e) => handlePreviewChange(field.name, e.target.value)}
                      className="field-input" 
                    />
                  )}
                  
                  {field.type === 'number' && (
                    <input 
                      type={field.mask ? 'password' : 'number'} 
                      placeholder={field.placeholder || (field.mask ? '••••••' : '')} 
                      defaultValue={field.defaultValue}
                      onFocus={(e) => { if (field.mask) try { e.currentTarget.type = 'text'; } catch {} }}
                      onBlur={(e) => { if (field.mask) try { e.currentTarget.type = 'password'; } catch {} }}
                      onChange={(e) => handlePreviewChange(field.name, e.target.value)}
                      min={field.validation?.min}
                      max={field.validation?.max}
                      className="field-input" 
                    />
                  )}
                  
                  {field.type === 'date' && (
                    <input 
                      type="date" 
                      defaultValue={field.defaultValue}
                      onClick={(e) => {
                        if (field.autoToday) {
                          const d = new Date();
                          const yyyy = d.getFullYear();
                          const mm = String(d.getMonth() + 1).padStart(2, '0');
                          const dd = String(d.getDate()).padStart(2, '0');
                          const val = `${yyyy}-${mm}-${dd}`;
                          try { e.currentTarget.value = val; } catch {}
                          handlePreviewChange(field.name, val);
                        }
                      }}
                      onChange={(e) => handlePreviewChange(field.name, e.target.value)}
                      className="field-input" 
                    />
                  )}
                  
                  {field.type === 'time' && (
                    <input 
                      type="time" 
                      defaultValue={field.defaultValue}
                      onChange={(e) => handlePreviewChange(field.name, e.target.value)}
                      className="field-input" 
                    />
                  )}
                  
                  {field.type === 'textarea' && (
                    <textarea 
                      placeholder={field.placeholder} 
                      defaultValue={field.defaultValue}
                      onChange={(e) => handlePreviewChange(field.name, e.target.value)}
                      rows="4" 
                      className="field-input" 
                    />
                  )}
                  
                  {field.type === 'select' && (
                    <select 
                      className="field-input" 
                      defaultValue={field.defaultValue}
                      onChange={(e) => handlePreviewChange(field.name, e.target.value)}
                    >
                      <option value="">Choose...</option>
                      {(field.options || []).map((opt, idx) => (
                        <option key={idx} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  )}
                  
                  {field.type === 'radio' && (
                    <div className="radio-group">
                      {(field.options || []).map((opt, idx) => (
                        <label key={idx} className="radio-label">
                          <input 
                            type="radio" 
                            name={field.name} 
                            value={opt.value}
                            defaultChecked={field.defaultValue === opt.value}
                            onChange={(e) => e.target.checked && handlePreviewChange(field.name, opt.value)}
                            className="native-radio"
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  )}
                  
                  {field.type === 'checkbox' && (
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        defaultChecked={field.defaultValue === 'true'}
                        onChange={(e) => handlePreviewChange(field.name, e.target.checked)}
                        className="native-checkbox"
                      />
                      {field.checkboxText || field.placeholder || field.label || 'Check this box'}
                    </label>
                  )}
                  
                  {field.type === 'multiselect' && (
                    <div className="checkbox-group">
                      {(field.options || []).map((opt, idx) => (
                        <label key={idx} className="checkbox-label">
                          <input 
                            type="checkbox" 
                            value={opt.value}
                            name={field.name}
                            onChange={(e) => handleMultiChange(field.name, opt.value, e.target.checked)}
                            className="native-checkbox"
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  )}
                  
                  {field.type === 'file' && (
                    <input 
                      type="file" 
                      className="field-input" 
                      accept={field.validation?.accept} 
                    />
                  )}
                  
                  {field.type === 'url' && (
                    <input 
                      type="url" 
                      placeholder={field.placeholder || 'https://example.com'} 
                      defaultValue={field.defaultValue}
                      onChange={(e) => handlePreviewChange(field.name, e.target.value)}
                      className="field-input" 
                    />
                  )}
                  
                  {field.type === 'rating' && (
                    <div className="rating-group">
                      {[...Array(field.validation?.maxStars || 5)].map((_, idx) => (
                        <Star 
                          key={idx} 
                          size={24} 
                          className="rating-star"
                          fill={idx < (previewData[field.name] || 0) ? '#fbbf24' : 'none'}
                          onClick={() => handlePreviewChange(field.name, idx + 1)}
                        />
                      ))}
                    </div>
                  )}
                  
                  {field.helpText && (
                    <small className="field-help">{field.helpText}</small>
                  )}
                </>
              )}
            </div>)
          ))}
        </div>
        
        <div className="preview-footer">
          <button className="btn-primary">
            {currentForm.settings.submitButtonText || 'Submit'}
          </button>
        </div>
      </div>
    );
  };

  // PDF Import Modal Component
  const PdfImportModal = () => {
    if (!showPdfImport) return null;

    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="modal-header">
            <h2>
              <FileUp size={24} />
              Import PDF Form
            </h2>
            <button onClick={() => { setShowPdfImport(false); setPdfFields([]); }} className="btn-icon">
              <X size={20} />
            </button>
          </div>

          <div className="modal-body">
            {pdfProcessing ? (
              <div className="processing-state">
                <Loader size={48} className="spinning" />
                <h3>Processing PDF...</h3>
                <p>Extracting form fields from your document</p>
              </div>
            ) : pdfFields.length > 0 ? (
              <>
                <div className="import-info">
                  <Info size={20} />
                  <p>We found {pdfFields.length} fields in your PDF. Review and customize them below:</p>
                </div>
                
                <div className="pdf-fields-list">
                  {pdfFields.map((field, index) => (
                    <div key={index} className={`pdf-field-item ${field.import !== false ? 'selected' : ''}`}>
                      <div className="pdf-field-check">
                        <input
                          type="checkbox"
                          checked={field.import !== false}
                          onChange={() => togglePdfField(index)}
                          className="native-checkbox"
                        />
                      </div>
                      <div className="pdf-field-info">
                        <div className="pdf-field-label">{field.label}</div>
                        <div className="pdf-field-type">
                          <select
                            value={field.type}
                            onChange={(e) => changePdfFieldType(index, e.target.value)}
                            className="type-select"
                          >
                            <option value="text">Text</option>
                            <option value="inlineText">Inline Text + Inputs</option>
                            <option value="email">Email</option>
                            <option value="phone">Phone</option>
                            <option value="number">Number</option>
                            <option value="date">Date</option>
                            <option value="time">Time</option>
                            <option value="textarea">Text Area</option>
                            <option value="select">Dropdown</option>
                            <option value="radio">Radio</option>
                            <option value="checkbox">Checkbox</option>
                            <option value="signature">Signature</option>
                            <option value="file">File Upload</option>
                            <option value="url">URL</option>
                            <option value="heading">Section Heading</option>
                          </select>
                        </div>
                      </div>
                      <div className="pdf-field-badges">
                        {field.required && <span className="badge-required">Required</span>}
                        <span className="badge-type">{field.pdfType}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="import-actions">
                  <button onClick={() => { setShowPdfImport(false); setPdfFields([]); }} className="btn-secondary">
                    Cancel
                  </button>
                  <button 
                    onClick={importPdfFields} 
                    className="btn-primary"
                    disabled={!pdfFields.some(f => f.import !== false)}
                  >
                    <Wand2 size={16} />
                    Import {pdfFields.filter(f => f.import !== false).length} Fields
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <FileUp size={48} />
                <h3>No form fields detected</h3>
                <p>{pdfError || "The PDF doesn't appear to contain form fields, or there was an error processing it."}</p>
                <button onClick={() => { setShowPdfImport(false); setPdfError(''); }} className="btn-secondary">
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <style>{`
        .form-creator {
          min-height: 100vh;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        }

        .creator-container {
          max-width: 100%;
          margin: 0;
          border-radius: 0;
          box-shadow: none;
          overflow: visible;
          background: transparent;
        }

        .creator-header {
          padding: 30px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .header-title h1 {
          font-size: 28px;
          font-weight: 700;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .header-title p {
          margin: 5px 0 0 0;
          opacity: 0.9;
          font-size: 14px;
        }

        .header-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .tabs {
          display: flex;
          border-bottom: 2px solid #e9ecef;
          padding: 0 20px;
        }

        .tab {
          padding: 15px 25px;
          background: none;
          border: none;
          color: #6c757d;
          font-weight: 500;
          cursor: pointer;
          border-bottom: 3px solid transparent;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .tab.active {
          color: #667eea;
          border-bottom-color: #667eea;
        }

        .creator-content {
          display: flex;
          height: calc(100vh - 280px);
          position: relative;
        }

        .field-types-panel {
          width: 280px;
          border-right: 1px solid #e9ecef;
          padding: 20px;
          overflow-y: auto;
        }

        .panel-title {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          color: #6c757d;
          margin-bottom: 15px;
          letter-spacing: 0.5px;
        }

        .field-type-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .field-type-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 15px 10px;
          border: 2px solid #e9ecef;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.3s;
          font-size: 12px;
          color: #495057;
        }

        .field-type-btn:hover {
          border-color: #667eea;
          background: #f8f6ff;
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(102, 126, 234, 0.2);
        }

        .field-type-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 8px;
        }

        .icon-blue { background: #e7f5ff; color: #1c7ed6; }
        .icon-purple { background: #f3f0ff; color: #7950f2; }
        .icon-green { background: #ebfbee; color: #40c057; }
        .icon-indigo { background: #edf2ff; color: #5c7cfa; }
        .icon-pink { background: #fff0f6; color: #e64980; }
        .icon-teal { background: #e6fcf5; color: #20c997; }
        .icon-orange { background: #fff4e6; color: #fd7e14; }
        .icon-red { background: #ffe5e5; color: #fa5252; }
        .icon-cyan { background: #e3fafc; color: #22b8cf; }
        .icon-yellow { background: #fff9db; color: #fab005; }
        .icon-gray { background: #f1f3f5; color: #868e96; }

        .form-builder {
          flex: 1;
          padding: 30px;
          overflow-y: auto;
        }

        .form-settings {
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 30px;
        }

        .settings-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-top: 20px;
        }

        .settings-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
        }

        .form-group label {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        :root[data-theme="light"] .form-group label { color: #495057; }

        .form-group input,
        .form-group textarea,
        .form-group select {
          padding: 10px 15px;
          border: 1px solid #dee2e6;
          border-radius: 8px;
          font-size: 14px;
          transition: all 0.3s;
        }

        .input-error {
          border-color: #fa5252 !important;
          box-shadow: 0 0 0 3px rgba(250,82,82,0.15) !important;
        }

        .error-text {
          margin-top: 6px;
          color: #e03131;
          font-size: 12px;
          font-weight: 600;
        }

        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .pdf-import-section {
          margin-bottom: 20px;
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: white;
        }

        .pdf-import-info {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .pdf-import-info h3 {
          margin: 0;
          font-size: 18px;
        }

        .pdf-import-info p {
          margin: 5px 0 0 0;
          opacity: 0.9;
          font-size: 14px;
        }

        .fields-container {
          min-height: 300px;
          border: 2px dashed #dee2e6;
          border-radius: 12px;
          padding: 20px;
          position: relative;
          transition: all 0.3s;
        }

        .fields-container.has-fields {
          border-style: solid;
          border-color: #e9ecef;
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: #adb5bd;
        }

        .empty-state svg {
          margin-bottom: 20px;
          opacity: 0.5;
        }

        .field-item {
          border: 2px solid #e9ecef;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 15px;
          position: relative;
          transition: all 0.3s;
          cursor: move;
        }

        .field-item:hover {
          border-color: #667eea;
          box-shadow: 0 5px 15px rgba(102, 126, 234, 0.1);
        }

        .field-item.selected {
          border-color: #667eea;
        }

        .field-item.drag-over {
          border-top: 3px solid #40c057;
          padding-top: 30px;
        }

        .field-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 15px;
        }

        .field-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .drag-handle {
          color: #adb5bd;
          cursor: grab;
        }

        .drag-handle:active {
          cursor: grabbing;
        }

        .field-type-badge {
          background: #e9ecef;
          color: #495057;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .field-label-text {
          font-weight: 600;
        }

        /* Admin read-only text block in preview */
        .admin-text-block {
          border: 1px solid #e9ecef;
          padding: 12px 14px;
          border-radius: 8px;
        }
        .admin-text-line { margin: 0 0 8px 0; }
        .admin-text-line:last-child { margin-bottom: 0; }

        .inline-text-block{display:flex; flex-wrap:wrap; gap:8px; align-items:center}
        .inline-input{border:0; border-bottom:2px solid #94a3b8; background:transparent; padding:2px 6px; min-width:120px}

        .field-actions {
          display: flex;
          gap: 8px;
        }

        .btn-icon {
          background: none;
          border: none;
          padding: 8px;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        :root[data-theme="light"] .btn-icon:hover {
          background: #495057;
          color: #e9ecef;
        }

        .btn-icon:hover {
          background: #e9ecef;
          color: #495057;
        }

        .btn-icon.small {
          padding: 4px;
        }

        .btn-icon.danger:hover {
          background: #ffe5e5;
          color: #fa5252;
        }

        .field-config-panel {
          position: absolute;
          right: 0;
          top: 0;
          bottom: 0;
          width: 320px;
          background: linear-gradient(180deg,#0b0f1d 0%, #0c1020 40%, #0a0e1b 100%);
          border-left: 1px solid #e9ecef;
          box-shadow: -5px 0 20px rgba(0,0,0,0.1);
          z-index: 20;
          animation: slideIn 0.3s ease-out;
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }

        :root[data-theme="light"] .field-config-panel, :root[data-theme="light"] .config-footer {
          background: #fff;
        }

        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }

        .config-header {
          padding: 20px;
          border-bottom: 1px solid #e9ecef;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .config-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .config-body {
          padding: 20px;
          overflow-y: auto;
          flex: 1 1 auto;
          min-height: 0;
        }

        .config-group {
          margin-bottom: 20px;
        }

        .config-group label {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .config-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          font-size: 14px;
        }

        .config-input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-size: 14px;
        }

        .native-checkbox,
        .native-radio {
          -webkit-appearance: checkbox !important;
          -moz-appearance: checkbox !important;
          appearance: checkbox !important;
          width: 18px !important;
          height: 18px !important;
          min-width: 18px !important;
          min-height: 18px !important;
          margin: 0 !important;
          margin-right: 8px !important;
          cursor: pointer;
          flex-shrink: 0;
          accent-color: #667eea;
        }

        .native-radio {
          -webkit-appearance: radio !important;
          -moz-appearance: radio !important;
          appearance: radio !important;
        }

        input[type="checkbox"].native-checkbox,
        input[type="radio"].native-radio {
          opacity: 1 !important;
          position: relative !important;
          pointer-events: auto !important;
          display: inline-block !important;
          visibility: visible !important;
        }

        .toggle { 
          display: inline-flex; 
          align-items: center; 
          gap: 10px; 
          cursor: pointer; 
          user-select: none; 
        }
        
        .toggle input { 
          position: absolute; 
          opacity: 0; 
          pointer-events: none; 
        }
        
        .toggle-track { 
          position: relative; 
          display: inline-block; 
          width: 38px; 
          height: 20px; 
          background: #e2e8f0; 
          border-radius: 999px; 
          transition: background .15s; 
          box-shadow: inset 0 0 0 1px rgba(0,0,0,.05); 
        }
        
        .toggle-thumb { 
          position: absolute; 
          top: 2px; 
          left: 2px; 
          width: 16px; 
          height: 16px; 
          border-radius: 50%; 
          background: #fff; 
          box-shadow: 0 1px 3px rgba(0,0,0,.25); 
          transition: left .15s; 
        }
        
        .toggle input:checked + .toggle-track { 
          background: #4ade80; 
        }
        
        .toggle input:checked + .toggle-track .toggle-thumb { 
          left: 20px; 
        }
        
        .toggle-text { 
          font-size: 13px; 
          font-weight: 600; 
          color: #334155; 
        }

        .required-badge { 
          background: #fff1f2; 
          color: #e11d48; 
          border: 1px solid #fecdd3; 
          padding: 2px 8px; 
          border-radius: 999px; 
          font-size: 11px; 
          font-weight: 800; 
        }

        .conditional-badge {
          background: #ecfeff;
          color: #0891b2;
          border: 1px solid #a5f3fc;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
        }

        .trigger-badge {
          background: #eef2ff;
          color: #4f46e5;
          border: 1px solid #c7d2fe;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
        }

        .radio-label {
          display: flex !important;
          align-items: center !important;
          gap: 8px;
          cursor: pointer;
          font-size: 14px;
          margin: 0;
          padding: 4px 0;
        }

        .radio-group, .checkbox-group { 
          display: grid; 
          gap: 8px; 
        }

        .options-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .option-item {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .option-input {
          flex: 1;
          padding: 6px 10px;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          font-size: 13px;
        }

        .config-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .config-footer {
          padding: 16px 20px;
          border-top: 1px solid #e9ecef;
          background: linear-gradient(180deg,#0b0f1d 0%, #0c1020 40%, #0a0e1b 100%);
          flex: 0 0 auto;
        }

        .btn-primary {
          background: #667eea;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .btn-primary:hover {
          background: #5a67d8;
          transform: translateY(-2px);
          box-shadow: 0 5px 20px rgba(102, 126, 234, 0.3);
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-secondary {
          color: #495057;
          background: #ffffffff;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .btn-secondary:hover {
          background: #a1b2ffff;
        }

        .btn-secondary.small {
          padding: 8px 16px;
          font-size: 13px;
        }

        .btn-secondary.full-width {
          width: 100%;
          justify-content: center;
        }

        .btn-danger {
          background: #fa5252;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          justify-content: center;
        }

        .btn-danger:hover {
          background: #e03131;
        }

        .config-footer .btn-danger {
          width: auto;
        }

        .config-footer .btn-primary,
        .config-footer .btn-secondary,
        .config-footer .btn-danger {
          padding: 8px 12px;
          font-size: 12px;
          gap: 6px;
          border-radius: 8px;
        }

        .btn-success {
          background: #40c057;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .btn-success:hover {
          background: #37b24d;
        }

        .btn-pdf {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .btn-pdf:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 20px rgba(118, 75, 162, 0.4);
        }

        .form-preview {
          border-radius: 16px;
          padding: 28px;
          max-width: 960px;
          margin: 0 auto;
          border: 1px solid #e9ecef;
          box-shadow: 0 8px 30px rgba(0,0,0,.06);
        }

        .preview-header {
          margin-bottom: 30px;
          text-align: center;
        }

        .preview-header h2 {
          margin: 0 0 10px 0;
          font-size: 28px;
        }

        .preview-header p {
          color: #6c757d;
          margin: 0;
        }

        .preview-fields { 
          display: flex; 
          flex-wrap: wrap; 
          gap: 16px 20px; 
        }

        .preview-field { 
          flex: 1 1 100%; 
          border: 1px solid #edf2f7; 
          border-radius: 10px; 
          padding: 12px; 
        }

        .preview-field.width-half {
          flex: 1 1 calc(50% - 10px);
        }

        .preview-field.width-third {
          flex: 1 1 calc(33.333% - 14px);
        }

        .preview-field.width-quarter {
          flex: 1 1 calc(25% - 15px);
        }

        .field-heading {
          font-size: 20px;
          font-weight: 600;
          margin: 20px 0 10px 0;
          padding-bottom: 10px;
          border-bottom: 2px solid #e9ecef;
        }

        .field-divider {
          border: none;
          border-top: 2px solid #e9ecef;
          margin: 20px 0;
        }

        .field-label { 
          font-size: 13px; 
          font-weight: 700; 
          margin-bottom: 6px; 
          display: block;
        }

        .field-info {
          font-size: 13px;
          margin: 4px 0 8px 0;
        }

        .required {
          color: #fa5252;
          margin-left: 4px;
        }

        .field-input { 
          width: 100%; 
          padding: 10px 12px; 
          border: 1px solid #d1d5db; 
          border-radius: 10px; 
          font-size: 14px; 
          transition: all .15s; 
        }

        .field-input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .rating-group { 
          display: flex; 
          gap: 6px; 
        }

        .rating-star { 
          cursor: pointer; 
          color: #f59e0b; 
          transition: transform .15s; 
        }

        .rating-star:hover {
          transform: scale(1.2);
        }

        .field-help {
          margin-top: 6px;
          color: #6c757d;
          font-size: 13px;
          display: block;
        }

        .preview-footer {
          margin-top: 30px;
          display: flex;
          justify-content: center;
        }

        .saved-message {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: #40c057;
          color: white;
          padding: 12px 16px;
          border-radius: 10px;
          box-shadow: 0 10px 24px rgba(0,0,0,0.2);
          display: flex;
          align-items: center;
          gap: 8px;
          animation: slideUp 0.25s ease-out;
          z-index: 100;
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .forms-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
          padding: 20px;
        }

        .form-card {
          border: 1px solid #e9ecef;
          border-radius: 12px;
          padding: 20px;
          transition: all 0.3s;
          cursor: pointer;
        }

        .form-card:hover {
          box-shadow: 0 5px 15px rgba(0,0,0,0.1);
          transform: translateY(-2px);
        }

        .form-card-header {
          display: flex;
          justify-content: space-between;
          align-items: start;
          margin-bottom: 12px;
        }

        .form-card-title {
          font-size: 18px;
          font-weight: 600;
        }

        .form-status {
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .status-active {
          background: #ebfbee;
          color: #40c057;
        }

        .status-draft {
          background: #fff9db;
          color: #fab005;
        }

        .status-closed {
          background: #f1f3f5;
          color: #868e96;
        }

        .form-card-meta {
          display: flex;
          gap: 20px;
          margin-top: 15px;
          padding-top: 15px;
          border-top: 1px solid #e9ecef;
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.2s ease-out;
        }

        .modal-content {
          background: white;
          border-radius: 16px;
          width: 90%;
          max-width: 800px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          animation: slideUpModal 0.3s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUpModal {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .modal-header {
          padding: 24px;
          border-bottom: 1px solid #e9ecef;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .modal-header h2 {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 24px;
        }

        .modal-body {
          padding: 24px;
          overflow-y: auto;
          flex: 1;
        }

        .processing-state {
          text-align: center;
          padding: 60px 20px;
        }

        .processing-state h3 {
          margin: 20px 0 10px 0;
          font-size: 20px;
        }

        .processing-state p {
          color: #6c757d;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .import-info {
          background: #e7f5ff;
          border: 1px solid #74c0fc;
          border-radius: 8px;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
          color: #1c7ed6;
        }

        .pdf-fields-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-height: 400px;
          overflow-y: auto;
          padding: 4px;
        }

        .pdf-field-item {
          border: 2px solid #e9ecef;
          border-radius: 8px;
          padding: 12px;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: all 0.2s;
        }

        .pdf-field-item.selected {
          border-color: #667eea;
          background: #f8f6ff;
        }

        .pdf-field-check {
          flex-shrink: 0;
        }

        .pdf-field-info {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .pdf-field-label {
          font-weight: 600;
          flex: 1;
        }

        .pdf-field-type {
          flex-shrink: 0;
        }

        .type-select {
          padding: 4px 8px;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          font-size: 13px;
        }

        .pdf-field-badges {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }

        .badge-required {
          background: #fff1f2;
          color: #e11d48;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
        }

        .badge-type {
          background: #f1f3f5;
          color: #495057;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
        }

        .import-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid #e9ecef;
        }

        @media (max-width: 768px) {
          .creator-container {
            border-radius: 0;
          }

          .field-types-panel {
            display: none;
          }

          .field-config-panel {
            width: 100%;
          }

          .settings-row {
            grid-template-columns: 1fr;
          }

          .preview-field.width-half,
          .preview-field.width-third,
          .preview-field.width-quarter {
            flex: 1 1 100%;
          }

          .header-actions {
            flex-direction: column;
            gap: 8px;
          }

          .tabs {
            overflow-x: auto;
            padding: 0 10px;
          }

          .tab {
            padding: 12px 16px;
            font-size: 13px;
          }

          .modal-content {
            width: 95%;
            max-height: 95vh;
          }

                  .signature-box{
          height: 120px; display:flex; align-items:center; justify-content:center; color:#6c757d;
          border:1px dashed #cbd5e1; border-radius:8px; background:#f8fafc;
        }

        }
      `}</style>

      <div className="form-creator">
        <div className="creator-container">
          <div className="creator-header">
            <div className="header-title">
              <h1>
                <FileText size={32} />
                Form Creator
              </h1>
              <p>Create dynamic forms with drag-and-drop simplicity</p>
            </div>
            <div className="header-actions">
              <button onClick={() => navigate('/admin/docs-center')} className="btn-secondary">
                <ArrowLeft size={20} /> Docs Center
              </button>
              {savedMessage && (
                <div className="saved-message">
                  <Check size={20} />
                  {savedMessage}
                </div>
              )}
              {activeTab === 'builder' && (
                <>
                  <button onClick={() => setActiveTab('preview')} className="btn-secondary">
                    <Eye size={20} /> Preview
                  </button>
                  <button 
                    onClick={saveForm} 
                    className="btn-success"
                    disabled={loading}
                  >
                    <Save size={20} />
                    {loading ? 'Saving...' : 'Save Form'}
                  </button>
                </>
              )}
              {activeTab === 'preview' && (
                <button onClick={() => setActiveTab('builder')} className="btn-secondary">
                  <Edit2 size={20} /> Edit Form
                </button>
              )}
            </div>
          </div>

          <div className="tabs">
            <button 
              className={`tab ${activeTab === 'builder' ? 'active' : ''}`}
              onClick={() => setActiveTab('builder')}
            >
              <Edit2 size={18} />
              Form Builder
            </button>
            <button 
              className={`tab ${activeTab === 'preview' ? 'active' : ''}`}
              onClick={() => setActiveTab('preview')}
            >
              <Eye size={18} />
              Preview
            </button>
            <button 
              className={`tab ${activeTab === 'forms' ? 'active' : ''}`}
              onClick={() => setActiveTab('forms')}
            >
              <FileText size={18} />
              My Forms
            </button>
            <button 
              className={`tab ${activeTab === 'submissions' ? 'active' : ''}`}
              onClick={() => setActiveTab('submissions')}
            >
              <Send size={18} />
              Submissions
            </button>
          </div>

          {activeTab === 'builder' && (
            <div className="creator-content">
              <div className="field-types-panel">
                <div className="panel-title">Add Fields</div>
                <div className="field-type-grid">
                  {fieldTypes.map(fieldType => (
                    <button
                      key={fieldType.type}
                      onClick={() => addField(fieldType)}
                      className="field-type-btn"
                    >
                      <div className={`field-type-icon icon-${fieldType.color}`}>
                        <fieldType.icon size={20} />
                      </div>
                      {fieldType.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-builder">
                <div className="pdf-import-section">
                  <div className="pdf-import-info">
                    <FileUp size={32} />
                    <div>
                      <h3>Import from PDF</h3>
                      <p>Upload a PDF form to automatically extract and convert fields</p>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    onChange={handlePdfUpload}
                    style={{ display: 'none' }}
                  />
                  <button onClick={() => fileInputRef.current?.click()} className="btn-pdf">
                    <Upload size={20} />
                    Upload PDF
                  </button>
                </div>

                <div className="pdf-import-section" style={{ marginTop: 16 }}>
                  <div className="pdf-import-info">
                    <FileText size={32} />
                    <div>
                      <h3>Template JSON</h3>
                      <p>Import/export a JSON template for this form builder</p>
                    </div>
                  </div>
                  <input
                    ref={jsonFileInputRef}
                    type="file"
                    accept="application/json"
                    onChange={handleTemplateJsonUpload}
                    style={{ display: 'none' }}
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => jsonFileInputRef.current?.click()} className="btn-secondary">
                      <Upload size={18} /> Upload JSON
                    </button>
                    <button onClick={exportCurrentFormJson} className="btn-secondary">
                      <Download size={18} /> Export JSON
                    </button>
                  </div>
                </div>

                <div className="form-settings">
                  <div className="settings-row">
                    <div className="form-group">
                      <label>Form Title</label>
                      <input
                        type="text"
                        value={currentForm.title}
                        onChange={(e) => {
                          if (errors.title) setErrors((er) => ({ ...er, title: undefined }));
                          setCurrentForm({ ...currentForm, title: e.target.value });
                        }}
                        placeholder="Enter form title"
                        className={errors.title ? 'config-input input-error' : undefined}
                      />
                      {errors.title && (
                        <div className="error-text">{errors.title}</div>
                      )}
                    </div>
                    <div className="form-group">
                      <label>Form Status</label>
                      <select
                        value={currentForm.status}
                        onChange={(e) => setCurrentForm({...currentForm, status: e.target.value})}
                      >
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea
                      value={currentForm.description}
                      onChange={(e) => setCurrentForm({...currentForm, description: e.target.value})}
                      placeholder="Describe what this form is for"
                      rows="2"
                    />
                  </div>
                </div>

                <div className={`fields-container ${currentForm.fields.length > 0 ? 'has-fields' : ''}`}>
                  {currentForm.fields.length === 0 ? (
                    <div className="empty-state">
                      <Plus size={48} />
                      <h3>No fields yet</h3>
                      <p>Click on field types from the left panel or upload a PDF to add fields</p>
                    </div>
                  ) : (
                    currentForm.fields.map((field, index) => (
                      <div
                        key={field.id}
                        className={`field-item ${selectedField === field.id ? 'selected' : ''} ${dragOverIndex === index ? 'drag-over' : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, index)}
                        onClick={() => {
                          setSelectedField(field.id);
                          setShowFieldConfig(true);
                        }}
                      >
                        <div className="field-header">
                          <div className="field-info">
                            <GripVertical size={20} className="drag-handle" />
                            <span className="field-type-badge">{field.type}</span>
                            <span className="field-label-text">
                              {field.label}
                            </span>
                            {field.required && <span className="required-badge">Required</span>}
                            {field.conditional?.enabled && <span className="conditional-badge">Conditional</span>}
                            {currentForm.fields.some(f => f.conditional?.enabled && f.conditional?.fieldId === field.id) && (
                              <span className="trigger-badge">Triggers</span>
                            )}
                          </div>
                          <div className="field-actions">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                moveField(field.id, 'up');
                              }}
                              className="btn-icon small"
                              disabled={index === 0}
                            >
                              <ChevronUp size={16} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                moveField(field.id, 'down');
                              }}
                              className="btn-icon small"
                              disabled={index === currentForm.fields.length - 1}
                            >
                              <ChevronDown size={16} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                duplicateField(field.id);
                              }}
                              className="btn-icon small"
                            >
                              <Copy size={16} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteField(field.id);
                              }}
                              className="btn-icon small danger"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {showFieldConfig && selectedField && (
                <FieldConfigPanel 
                  field={currentForm.fields.find(f => f.id === selectedField)}
                />
              )}
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="creator-content">
              <div className="form-builder">
                <FormPreview />
              </div>
            </div>
          )}

          {activeTab === 'forms' && (
            <div className="form-builder">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px 12px 4px' }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>My Forms</h2>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-secondary small" onClick={loadForms} disabled={loading}>
                    <Settings size={16} className={loading ? 'spinning' : ''} /> Refresh
                  </button>
                  <button className="btn-primary small" onClick={() => { setCurrentForm({ ...currentForm, id: undefined, title: '', description: '', fields: [] }); setActiveTab('builder'); }}>
                    <Plus size={16} /> New Form
                  </button>
                </div>
              </div>
              {loading ? (
                <div className="empty-state">
                  <Settings size={48} className="spinning" />
                  <h3>Loading forms...</h3>
                </div>
              ) : forms.length === 0 ? (
                <div className="empty-state">
                  <Archive size={48} />
                  <h3>No forms yet</h3>
                  <p>Create your first form to get started</p>
                </div>
              ) : (
                <div className="forms-grid">
                  {forms.map(form => (
                    <div 
                      key={form.id} 
                      className="form-card"
                      onClick={() => {
                        setCurrentForm(form);
                        setActiveTab('builder');
                      }}
                    >
                      <div className="form-card-header">
                        <h3 className="form-card-title">{form.title || 'Untitled Form'}</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className={`form-status status-${form.status || 'draft'}`}>
                            {form.status || 'draft'}
                          </span>
                          <button
                            className="btn-icon small danger"
                            title="Delete form"
                            disabled={loading}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!form?.id) return;
                              const title = form.title || 'Untitled Form';
                              setModal?.({
                                open: true,
                                type: 'node',
                                title: 'Delete Form',
                                node: (
                                  <div>
                                    <p style={{ marginTop: 0 }}>Are you sure you want to delete “{title}”?</p>
                                    <p style={{ color: '#6b7280' }}>This action cannot be undone.</p>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                                      <button
                                        className="btn-secondary"
                                        onClick={() => setModal((m) => ({ ...m, open: false }))}
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        className="btn-danger"
                                        onClick={async () => {
                                          setModal((m) => ({ ...m, open: false }));
                                          try { await deleteForm(form.id); } catch {}
                                        }}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                )
                              });
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <p style={{fontSize: '14px', marginBottom: '10px' }}>
                        {form.description || 'No description'}
                      </p>
                      <div className="form-card-meta">
                        <div className="meta-item">
                          <FileText size={16} />
                          {form.fields?.length || 0} fields
                        </div>
                        <div className="meta-item">
                          <Send size={16} />
                          {form.submissions || 0} submissions
                        </div>
                        <div className="meta-item" title="Last updated">
                          <Clock size={16} />
                          {form.updatedAt ? new Date(form.updatedAt).toLocaleString() : '—'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'submissions' && (
            <div className="form-builder">
              <div className="empty-state">
                <Users size={48} />
                <h3>Submissions are now managed in Docs Center</h3>
                <p>Go to Docs Center → Form Submissions to review, preview and approve student forms.</p>
                <button className="btn-secondary" onClick={() => navigate('/admin/docs-center')}>
                  <ArrowLeft size={16}/> Open Docs Center
                </button>
              </div>
            </div>
          )}
        </div>

        <PdfImportModal />
      </div>
    </>
  );
};

export default FormBuilder;
