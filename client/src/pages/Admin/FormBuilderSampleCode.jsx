// File: client/src/pages/AdminFormBuilder.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Copy,
  Save,
  Upload,
  Download,
  Eye,
  ChevronUp,
  ChevronDown,
  X,
  GripVertical,
  PanelsTopLeft,
  Settings,
  SlidersHorizontal,
  ListChecks,
  PanelLeftOpen,
  PanelRightOpen,
} from "lucide-react";

// --- Utilities ---
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const toKebab = (s = "") => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const download = (filename, text) => {
  const blob = new Blob([text], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// Default new field by type
const makeField = (type) => {
  const id = uid();
  const base = {
    id,
    type,
    label: type === "heading" ? "Section Heading" : `${type[0].toUpperCase()}${type.slice(1)} Field`,
    name: `${type}-${id.slice(0, 5)}`,
    required: false,
    helpText: "",
    placeholder: "",
    defaultValue: "",
    width: "full", // full, half, third
  };
  switch (type) {
    case "text":
    case "email":
    case "number":
    case "phone":
    case "date":
    case "time":
    case "textarea":
    case "file":
    case "toggle":
    case "checkbox":
      return base;
    case "select":
    case "radio-group":
    case "checkbox-group":
      return { ...base, options: [{ id: uid(), label: "Option 1", value: "option-1" }] };
    case "heading":
      return { id, type, text: "Section Title", level: 3 };
    case "divider":
      return { id, type };
    default:
      return base;
  }
};

const FIELD_TYPES = [
  { type: "heading", label: "Heading" },
  { type: "divider", label: "Divider" },
  { type: "text", label: "Text" },
  { type: "textarea", label: "Textarea" },
  { type: "number", label: "Number" },
  { type: "email", label: "Email" },
  { type: "phone", label: "Phone" },
  { type: "date", label: "Date" },
  { type: "time", label: "Time" },
  { type: "select", label: "Select" },
  { type: "radio-group", label: "Radio Group" },
  { type: "checkbox", label: "Checkbox" },
  { type: "checkbox-group", label: "Checkbox Group" },
  { type: "toggle", label: "Toggle" },
  { type: "file", label: "File Upload" },
];

const PANEL_CLASSES = "bg-white rounded-2xl shadow-sm border border-gray-200";
const BTN = "inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm";

function HeaderBar({ title, description, onPreview, onSave, onLoad, onExportJSON, onImportJSON, onGenerate, setTitle, setDescription }) {
  const fileInputRef = useRef(null);
  return (
    <div className="sticky top-0 z-30 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
        <PanelsTopLeft className="w-6 h-6" />
        <input
          className="text-lg md:text-xl font-semibold outline-none bg-transparent w-[22ch] md:w-[32ch]"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled Form"
        />
        <input
          className="text-gray-500 outline-none bg-transparent flex-1 min-w-[120px]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add a short description…"
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <button className={`${BTN} border-gray-300 hover:bg-gray-50`} onClick={onPreview}><Eye className="w-4 h-4"/>Preview</button>
          <button className={`${BTN} border-gray-300 hover:bg-gray-50`} onClick={onSave}><Save className="w-4 h-4"/>Save</button>
          <button className={`${BTN} border-gray-300 hover:bg-gray-50`} onClick={onLoad}><Upload className="w-4 h-4"/>Load</button>
          <button className={`${BTN} border-gray-300 hover:bg-gray-50`} onClick={onExportJSON}><Download className="w-4 h-4"/>Export JSON</button>
          <>
            <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={(e) => onImportJSON(e.target.files?.[0] || null)} />
            <button className={`${BTN} border-gray-300 hover:bg-gray-50`} onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4"/>Import JSON</button>
          </>
          <button className={`${BTN} border-gray-300 hover:bg-gray-50`} onClick={onGenerate}><SlidersHorizontal className="w-4 h-4"/>Generate Component</button>
        </div>
      </div>
    </div>
  );
}

function Toolbox({ onAdd, collapsed, setCollapsed }) {
  return (
    <div className={`${PANEL_CLASSES} p-3 h-full flex flex-col`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2"><ListChecks className="w-5 h-5"/>Fields</h3>
        <button onClick={() => setCollapsed(!collapsed)} className="p-1 rounded-lg border hover:bg-gray-50">
          {collapsed ? <PanelRightOpen className="w-4 h-4"/> : <PanelLeftOpen className="w-4 h-4"/>}
        </button>
      </div>
      {!collapsed && (
        <div className="mt-3 grid grid-cols-2 gap-2 overflow-auto">
          {FIELD_TYPES.map((f) => (
            <button
              key={f.type}
              className="text-left text-sm border rounded-xl px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", f.type)}
              onClick={() => onAdd(f.type)}
            >
              <Plus className="w-4 h-4"/>
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CanvasField({ field, index, isSelected, onSelect, onDelete, onDuplicate, onMoveUp, onMoveDown, dragProps }) {
  return (
    <div
      className={`group border rounded-xl p-3 bg-white hover:shadow-sm ${isSelected ? "ring-2 ring-indigo-500" : ""}`}
      onClick={(e) => { e.stopPropagation(); onSelect(index); }}
      draggable
      onDragStart={(e) => dragProps.onDragStart(e, index)}
      onDragOver={(e) => dragProps.onDragOver(e, index)}
      onDrop={(e) => dragProps.onDrop(e, index)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-500">
          <GripVertical className="w-4 h-4 opacity-60"/>
          <span className="text-xs uppercase tracking-wide">{field.type}</span>
        </div>
        <div className="hidden group-hover:flex items-center gap-1">
          <button title="Move up" className="p-1 border rounded-lg hover:bg-gray-50" onClick={(e)=>{e.stopPropagation(); onMoveUp(index);}}><ChevronUp className="w-4 h-4"/></button>
          <button title="Move down" className="p-1 border rounded-lg hover:bg-gray-50" onClick={(e)=>{e.stopPropagation(); onMoveDown(index);}}><ChevronDown className="w-4 h-4"/></button>
          <button title="Duplicate" className="p-1 border rounded-lg hover:bg-gray-50" onClick={(e)=>{e.stopPropagation(); onDuplicate(index);}}><Copy className="w-4 h-4"/></button>
          <button title="Delete" className="p-1 border rounded-lg hover:bg-red-50" onClick={(e)=>{e.stopPropagation(); onDelete(index);}}><Trash2 className="w-4 h-4 text-red-600"/></button>
        </div>
      </div>
      <div className="mt-2">
        {renderFieldPreview(field)}
      </div>
      {field.helpText ? (<p className="text-xs text-gray-500 mt-1">{field.helpText}</p>) : null}
    </div>
  );
}

function renderFieldPreview(field) {
  const base = (node) => (
    <div className={field.width === "full" ? "" : field.width === "half" ? "max-w-[480px]" : "max-w-[320px]"}>
      {node}
    </div>
  );
  switch (field.type) {
    case "heading": {
      const Tag = `h${field.level || 3}`;
      return base(<Tag className="text-lg font-semibold">{field.text || "Section Title"}</Tag>);
    }
    case "divider":
      return base(<hr className="border-t"/>);
    case "textarea":
      return base(
        <label className="block">
          <span className="text-sm font-medium">{field.label}</span>
          <textarea className="mt-1 w-full border rounded-xl p-2" placeholder={field.placeholder || ""} defaultValue={field.defaultValue || ""} />
        </label>
      );
    case "select":
      return base(
        <label className="block">
          <span className="text-sm font-medium">{field.label}</span>
          <select className="mt-1 w-full border rounded-xl p-2">
            {(field.options || []).map((o) => (
              <option key={o.id} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      );
    case "radio-group":
      return base(
        <fieldset>
          <legend className="text-sm font-medium">{field.label}</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {(field.options || []).map((o) => (
              <label key={o.id} className="inline-flex items-center gap-2">
                <input type="radio" name={field.name} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    case "checkbox-group":
      return base(
        <fieldset>
          <legend className="text-sm font-medium">{field.label}</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {(field.options || []).map((o) => (
              <label key={o.id} className="inline-flex items-center gap-2">
                <input type="checkbox" value={o.value} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    case "toggle":
      return base(
        <label className="flex items-center gap-3">
          <input type="checkbox" className="peer hidden" />
          <span className="w-10 h-6 rounded-full bg-gray-300 relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:transition peer-checked:bg-indigo-600 peer-checked:after:translate-x-4"/>
          <span className="text-sm">{field.label}</span>
        </label>
      );
    case "file":
      return base(
        <label className="block">
          <span className="text-sm font-medium">{field.label}</span>
          <input type="file" className="mt-1 w-full border rounded-xl p-2" />
        </label>
      );
    case "checkbox":
      return base(
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" />
          <span className="text-sm">{field.label}</span>
        </label>
      );
    default: {
      const type = field.type === "phone" ? "tel" : field.type;
      return base(
        <label className="block">
          <span className="text-sm font-medium">{field.label}</span>
          <input type={type} className="mt-1 w-full border rounded-xl p-2" placeholder={field.placeholder || ""} defaultValue={field.defaultValue || ""} />
        </label>
      );
    }
  }
}

function PropertiesPanel({ field, onChange }) {
  if (!field) {
    return (
      <div className={`${PANEL_CLASSES} p-4 h-full`}>
        <div className="text-gray-500 flex items-center gap-2"><Settings className="w-5 h-5"/>Select a field to edit its properties</div>
      </div>
    );
  }

  const set = (k, v) => onChange({ ...field, [k]: v });

  const widthOptions = [
    { v: "full", label: "Full" },
    { v: "half", label: "Half" },
    { v: "third", label: "Third" },
  ];

  return (
    <div className={`${PANEL_CLASSES} p-4 h-full overflow-auto`}>
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <SlidersHorizontal className="w-4 h-4"/>
        <span>Field Settings</span>
      </div>

      {/* Generic */}
      {field.type !== "heading" && field.type !== "divider" && (
        <>
          <label className="block mt-3 text-sm">Label<input className="mt-1 w-full border rounded-xl p-2" value={field.label || ""} onChange={(e)=>set("label", e.target.value)} /></label>
          <label className="block mt-3 text-sm">Name<input className="mt-1 w-full border rounded-xl p-2" value={field.name || ""} onChange={(e)=>set("name", toKebab(e.target.value))} /></label>
          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            {widthOptions.map((o)=> (
              <button key={o.v} className={`border rounded-xl px-2 py-1 ${field.width===o.v?"bg-indigo-600 text-white border-indigo-600":"hover:bg-gray-50"}`} onClick={()=>set("width", o.v)}>{o.label}</button>
            ))}
          </div>
          <label className="block mt-3 text-sm">Placeholder<input className="mt-1 w-full border rounded-xl p-2" value={field.placeholder || ""} onChange={(e)=>set("placeholder", e.target.value)} /></label>
          <label className="block mt-3 text-sm">Default Value<input className="mt-1 w-full border rounded-xl p-2" value={field.defaultValue || ""} onChange={(e)=>set("defaultValue", e.target.value)} /></label>
          <label className="block mt-3 text-sm">Help Text<input className="mt-1 w-full border rounded-xl p-2" value={field.helpText || ""} onChange={(e)=>set("helpText", e.target.value)} /></label>
          <label className="inline-flex items-center gap-2 mt-3 text-sm"><input type="checkbox" checked={!!field.required} onChange={(e)=>set("required", e.target.checked)} /> Required</label>
        </>
      )}

      {/* Type-specific */}
      {field.type === "number" && (
        <div className="grid grid-cols-3 gap-2 mt-3 text-sm">
          <label className="block">Min<input className="mt-1 w-full border rounded-xl p-2" type="number" value={field.min ?? ""} onChange={(e)=>set("min", e.target.value)} /></label>
          <label className="block">Max<input className="mt-1 w-full border rounded-xl p-2" type="number" value={field.max ?? ""} onChange={(e)=>set("max", e.target.value)} /></label>
          <label className="block">Step<input className="mt-1 w-full border rounded-xl p-2" type="number" value={field.step ?? ""} onChange={(e)=>set("step", e.target.value)} /></label>
        </div>
      )}

      {field.type === "heading" && (
        <div className="mt-3">
          <label className="block text-sm">Text<input className="mt-1 w-full border rounded-xl p-2" value={field.text || ""} onChange={(e)=>set("text", e.target.value)} /></label>
          <label className="block mt-3 text-sm">Level<select className="mt-1 w-full border rounded-xl p-2" value={field.level || 3} onChange={(e)=>set("level", Number(e.target.value))}><option value={1}>H1</option><option value={2}>H2</option><option value={3}>H3</option><option value={4}>H4</option><option value={5}>H5</option></select></label>
        </div>
      )}

      {["select","radio-group","checkbox-group"].includes(field.type) && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Options</span>
            <button className="text-sm border rounded-xl px-2 py-1 hover:bg-gray-50" onClick={()=> set("options", [...(field.options||[]), { id: uid(), label: `Option ${(field.options?.length||0)+1}`, value: `option-${(field.options?.length||0)+1}` }])}><Plus className="w-4 h-4"/></button>
          </div>
          <div className="mt-2 space-y-2">
            {(field.options||[]).map((o, i) => (
              <div key={o.id} className="flex items-center gap-2">
                <input className="border rounded-xl p-2 flex-1" value={o.label} onChange={(e)=>{
                  const opts = [...field.options];
                  opts[i] = { ...o, label: e.target.value };
                  set("options", opts);
                }} />
                <input className="border rounded-xl p-2 w-[40%]" value={o.value} onChange={(e)=>{
                  const opts = [...field.options];
                  opts[i] = { ...o, value: toKebab(e.target.value) };
                  set("options", opts);
                }} />
                <button className="p-2 border rounded-xl hover:bg-red-50" onClick={()=>{
                  const opts = (field.options||[]).filter((x)=>x.id!==o.id);
                  set("options", opts);
                }}><Trash2 className="w-4 h-4 text-red-600"/></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {field.type === "textarea" && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <label className="block">Rows<input type="number" className="mt-1 w-full border rounded-xl p-2" value={field.rows || 4} onChange={(e)=>set("rows", Number(e.target.value)||4)} /></label>
        </div>
      )}
    </div>
  );
}

function PreviewModal({ open, onClose, schema }) {
  const formRef = useRef(null);

  const onSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(formRef.current);
    const out = {};
    schema.fields.forEach((f) => {
      if (f.type === "checkbox-group") {
        out[f.name] = fd.getAll(f.name);
      } else if (f.type === "checkbox") {
        out[f.name] = fd.get(f.name) === "on";
      } else if (f.type === "file") {
        out[f.name] = (fd.get(f.name)?.name) || null;
      } else {
        out[f.name] = fd.get(f.name);
      }
    });
    alert("Submitted data as JSON:\n\n" + JSON.stringify(out, null, 2));
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl" onMouseDown={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <div className="font-semibold">Preview: {schema.title || "Untitled Form"}</div>
          <button className="p-2 border rounded-xl hover:bg-gray-50" onClick={onClose}><X className="w-4 h-4"/></button>
        </div>
        <div className="p-4">
          {schema.description && (<p className="text-gray-600 mb-3">{schema.description}</p>)}
          <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
            <FormRenderer schema={schema} />
            <div className="pt-2">
              <button className="px-4 py-2 rounded-xl bg-indigo-600 text-white">Submit</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function FormRenderer({ schema }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {schema.fields.map((f) => (
        <div key={f.id} className={f.width === "full" ? "md:col-span-2" : f.width === "half" ? "md:col-span-1" : "md:col-span-1 max-w-sm"}>
          {renderLiveField(f)}
        </div>
      ))}
    </div>
  );
}

function renderLiveField(field) {
  if (field.type === "heading") {
    const Tag = `h${field.level || 3}`;
    return <Tag className="text-lg font-semibold">{field.text || "Section Title"}</Tag>;
  }
  if (field.type === "divider") return <hr className="border-t"/>;

  if (field.type === "textarea") {
    return (
      <label className="block">
        <span className="text-sm font-medium">{field.label}</span>
        <textarea name={field.name} required={!!field.required} placeholder={field.placeholder || ""} defaultValue={field.defaultValue || ""} rows={field.rows || 4} className="mt-1 w-full border rounded-xl p-2" />
        {field.helpText && <span className="text-xs text-gray-500">{field.helpText}</span>}
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="block">
        <span className="text-sm font-medium">{field.label}</span>
        <select name={field.name} required={!!field.required} defaultValue={field.defaultValue || ""} className="mt-1 w-full border rounded-xl p-2">
          {(field.options || []).map((o) => <option key={o.id} value={o.value}>{o.label}</option>)}
        </select>
        {field.helpText && <span className="text-xs text-gray-500">{field.helpText}</span>}
      </label>
    );
  }

  if (field.type === "radio-group") {
    return (
      <fieldset>
        <legend className="text-sm font-medium">{field.label}</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {(field.options || []).map((o) => (
            <label key={o.id} className="inline-flex items-center gap-2">
              <input type="radio" name={field.name} value={o.value} required={!!field.required} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        {field.helpText && <span className="text-xs text-gray-500">{field.helpText}</span>}
      </fieldset>
    );
  }

  if (field.type === "checkbox-group") {
    return (
      <fieldset>
        <legend className="text-sm font-medium">{field.label}</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {(field.options || []).map((o) => (
            <label key={o.id} className="inline-flex items-center gap-2">
              <input type="checkbox" name={field.name} value={o.value} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        {field.helpText && <span className="text-xs text-gray-500">{field.helpText}</span>}
      </fieldset>
    );
  }

  if (field.type === "toggle") {
    return (
      <label className="flex items-center gap-3">
        <input type="checkbox" name={field.name} className="peer hidden" defaultChecked={!!field.defaultValue} />
        <span className="w-10 h-6 rounded-full bg-gray-300 relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:transition peer-checked:bg-indigo-600 peer-checked:after:translate-x-4"/>
        <span className="text-sm">{field.label}</span>
      </label>
    );
  }

  if (field.type === "file") {
    return (
      <label className="block">
        <span className="text-sm font-medium">{field.label}</span>
        <input type="file" name={field.name} required={!!field.required} className="mt-1 w-full border rounded-xl p-2" />
        {field.helpText && <span className="text-xs text-gray-500">{field.helpText}</span>}
      </label>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="inline-flex items-center gap-2">
        <input type="checkbox" name={field.name} defaultChecked={!!field.defaultValue} />
        <span className="text-sm">{field.label}</span>
      </label>
    );
  }

  const inputType = field.type === "phone" ? "tel" : field.type;
  return (
    <label className="block">
      <span className="text-sm font-medium">{field.label}</span>
      <input
        type={inputType}
        name={field.name}
        required={!!field.required}
        placeholder={field.placeholder || ""}
        defaultValue={field.defaultValue || ""}
        min={field.min}
        max={field.max}
        step={field.step}
        className="mt-1 w-full border rounded-xl p-2"
      />
      {field.helpText && <span className="text-xs text-gray-500">{field.helpText}</span>}
    </label>
  );
}

export default function AdminFormBuilder() {
  const [fields, setFields] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  // Drag & drop reordering within canvas
  const dragIndexRef = useRef(null);
  const onDragStart = (e, i) => { dragIndexRef.current = i; e.dataTransfer.effectAllowed = "move"; };
  const onDragOver = (e, overIndex) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const onDrop = (e, dropIndex) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from === dropIndex) return;
    setFields((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(dropIndex, 0, moved);
      return next;
    });
    dragIndexRef.current = null;
  };

  const dragProps = { onDragStart, onDragOver, onDrop };

  const addField = (type) => {
    const nf = makeField(type);
    setFields((arr) => [...arr, nf]);
    setSelectedIndex(fields.length);
  };

  const deleteField = (i) => {
    setFields((arr) => arr.filter((_, idx) => idx !== i));
    if (selectedIndex === i) setSelectedIndex(-1);
  };

  const duplicateField = (i) => {
    setFields((arr) => {
      const copy = JSON.parse(JSON.stringify(arr[i]));
      copy.id = uid();
      copy.name = `${copy.type}-${copy.id.slice(0, 5)}`;
      return [...arr.slice(0, i + 1), copy, ...arr.slice(i + 1)];
    });
  };

  const moveUp = (i) => i > 0 && setFields((arr) => { const next = [...arr]; [next[i-1], next[i]] = [next[i], next[i-1]]; return next; });
  const moveDown = (i) => i < fields.length - 1 && setFields((arr) => { const next = [...arr]; [next[i+1], next[i]] = [next[i], next[i+1]]; return next; });

  const updateSelected = (f) => setFields((arr) => arr.map((x, i) => (i === selectedIndex ? f : x)));

  const schema = useMemo(() => ({
    version: 1,
    title: title.trim(),
    description: description.trim(),
    fields,
  }), [title, description, fields]);

  // Persistence
  const STORAGE_KEY = "admin-form-builder-schema";
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(schema));
  const load = () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return alert("Nothing saved yet.");
    try {
      const s = JSON.parse(raw);
      setTitle(s.title || "");
      setDescription(s.description || "");
      setFields(Array.isArray(s.fields) ? s.fields : []);
      setSelectedIndex(-1);
    } catch (e) {
      alert("Failed to load saved schema.");
    }
  };

  const exportJSON = () => download(`${toKebab(title||"untitled-form")}-schema.json`, JSON.stringify(schema, null, 2));
  const importJSON = async (file) => {
    if (!file) return;
    const text = await file.text();
    try {
      const s = JSON.parse(text);
      setTitle(s.title || "");
      setDescription(s.description || "");
      setFields(Array.isArray(s.fields) ? s.fields : []);
      setSelectedIndex(-1);
    } catch (e) {
      alert("Invalid JSON file.");
    }
  };

  const generateComponent = () => {
    const componentName = (title && title.match(/[A-Za-z0-9]+/g)?.join("")) || "GeneratedForm";
    const fileName = `${componentName}.jsx`;
    const code = `// Auto-generated from AdminFormBuilder schema\nimport React, { useRef } from 'react';\n\nconst schema = ${JSON.stringify(schema, null, 2)};\n\nfunction Field({ f }) {\n  if (f.type === 'heading') {\n    const Tag = 'h' + (f.level || 3);\n    return React.createElement(Tag, { className: 'text-lg font-semibold' }, f.text || 'Section Title');\n  }\n  if (f.type === 'divider') return <hr className=\"border-t\"/>;\n  if (f.type === 'textarea') {\n    return (<label className=\"block\"><span className=\"text-sm font-medium\">{f.label}</span><textarea name={f.name} required={!!f.required} placeholder={f.placeholder||''} defaultValue={f.defaultValue||''} rows={f.rows||4} className=\"mt-1 w-full border rounded-xl p-2\" /></label>);\n  }\n  if (f.type === 'select') {\n    return (<label className=\"block\"><span className=\"text-sm font-medium\">{f.label}</span><select name={f.name} required={!!f.required} defaultValue={f.defaultValue||''} className=\"mt-1 w-full border rounded-xl p-2\">{(f.options||[]).map(o => <option key={o.id} value={o.value}>{o.label}</option>)}</select></label>);\n  }\n  if (f.type === 'radio-group') {\n    return (<fieldset><legend className=\"text-sm font-medium\">{f.label}</legend><div className=\"mt-1 flex flex-wrap gap-3\">{(f.options||[]).map(o => (<label key={o.id} className=\"inline-flex items-center gap-2\"><input type=\"radio\" name={f.name} value={o.value} required={!!f.required} /><span>{o.label}</span></label>))}</div></fieldset>);\n  }\n  if (f.type === 'checkbox-group') {\n    return (<fieldset><legend className=\"text-sm font-medium\">{f.label}</legend><div className=\"mt-1 flex flex-wrap gap-3\">{(f.options||[]).map(o => (<label key={o.id} className=\"inline-flex items-center gap-2\"><input type=\"checkbox\" name={f.name} value={o.value} /><span>{o.label}</span></label>))}</div></fieldset>);\n  }\n  if (f.type === 'toggle') {\n    return (<label className=\"flex items-center gap-3\"><input type=\"checkbox\" name={f.name} className=\"peer hidden\" defaultChecked={!!f.defaultValue} /><span className=\"w-10 h-6 rounded-full bg-gray-300 relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:transition peer-checked:bg-indigo-600 peer-checked:after:translate-x-4\"/><span className=\"text-sm\">{f.label}</span></label>);\n  }\n  if (f.type === 'file') {\n    return (<label className=\"block\"><span className=\"text-sm font-medium\">{f.label}</span><input type=\"file\" name={f.name} required={!!f.required} className=\"mt-1 w-full border rounded-xl p-2\" /></label>);\n  }\n  if (f.type === 'checkbox') {\n    return (<label className=\"inline-flex items-center gap-2\"><input type=\"checkbox\" name={f.name} defaultChecked={!!f.defaultValue} /><span className=\"text-sm\">{f.label}</span></label>);\n  }\n  const inputType = f.type === 'phone' ? 'tel' : f.type;\n  return (<label className=\"block\"><span className=\"text-sm font-medium\">{f.label}</span><input type={inputType} name={f.name} required={!!f.required} placeholder={f.placeholder||''} defaultValue={f.defaultValue||''} min={f.min} max={f.max} step={f.step} className=\"mt-1 w-full border rounded-xl p-2\" /></label>);\n}\n\nexport default function ${componentName}() {\n  const formRef = useRef(null);\n  const submit = (e) => {\n    e.preventDefault();\n    const fd = new FormData(formRef.current);\n    const out = {};\n    schema.fields.forEach((f)=>{\n      if (f.type === 'checkbox-group') out[f.name] = fd.getAll(f.name);\n      else if (f.type === 'checkbox') out[f.name] = fd.get(f.name) === 'on';\n      else if (f.type === 'file') out[f.name] = (fd.get(f.name)?.name)||null;\n      else out[f.name] = fd.get(f.name);\n    });\n    alert(JSON.stringify(out, null, 2));\n  };\n  return (<div className=\"max-w-3xl mx-auto p-4\"><h1 className=\"text-2xl font-bold\">{schema.title || 'Untitled Form'}</h1>{schema.description && (<p className=\"text-gray-600\">{schema.description}</p>)}<form ref={formRef} onSubmit={submit} className=\"mt-4 grid grid-cols-1 md:grid-cols-2 gap-4\">{schema.fields.map(f => (<div key={f.id} className={f.width==='full'?'md:col-span-2':(f.width==='half'?'md:col-span-1':'md:col-span-1 max-w-sm')}> <Field f={f}/> </div>))}<div className=\"md:col-span-2\"><button className=\"px-4 py-2 rounded-xl bg-indigo-600 text-white\">Submit</button></div></form></div>);\n}\n`;
    download(fileName, code);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <HeaderBar
        title={title}
        description={description}
        setTitle={setTitle}
        setDescription={setDescription}
        onPreview={() => setPreviewOpen(true)}
        onSave={save}
        onLoad={load}
        onExportJSON={exportJSON}
        onImportJSON={importJSON}
        onGenerate={generateComponent}
      />

      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-12 gap-4">
        {/* Toolbox */}
        <div className="col-span-12 md:col-span-3 lg:col-span-3 h-[70vh] md:h-[78vh]">
          <Toolbox onAdd={addField} collapsed={leftCollapsed} setCollapsed={setLeftCollapsed} />
        </div>

        {/* Canvas */}
        <div className={`col-span-12 ${leftCollapsed ? 'md:col-span-6 lg:col-span-7' : 'md:col-span-6 lg:col-span-6'}`}>
          <div className={`${PANEL_CLASSES} p-4 h-[70vh] md:h-[78vh] overflow-auto`} onClick={()=>setSelectedIndex(-1)} onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>{
            const type = e.dataTransfer.getData('text/plain');
            if (FIELD_TYPES.find(t=>t.type===type)) addField(type);
          }}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><Settings className="w-5 h-5"/>Form Canvas</h3>
              <div className="text-sm text-gray-500">Drag fields here, click a field to edit</div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              {fields.length === 0 && (
                <div className="border-2 border-dashed rounded-2xl p-8 text-center text-gray-500">
                  Drag items from the left or click to add fields.
                </div>
              )}

              {fields.map((f, i) => (
                <CanvasField
                  key={f.id}
                  field={f}
                  index={i}
                  isSelected={i===selectedIndex}
                  onSelect={setSelectedIndex}
                  onDelete={deleteField}
                  onDuplicate={duplicateField}
                  onMoveUp={moveUp}
                  onMoveDown={moveDown}
                  dragProps={dragProps}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Properties */}
        <div className="col-span-12 md:col-span-3 lg:col-span-3 h-[70vh] md:h-[78vh]">
          <PropertiesPanel field={fields[selectedIndex]} onChange={updateSelected} />
        </div>
      </div>

      <PreviewModal open={previewOpen} onClose={()=>setPreviewOpen(false)} schema={schema} />
    </div>
  );
}
