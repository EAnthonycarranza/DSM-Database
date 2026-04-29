import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import * as pdfjsLib from 'pdfjs-dist';
import {
  FaPlus, FaSave, FaEye, FaTimes, FaGripVertical,
  FaTrash, FaCopy, FaCog, FaChevronUp, FaChevronDown,
  FaFilePdf, FaFileCode, FaMagic, FaArrowLeft, FaCheck,
  FaHeading, FaParagraph, FaStar, FaSignature, FaLocationArrow,
  FaKeyboard, FaMousePointer, FaDatabase, FaBolt, FaCircle, FaListUl,
  FaFileUpload, FaFileDownload, FaUser, FaShieldAlt, FaCalendarAlt,
  FaFilter, FaLink, FaAsterisk, FaList, FaLayerGroup, FaQuoteLeft,
  FaExchangeAlt, FaPenNib, FaCode, FaClipboard
} from "react-icons/fa";

const PDFJS_VERSION = pdfjsLib.version || "5.4.54";
const PDFJS_MAJOR = parseInt((PDFJS_VERSION || "5").split(".")[0], 10) || 5;
const PDFJS_WORKER_EXT = PDFJS_MAJOR >= 4 ? "mjs" : "js";
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.${PDFJS_WORKER_EXT}`;
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text Input', icon: FaKeyboard },
  { value: 'textarea', label: 'Long Text', icon: FaParagraph },
  { value: 'number', label: 'Number', icon: FaPlus },
  { value: 'date', label: 'Date', icon: FaPlus },
  { value: 'select', label: 'Dropdown', icon: FaMousePointer },
  { value: 'radio', label: 'Radio', icon: FaCircle },
  { value: 'checkbox', label: 'Checkbox', icon: FaCheck },
  { value: 'multiselect', label: 'Multi-Select', icon: FaListUl },
  { value: 'signature', label: 'Signature', icon: FaSignature },
  { value: 'rating', label: 'Rating', icon: FaStar },
  { value: 'heading', label: 'Heading', icon: FaHeading },
  { value: 'adminText', label: 'Text Block', icon: FaParagraph },
  { value: 'inlineText', label: 'Inline Input', icon: FaQuoteLeft },
];

const PDF_BLANK_LINE = (t) => /^[\s_]+$/.test(t) && /_{3,}/.test(t);
const PDF_OFFICE_HEADER = (t) => /\(FOR OFFICE USE ONLY\)/i.test(t);
const PDF_PAGE_NUMBER = (t) => /^\d{1,3}$/.test(t);
const PDF_NUMBERED_START = (t) => /^\d+\.\s/.test(t);
const PDF_HEADING_CAPS = (t) => {
  if (!t || t.length < 5 || t.length >= 70) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  return /^[A-Z][A-Z\s&,.()'\-:\d]+$/.test(t);
};
const PDF_TITLE_CASE = (t) => {
  if (!t || t.length < 5 || t.length >= 70) return false;
  if (/[.:;!?]$/.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 8) return false;
  return words.every(w => /^[A-Z\d(]/.test(w) || /^(of|and|the|in|for|a|an|to|on|at|or|vs?|is|by|with)$/i.test(w));
};

async function extractPdfLines(file) {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/standard_fonts/`
  });
  const pdf = await loadingTask.promise;
  const allLines = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const lineMap = new Map();
    for (const item of content.items) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      let key = null;
      for (const existingY of lineMap.keys()) {
        if (Math.abs(existingY - y) <= 3) { key = existingY; break; }
      }
      if (key === null) { key = y; lineMap.set(y, []); }
      lineMap.get(key).push(item);
    }
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const items = lineMap.get(y).sort((a, b) => a.transform[4] - b.transform[4]);
      const text = items.map(it => it.str).join('').replace(/\s+/g, ' ').trim();
      if (text) allLines.push({ text, y, page: pageNum, items });
    }
  }
  return allLines;
}

function groupPdfParagraphs(allLines) {
  const paragraphs = [];
  let current = [];
  const flush = () => { if (current.length) { paragraphs.push(current); current = []; } };
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const prev = allLines[i - 1];
    if (PDF_PAGE_NUMBER(line.text)) { flush(); continue; }
    if (PDF_BLANK_LINE(line.text)) { flush(); paragraphs.push([line]); continue; }
    if (PDF_OFFICE_HEADER(line.text)) { flush(); paragraphs.push([line]); continue; }
    if (PDF_HEADING_CAPS(line.text)) { flush(); paragraphs.push([line]); continue; }
    if (!current.length && PDF_TITLE_CASE(line.text)) { paragraphs.push([line]); continue; }
    if (PDF_NUMBERED_START(line.text)) { flush(); current.push(line); continue; }
    if (prev) {
      const prevText = prev.text;
      const prevSpecial = PDF_BLANK_LINE(prevText) || PDF_OFFICE_HEADER(prevText) || PDF_PAGE_NUMBER(prevText) || PDF_HEADING_CAPS(prevText);
      const prevEndsSentence = /[.!?]\s*$/.test(prevText);
      const lineStartsUpper = /^[A-Z]/.test(line.text);
      let bigGap = false;
      if (prev.page === line.page && (prev.y - line.y) > 25) bigGap = true;
      if (prevSpecial || bigGap || (prevEndsSentence && lineStartsUpper)) flush();
    }
    current.push(line);
  }
  flush();
  return paragraphs;
}

function splitLabelsByBlanks(blankItems, labelItems) {
  let fullText = '';
  const ranges = [];
  for (const it of blankItems) {
    const startPos = fullText.length;
    fullText += it.str;
    const width = it.width || (it.str.length * 5);
    ranges.push({ start: startPos, end: fullText.length, x: it.transform[4], width });
  }
  const runs = [];
  const re = /_{3,}/g;
  let m;
  while ((m = re.exec(fullText)) !== null) {
    let x0 = null, x1 = null;
    for (const r of ranges) {
      const span = Math.max(1, r.end - r.start);
      if (x0 === null && r.end > m.index) {
        x0 = r.x + ((m.index - r.start) / span) * r.width;
      }
      if (r.end >= m.index + m[0].length) {
        x1 = r.x + ((m.index + m[0].length - r.start) / span) * r.width;
        break;
      }
    }
    if (x0 === null) x0 = ranges[0]?.x || 0;
    if (x1 === null) {
      const last = ranges[ranges.length - 1];
      x1 = (last?.x || 0) + (last?.width || 100);
    }
    runs.push({ x0, x1, mid: (x0 + x1) / 2 });
  }
  if (runs.length === 0) {
    return [labelItems.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim()].filter(Boolean);
  }
  const groups = runs.map(() => []);
  for (const it of labelItems) {
    if (!it.str || !it.str.trim()) continue;
    const x = it.transform[4];
    let best = 0, bestDist = Infinity;
    for (let r = 0; r < runs.length; r++) {
      if (x >= runs[r].x0 && x <= runs[r].x1) { best = r; bestDist = 0; break; }
      const d = Math.abs(x - runs[r].mid);
      if (d < bestDist) { bestDist = d; best = r; }
    }
    groups[best].push(it);
  }
  return groups.map(g => {
    g.sort((a, b) => a.transform[4] - b.transform[4]);
    return g.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
  }).filter(Boolean);
}

function pdfParagraphsToFormSchema(paragraphs, defaultTitle) {
  const fields = [];
  let titleCandidate = null;
  let officeHeaderAdded = false;
  let fieldCounter = 0;
  const newId = () => `field_pdf_${Date.now()}_${++fieldCounter}_${Math.random().toString(36).substr(2, 4)}`;
  const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'field';

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const text = para.map(l => l.text).join(' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (PDF_PAGE_NUMBER(text)) continue;

    if (PDF_OFFICE_HEADER(text)) {
      if (!officeHeaderAdded) {
        fields.push({
          id: newId(), type: 'heading', label: 'Office Use Only',
          level: 3, recipientRole: 'admin'
        });
        if (/Student Name/i.test(text)) {
          fields.push({
            id: newId(), type: 'text', label: 'Student Name',
            name: `office_student_name_${fieldCounter}`,
            placeholder: 'Enter student name', width: 'full',
            required: true, recipientRole: 'admin'
          });
        }
        officeHeaderAdded = true;
      }
      continue;
    }

    if (para.length === 1 && PDF_BLANK_LINE(para[0].text)) {
      const blankLine = para[0];
      const blankCount = (blankLine.text.match(/_{3,}/g) || []).length;
      const nextPara = paragraphs[i + 1];
      if (nextPara && nextPara.length === 1 && !PDF_BLANK_LINE(nextPara[0].text) && !/_{3,}/.test(nextPara[0].text)) {
        const labelLine = nextPara[0];
        const labels = splitLabelsByBlanks(blankLine.items, labelLine.items);
        if (labels.length >= 1 && (labels.length === blankCount || labels.length === 1)) {
          labels.forEach((lbl) => {
            const lc = lbl.toLowerCase();
            let type = 'text';
            if (/signature/.test(lc)) type = 'signature';
            else if (/\bdate\b/.test(lc)) type = 'date';
            const adminRole = /witness|director|staff|officer|office|supervisor/.test(lc);
            fields.push({
              id: newId(), type, label: lbl,
              name: `${slug(lbl)}_${fieldCounter}`,
              width: labels.length === 2 ? 'half' : labels.length >= 3 ? 'third' : 'full',
              required: type === 'signature',
              recipientRole: adminRole ? 'admin' : 'student'
            });
          });
          i++;
          continue;
        }
      }
      continue;
    }

    if (PDF_HEADING_CAPS(text) || PDF_TITLE_CASE(text)) {
      if (!titleCandidate && para[0].page === 1) titleCandidate = text;
      fields.push({
        id: newId(), type: 'heading', label: text,
        level: PDF_HEADING_CAPS(text) ? 1 : 2, recipientRole: 'student'
      });
      continue;
    }

    if (/_{3,}/.test(text)) {
      const parts = [];
      const re = /(_{3,})/g;
      let lastIdx = 0, m, inputIdx = 0;
      while ((m = re.exec(text)) !== null) {
        if (m.index > lastIdx) parts.push({ t: 'text', v: text.slice(lastIdx, m.index) });
        inputIdx++;
        parts.push({
          t: 'input', inputType: 'text',
          name: `inline_input_${Date.now()}_${inputIdx}`,
          placeholder: 'Enter...', required: false
        });
        lastIdx = m.index + m[0].length;
      }
      if (lastIdx < text.length) parts.push({ t: 'text', v: text.slice(lastIdx) });
      fields.push({
        id: newId(), type: 'inlineText', label: 'Statement',
        parts, recipientRole: 'student'
      });
      continue;
    }

    fields.push({
      id: newId(), type: 'adminText',
      label: PDF_NUMBERED_START(text) ? `Section ${text.match(/^\d+/)[0]}` : 'Section',
      content: text, recipientRole: 'student'
    });
  }

  return {
    title: titleCandidate || defaultTitle,
    description: 'Imported from PDF document',
    fields,
    status: 'active',
    settings: { submitText: 'Submit Form', successMsg: 'Submitted successfully' }
  };
}

export default function AdminFormBuilder() {
  const navigate = useNavigate();
  const location = useLocation();
  const { api, setToast, setModal } = useApp();
  
  const queryParams = new URLSearchParams(location.search);
  const editId = queryParams.get('id');

  const [currentForm, setCurrentForm] = useState({
    title: '', description: '', fields: [], 
    status: 'active',
    settings: { submitText: 'Submit Form', successMsg: 'Submitted successfully' }
  });

  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('canvas');
  const [selectedFieldId, setSelectedField] = useState(null);
  const [previewData, setPreviewData] = useState({});
  const [previewRole, setPreviewRole] = useState('student');
  const fileInputRef = useRef(null);
  const pdfInputRef = useRef(null);

  useEffect(() => {
    if (editId) {
      (async () => {
        setLoading(true);
        try {
          const f = await api.get('forms', editId);
          if (f) {
            const normalizedFields = (f.fields || []).map((field, idx) => ({
              ...field,
              id: field.id || `field_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
              recipientRole: field.recipientRole || 'student'
            }));
            setCurrentForm({ ...f, fields: normalizedFields });
          }
        } finally { setLoading(false); }
      })();
    }
  }, [editId, api]);

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const items = Array.from(currentForm.fields);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setCurrentForm(f => ({ ...f, fields: items }));
  };

  const addField = (type, role = 'student', index = null) => {
    const id = `field_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const newField = {
      id, type, label: role === 'admin' ? `Admin ${type}` : `New ${type} field`, 
      name: `field_${currentForm.fields.length + 1}_${Math.random().toString(36).substr(2, 3)}`,
      required: false, width: 'full', placeholder: '',
      recipientRole: role,
      logic: null 
    };
    
    if (['select', 'radio', 'multiselect'].includes(type)) {
      newField.options = [{ value: 'opt1', label: 'Option 1' }];
    }

    if (type === 'inlineText') {
      newField.label = "Inline Text Block";
      newField.parts = [
        { t: "text", v: "I, " },
        { t: "input", inputType: "text", name: "name_" + Date.now(), required: true },
        { t: "text", v: " understand the terms..." }
      ];
    }
    
    setCurrentForm(f => {
      const newFields = [...f.fields];
      if (index !== null) newFields.splice(index, 0, newField);
      else newFields.push(newField);
      return { ...f, fields: newFields };
    });
    setSelectedField(id);
  };

  const duplicateField = (fieldId) => {
    const idx = currentForm.fields.findIndex(f => f.id === fieldId);
    if (idx === -1) return;
    const original = currentForm.fields[idx];
    const newField = { 
      ...JSON.parse(JSON.stringify(original)), 
      id: `field_${Date.now()}_dup`,
      name: `${original.name}_copy`
    };
    const newFields = [...currentForm.fields];
    newFields.splice(idx + 1, 0, newField);
    setCurrentForm(f => ({ ...f, fields: newFields }));
    setSelectedField(newField.id);
    setToast("Field duplicated");
  };

  const updateField = (id, updates) => {
    setCurrentForm(f => ({
      ...f,
      fields: f.fields.map(x => x.id === id ? { ...x, ...updates } : x)
    }));
  };

  const importJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (!parsed.fields) parsed.fields = [];
        parsed.fields = parsed.fields.map((f, i) => ({
          ...f,
          id: f.id || `field_imp_${Date.now()}_${i}`,
          recipientRole: f.recipientRole || 'student'
        }));
        setCurrentForm(parsed);
        setToast("JSON schema imported successfully");
      } catch (err) {
        setToast({ type: 'error', text: 'Invalid JSON file structure' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const importPdf = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const lines = await extractPdfLines(file);
      const paragraphs = groupPdfParagraphs(lines);
      const schema = pdfParagraphsToFormSchema(paragraphs, file.name.replace('.pdf', ''));
      
      setCurrentForm(schema);
      setToast("PDF converted to Form Schema successfully");
      setActiveTab('canvas');
    } catch (err) {
      console.error("PDF Import Error:", err);
      setToast({ type: 'error', text: 'Failed to translate PDF to JSON' });
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!currentForm.title) return setToast({ type: 'warn', text: 'Form title is required' });
    
    const cleanedFields = currentForm.fields.map(f => {
      if (!f.logic || !f.logic.conditions) return f;
      const conditions = f.logic.conditions.filter(c => c.parentName && c.value);
      if (conditions.length === 0) return { ...f, logic: null };
      return { ...f, logic: { ...f.logic, conditions } };
    });

    const formToSave = { ...currentForm, fields: cleanedFields };

    setLoading(true);
    try {
      if (formToSave.id) await api.put('forms', formToSave);
      else await api.add('forms', formToSave);
      setToast("Form schema synchronized");
      navigate('/admin/forms');
    } catch {
      setToast({ type: 'error', text: 'Failed to sync form' });
    } finally { setLoading(false); }
  };

  const evaluateLogic = (field, data) => {
    if (!field.logic || !field.logic.conditions || field.logic.conditions.length === 0) return true;
    const { conditions, operator = 'and' } = field.logic;
    const results = conditions.map(c => {
      const val = data[c.parentName];
      return Array.isArray(val) ? val.includes(c.value) : val === c.value;
    });
    return operator === 'or' ? results.some(r => r) : results.every(r => r);
  };

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(currentForm, null, 2));
    setToast("JSON copied to clipboard");
  };

  if (loading) return <div className="fb-loading">Mounting builder engine...</div>;

  return (
    <section className="fb-page fade-in">
      <style>{FB_CSS}</style>
      
      <header className="fb-header">
        <div className="fb-header-left">
          <button className="back-btn" onClick={() => navigate('/admin/forms')}><FaArrowLeft /></button>
          <div>
            <input 
              className="title-input" 
              value={currentForm.title} 
              onChange={e => setCurrentForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Form Title..." 
            />
            <div className="subtitle">ID: {currentForm.id || 'Draft'}</div>
          </div>
        </div>

        <div className="fb-nav-tabs">
          <button className={activeTab === 'canvas' ? 'active' : ''} onClick={() => setActiveTab('canvas')}><FaMagic /> Builder</button>
          <button className={activeTab === 'preview' ? 'active' : ''} onClick={() => setActiveTab('preview')}><FaEye /> Preview</button>
          <button className={activeTab === 'json' ? 'active' : ''} onClick={() => setActiveTab('json')}><FaFileCode /> JSON</button>
          <button className="fb-tab-btn" onClick={() => navigate('/admin/forms')}><FaCog /> Settings</button>
        </div>

        <div className="fb-header-actions">
          {activeTab === 'json' && (
            <>
              <button className="fb-btn secondary" onClick={() => pdfInputRef.current?.click()} title="Convert PDF to JSON Form">
                <FaFilePdf /> PDF Import
              </button>
              <button className="fb-btn secondary" onClick={() => fileInputRef.current?.click()}>
                <FaFileUpload /> JSON Import
              </button>
              <button className="fb-btn secondary" onClick={() => {
                const data = JSON.stringify(currentForm, null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${(currentForm.title || 'form').replace(/\s+/g, '_').toLowerCase()}_schema.json`;
                link.click();
                URL.revokeObjectURL(url);
              }}>
                <FaFileDownload /> Export
              </button>
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".json" onChange={importJson} />
              <input type="file" ref={pdfInputRef} style={{ display: 'none' }} accept=".pdf" onChange={importPdf} />
            </>
          )}
          <button className="fb-btn secondary" onClick={() => navigate('/admin/forms')}>Discard</button>
          <button className="fb-btn primary" onClick={handleSave} disabled={loading}>
            <FaSave /> {currentForm.id ? 'Update Form' : 'Publish Form'}
          </button>
        </div>
      </header>

      <div className={`fb-workspace ${activeTab !== 'canvas' ? 'full-view' : ''}`}>
        {activeTab === 'canvas' && (
          <aside className="fb-library">
            <div className="lib-section">
              <div className="lib-head">Structure</div>
              <div className="lib-grid">
                <LibItem icon={FaHeading} label="Heading" onClick={() => addField('heading')} />
                <LibItem icon={FaParagraph} label="Text Block" onClick={() => addField('adminText')} />
                <LibItem icon={FaQuoteLeft} label="Inline Input" onClick={() => addField('inlineText')} />
                <LibItem icon={FaPlus} label="Divider" onClick={() => addField('divider')} />
              </div>
            </div>
            <div className="lib-section">
              <div className="lib-head">Essentials</div>
              <div className="lib-grid">
                <LibItem icon={FaKeyboard} label="Text" onClick={() => addField('text')} />
                <LibItem icon={FaParagraph} label="Long Text" onClick={() => addField('textarea')} />
                <LibItem icon={FaPlus} label="Number" onClick={() => addField('number')} />
                <LibItem icon={FaPlus} label="Date" onClick={() => addField('date')} />
              </div>
            </div>
            <div className="lib-section">
              <div className="lib-head">Selection</div>
              <div className="lib-grid">
                <LibItem icon={FaMousePointer} label="Dropdown" onClick={() => addField('select')} />
                <LibItem icon={FaCircle} label="Radio" onClick={() => addField('radio')} />
                <LibItem icon={FaCheck} label="Checkbox" onClick={() => addField('checkbox')} />
                <LibItem icon={FaListUl} label="Multi-Select" onClick={() => addField('multiselect')} />
              </div>
            </div>
            <div className="lib-section admin-lib">
              <div className="lib-head">Admin Inputs</div>
              <div className="lib-grid">
                <LibItem icon={FaUser} label="Admin Name" onClick={() => addField('text', 'admin')} />
                <LibItem icon={FaCalendarAlt} label="Admin Date" onClick={() => addField('date', 'admin')} />
                <LibItem icon={FaSignature} label="Admin Sig" onClick={() => addField('signature', 'admin')} />
              </div>
            </div>
            <div className="lib-section">
              <div className="lib-head">Advanced</div>
              <div className="lib-grid">
                <LibItem icon={FaSignature} label="Signature" onClick={() => addField('signature')} />
                <LibItem icon={FaStar} label="Rating" onClick={() => addField('rating')} />
                <LibItem icon={FaLocationArrow} label="Location" onClick={() => addField('location')} />
                <LibItem icon={FaFilePdf} label="PDF Import" onClick={() => pdfInputRef.current?.click()} />
              </div>
            </div>
          </aside>
        )}

        <main className={`fb-canvas ${activeTab !== 'canvas' ? 'full-view' : ''}`}>
          {activeTab === 'canvas' && (
            <div className="canvas-scroll">
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="form-fields">
                  {(provided, snapshot) => (
                    <div 
                      className={`field-list ${snapshot.isDraggingOver ? 'dragging-over' : ''}`} 
                      {...provided.droppableProps} 
                      ref={provided.innerRef}
                    >
                      {currentForm.fields.length === 0 ? (
                        <div className="canvas-empty">
                          <FaBolt />
                          <h3>Empty Canvas</h3>
                          <p>Select a component from the library to begin building.</p>
                        </div>
                      ) : (
                        <>
                          {currentForm.fields.map((field, idx) => (
                            <Draggable key={field.id} draggableId={field.id} index={idx}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={`draggable-wrapper ${snapshot.isDragging ? 'dragging' : ''}`}
                                >
                                  <div className="insert-gap">
                                    <button className="insert-btn" onClick={() => addField('text', 'student', idx)}>
                                      <FaPlus /> Insert Field
                                    </button>
                                  </div>
                                  <FieldCard 
                                    field={field} 
                                    allFields={currentForm.fields}
                                    active={selectedFieldId === field.id}
                                    onSelect={() => setSelectedField(field.id)}
                                    onUpdate={(u) => updateField(field.id, u)}
                                    onDuplicate={() => duplicateField(field.id)}
                                    dragHandleProps={provided.dragHandleProps}
                                    onDelete={() => {
                                      setCurrentForm(f => ({ ...f, fields: f.fields.filter(x => x.id !== field.id) }));
                                      if (selectedFieldId === field.id) setSelectedField(null);
                                    }}
                                  />
                                  {snapshot.isDragging && <div className="drag-placeholder-visual" />}
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </>
                      )}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
              {currentForm.fields.length > 0 && (
                <div className="insert-gap last">
                  <button className="insert-btn" onClick={() => addField('text')}>
                    <FaPlus /> Add at End
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="preview-container">
              <div className="preview-card">
                <header className="preview-head">
                  <div className="preview-head-left">
                    <h2>{currentForm.title || 'Untitled Form'}</h2>
                    <p>{currentForm.description}</p>
                  </div>
                  <div className="compact-switcher">
                    <button className={previewRole === 'student' ? 'active' : ''} onClick={() => setPreviewRole('student')} title="Student Perspective"><FaUser /></button>
                    <button className={previewRole === 'admin' ? 'active' : ''} onClick={() => setPreviewRole('admin')} title="Admin Perspective"><FaShieldAlt /></button>
                  </div>
                </header>
                <div className="preview-body">
                  {currentForm.fields.map(f => {
                    if (!evaluateLogic(f, previewData)) return null;
                    return (
                      <PreviewField 
                        key={f.id} 
                        field={f} 
                        value={previewData[f.name]} 
                        role={previewRole}
                        onChange={(val) => setPreviewData(p => ({ ...p, [f.name]: val }))} 
                      />
                    );
                  })}
                </div>
                <div className="preview-foot">
                  <button className="fb-btn primary" style={{ width: '100%' }}>{currentForm.settings?.submitButtonText || 'Submit Form'}</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'json' && (
            <div className="json-container">
              <div className="json-editor-wrap">
                <header className="json-editor-head">
                  <div className="json-title-group">
                    <FaCode />
                    <span>Schema Definition (JSON)</span>
                  </div>
                  <button className="copy-json-btn" onClick={copyJson}>
                    <FaClipboard /> Copy JSON
                  </button>
                </header>
                <div className="json-body-wrap">
                  <div className="json-line-numbers">
                    {JSON.stringify(currentForm, null, 2).split('\n').map((_, i) => <div key={i}>{i+1}</div>)}
                  </div>
                  <textarea 
                    className="json-textarea"
                    spellCheck="false"
                    value={JSON.stringify(currentForm, null, 2)}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        if (parsed.fields) {
                          parsed.fields = parsed.fields.map((f, i) => ({
                            ...f,
                            id: f.id || `field_json_${Date.now()}_${i}`,
                            recipientRole: f.recipientRole || 'student'
                          }));
                        }
                        setCurrentForm(parsed);
                      } catch (err) {}
                    }}
                  />
                </div>
                <footer className="json-editor-foot">
                  <FaBolt /> Any valid JSON structure changes will reflect instantly in the Visual Builder.
                </footer>
              </div>
            </div>
          )}
        </main>

        {activeTab === 'canvas' && (
          <aside className="fb-inspector">
            {selectedFieldId ? (
              <Inspector 
                allFields={currentForm.fields}
                field={currentForm.fields.find(x => x.id === selectedFieldId)} 
                onUpdate={(updates) => updateField(selectedFieldId, updates)}
              />
            ) : (
              <div className="inspector-empty">
                <FaCog />
                <p>Select a field to configure advanced properties.</p>
              </div>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}

function LibItem({ icon: Icon, label, onClick }) {
  return (
    <button className="lib-item" onClick={onClick}>
      <Icon />
      <span>{label}</span>
    </button>
  );
}

function FieldCard({ field, active, onSelect, onDelete, onDuplicate, onUpdate, allFields, dragHandleProps }) {
  const isLogicActive = field.logic && field.logic.conditions?.length > 0;

  const handleAddOption = (e) => {
    e.stopPropagation();
    const newOpts = [...(field.options || []), { label: 'New Option', value: `opt_${Date.now()}` }];
    onUpdate({ options: newOpts });
  };

  const handleUpdateOption = (idx, val) => {
    const newOpts = [...field.options];
    newOpts[idx] = { ...newOpts[idx], label: val, value: val.toLowerCase().replace(/\s+/g, '_') };
    onUpdate({ options: newOpts });
  };

  return (
    <div className={`field-card ${active ? 'active' : ''} ${isLogicActive ? 'is-conditional' : ''}`} onClick={onSelect}>
      {isLogicActive && <div className="logic-connector-line" />}
      
      <div className="field-drag-handle" {...dragHandleProps}><FaGripVertical /></div>
      
      <div className="field-content">
        <div className="field-top-row">
          <input 
            className="field-inline-label"
            value={field.label}
            onChange={e => onUpdate({ label: e.target.value })}
            onClick={e => e.stopPropagation()}
            placeholder="Field Label..."
          />
          <div className="field-quick-meta">
            <div className="type-switcher-wrap" onClick={e => e.stopPropagation()}>
              <select 
                className="type-compact-select"
                value={field.type}
                onChange={e => onUpdate({ type: e.target.value })}
              >
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <FaExchangeAlt className="switch-icon" />
              <span>{field.type}</span>
            </div>
            <span className="field-role-tag" style={{ color: field.recipientRole === 'admin' ? '#ef4444' : 'var(--text-muted)' }}>
              {(field.recipientRole || 'student').toUpperCase()}
            </span>
          </div>
        </div>

        {['select', 'radio', 'multiselect'].includes(field.type) && (
          <div className="field-inline-options">
            {field.options?.map((opt, i) => (
              <div key={i} className="inline-opt">
                <input 
                  value={opt.label} 
                  onChange={e => handleUpdateOption(i, e.target.value)}
                  onClick={e => e.stopPropagation()}
                />
                <button onClick={(e) => { e.stopPropagation(); onUpdate({ options: field.options.filter((_, idx) => idx !== i) }); }}><FaTimes /></button>
              </div>
            ))}
            <button className="add-opt-btn" onClick={handleAddOption}><FaPlus /> Option</button>
          </div>
        )}

        {field.type === 'inlineText' && (
          <div className="inline-text-summary">
            {field.parts?.map((p, i) => (
              <span key={i} className={`part-chip ${p.t}`}>
                {p.t === 'text' ? p.v : `[Input: ${p.placeholder || 'Blank'}]`}
              </span>
            ))}
          </div>
        )}

        {isLogicActive && (
          <div className="logic-summary">
            <FaFilter /> Shown if <strong>{field.logic.conditions.length} rule(s)</strong> met ({ (field.logic.operator || 'and').toUpperCase()})
          </div>
        )}
      </div>

      <div className="field-quick-actions">
        <button 
          className={`quick-btn req ${field.required ? 'active' : ''}`} 
          data-tooltip="Toggle Required"
          onClick={(e) => { e.stopPropagation(); onUpdate({ required: !field.required }); }}
        >
          <FaAsterisk />
        </button>
        <button className="quick-btn" data-tooltip="Duplicate" onClick={(e) => { e.stopPropagation(); onDuplicate(); }}><FaCopy /></button>
        <button className="quick-btn del" data-tooltip="Delete" onClick={(e) => { e.stopPropagation(); onDelete(); }}><FaTrash /></button>
      </div>
    </div>
  );
}

function Inspector({ field, onUpdate, allFields }) {
  if (!field) return null;

  const potentialParents = allFields.filter(f => 
    f.id !== field.id && ['select', 'radio', 'checkbox'].includes(f.type)
  );

  const handleAddCondition = () => {
    const newConditions = [...(field.logic?.conditions || []), { parentName: '', value: '' }];
    onUpdate({ logic: { ...field.logic, conditions: newConditions, operator: field.logic?.operator || 'and' } });
  };

  const handleUpdateCondition = (idx, updates) => {
    const newConditions = [...field.logic.conditions];
    newConditions[idx] = { ...newConditions[idx], ...updates };
    onUpdate({ logic: { ...field.logic, conditions: newConditions } });
  };

  const handleRemoveCondition = (idx) => {
    const newConditions = field.logic.conditions.filter((_, i) => i !== idx);
    onUpdate({ logic: { ...field.logic, conditions: newConditions } });
  };

  return (
    <div className="inspector-content">
      <div className="ins-head">Advanced Settings</div>
      <div className="ins-body">
        <div className="ins-group">
          <label>Variable Name</label>
          <input value={field.name} onChange={e => onUpdate({ name: e.target.value })} />
        </div>

        {field.type === 'inlineText' && (
          <div className="ins-group">
            <label>Inline Parts Editor</label>
            <div className="ins-parts-list">
              {field.parts?.map((p, i) => (
                <div key={i} className={`ins-part-item ${p.t}`}>
                  <div className="part-header">
                    <span>{p.t.toUpperCase()}</span>
                    <button onClick={() => onUpdate({ parts: field.parts.filter((_, idx) => idx !== i) })}><FaTimes /></button>
                  </div>
                  {p.t === 'text' ? (
                    <textarea 
                      value={p.v} 
                      onChange={e => {
                        const newParts = [...field.parts];
                        newParts[i].v = e.target.value;
                        onUpdate({ parts: newParts });
                      }}
                    />
                  ) : (
                    <div className="part-inputs">
                      <input placeholder="Name (key)" value={p.name} onChange={e => {
                        const newParts = [...field.parts];
                        newParts[i].name = e.target.value;
                        onUpdate({ parts: newParts });
                      }} />
                      <input placeholder="Placeholder" value={p.placeholder} onChange={e => {
                        const newParts = [...field.parts];
                        newParts[i].placeholder = e.target.value;
                        onUpdate({ parts: newParts });
                      }} />
                    </div>
                  )}
                </div>
              ))}
              <div className="parts-add-actions">
                <button onClick={() => onUpdate({ parts: [...field.parts, { t: 'text', v: 'New text' }] })}><FaPlus /> Text</button>
                <button onClick={() => onUpdate({ parts: [...field.parts, { t: 'input', inputType: 'text', name: 'input_' + Date.now(), placeholder: '...' }] })}><FaPlus /> Input</button>
              </div>
            </div>
          </div>
        )}

        <div className="ins-group">
          <label><FaFilter /> Visibility Logic</label>
          <div className="ins-logic-box multi">
            <div className="logic-config-header">
              <select 
                className="operator-select"
                value={field.logic?.operator || 'and'}
                onChange={e => onUpdate({ logic: { ...field.logic, operator: e.target.value } })}
              >
                <option value="and">All rules match (AND)</option>
                <option value="or">Any rule matches (OR)</option>
              </select>
            </div>
            <div className="conditions-list">
              {(field.logic?.conditions || []).map((c, i) => (
                <div key={i} className="condition-row">
                  <div className="cond-top">
                    <span>Rule {i + 1}</span>
                    <button className="cond-del" onClick={() => handleRemoveCondition(i)}><FaTimes /></button>
                  </div>
                  <select 
                    value={c.parentName}
                    onChange={e => handleUpdateCondition(i, { parentName: e.target.value })}
                  >
                    <option value="">Select Trigger...</option>
                    {potentialParents.map(p => <option key={p.id} value={p.name}>{p.label || p.name}</option>)}
                  </select>
                  <input 
                    placeholder="equals value..."
                    value={c.value}
                    onChange={e => handleUpdateCondition(i, { value: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <button className="add-cond-btn" onClick={handleAddCondition}>
              <FaPlus /> Add Condition
            </button>
          </div>
        </div>

        <div className="ins-divider" />

        {field.type === 'heading' && (
          <div className="ins-group">
            <label>Heading Level</label>
            <select value={field.level || 1} onChange={e => onUpdate({ level: parseInt(e.target.value) })} style={{ width: '100%', padding: '10px', borderRadius: '10px', background: 'var(--bg)' }}>
              <option value={1}>Heading 1</option>
              <option value={2}>Heading 2</option>
              <option value={3}>Heading 3</option>
            </select>
          </div>
        )}
        <div className="ins-group">
          <label>Recipient Role</label>
          <select 
            style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg)', fontWeight: 600, outline: 'none', color: 'var(--text)' }}
            value={field.recipientRole || 'student'} 
            onChange={e => onUpdate({ recipientRole: e.target.value })}
          >
            <option value="student">Student</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
    </div>
  );
}

const FB_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400..700&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');

  .fb-page { height: calc(100vh - 64px); display: flex; flex-direction: column; background: var(--bg); }
  .fb-header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 12px 32px; display: flex; align-items: center; justify-content: space-between; z-index: 10; }
  
  .fb-header-left { display: flex; align-items: center; gap: 20px; }
  .back-btn { width: 40px; height: 40px; border-radius: 12px; background: var(--bg); color: var(--text-muted); display: grid; place-items: center; transition: 0.2s; }
  .back-btn:hover { background: var(--border); color: var(--text); }
  
  .title-input { background: none; border: none; font-size: 20px; font-weight: 800; color: var(--text); outline: none; width: 300px; }
  .subtitle { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }

  .fb-nav-tabs { display: flex; background: var(--bg); padding: 4px; border-radius: 14px; gap: 4px; }
  .fb-nav-tabs button { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 10px; font-size: 13px; font-weight: 700; color: var(--text-muted); transition: 0.2s; border: none; background: transparent; cursor: pointer; }
  .fb-nav-tabs button.active { background: var(--surface); color: var(--primary); box-shadow: 0 2px 4px rgba(0,0,0,0.05); }

  .fb-header-actions { display: flex; gap: 12px; }
  .fb-btn { height: 40px; padding: 0 20px; border-radius: 10px; font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 8px; transition: 0.2s; border: none; cursor: pointer; }
  .fb-btn.primary { background: var(--primary); color: white; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2); }
  .fb-btn.secondary { background: var(--surface); border: 1px solid var(--border); color: var(--text-muted); }

  .fb-workspace { flex: 1; display: grid; grid-template-columns: 280px 1fr 340px; min-height: 0; }
  .fb-workspace.full-view { grid-template-columns: 1fr; }
  
  .fb-library { background: var(--surface); border-right: 1px solid var(--border); padding: 24px; overflow-y: auto; }
  .lib-section { margin-bottom: 24px; }
  .lib-head { font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
  .lib-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .lib-item { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; transition: 0.2s; cursor: pointer; color: var(--text); }
  .lib-item:hover { background: rgba(99, 102, 241, 0.05); border-color: var(--primary); color: var(--primary); }
  .lib-item svg { font-size: 18px; opacity: 0.7; }
  .lib-item span { font-size: 11px; font-weight: 700; }

  .admin-lib .lib-item { background: rgba(245, 158, 11, 0.05); border-color: rgba(245, 158, 11, 0.2); }
  .admin-lib .lib-item:hover { background: rgba(245, 158, 11, 0.1); border-color: #f59e0b; color: #f59e0b; }

  .fb-canvas { background: var(--bg); padding: 40px; overflow-y: auto; display: flex; justify-content: center; transition: 0.3s; }
  .fb-canvas.full-view { padding: 0; }
  .canvas-scroll { width: 100%; max-width: 700px; padding-bottom: 100px; position: relative; }
  .canvas-empty { height: 400px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); text-align: center; border: 2px dashed var(--border); border-radius: 24px; }
  .canvas-empty svg { font-size: 48px; margin-bottom: 16px; opacity: 0.3; }

  .dragging-over { background: rgba(79, 70, 229, 0.05); }
  .draggable-wrapper { position: relative; margin-bottom: 8px; }
  .draggable-wrapper.dragging { z-index: 100; pointer-events: none; }
  .draggable-wrapper.dragging .field-card { box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); transform: scale(1.03); border-color: var(--primary); background: var(--surface); }
  
  .field-list > div:not(.draggable-wrapper.dragging) + .draggable-wrapper.dragging::before {
    content: ''; position: absolute; top: -14px; left: 0; right: 0; height: 4px; background: var(--primary); border-radius: 4px; box-shadow: 0 0 10px rgba(79, 70, 229, 0.5); z-index: 10;
  }

  .insert-gap { height: 24px; display: flex; align-items: center; justify-content: center; opacity: 0; transition: 0.2s; position: relative; }
  .insert-gap:hover, .insert-gap.last { opacity: 1; }
  .insert-btn { padding: 4px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 20px; font-size: 10px; font-weight: 800; color: var(--text-muted); display: flex; align-items: center; gap: 6px; box-shadow: var(--shadow); z-index: 2; cursor: pointer; }
  .insert-btn:hover { border-color: var(--primary); color: var(--primary); transform: scale(1.05); }

  .field-list { display: flex; flex-direction: column; width: 100%; min-height: 100px; padding: 10px 0; }
  .field-card { background: var(--surface); border-radius: 16px; padding: 16px; display: flex; align-items: center; gap: 16px; border: 1px solid var(--border); transition: all 0.2s cubic-bezier(0.2, 0, 0, 1); cursor: pointer; position: relative; }
  .field-card:hover { border-color: var(--text-muted); }
  .field-card.active { border-color: var(--primary); border-width: 2px; box-shadow: var(--shadow-lg); z-index: 5; }
  
  .field-card.is-conditional { margin-left: 40px; border-left: 4px solid var(--primary); background: rgba(99, 102, 241, 0.02); }
  .logic-connector-line { position: absolute; left: -24px; top: -12px; bottom: 50%; width: 24px; border-left: 2px dashed var(--border); border-bottom: 2px dashed var(--border); border-bottom-left-radius: 12px; }

  .field-drag-handle { color: var(--text-muted); cursor: grab; padding: 8px; border-radius: 6px; display: flex; align-items: center; }
  .field-drag-handle:hover { background: var(--bg); color: var(--text); }
  .field-content { flex: 1; min-width: 0; }
  
  .field-top-row { display: flex; align-items: center; gap: 12px; }
  .field-inline-label { flex: 1; background: none; border: none; font-size: 14px; font-weight: 700; color: var(--text); outline: none; padding: 4px 0; border-bottom: 1px solid transparent; }
  .field-card.active .field-inline-label { border-bottom-color: var(--border); }
  .field-inline-label:focus { border-bottom-color: var(--primary) !important; }

  .field-quick-meta { display: flex; align-items: center; gap: 8px; }
  .type-switcher-wrap { display: flex; align-items: center; gap: 4px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 2px 8px; color: var(--primary); transition: 0.2s; position: relative; }
  .type-switcher-wrap:hover { border-color: var(--primary); background: var(--surface); }
  .type-compact-select { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
  .type-switcher-wrap span { font-size: 9px; font-weight: 800; text-transform: uppercase; }
  
  .field-role-tag { font-size: 9px; font-weight: 800; text-transform: uppercase; background: var(--bg); padding: 2px 8px; border-radius: 4px; border: 1px solid var(--border); white-space: nowrap; color: var(--text-muted); }
  
  .field-inline-options { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
  .inline-opt { display: flex; align-items: center; background: var(--bg); border-radius: 6px; padding: 2px 4px 2px 8px; border: 1px solid var(--border); }
  .inline-opt input { background: none; border: none; outline: none; font-size: 11px; font-weight: 700; color: var(--text); width: 80px; }
  .inline-opt button { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; font-size: 10px; display: flex; }
  .inline-opt button:hover { color: #ef4444; }
  .add-opt-btn { background: none; border: 1px dashed var(--text-muted); border-radius: 6px; color: var(--text-muted); font-size: 10px; font-weight: 700; padding: 4px 8px; cursor: pointer; display: flex; align-items: center; gap: 4px; }
  .add-opt-btn:hover { border-color: var(--primary); color: var(--primary); }

  .inline-text-summary { font-size: 12px; margin-top: 12px; line-height: 1.6; display: flex; flex-wrap: wrap; gap: 4px; color: var(--text-muted); }
  .part-chip { padding: 2px 6px; border-radius: 4px; font-weight: 600; }
  .part-chip.text { background: var(--bg); color: var(--text-muted); font-style: italic; }
  .part-chip.input { background: rgba(99, 102, 241, 0.1); color: var(--primary); border: 1px solid rgba(99, 102, 241, 0.2); }

  .logic-summary { font-size: 11px; color: var(--primary); margin-top: 8px; display: flex; align-items: center; gap: 6px; background: rgba(99, 102, 241, 0.1); padding: 4px 10px; border-radius: 6px; width: fit-content; }

  .field-quick-actions { display: flex; gap: 4px; opacity: 0.3; transition: 0.2s; }
  .field-card:hover .field-quick-actions, .field-card.active .field-quick-actions { opacity: 1; }
  
  .quick-btn { width: 32px; height: 32px; border-radius: 8px; color: var(--text-muted); display: grid; place-items: center; transition: 0.2s; background: none; border: none; cursor: pointer; font-size: 14px; position: relative; }
  .quick-btn:hover { background: var(--bg); color: var(--text); }
  .quick-btn.del:hover { background: #fff1f2; color: #ef4444; }
  :root[data-theme="dark"] .quick-btn.del:hover { background: #451a1a; }
  .quick-btn.req.active { color: #f59e0b; background: #fff7ed; }
  :root[data-theme="dark"] .quick-btn.req.active { background: #452a1a; }

  .fb-inspector { background: var(--surface); border-left: 1px solid var(--border); padding: 24px; overflow-y: auto; }
  .inspector-empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); text-align: center; opacity: 0.5; }
  .inspector-empty svg { font-size: 32px; margin-bottom: 12px; }

  .ins-head { font-size: 16px; font-weight: 800; color: var(--text); margin-bottom: 24px; }
  .ins-group { margin-bottom: 20px; }
  .ins-group label { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px; }
  .ins-group input, .ins-group select { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg); font-size: 14px; font-weight: 600; outline: none; color: var(--text); }
  .ins-group input:focus, .ins-group select:focus { border-color: var(--primary); background: var(--surface); }
  
  .ins-parts-list { display: flex; flex-direction: column; gap: 12px; background: var(--bg); padding: 12px; border-radius: 12px; border: 1px solid var(--border); }
  .ins-part-item { background: var(--surface); border: 1px solid var(--border); padding: 10px; border-radius: 8px; }
  .ins-part-item.input { border-left: 4px solid var(--primary); }
  .part-header { display: flex; justify-content: space-between; font-size: 9px; font-weight: 800; color: var(--text-muted); margin-bottom: 8px; }
  .part-header button { background: none; border: none; color: #ef4444; cursor: pointer; }
  .ins-part-item textarea { width: 100%; border: none; font-size: 12px; font-weight: 600; color: var(--text); outline: none; resize: none; background: transparent; min-height: 40px; }
  .part-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .part-inputs input { font-size: 11px !important; padding: 6px !important; }
  .parts-add-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
  .parts-add-actions button { padding: 8px; border: 1px dashed var(--text-muted); border-radius: 8px; background: var(--surface); font-size: 11px; font-weight: 700; color: var(--text-muted); cursor: pointer; }
  .parts-add-actions button:hover { border-color: var(--primary); color: var(--primary); }

  .ins-divider { height: 1px; background: var(--border); margin: 24px 0; }
  .ins-logic-box.multi { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
  .logic-config-header { margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 12px; }
  .conditions-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
  .condition-row { background: var(--surface); border: 1px solid var(--border); padding: 12px; border-radius: 10px; display: flex; flex-direction: column; gap: 8px; }
  .add-cond-btn { width: 100%; padding: 8px; border: 1px dashed var(--text-muted); border-radius: 8px; background: none; color: var(--text-muted); font-size: 11px; font-weight: 700; cursor: pointer; }

  .json-container { width: 100%; height: 100%; padding: 40px; display: flex; justify-content: center; }
  .json-editor-wrap { width: 100%; max-width: 1000px; height: 100%; display: flex; flex-direction: column; background: #1e1e2e; border-radius: 20px; border: 1px solid #313244; box-shadow: 0 30px 60px -12px rgba(0,0,0,0.4); overflow: hidden; }
  
  .json-editor-head { background: #181825; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #313244; }
  .json-title-group { display: flex; align-items: center; gap: 12px; color: #cdd6f4; font-weight: 700; font-size: 14px; }
  .json-title-group svg { color: #f5c2e7; }
  .copy-json-btn { background: #313244; border: 1px solid #45475a; color: #cdd6f4; padding: 6px 16px; border-radius: 8px; font-size: 12px; font-weight: 700; display: flex; align-items: center; gap: 8px; cursor: pointer; transition: 0.2s; }
  .copy-json-btn:hover { background: #45475a; color: #f5c2e7; }

  .json-body-wrap { flex: 1; display: flex; overflow: hidden; }
  .json-line-numbers { width: 40px; background: #181825; padding: 20px 0; display: flex; flex-direction: column; align-items: center; color: #585b70; font-family: 'JetBrains Mono', monospace; font-size: 12px; user-select: none; border-right: 1px solid #313244; }
  .json-line-numbers div { height: 20.8px; display: flex; align-items: center; }

  .json-textarea { flex: 1; font-family: 'JetBrains Mono', monospace; font-size: 13px; line-height: 1.6; padding: 20px; background: #1e1e2e; color: #89dceb; border: none; outline: none; resize: none; overflow-y: auto; }
  .json-textarea::selection { background: rgba(245, 194, 231, 0.2); }

  .json-editor-foot { background: #181825; padding: 12px 24px; color: #9399b2; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 10px; border-top: 1px solid #313244; }
  .json-editor-foot svg { color: #fab387; }

  .fb-loading { height: 100vh; display: grid; place-items: center; font-weight: 800; color: var(--text-muted); background: var(--bg); }

  .preview-container { width: 100%; height: 100%; padding: 48px 24px; overflow-y: auto; background: var(--bg); display: flex; justify-content: center; }
  .preview-card { width: 100%; max-width: 800px; background: var(--surface); border-radius: 24px; box-shadow: var(--shadow-lg); overflow: hidden; border: 1px solid var(--border); height: fit-content; margin-bottom: 40px; }
  .preview-head { background: #0f172a; color: white; padding: 32px 40px; display: flex; justify-content: space-between; align-items: center; }
  .preview-head-left h2 { margin: 0; font-size: 24px; font-weight: 800; }
  .preview-head-left p { margin: 8px 0 0; opacity: 0.7; font-size: 14px; }
  .compact-switcher { display: flex; background: rgba(255,255,255,0.1); padding: 4px; border-radius: 12px; gap: 4px; }
  .compact-switcher button { width: 36px; height: 36px; border-radius: 8px; display: grid; place-items: center; color: rgba(255,255,255,0.5); transition: 0.2s; background: none; border: none; cursor: pointer; }
  .compact-switcher button.active { background: #fff; color: #0f172a; }

  .preview-body { padding: 40px; display: flex; flex-direction: column; gap: 24px; }
  .preview-foot { padding: 24px 40px; border-top: 1px solid var(--border); background: var(--bg); }

  .preview-field-row { display: flex; flex-direction: column; gap: 8px; }
  .pv-label { font-size: 13px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
  .pv-input { padding: 12px 16px; border-radius: 12px; border: 2px solid var(--border); background: var(--bg); font-size: 15px; font-weight: 600; outline: none; transition: 0.2s; width: 100%; color: var(--text); }
  .pv-input:focus { border-color: var(--primary); background: var(--surface); }
  
  .pv-inline-text-wrap { line-height: 2; font-size: 15px; color: var(--text); }
  .pv-inline-field { display: inline-block; border: none; border-bottom: 2px solid var(--text-muted); background: transparent; padding: 0 8px; outline: none; font-weight: 700; color: var(--primary); transition: 0.2s; margin: 0 4px; }
  .pv-inline-field:focus { border-color: var(--primary); background: var(--bg); }

  .pv-radio-group, .pv-checkbox-group { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
  .pv-opt-label { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600; color: var(--text); cursor: pointer; }
  .pv-opt-label input { width: 18px; height: 18px; cursor: pointer; }
  
  .pv-rating { display: flex; gap: 8px; color: var(--text-muted); font-size: 24px; }
  .pv-rating svg { cursor: pointer; transition: 0.2s; }
  .pv-rating svg.active { color: #f59e0b; }

  .pv-heading { margin: 32px 0 8px; color: var(--text); border-bottom: 2px solid var(--border); padding-bottom: 8px; }
  .pv-text-block { background: var(--bg); padding: 20px; border-radius: 12px; border: 1px solid var(--border); color: var(--text-muted); line-height: 1.6; font-size: 14px; white-space: pre-wrap; }
  .pv-divider { border: none; border-top: 1px solid var(--border); margin: 32px 0; }

  .pv-sig-box { width: 100%; min-height: 120px; background: var(--bg); border: 2px dashed var(--border); border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); cursor: pointer; transition: 0.2s; overflow: hidden; padding: 20px; position: relative; }
  .pv-sig-box:hover { border-color: var(--primary); background: rgba(99, 102, 241, 0.05); color: var(--primary); }
  .pv-sig-box.filled { border-style: solid; background: var(--surface); border-color: #10b981; color: var(--text); }
  .pv-sig-display { font-family: 'Dancing Script', cursive; font-size: 42px; text-align: center; }
  .pv-sig-meta { font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); margin-top: 12px; letter-spacing: 1px; }

  .sig-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); z-index: 1000; display: grid; place-items: center; padding: 20px; }
  .sig-modal { background: var(--surface); border-radius: 24px; width: 100%; max-width: 500px; padding: 32px; box-shadow: var(--shadow-lg); border: 1px solid var(--border); }
  .sig-modal h3 { margin: 0 0 8px; font-size: 20px; font-weight: 800; color: var(--text); }
  .sig-modal p { margin: 0 0 24px; color: var(--text-muted); font-size: 14px; }
  .sig-input-wrap { margin-bottom: 24px; }
  .sig-input-wrap input { width: 100%; padding: 16px; border-radius: 12px; border: 2px solid var(--border); font-size: 18px; font-weight: 600; outline: none; transition: 0.2s; background: var(--bg); color: var(--text); }
  .sig-input-wrap input:focus { border-color: var(--primary); box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1); }
  .sig-preview-box { height: 140px; background: var(--bg); border-radius: 16px; border: 1px solid var(--border); display: grid; place-items: center; margin-bottom: 24px; }
  .sig-preview-text { font-family: 'Dancing Script', cursive; font-size: 48px; color: var(--primary); }
  .sig-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  .preview-field-row.disabled { opacity: 0.4; cursor: not-allowed; position: relative; }
  .preview-field-row.disabled::after { content: 'Locked: ' attr(data-recipient); position: absolute; right: 0; top: 0; font-size: 9px; font-weight: 800; text-transform: uppercase; background: var(--bg); padding: 2px 8px; border-radius: 4px; color: var(--text-muted); z-index: 10; border: 1px solid var(--border); }
  .preview-field-row.disabled * { pointer-events: none !important; }

  @media (max-width: 1024px) {
    .fb-workspace { grid-template-columns: 200px 1fr 280px; }
  }

  @media (max-width: 768px) {
    .fb-header { 
      flex-direction: column; 
      height: auto; 
      padding: 16px; 
      gap: 14px; 
      align-items: stretch; 
      position: sticky;
      top: 0;
      background: var(--surface);
      z-index: 100;
      box-shadow: var(--shadow);
    }
    .fb-header-left { gap: 10px; }
    .fb-nav-tabs { 
      order: 3; 
      width: 100%; 
      justify-content: space-between;
      background: var(--bg);
      padding: 4px;
      border-radius: 12px;
    }
    .fb-nav-tabs button { flex: 1; padding: 8px; font-size: 12px; border-radius: 10px; }
    .fb-header-actions { width: 100%; flex-wrap: wrap; gap: 8px; order: 2; }
    .fb-header-actions button { flex: 1; min-width: 120px; min-height: 44px; justify-content: center; }

    .fb-workspace:not(.full-view) { grid-template-columns: 1fr; }
    .fb-library { display: none; }
    .fb-inspector { display: none; }
    .fb-inspector.show { 
      display: block; 
      position: fixed; 
      inset: 0; 
      z-index: 1500; 
      background: var(--surface); 
      padding: 20px; 
      overflow-y: auto; 
    }
    .fb-page { height: auto; min-height: 100vh; }
    .fb-canvas { padding: 20px 14px; }

    /* Compact preview modal */
    .preview-pane { padding: 20px 16px; }
    .preview-field-row input,
    .preview-field-row select,
    .preview-field-row textarea { font-size: 16px; min-height: 48px; padding: 14px; border-radius: 12px; }
    .pv-label { font-size: 13px; margin-bottom: 6px; }

    .sig-modal { 
      padding: 24px 20px; 
      max-width: 100%; 
      border-radius: 0; 
      height: 100%;
      max-height: 100%; 
      display: flex;
      flex-direction: column;
    }
    .sig-actions { grid-template-columns: 1fr; gap: 10px; margin-top: auto; }
    .sig-actions button { min-height: 50px; }
  }

  @media (max-width: 480px) {
    .fb-canvas { padding: 16px 12px; }
    .fb-header h1, .fb-header-info h1 { font-size: 18px; }
  }
`;

function PreviewField({ field, value, onChange, role }) {
  const isReserved = field.recipientRole && field.recipientRole !== role;
  const [showSigModal, setShowSigModal] = useState(false);
  const [sigName, setSigName] = useState('');

  if (field.type === 'heading') {
    const Level = `h${field.level || 1}`;
    return <div className="preview-field-row"><Level className="pv-heading">{field.label}</Level></div>;
  }
  if (field.type === 'divider') {
    return <div className="preview-field-row"><hr className="pv-divider" /></div>;
  }
  if (field.type === 'adminText') {
    return <div className="preview-field-row"><div className="pv-text-block">{field.content}</div></div>;
  }

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
                  <div className="pv-sig-meta">Digitally Signed by {value} • {new Date().toLocaleDateString()}</div>
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
                    <input 
                      autoFocus
                      placeholder="Type your name..." 
                      value={sigName}
                      onChange={e => setSigName(e.target.value)}
                    />
                  </div>
                  <div className="sig-preview-box">
                    <div className="sig-preview-text">{sigName || 'Your Signature'}</div>
                  </div>
                  <div className="sig-actions">
                    <button className="fb-btn secondary" onClick={() => setShowSigModal(false)}>Cancel</button>
                    <button className="fb-btn primary" disabled={!sigName} onClick={() => {
                      onChange(sigName);
                      setShowSigModal(false);
                    }}>Adopt and Sign</button>
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
                {p.t === 'text' ? (
                  <span>{p.v}</span>
                ) : (
                  <input 
                    className="pv-inline-field"
                    placeholder={p.placeholder}
                    disabled={isReserved}
                    value={value?.[p.name] || ''}
                    onChange={e => onChange({ ...value, [p.name]: e.target.value })}
                    style={{ width: (p.placeholder?.length || 10) * 10 + 'px' }}
                  />
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
        const toggleOption = (val) => {
          const newSelected = selected.includes(val) 
            ? selected.filter(v => v !== val) 
            : [...selected, val];
          onChange(newSelected);
        };
        return (
          <div className="pv-checkbox-group">
            {field.options?.map(o => (
              <label key={o.value} className="pv-opt-label">
                <input type="checkbox" disabled={isReserved} checked={selected.includes(o.value)} onChange={() => toggleOption(o.value)} />
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
    <div 
      className={`preview-field-row ${field.width || 'full'} ${isReserved ? 'disabled' : ''}`}
      data-recipient={field.recipientRole || 'student'}
    >
      {field.type !== 'inlineText' && <label className="pv-label">{field.label}{field.required && ' *'}</label>}
      {renderInput()}
    </div>
  );
}
