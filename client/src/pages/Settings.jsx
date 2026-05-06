// src/pages/Settings.jsx
import React from "react";
import { useApp } from "../context/AppContext";
import {
  FaUserCircle, FaTags, FaListOl, FaUsers, FaIdBadge, FaBed,
  FaPlus, FaTrash, FaSave, FaPen, FaCheck, FaTimes, FaShieldAlt, FaGlobe, FaPalette,
  FaClipboardCheck, FaIdCard, FaBriefcase, FaRunning, FaUser
} from "react-icons/fa";

/* ---------------- helpers ---------------- */
const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

function toObjList(src, defaults = []) {
  let arr = Array.isArray(src) ? src : [];
  if (!arr.length && defaults.length) arr = defaults;
  return arr
    .map((x) => typeof x === "string" ? { id: uid(), name: x } : { id: x.id || uid(), name: (x.name ?? "") })
    .filter((x) => x.name.trim() !== "");
}

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
function ListEditor({ title, icon: Icon, items, setItems, placeholder, color = "#6366f1" }) {
  const [newName, setNewName] = React.useState("");
  const [editingId, setEditingId] = React.useState(null);
  const [editVal, setEditVal] = React.useState("");

  const add = () => {
    const n = newName.trim();
    if (!n) return;
    setItems((list) => [...list, { id: uid(), name: n }]);
    setNewName("");
  };

  const beginEdit = (id, cur) => { setEditingId(id); setEditVal(cur); };
  const cancelEdit = () => { setEditingId(null); setEditVal(""); };
  const saveEdit = () => {
    const v = editVal.trim();
    if (!v) return;
    setItems((list) => list.map((it) => (it.id === editingId ? { ...it, name: v } : it)));
    cancelEdit();
  };

  const remove = (id) => setItems((list) => list.filter((it) => it.id !== id));

  return (
    <div className="set-card">
      <div className="set-card-head">
        <div className="set-card-title">
          <div className="set-ico" style={{ background: `color-mix(in srgb, ${color}, transparent 85%)`, color: color }}>
            {Icon ? <Icon size={14} /> : null}
          </div>
          <strong>{title}</strong>
          <span className="count">{items.length}</span>
        </div>
        <div className="set-card-add">
          <input className="set-input-small" placeholder={placeholder} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button className="set-add-btn" onClick={add} title="Add New Item"><FaPlus size={10}/></button>
        </div>
      </div>

      <div className="set-list-wrap">
        {!items.length && <div className="hint">No items configured yet.</div>}
        <ul className="set-list">
          {items.map((it) => {
            const isEditing = editingId === it.id;
            return (
              <li key={it.id} className="set-row">
                {isEditing ? (
                  <>
                    <input className="set-edit-input" value={editVal} onChange={(e) => setEditVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }} autoFocus />
                    <button className="set-row-btn save" onClick={saveEdit}><FaCheck /></button>
                    <button className="set-row-btn cancel" onClick={cancelEdit}><FaTimes /></button>
                  </>
                ) : (
                  <>
                    <div className="set-chip">{it.name}</div>
                    <button className="set-row-btn edit" onClick={() => beginEdit(it.id, it.name)}><FaPen /></button>
                    <button className="set-row-btn del" onClick={() => remove(it.id)}><FaTrash /></button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ---------------- page ---------------- */
export default function Settings() {
  const { api, data, user, setPresence, presenceFor, setModal, setToast } = useApp();
  const [statusMenu, setStatusMenu] = React.useState(false);

  const isAdmin = String(user?.role || "").toLowerCase() === "admin";
  const myPresence = presenceFor(user);

  const handleStatusChange = async (s) => {
    try { await setPresence(s); setStatusMenu(false); } catch {}
  };

  const username = data?.user?.name || user?.name || user?.email || "Administrator";

  const DEFAULTS = React.useMemo(() => ({
    statuses: ["Current", "Waitlist", "Future Applicant", "Alumni", "Withdrawn"],
    phases: ["1", "2"],
    squads: ["A", "B", "C"],
    recordTypes: ["Resident", "Applicant", "Prospect", "Alumni"],
    dorms: [],
    appStatuses: ["Not Started", "In Progress", "Completed", "Not Needed"],
    bgStatuses: ["Not Started", "In Progress", "Completed", "Not Needed"],
    idOptions: ["Yes", "No, needs ID", "N/A"],
    readinessOptions: ["Ready", "Not Ready", "No, needs ID"],
    fitnessOptions: ["Active", "Limited", "Exempt"],
    genders: ["Male", "Female"],
  }), []);

  const initial = React.useMemo(() => {
    const s = data?.settings || {};
    return {
      statuses: toObjList(s.statuses, DEFAULTS.statuses),
      phases: toObjList(s.phases, DEFAULTS.phases),
      squads: toObjList(s.squads, DEFAULTS.squads),
      recordTypes: toObjList(s.recordTypes, DEFAULTS.recordTypes),
      dorms: toObjList(s.dorms, DEFAULTS.dorms),
      appStatuses: toObjList(s.appStatuses, DEFAULTS.appStatuses),
      bgStatuses: toObjList(s.bgStatuses, DEFAULTS.bgStatuses),
      idOptions: toObjList(s.idOptions, DEFAULTS.idOptions),
      readinessOptions: toObjList(s.readinessOptions, DEFAULTS.readinessOptions),
      fitnessOptions: toObjList(s.fitnessOptions, DEFAULTS.fitnessOptions),
      genders: toObjList(s.genders, DEFAULTS.genders),
    };
  }, [data?.settings, DEFAULTS]);

  const [statuses, setStatuses] = React.useState(initial.statuses);
  const [phases, setPhases] = React.useState(initial.phases);
  const [squads, setSquads] = React.useState(initial.squads);
  const [recordTypes, setRecordTypes] = React.useState(initial.recordTypes);
  const [dorms, setDorms] = React.useState(initial.dorms);
  const [appStatuses, setAppStatuses] = React.useState(initial.appStatuses);
  const [bgStatuses, setBgStatuses] = React.useState(initial.bgStatuses);
  const [idOptions, setIdOptions] = React.useState(initial.idOptions);
  const [readinessOptions, setReadinessOptions] = React.useState(initial.readinessOptions);
  const [fitnessOptions, setFitnessOptions] = React.useState(initial.fitnessOptions);
  const [genders, setGenders] = React.useState(initial.genders);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setStatuses(initial.statuses); 
    setPhases(initial.phases); 
    setSquads(initial.squads); 
    setRecordTypes(initial.recordTypes); 
    setDorms(initial.dorms);
    setAppStatuses(initial.appStatuses);
    setBgStatuses(initial.bgStatuses);
    setIdOptions(initial.idOptions);
    setReadinessOptions(initial.readinessOptions);
    setFitnessOptions(initial.fitnessOptions);
    setGenders(initial.genders);
  }, [initial]);

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
        appStatuses: normalizeForSave(appStatuses),
        bgStatuses: normalizeForSave(bgStatuses),
        idOptions: normalizeForSave(idOptions),
        readinessOptions: normalizeForSave(readinessOptions),
        fitnessOptions: normalizeForSave(fitnessOptions),
        genders: normalizeForSave(genders),
        updatedAt: Date.now(),
      };
      await api.put("settings", next);
      setModal({
        open: true,
        type: "node",
        props: { cardStyle: { maxWidth: '400px', textAlign: 'center' } },
        node: (
          <div className="set-success-modal">
            <div className="ssm-icon"><FaCheck /></div>
            <h2>Settings Synchronized</h2>
            <p>Your program configuration and student input defaults have been successfully updated across the system.</p>
            <button className="dsm-btn-primary" style={{ width: '100%', marginTop: '12px' }} onClick={() => setModal({ open: false })}>
              Done
            </button>
          </div>
        )
      });
    } catch (e) {
      setToast({ type: 'error', text: "Error updating configuration." });
    } finally { setSaving(false); }
  };

  return (
    <section className="set-page active">
      <style>{LOCAL_CSS}</style>

      <div className="set-hero">
        <div className="set-hero-left">
          <div className="set-avatar-wrap">
            <FaUserCircle size={40} className="set-avatar-icon" />
            {isAdmin && <span className={`set-presence-ring ${myPresence}`} />}
          </div>
          <div className="set-hero-info">
            <div className="set-signed-label">Signed in as</div>
            <div className="set-username">{username}</div>
          </div>
          {isAdmin && (
            <div className="set-status-ctrl">
              <button className={`set-status-pill ${myPresence}`} onClick={() => setStatusMenu(!statusMenu)}>
                <span className="dot" />
                <span>{myPresence.charAt(0).toUpperCase() + myPresence.slice(1)}</span>
              </button>
              {statusMenu && (
                <div className="set-status-pop">
                  {["online", "away", "offline"].map(s => (
                    <button key={s} className="set-status-opt" onClick={() => handleStatusChange(s)}>
                      <span className={`dot ${s}`} />
                      <span>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="set-hero-actions">
          <button className="set-save-btn" onClick={saveAll} disabled={saving}>
            <FaSave /> {saving ? "Updating..." : "Save Configuration"}
          </button>
        </div>
      </div>

      <div className="set-grid">
        <ListEditor title="User Statuses" icon={FaTags} items={statuses} setItems={setStatuses} placeholder="New status..." color="var(--primary)" />
        <ListEditor title="Program Phases" icon={FaListOl} items={phases} setItems={setPhases} placeholder="New phase..." color="var(--primary)" />
        <ListEditor title="Assigned Squads" icon={FaUsers} items={squads} setItems={setSquads} placeholder="New squad..." color="var(--primary)" />
        <ListEditor title="Record Types" icon={FaIdBadge} items={recordTypes} setItems={setRecordTypes} placeholder="New type..." color="var(--primary)" />
        <ListEditor title="Housing/Dorms" icon={FaBed} items={dorms} setItems={setDorms} placeholder="New dorm..." color="var(--secondary)" />
        <ListEditor title="App Statuses" icon={FaClipboardCheck} items={appStatuses} setItems={setAppStatuses} placeholder="New status..." color="var(--accent)" />
        <ListEditor title="Background Status" icon={FaShieldAlt} items={bgStatuses} setItems={setBgStatuses} placeholder="New status..." color="var(--danger)" />
        <ListEditor title="ID Verification" icon={FaIdCard} items={idOptions} setItems={setIdOptions} placeholder="New option..." color="var(--secondary)" />
        <ListEditor title="Work Readiness" icon={FaBriefcase} items={readinessOptions} setItems={setReadinessOptions} placeholder="New option..." color="var(--primary)" />
        <ListEditor title="Fitness Levels" icon={FaRunning} items={fitnessOptions} setItems={setFitnessOptions} placeholder="New option..." color="var(--secondary)" />
        <ListEditor title="Genders" icon={FaUser} items={genders} setItems={setGenders} placeholder="New gender..." color="var(--primary)" />
        
        {/* Placeholder for future sections */}
        <div className="set-card info">
          <div className="set-card-head"><div className="set-card-title"><div className="set-ico" style={{background:'var(--accent-soft)', color:'var(--accent)'}}><FaShieldAlt size={14}/></div><strong>Security & Access</strong></div></div>
          <div className="set-list-wrap"><p className="hint">Audit logs and permission groups are managed in the Team portal.</p></div>
        </div>
      </div>
    </section>
  );
}

const LOCAL_CSS = `
  .set-page { padding: 32px; background: var(--bg); min-height: calc(100vh - 64px); font-family: 'Inter', system-ui, sans-serif; }
  
  .set-hero { display: flex; align-items: center; justify-content: space-between; background: var(--surface); padding: 24px 32px; border-radius: 20px; border: 1px solid var(--border); box-shadow: var(--shadow); margin-bottom: 32px; }
  .set-hero-left { display: flex; align-items: center; gap: 20px; }
  .set-avatar-wrap { position: relative; }
  .set-avatar-icon { color: var(--text-muted); }
  .set-presence-ring { position: absolute; bottom: 0; right: 0; width: 14px; height: 14px; border-radius: 50%; border: 3px solid var(--surface); }
  .set-presence-ring.online { background: var(--success); }
  .set-presence-ring.away { background: var(--warning); }
  .set-presence-ring.offline { background: var(--text-muted); }

  .set-hero-info { display: flex; flex-direction: column; }
  .set-signed-label { font-size: 11px; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
  .set-username { font-size: 18px; font-weight: 800; color: var(--text); }

  .set-status-pill { display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg); cursor: pointer; font-size: 13px; font-weight: 700; transition: all 0.2s; position: relative; color: var(--text); }
  .set-status-pill .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); }
  .set-status-pill.online .dot { background: var(--success); box-shadow: 0 0 8px rgba(var(--primary-rgb), 0.4); }
  .set-status-pill.away .dot { background: var(--warning); }
  .set-status-pill.offline .dot { background: var(--text-muted); }
  
  .set-status-pop { position: absolute; top: calc(100% + 8px); left: 0; width: 140px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow-lg); padding: 6px; z-index: 100; }
  .set-status-opt { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border: none; background: none; cursor: pointer; border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--text-muted); transition: all 0.2s; }
  .set-status-opt:hover { background: var(--primary-soft); color: var(--primary); }
  .set-status-opt .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); }
  .set-status-opt .dot.online { background: var(--success); }
  .set-status-opt .dot.away { background: var(--warning); }
  .set-status-opt .dot.offline { background: var(--text-muted); }

  .set-save-btn { display: flex; align-items: center; gap: 10px; padding: 12px 24px; border-radius: 14px; background: var(--primary); color: white; border: none; cursor: pointer; font-weight: 700; font-size: 14px; box-shadow: var(--shadow-brand); transition: all 0.2s; }
  .set-save-btn:hover:not(:disabled) { background: var(--primary-hover); transform: translateY(-1px); }
  .set-save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  :root[data-theme="dark"] .set-save-btn { color: #1A1014; }

  .set-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 24px; }
  .set-card { background: var(--surface); border-radius: 24px; border: 1px solid var(--border); padding: 24px; box-shadow: var(--shadow); }
  .set-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .set-card-title { display: flex; align-items: center; gap: 12px; }
  .set-ico { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; }
  .set-card-title strong { font-size: 16px; font-weight: 800; color: var(--text); }
  .set-card-title .count { font-size: 11px; font-weight: 800; background: var(--bg); color: var(--text-muted); padding: 2px 8px; border-radius: 20px; border: 1px solid var(--border); }

  .set-card-add { display: flex; align-items: center; gap: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 4px 6px; }
  .set-input-small { background: none; border: none; outline: none; font-size: 13px; font-weight: 600; padding: 6px 8px; width: 120px; color: var(--text); }
  .set-add-btn { width: 28px; height: 28px; border-radius: 8px; background: var(--primary); color: white; border: none; cursor: pointer; display: grid; place-items: center; transition: 0.2s; }
  .set-add-btn:hover { background: var(--primary-hover); transform: scale(1.05); }
  :root[data-theme="dark"] .set-add-btn { color: #1A1014; }

  .set-list-wrap { max-height: 300px; overflow-y: auto; padding-right: 4px; }
  .set-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .set-row { display: flex; align-items: center; gap: 8px; animation: slideUp 0.2s ease-out; }
  @keyframes slideUp { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
  .set-chip { flex: 1; padding: 10px 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; font-size: 14px; font-weight: 600; color: var(--text); }
  .set-edit-input { flex: 1; padding: 10px 16px; background: var(--surface); border: 2px solid var(--primary); border-radius: 12px; font-size: 14px; font-weight: 600; outline: none; color: var(--text); }
  
  .set-row-btn { width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); color: var(--text-muted); cursor: pointer; display: grid; place-items: center; transition: all 0.2s; font-size: 12px; }
  .set-row-btn:hover { background: var(--primary-soft); color: var(--primary); border-color: var(--primary); }
  .set-row-btn.del:hover { color: var(--danger); border-color: var(--danger); background: rgba(var(--primary-rgb), 0.05); }
  .set-row-btn.save { background: var(--primary); color: white; border: none; }
  .set-row-btn.cancel { background: var(--bg); color: var(--text-muted); border: 1px solid var(--border); }
  :root[data-theme="dark"] .set-row-btn.save { color: #1A1014; }

  .hint { font-size: 13px; color: var(--text-muted); font-style: italic; padding: 10px; text-align: center; }
  
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }

  @media (max-width: 768px) {
    .set-page { padding: 16px 12px; min-height: 0; }
    .set-hero { padding: 16px 18px; flex-direction: column; align-items: stretch; gap: 14px; margin-bottom: 18px; border-radius: 16px; }
    .set-hero-left { gap: 14px; }
    .set-username { font-size: 16px; }
    .set-status-pill { justify-content: space-between; padding: 12px 16px; min-height: 44px; }
    .set-save-btn { width: 100%; justify-content: center; min-height: 48px; }

    .set-grid { grid-template-columns: 1fr; gap: 14px; }
    .set-card { padding: 18px 16px; border-radius: 16px; }
    .set-card-head { flex-wrap: wrap; gap: 12px; margin-bottom: 14px; }
    .set-card-add { flex: 1; }
    .set-input-small { flex: 1; width: auto; min-width: 0; font-size: 16px; padding: 10px 8px; }
    .set-add-btn { width: 36px; height: 36px; flex-shrink: 0; }

    .set-list-wrap { max-height: 240px; }
    .set-chip, .set-edit-input { padding: 12px 14px; font-size: 15px; min-height: 44px; }
    .set-row-btn { width: 40px; height: 40px; flex-shrink: 0; }
  }

  .set-success-modal { padding: 24px 8px; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .ssm-icon { width: 64px; height: 64px; border-radius: 50%; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; font-size: 24px; margin-bottom: 20px; animation: popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
  @keyframes popIn { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  .set-success-modal h2 { font-size: 20px; font-weight: 800; color: var(--text); margin: 0 0 12px; }
  .set-success-modal p { font-size: 14px; color: var(--text-muted); line-height: 1.6; margin: 0 0 24px; }
`;
