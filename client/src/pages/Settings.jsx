// src/pages/Settings.jsx
import React from "react";
import { useApp } from "../context/AppContext";
import {
  FaUserCircle, FaTags, FaListOl, FaUsers, FaIdBadge, FaBed,
  FaPlus, FaTrash, FaSave, FaPen, FaCheck, FaTimes
} from "react-icons/fa";

/* ---------------- helpers ---------------- */
const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

/** Accepts strings or {id,name}; returns [{id,name}] with optional defaults when empty */
function toObjList(src, defaults = []) {
  let arr = Array.isArray(src) ? src : [];
  if (!arr.length && defaults.length) arr = defaults;
  return arr
    .map((x) =>
      typeof x === "string" ? { id: uid(), name: x } : { id: x.id || uid(), name: (x.name ?? "") }
    )
    .filter((x) => x.name.trim() !== "");
}

/** Trim + dedupe by name (case-insensitive) */
function normalizeForSave(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const n = (it.name || "").trim();
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: it.id || uid(), name: n });
  }
  return out;
}

/* ---------------- reusable list editor ---------------- */
function ListEditor({ title, icon: Icon, items, setItems, placeholder }) {
  const [newName, setNewName] = React.useState("");
  const [editingId, setEditingId] = React.useState(null);
  const [editVal, setEditVal] = React.useState("");

  const add = () => {
    const n = newName.trim();
    if (!n) return;
    setItems((list) => [...list, { id: uid(), name: n }]);
    setNewName("");
  };

  const beginEdit = (id, cur) => {
    setEditingId(id);
    setEditVal(cur);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditVal("");
  };
  const saveEdit = () => {
    const v = editVal.trim();
    if (!v) return;
    setItems((list) => list.map((it) => (it.id === editingId ? { ...it, name: v } : it)));
    cancelEdit();
  };

  const remove = (id) => setItems((list) => list.filter((it) => it.id !== id));

  return (
    <div className="card set-card">
      <div className="set-card-head">
        <div className="set-card-title">
          <span className="set-ico">{Icon ? <Icon size={16} /> : null}</span>
          <strong>{title}</strong>
          <span className="count">{items.length}</span>
        </div>

        {/* keep input + Add always inline */}
        <div className="set-card-add">
 <input
   className="btn"
  placeholder={placeholder}
   value={newName}
   onChange={(e) => setNewName(e.target.value)}
   onKeyDown={(e) => e.key === "Enter" && add()}
   style={{ height: 34 }}
/>
          <button className="btn primary" onClick={add} title="Add" style={{ height: 34 }}>
            <FaPlus /> <span className="hide-sm">Add</span>
          </button>
        </div>
      </div>

      {!items.length && <div className="hint">No items yet. Add your first above.</div>}

      {!!items.length && (
        <ul className="set-list">
          {items.map((it) => {
            const isEditing = editingId === it.id;
            return (
              <li key={it.id} className="set-row">
                {isEditing ? (
                  <>
                    <input
                      className="btn set-input"
                      value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                      autoFocus
                    />
                    <button className="icon-btn" onClick={saveEdit} title="Save">
                      <FaCheck />
                    </button>
                    <button className="icon-btn" onClick={cancelEdit} title="Cancel">
                      <FaTimes />
                    </button>
                    <button className="icon-btn danger" onClick={() => remove(it.id)} title="Delete">
                      <FaTrash />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="set-chip" title="Click Edit to modify">{it.name}</div>
                    <button
                      className="icon-btn"
                      onClick={() => beginEdit(it.id, it.name)}
                      title="Edit"
                    >
                      <FaPen />
                    </button>
                    <button className="icon-btn danger" onClick={() => remove(it.id)} title="Delete">
                      <FaTrash />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------------- page ---------------- */
export default function Settings() {
  const { api, data } = useApp();

  // figure out a username to show
  const currentUser =
    data?.user || data?.me || data?.auth?.user || data?.currentUser || null;
  const username =
    currentUser?.username ||
    currentUser?.name ||
    currentUser?.email ||
    "admin";

  // Defaults if DB has none
  const DEFAULTS = React.useMemo(
    () => ({
      statuses: ["Current", "Waitlist", "Future Applicant", "Alumni", "Withdrawn"],
      phases: ["1", "2"],
      squads: ["A", "B", "C"],
      recordTypes: ["Resident", "Applicant", "Prospect", "Alumni"],
      dorms: [],
    }),
    []
  );

  // seed from current settings (supports strings or {id,name})
  const initial = React.useMemo(() => {
    const s = data?.settings || {};
    return {
      statuses: toObjList(s.statuses, DEFAULTS.statuses),
      phases: toObjList(s.phases, DEFAULTS.phases),
      squads: toObjList(s.squads, DEFAULTS.squads),
      recordTypes: toObjList(s.recordTypes, DEFAULTS.recordTypes),
      dorms: toObjList(s.dorms, DEFAULTS.dorms),
    };
  }, [data?.settings, DEFAULTS]);

  const [statuses, setStatuses] = React.useState(initial.statuses);
  const [phases, setPhases] = React.useState(initial.phases);
  const [squads, setSquads] = React.useState(initial.squads);
  const [recordTypes, setRecordTypes] = React.useState(initial.recordTypes);
  const [dorms, setDorms] = React.useState(initial.dorms);
  const [saving, setSaving] = React.useState(false);

  // sync when settings arrive later
  React.useEffect(() => {
    setStatuses(initial.statuses);
    setPhases(initial.phases);
    setSquads(initial.squads);
    setRecordTypes(initial.recordTypes);
    setDorms(initial.dorms);
  }, [initial.statuses, initial.phases, initial.squads, initial.recordTypes, initial.dorms]);

  const saveAll = async () => {
    setSaving(true);
    try {
      const next = {
        ...(data?.settings || {}),
        statuses: normalizeForSave(statuses),
        phases: normalizeForSave(phases),
        squads: normalizeForSave(squads),
        recordTypes: normalizeForSave(recordTypes),
        dorms: normalizeForSave(dorms),
        updatedAt: Date.now(),
      };
      await api.put("settings", next);
      alert("Settings saved.");
    } catch (e) {
      console.error(e);
      alert("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page active" aria-label="Settings">
      <style>{LOCAL_CSS}</style>

      {/* Header / user */}
      <div className="card set-hero">
        <div className="user">
          <div className="avatar">
            <FaUserCircle size={28} />
          </div>
          <div className="u-meta">
            <div className="u-label">Signed in as</div>
            <div className="u-name">{username}</div>
          </div>
        </div>

        <div className="title">
          <h2>Settings</h2>
          <div className="sub">Master lists used across student profiles & filters</div>
        </div>

        <div className="actions">
          <button className="btn primary" onClick={saveAll} disabled={saving} title="Save Settings">
            <FaSave /> {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>

      {/* Grid of editors */}
      <div className="set-grid">
        <ListEditor
          title="Statuses"
          icon={FaTags}
          items={statuses}
          setItems={setStatuses}
          placeholder="e.g., Current"
        />
        <ListEditor
          title="Phases"
          icon={FaListOl}
          items={phases}
          setItems={setPhases}
          placeholder="e.g., 1"
        />
        <ListEditor
          title="Squads"
          icon={FaUsers}
          items={squads}
          setItems={setSquads}
          placeholder="e.g., A"
        />
        <ListEditor
          title="Record Types"
          icon={FaIdBadge}
          items={recordTypes}
          setItems={setRecordTypes}
          placeholder="e.g., Resident"
        />
        <ListEditor
          title="Dorms"
          icon={FaBed}
          items={dorms}
          setItems={setDorms}
          placeholder="e.g., North Hall"
        />
      </div>
    </section>
  );
}

/* ---------------- local scoped CSS ---------------- */
const LOCAL_CSS = `
/* ---------- page header ---------- */
.set-hero{
  display:flex; align-items:center; gap:14px; justify-content:space-between;
}
.set-hero .user{ display:flex; align-items:center; gap:10px; }
.set-hero .avatar{
  width:38px; height:38px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  background:#0f162b; border:1px solid #25335d; color:#9fb4de;
}
.set-hero .u-label{ font-size:12px; color:var(--text-dim); }
.set-hero .u-name{ font-weight:800; }
.set-hero .title h2{ margin:0; }
.set-hero .sub{ color:var(--text-dim); }

/* ---------- FLEX grid of wide cards ---------- */
/* Tweak this one knob to control minimum card width */
.set-grid{
  --settings-card-min: 680px;   /* was ~340px; now much wider */
  display:flex;
  flex-wrap:wrap;
  gap:16px;
  margin-top:12px;
}

/* Each card is at least the min width, grows to fill the row */
.set-card{
  flex: 1 1 var(--settings-card-min);
  min-width: var(--settings-card-min);
  max-width: 100%;
}

/* Card header: title (left) + Add row (right) */
.set-card-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  border-bottom:1px solid #1f294a;
  padding-bottom:8px;
  margin-bottom:8px;
}
.set-card-title{ display:flex; align-items:center; gap:8px; font-weight:800; }
.set-card-title .count{
  margin-left:6px; font-size:12px; color:var(--text-dim); background:#0f162b;
  border:1px solid #25335d; border-radius:999px; padding:2px 8px;
}
.set-ico{ width:22px; height:22px; display:grid; place-items:center; color:#9fb4de; }

/* Add bar uses flex; input stretches, button hugs content */
.set-card-add{
  display:flex;
  align-items:center;
  gap:8px;
  flex:1;
}
.set-card-add input.btn{ flex:1; height:34px; min-width:240px; }
.set-card-add .btn.primary{ flex:0 0 auto; height:34px; }

/* List of items */
.set-list{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px; }

/* Row: either chip + (edit/delete) OR input + (save/cancel/delete) */
.set-row{ display:flex; align-items:center; gap:8px; }
.set-input{ flex:1; height:34px; }
.set-chip{
  flex:1;
  border:1px solid #233258; background:#0f162b; border-radius:8px;
  padding:8px 12px;
}

.icon-btn{
  width:36px; height:34px; border-radius:8px;
  border:1px solid #2a3c6a; background:#0f162b; color:var(--text);
  display:flex; align-items:center; justify-content:center;
}
.icon-btn.danger:hover{ background:#361b1b; color:#ffb4b4; }

.hint{ opacity:.8; font-size:13px; }

/* On small screens, allow single-column full-width cards */
@media (max-width: 760px){
  .set-grid{ --settings-card-min: 100%; }
  .hide-sm{ display:none; }
}
`;