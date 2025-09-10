// src/components/TopNav.jsx
import React, { useRef, useState, useEffect, useLayoutEffect } from "react";
import "@fortawesome/fontawesome-free/css/all.min.css";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useApp } from "../context/AppContext";

import {
  FaHome, FaUsers, FaCalendarAlt, FaChartLine, FaColumns,
  FaComments, FaCreditCard, FaBullhorn, FaPlus, FaBell, FaSearch,
  FaUser, FaKey, FaUserFriends, FaCog, FaFileAlt, FaSignOutAlt,
  FaUserPlus, FaSeedling, FaGraduationCap, FaTimes, FaTrash, FaPaperPlane,
  FaMoon, FaSun
} from "react-icons/fa";

const STATUSES = ["Current", "Waitlist", "Future Applicant", "Alumni", "Withdrawn"];
const PHASES   = ["", "1", "2"];
const SQUADS   = ["", "A", "B", "C"];
const RECORD_TYPES = ["Resident", "Applicant", "Prospect", "Alumni"];

const NAV_ITEMS = [
  { to: "/admin/home",      label: "Home",      icon: FaHome },
  { to: "/admin/students",  label: "Students",  icon: FaUsers },
  { to: "/admin/calendar",  label: "Calendar",  icon: FaCalendarAlt },
  { to: "/admin/insights",  label: "Insights",  icon: FaChartLine },
  { to: "/admin/boards",    label: "Boards",    icon: FaColumns },
  { to: "/admin/engage",    label: "Engage",    icon: FaComments },
  { to: "/admin/payments",  label: "Payments",  icon: FaCreditCard },
  { to: "/admin/marketing", label: "Marketing", icon: FaBullhorn },
];

function AddPersonModal({ kind, api, dorms = [], onClose, onCreated }) {
  const presets = {
    student: { title: "Add Student",           status: "Current",          recordType: "Resident" },
    future:  { title: "Add Future Applicant",  status: "Future Applicant", recordType: "Applicant" },
    alumni:  { title: "Add Alumni Record",     status: "Alumni",           recordType: "Alumni" },
  };
  const meta = presets[kind] ?? presets.student;
  const todayISO = new Date().toISOString().slice(0,10);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", mobile: "",
    status: meta.status, recordType: meta.recordType,
    phase: "", squad: "", dorm: "", intakeDate: "", exitDate: kind==="alumni"?todayISO:"",
    referralSource: "",
    mentor: "No",
    location: "",
    // New fields
    application: "",
    background: "",
    programPhase: "",
    durationInProgram: "",
    employment: "",
    readiness: "No",
    employmentPlacement: "No",
    workshops: "",
    serviceHours: "",
    celebrate: "",
    healthRecovery: ""
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    const p = document.body.style.overflow;
    document.body.style.overflow="hidden";
    return () => (document.body.style.overflow=p);
  }, []);
  useEffect(() => {
    const onKey = e => e.key==="Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const blank = v => (v && String(v).trim() !== "" ? v : undefined);

  const save = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) return alert("First and last name are required.");
    setSaving(true);
    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName:  form.lastName.trim(),
        email:     blank(form.email),
        mobile:    blank(form.mobile),
        status:    form.status,
        recordType:form.recordType,
        phase:     blank(form.phase),
        squad:     blank(form.squad),
        dorm:      blank(form.dorm),
        intakeDate:blank(form.intakeDate),
        exitDate:  blank(form.exitDate),
        referralSource: blank(form.referralSource),
        mentor:         blank(form.mentor),
        location:       blank(form.location),
        // New fields
        application:        blank(form.application),
        background:         blank(form.background),
        programPhase:       blank(form.programPhase),
        durationInProgram:  blank(form.durationInProgram),
        employment:         blank(form.employment),
        readiness:          blank(form.readiness),
        employmentPlacement:blank(form.employmentPlacement),
        workshops:          blank(form.workshops),
        serviceHours:       blank(form.serviceHours),
        celebrate:          blank(form.celebrate),
        healthRecovery:     blank(form.healthRecovery),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const created = await api.add("students", { id: undefined, ...payload });
      onCreated?.(created);
    } catch (e) {
      console.error(e); alert("Failed to create record.");
    } finally { setSaving(false); }
  };

  return (
    <div className="modal show">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-card" style={{ width:"min(760px,94vw)" }}>
        <div className="modal-header">
          <strong>{meta.title}</strong>
          <button className="icon-btn" onClick={onClose} title="Close"><FaTimes /></button>
        </div>

        <div className="modal-body" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">First Name *</span>
            <input className="btn" value={form.firstName} onChange={e=>set("firstName", e.target.value)} />
          </label>
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Last Name *</span>
            <input className="btn" value={form.lastName} onChange={e=>set("lastName", e.target.value)} />
          </label>
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Email</span>
            <input className="btn" type="email" value={form.email} onChange={e=>set("email", e.target.value)} />
          </label>
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Mobile</span>
            <input className="btn" value={form.mobile} onChange={e=>set("mobile", e.target.value)} />
          </label>
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Status</span>
            <select className="btn" value={form.status} onChange={e=>set("status", e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{s || "—"}</option>)}
            </select>
          </label>
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Record Type</span>
            <select className="btn" value={form.recordType} onChange={e=>set("recordType", e.target.value)}>
              {RECORD_TYPES.map(rt => <option key={rt} value={rt}>{rt}</option>)}
            </select>
          </label>
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Phase</span>
            <select className="btn" value={form.phase} onChange={e=>set("phase", e.target.value)}>
              {PHASES.map(p => <option key={p} value={p}>{p || "—"}</option>)}
            </select>
          </label>
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Squad</span>
            <select className="btn" value={form.squad} onChange={e=>set("squad", e.target.value)}>
              {SQUADS.map(sq => <option key={sq} value={sq}>{sq || "—"}</option>)}
            </select>
          </label>
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Dorm</span>
            <select className="btn" value={form.dorm} onChange={e=>set("dorm", e.target.value)}>
              <option value="">—</option>
              {dorms.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Intake Date</span>
            <input className="btn" type="date" value={form.intakeDate} onChange={e=>set("intakeDate", e.target.value)} />
          </label>
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Graduation Date</span>
            <input className="btn" type="date" value={form.exitDate} onChange={e=>set("exitDate", e.target.value)} />
          </label>

          {/* Application and Background */}
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Application</span>
            <input className="btn" value={form.application} onChange={e=>set("application", e.target.value)} placeholder="e.g., In progress" />
          </label>
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Background</span>
            <input className="btn" value={form.background} onChange={e=>set("background", e.target.value)} placeholder="e.g., In progress" />
          </label>

          {/* Program Phase and Duration */}
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Program Phase</span>
            <input className="btn" value={form.programPhase} onChange={e=>set("programPhase", e.target.value)} placeholder="e.g., Phase 1, Active" />
          </label>
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Duration in Program</span>
            <input className="btn" value={form.durationInProgram} onChange={e=>set("durationInProgram", e.target.value)} placeholder="e.g., 3 days" />
          </label>

          {/* Employment + Readiness + Placement */}
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Employment</span>
            <input className="btn" value={form.employment} onChange={e=>set("employment", e.target.value)} placeholder="e.g., No, needs ID" />
          </label>
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Readiness</span>
            <select className="btn" value={form.readiness} onChange={e=>set("readiness", e.target.value)}>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </label>
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Employment Placement</span>
            <select className="btn" value={form.employmentPlacement} onChange={e=>set("employmentPlacement", e.target.value)}>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </label>

          {/* Workshops and Service Hours */}
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Workshops / etc</span>
            <input className="btn" value={form.workshops} onChange={e=>set("workshops", e.target.value)} placeholder="e.g., Completed workshops" />
          </label>
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Service, Outreach & Volunteer Hours</span>
            <input className="btn" value={form.serviceHours} onChange={e=>set("serviceHours", e.target.value)} placeholder="e.g., 20 hours" />
          </label>

          {/* Referral from Pastor (was Mentor/Pastor), Location */}
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Referral from Pastor</span>
            <select className="btn" value={form.mentor} onChange={e=>set("mentor", e.target.value)}>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </label>
          <label style={{ display:"grid", gap:6 }}>
            <span className="label">Location</span>
            <input className="btn" value={form.location} onChange={e=>set("location", e.target.value)} />
          </label>

          {/* Celebrate and Health/Recovery (full width) */}
          <label style={{ display:"grid", gap:6, gridColumn:"1 / span 2" }}>
            <span className="label">Things to celebrate</span>
            <textarea value={form.celebrate} onChange={e=>set("celebrate", e.target.value)} placeholder="Notes worth celebrating..." />
          </label>
          <label style={{ display:"grid", gap:6, gridColumn:"1 / span 2" }}>
            <span className="label">Health/Recovery Improvements & Spiritual yummies :-)</span>
            <textarea value={form.healthRecovery} onChange={e=>set("healthRecovery", e.target.value)} placeholder="Health, recovery, spiritual notes..." />
          </label>
        </div>

        <div style={{ display:"flex", justifyContent:"flex-end", gap:8, padding:"10px 6px" }}>
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Create"}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Quick Messages Sidebar (slide-over) ---------------- */
function escHtmlQ(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
function highlightMentionsQ(text, users){
  if (!text) return "";
  const safe = escHtmlQ(text);
  return safe.replace(/@(\w+)/g,(match,username)=>{
    const u = users.find(
      (x)=>(x.name||"").replace(/\s/g,"").toLowerCase().startsWith(String(username).toLowerCase())
    );
    if (u){
      const first=(u.name||"").split(" ")[0];
      return `<span class="mention">@${first}</span>`;
    }
    return match;
  });
}

const QUICK_MSG_CSS = `
.qm-wrap{ position:fixed; inset:0; z-index:2000; }
.qm-backdrop{ position:absolute; inset:0; background:rgba(0,0,0,.45); backdrop-filter:blur(2px); }
.qm-panel{ position:absolute; top:0; right:0; height:100%; width:min(980px, 96vw); background:#0f142a; border-left:1px solid #22325b; box-shadow: -20px 0 40px rgba(0,0,0,.35); display:grid; grid-template-rows: 56px 1fr; }
.qm-head{ display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-bottom:1px solid #1f294a; }
.qm-head .title{ display:flex; align-items:center; gap:10px; font-weight:800; }
.qm-head .actions{ display:flex; align-items:center; gap:8px; }
.qm-body{ display:grid; grid-template-columns: 300px 1fr; gap:12px; padding:12px; overflow:hidden; }
.qm-col{ min-height:0; }
.qm-search{ display:flex; align-items:center; gap:8px; border:1px solid #25335d; background:#0f162b; padding:4px 8px; border-radius:8px; }
.qm-search input{ background:transparent; border:0; outline:0; color:var(--text); width:100%; }
.qm-threads{ border-right:1px dashed #22325b; padding-right:10px; overflow:auto; }
.qm-thread-list{ list-style:none; margin:8px 0 0; padding:0; display:grid; gap:8px; }
.qm-thread{ position:relative; padding:10px; border:1px solid #22325b; background:#0f162b; border-radius:10px; cursor:pointer; }
.qm-thread.active{ outline:2px solid #2b4fd7; }
.qm-thread .t-row{ display:flex; align-items:center; justify-content:space-between; gap:8px; }
.qm-thread .t-title{ font-weight:800; }
.qm-thread .t-last{ opacity:.8; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.qm-thread .t-from{ color:#9fb4de; margin-right:6px; }
.qm-unread{ position:absolute; top:10px; right:10px; width:10px; height:10px; background:#5bd1ff; border-radius:50%; box-shadow:0 0 0 2px #0f162b; }

.qm-chat{ display:grid; grid-template-rows: 44px 1fr 56px; min-height: 360px; }
.qm-chat-head{ display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #1f294a; padding-bottom:8px; }
.qm-ch-title{ font-weight:800; }
.qm-bubbles{ overflow:auto; display:flex; flex-direction:column; gap:10px; padding:8px 2px; }
.qm-bubble{ max-width: 80%; padding:10px 12px; border-radius:12px; box-shadow:0 6px 20px rgba(0,0,0,.25); }
.qm-bubble .meta{ font-size:11px; opacity:.8; margin-bottom:4px; display:flex; gap:8px; }
.qm-bubble.me{ align-self:flex-end; background:#1b2c5e; border:1px solid #2a3c6a; }
.qm-bubble.them{ align-self:flex-start; background:#11203e; border:1px solid #233258; }
.qm-compose{ display:flex; gap:8px; align-items:center; position:relative; }
.qm-compose input{ flex:1; }
.qm-compose .text-input{
  flex:1;
  background:#0f162b;
  border:1px solid #2b3767;
  border-radius:12px;
  padding:10px 12px;
  color:var(--text);
  outline:none;
  transition: box-shadow .15s, border-color .15s;
}
.qm-compose .text-input::placeholder{
  color:#9fb0e8;
  opacity:.85;
}
.qm-compose .text-input:focus{
  border-color:#42b0d5;
  box-shadow:0 0 0 3px rgba(66,176,213,.24);
}
/* Smart reply chips */
.qm-suggests{
  display:flex;
  gap:8px;
  flex-wrap:wrap;
  padding:6px 0 10px;
}
.qm-chip{
  background:#111a36;
  border:1px solid #2a3668;
  color:#cbd6ff;
  border-radius:999px;
  padding:6px 10px;
  cursor:pointer;
  font-size:13px;
}
.qm-chip:hover{
  background:#1a2344;
  border-color:#3a4a7d;
}
.qm-chip:active{
  transform: translateY(1px);
}
.qm-mention-pop{ position:absolute; left:6px; bottom:52px; width:min(360px, 80%); background:#0f162b; border:1px solid #25335d; border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,.45); padding:6px; z-index:20; }
.qm-m-item{ display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:8px; cursor:pointer; }
.qm-m-item:hover, .qm-m-item.active{ background:#142043; }
.qm-mention{ color:#7db2ff; font-weight:700; }
.qm-empty{ opacity:.7; display:grid; place-items:center; height:100%; }
.qm-btn{ background:#1b2547; border:1px solid #2e3a6b; color:#d8e2ff; padding:8px 12px; border-radius:10px; cursor:pointer; display:inline-flex; align-items:center; gap:8px; }
.qm-btn.primary{ background: linear-gradient(180deg,#3f76ff,#315bff); border-color:#2b47c6; color:#fff; }
.qm-btn.danger{ background:#2a151a; border-color:#7a2b36; color:#ffc9ce; }
.qm-icon-btn{ width:34px; height:34px; display:grid; place-items:center; border-radius:10px; background:#121a36; border:1px solid #2a3668; color:#cbd6ff; }
.qm-icon-btn:hover{ background:#1a2344; }

/* Light mode overrides: map hardcoded colors to theme variables */
:root[data-theme="light"] .qm-panel{
  background: var(--panel);
  border-left-color: var(--stroke);
}
:root[data-theme="light"] .qm-head{
  border-bottom-color: var(--stroke);
}
:root[data-theme="light"] .qm-body{
  background: transparent;
}
:root[data-theme="light"] .qm-search{
  background: var(--panel);
  border-color: var(--stroke);
}
:root[data-theme="light"] .qm-threads{
  border-right-color: var(--stroke);
}
:root[data-theme="light"] .qm-thread{
  background: var(--panel);
  border-color: var(--stroke);
}
:root[data-theme="light"] .qm-bubble.me{
  background: var(--panel-2);
  border-color: var(--stroke);
}
:root[data-theme="light"] .qm-bubble.them{
  background: var(--panel-2);
  border-color: var(--stroke);
}
:root[data-theme="light"] .qm-compose .text-input{
  background: var(--panel);
  border-color: var(--stroke);
  color: var(--text);
}
:root[data-theme="light"] .qm-mention-pop{
  background: var(--panel);
  border-color: var(--stroke);
}
:root[data-theme="light"] .qm-btn{
  background: var(--panel-2);
  border-color: var(--stroke);
  color: var(--text);
}
:root[data-theme="light"] .qm-btn.primary{
  background: var(--blue);
  border-color: transparent;
  color: #fff;
}
:root[data-theme="light"] .qm-icon-btn{
  background: var(--panel);
  border-color: var(--stroke);
  color: var(--text);
}
`;

function QuickMessagesPanel({ api, user, onClose }) {
  // Use App context for shared data/logic similar to Engage
  const { data, engage } = useApp();
  const me = user?.id || null;
  const [threads, setThreads] = React.useState([]);
  const [users, setUsers] = React.useState([]);
  const [activeId, setActiveId] = React.useState(null);
  const [searchQ, setSearchQ] = React.useState("");
  const [compose, setCompose] = React.useState("");
  const [showNew, setShowNew] = React.useState(false);

  const listRef = React.useRef(null);
  const composeRef = React.useRef(null);
  const [showMention, setShowMention] = React.useState(false);
  const [mentionQuery, setMentionQuery] = React.useState("");
  const [mentionIndex, setMentionIndex] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    if (!me) {
      setThreads([]);
      setUsers([]);
      return () => { alive = false; };
    }

    (async () => {
      try {
        const [msgs, us] = await Promise.all([
          api.getAll(`messages?for=${encodeURIComponent(me)}`).catch(() => []),
          api.getAll("users").catch(() => []),
        ]);
        if (!alive) return;
        const safeMsgs = Array.isArray(msgs) ? msgs : [];
        const safeUsers = Array.isArray(us) && us.length ? us : (Array.isArray(data?.users) ? data.users : []);
        setThreads(safeMsgs);
        setUsers(safeUsers);
      } catch (err) {
        if (!alive) return;
        // Fall back to context data
        const contextMessages = Array.isArray(data?.messages) ? data.messages : [];
        const contextUsers = Array.isArray(data?.users) ? data.users : [];
        setThreads(contextMessages);
        setUsers(contextUsers);
      }
    })();

    return () => { alive = false; };
  }, [me, api]);

  React.useEffect(() => { if (!activeId && threads.length) setActiveId(threads[0].id); }, [threads, activeId]);

  const active = React.useMemo(() => threads.find(t=>t.id===activeId) || null, [threads, activeId]);

  React.useEffect(() => {
    if (!active) return; if (active.readBy?.[me]) return;
    const next = { ...active, readBy: { ...(active.readBy||{}), [me]: true } };
    (async () => { await api.put("messages", next); setThreads(list=>list.map(t=>t.id===next.id?next:t)); })();
  }, [activeId]);

  React.useEffect(()=>{ const el=listRef.current; if (!el) return; el.scrollTop = el.scrollHeight + 1000; }, [activeId, active?.messages?.length]);

  function lastMessage(t){ const arr = Array.isArray(t?.messages)?t.messages:[]; return arr[arr.length-1] || null; }
  function threadTitle(t){
    if (t?.title) return t.title;
    const ids = (t?.participants || t?.members || []).filter(id => id !== me);
    const names = ids.map(id => users.find(u => u.id === id)?.name || id).filter(Boolean);
    return names.join(", ") || "DM";
  }

  async function send(overrideText){
    const text = (overrideText ?? compose).trim(); if (!text || !active) return;
    const id = (typeof crypto!=="undefined" && crypto.randomUUID) ? crypto.randomUUID() : (Date.now()+"-"+Math.random().toString(36).slice(2));
    const msg = { id, by: me, at: Date.now(), text };
    const next = { ...active, messages:[...(active.messages||[]), msg], readBy:{ ...(active.readBy||{}), [me]: true } };
    await api.put("messages", next);
    setThreads(list=>list.map(t=>t.id===next.id?next:t));
    setCompose("");
  }

  async function deleteThread(id){ if(!window.confirm("Delete this conversation?")) return; await api.del("messages", id); setThreads(list=>list.filter(t=>t.id!==id)); setActiveId(cur=>cur===id?null:cur); }

  const filtered = React.useMemo(()=>{ const q=searchQ.trim().toLowerCase(); if(!q) return threads; return threads.filter(t=>{ const title=threadTitle(t).toLowerCase(); const lm=(lastMessage(t)?.text||"").toLowerCase(); return title.includes(q)||lm.includes(q); }); }, [threads, searchQ, users]);

  function handleInput(e){ const val=e.target.value; setCompose(val); const caret=e.target.selectionStart||0; const before=val.slice(0, caret); const m=before.match(/@(\w*)$/); if(m){ setShowMention(true); setMentionQuery(m[1]); setMentionIndex(0);} else { setShowMention(false); setMentionQuery(""); } }

  const mentionMatches = React.useMemo(()=>{ if(!showMention) return []; const q=(mentionQuery||"").toLowerCase(); return users.filter(u=> u.id!==me && (u.name||"").replace(/\s/g,"").toLowerCase().startsWith(q)); }, [showMention, mentionQuery, users, me]);

  // -------- Smart Quick Replies (heuristic) --------
  function computeSmartReplies(activeThread, usersList, meId){
    if(!activeThread) return [];
    const msgs = activeThread.messages || [];
    const last = msgs[msgs.length-1];
    const text = (last?.text || "").toLowerCase();
    const peer = (activeThread.participants || []).find(id => id !== meId);
    const peerName = (usersList.find(u => u.id === peer)?.name || "").trim();
    const first = peerName.split(" ")[0] || "";
    const out = [];

    if (/(thank(s)?|thank\s+you)/i.test(text)) {
      out.push(`You're welcome${first ? `, ${first}` : ""}!`, "Happy to help!", "Anytime!");
    }
    if (text.includes("?") || /\b(can|could|would|do|did|are|is|when|where|why|how)\b/.test(text)) {
      out.push("Good question — let me check.", "Yes, that works.", "Let me get back to you shortly.");
    }
    if (/\b(when|time|schedule|meet|call|zoom)\b/.test(text)) {
      out.push("Can we do today at 3pm?", "Tomorrow morning works for me.", "What time works best for you?");
    }
    if (/\b(file|doc|docs?|pdf|upload|send)\b/.test(text)) {
      out.push("I'll send the file shortly.", "Uploading the PDF now.", "Do you prefer PDF or DOCX?");
    }
    if (!out.length) {
      out.push("Got it — thank you!", "I'll take a look and follow up.", "Can we chat for 10 minutes?");
    }
    // Deduplicate and cap
    return Array.from(new Set(out)).slice(0, 4);
  }

  const smartReplies = React.useMemo(()=> computeSmartReplies(active, users, me), [active, users, me]);

  function handleSmartClick(text){
    if ((compose || "").trim()) {
      setCompose(prev => (prev.trim().length ? (prev.endsWith(" ") ? prev + text : prev + " " + text) : text));
    } else {
      send(text);
    }
  }

  function insertMention(u){ const first=(u.name||"").split(" ")[0]; setCompose(prev=>{ const el=composeRef.current; const caret=el?el.selectionStart:prev.length; const before=prev.slice(0, caret).replace(/@(\w*)$/, `@${first} `); const after=prev.slice(caret); const next=before+after; setTimeout(()=>{ if(el){ const pos = before.length; el.focus(); el.setSelectionRange(pos,pos);} },0); return next; }); setShowMention(false); setMentionQuery(""); }

  React.useEffect(()=>{ const onKey=(e)=>{ if(e.key==="Escape") onClose?.(); }; document.addEventListener("keydown", onKey); return ()=>document.removeEventListener("keydown", onKey); }, [onClose]);

  // Stop global shortcuts from intercepting typing inside the compose input
  React.useEffect(() => {
    const el = composeRef.current;
    if (!el) return;
    const stop = (e) => { e.stopPropagation(); };
    // Capture phase to block before document/window handlers
    el.addEventListener("keydown", stop, true);
    el.addEventListener("keypress", stop, true);
    el.addEventListener("keyup", stop, true);
    return () => {
      el.removeEventListener("keydown", stop, true);
      el.removeEventListener("keypress", stop, true);
      el.removeEventListener("keyup", stop, true);
    };
  }, [/* reattach when switching threads */ activeId]);

  return (
    <div className="qm-wrap">
      <style>{QUICK_MSG_CSS}</style>
      <div className="qm-backdrop" onClick={onClose} />
      <aside className="qm-panel" role="dialog" aria-label="Messages">
        <div className="qm-head">
          <div className="title">Messages</div>
          <div className="actions">
            <button className="qm-btn" onClick={()=>setShowNew(true)}><FaPlus/> New</button>
            <button className="qm-icon-btn" onClick={onClose} title="Close"><FaTimes/></button>
          </div>
        </div>
        <div className="qm-body">
          {/* Left column: threads */}
          <div className="qm-col qm-threads">
            <div className="qm-search">
              <FaSearch/>
              <input placeholder="Search conversations" value={searchQ} onChange={e=>setSearchQ(e.target.value)} />
            </div>
            <ul className="qm-thread-list">
              {filtered.map(t=>{ const lm=lastMessage(t); const unread = !(t.readBy && t.readBy[me]) && lm && lm.by !== me; return (
                <li key={t.id} className={`qm-thread ${t.id===activeId?"active":""}`} onClick={()=>setActiveId(t.id)}>
                  <div className="t-row">
                    <div className="t-title">{threadTitle(t)}</div>
                    <button className="qm-icon-btn" title="Delete" onClick={(e)=>{ e.stopPropagation(); deleteThread(t.id); }}><FaTrash/></button>
                  </div>
                  <div className="t-last">{lm ? (<><span className="t-from">{lm.by===me?"You:":"Them:"}</span>{lm.text}</>) : (<em>No messages yet</em>)}</div>
                  {unread && <span className="qm-unread" aria-label="Unread"/>}
                </li>
              );})}
              {!filtered.length && <li className="qm-thread"><em>No conversations</em></li>}
            </ul>
          </div>

          {/* Right column: chat */}
          <div className="qm-col">
            {!active ? (
              <div className="qm-empty">Select or start a conversation</div>
            ) : (
              <div className="qm-chat">
                <div className="qm-chat-head">
                  <div className="qm-ch-title">{threadTitle(active)}</div>
                </div>
                <div className="qm-bubbles" ref={listRef}>
                  {(active.messages||[]).map(m=> (
                    <div key={m.id} className={`qm-bubble ${m.by===me?"me":"them"}`}>
                      <div className="meta">
                        <span className="who">{m.by===me?"You":(users.find(u=>u.id===m.by)?.name||m.by)}</span>
                        <span className="ts">{new Date(m.at).toLocaleString()}</span>
                      </div>
                      <div className="text" dangerouslySetInnerHTML={{ __html: highlightMentionsQ(m.text, users) }} />
                    </div>
                  ))}
                </div>
                {(!compose.trim() && !showMention && smartReplies.length > 0) && (
                  <div className="qm-suggests" role="listbox" aria-label="Quick replies">
                    {smartReplies.map((s, idx) => (
                      <button key={idx} className="qm-chip" onClick={() => handleSmartClick(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                <div className="qm-compose">
                  <input
                    type="text"
                    className="text-input"
                    ref={composeRef}
                    placeholder="Type a message. Press Enter to send. Use @ to mention"
                    value={compose}
                    onChange={handleInput}
                    onKeyDown={(e)=>{
                      // prevent bubbling to global hotkeys (fixes not being able to type 't')
                      e.stopPropagation();
                      // prevent bubbling to global hotkeys (fixes not being able to type 't')
                      e.stopPropagation();
                      if (showMention && mentionMatches.length){
                        if (e.key === "ArrowDown"){ setMentionIndex(i => (i+1)%mentionMatches.length); e.preventDefault(); return; }
                        if (e.key === "ArrowUp"){ setMentionIndex(i => (i-1+mentionMatches.length)%mentionMatches.length); e.preventDefault(); return; }
                        if (e.key === "Enter" || e.key === "Tab"){ e.preventDefault(); insertMention(mentionMatches[mentionIndex]); return; }
                        if (e.key === "Escape"){ setShowMention(false); setMentionQuery(""); return; }
                      }
                      if (e.key === "Enter") send();
                    }}
                  />
                  {showMention && mentionMatches.length>0 && (
                    <div className="qm-mention-pop">
                      {mentionMatches.slice(0,5).map((u,idx)=> (
                        <div key={u.id} className={`qm-m-item ${idx===mentionIndex?"active":""}`} onMouseDown={(e)=>{ e.preventDefault(); insertMention(u); }}>
                          <span className="qm-avatars">{u.initials || (u.name||"").split(" ").map(p=>p[0]).join("")}</span>
                          <span className="m-name">{u.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button className="qm-btn primary" onClick={send} disabled={!compose.trim()}><FaPaperPlane/> Send</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {showNew && (
        <QuickNewThreadModal users={users} me={me} api={api} engage={engage} onClose={()=>setShowNew(false)} onCreated={(t)=>{ setThreads(l=>[t,...l]); setActiveId(t.id); }} />
      )}
    </div>
  );
}

function QuickNewThreadModal({ users = [], me, api, engage, onClose, onCreated }) {
  const [q, setQ] = React.useState("");
  const [pick, setPick] = React.useState(()=>new Set());
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const filtered = React.useMemo(()=>{ const qq=q.trim().toLowerCase(); return users.filter(u=> u.id!==me && (!qq || (u.name||"").toLowerCase().includes(qq))); }, [q, users, me]);
  const toggle = (id) => setPick(s=>{ const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });
  const clearAll = () => setPick(new Set());

  const create = async () => {
    if (!pick.size || !me) return;
    setSaving(true);
    const participants = [me, ...Array.from(pick)];
    const title = name.trim() || null;
    try {
      let created = null;
      if (engage && typeof engage.createThread === "function") {
        created = await engage.createThread({ participants, title });
      } else {
        const thread = { id: undefined, type: participants.length > 2 ? "group" : "dm", participants, title, messages: [], readBy: { [me]: true } };
        created = await api.add("messages", thread);
      }
      onCreated?.(created);
      onClose?.();
    } catch (e) {
      console.error("Failed to create thread", e);
      alert("Could not create conversation.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal show" role="dialog" aria-modal="true">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-card" style={{ width:"min(720px, 96vw)", maxHeight:"80vh" }}>
        <div className="modal-header">
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <FaUsers />
            <strong>New Message</strong>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close"><FaTimes/></button>
        </div>
        <div className="modal-body" style={{ display:"grid", gap:12 }}>
          <label style={{ display:"grid", gap:6 }}>
            <span style={{ fontSize:12, color:"var(--text-dim)" }}>Conversation name (optional for groups)</span>
            <input className="btn" value={name} onChange={e=>setName(e.target.value)} />
          </label>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
            <div className="qm-search" style={{ flex:1 }}>
              <FaSearch/>
              <input placeholder="Search team" value={q} onChange={e=>setQ(e.target.value)} />
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {Array.from(pick).map(id=>{ const u=users.find(x=>x.id===id); if(!u) return null; const initials=u.initials || (u.name||"").split(" ").map(p=>p[0]).join(""); return (
                <span key={id} className="chip" onClick={()=>toggle(id)} title="Remove" style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 8px", borderRadius:999, background:"#0f162b", border:"1px solid #25335d" }}>
                  <span className="qm-avatars">{initials}</span>{u.name}
                </span>
              ); })}
              {!!pick.size && <button className="btn outline" onClick={clearAll} style={{ height:30 }}>Clear</button>}
            </div>
          </div>
          <div style={{ display:"grid", gap:8, maxHeight:"42vh", overflow:"auto", paddingRight:4 }}>
            {filtered.map(u=>{ const initials=u.initials || (u.name||"").split(" ").map(p=>p[0]).join(""); const selected=pick.has(u.id); return (
              <div key={u.id} className={`u-row ${selected?"sel":""}`} onClick={()=>toggle(u.id)} role="button" style={{ display:"flex", alignItems:"center", gap:10, padding:8, border:"1px solid #22325b", borderRadius:10, cursor:"pointer", background:"#0f162b", outline: selected?"2px solid #2b4fd7":"none" }}>
                <input type="checkbox" checked={selected} onChange={()=>toggle(u.id)} onClick={(e)=>e.stopPropagation()} />
                <span className="qm-avatars">{initials}</span>
                <span className="name" style={{ flex:1 }}>{u.name}</span>
              </div>
            ); })}
            {!filtered.length && <div style={{ opacity:.7 }}>No users</div>}
          </div>
        </div>
        <div style={{ display:"flex", justifyContent:"flex-end", gap:8, padding:"10px 6px" }}>
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn primary" disabled={!pick.size || saving} onClick={create}>{saving?"Creating…":"Create"}</button>
        </div>
      </div>
    </div>
  );
}

export default function TopNav() {
  const { setSearch, setPanels, api, data, panels, user, logout } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const [plusOpen, setPlusOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [createKind, setCreateKind] = useState(null);

  // Responsive nav state/refs
  const [moreOpen, setMoreOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(NAV_ITEMS.length);
  const navWrapRef = useRef(null);
  const measureRefs = useRef([]);   // widths of each nav item
  const moreMeasureRef = useRef(null); // width of the More button
  const moreRef = useRef(null);     // dropdown anchor

  const plusRefDesk = useRef(null);
  const avatarRef   = useRef(null);
  // add notifications dropdown ref/state
  const notifRef    = useRef(null);
  const [notifOpen, setNotifOpen] = useState(false);

  // NEW: "Show Read" toggle (persisted)
  const [showRead, setShowRead] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dsm:notifs:showRead") ?? "true"); } catch { return true; }
  });
  useEffect(() => {
    localStorage.setItem("dsm:notifs:showRead", JSON.stringify(showRead));
  }, [showRead]);

  // NEW: per-item clear with undo (id -> timeoutId)
  const [pendingClear, setPendingClear] = useState({});
  // cleanup any timers on unmount
  useEffect(() => {
    return () => {
      Object.values(pendingClear).forEach((t) => t && clearTimeout(t));
    };
  }, [/* on unmount */]);

  const startUndo = (n) => {
    if (!n?.id || pendingClear[n.id]) return;
    const t = setTimeout(async () => {
      try { await api.del("notifications", n.id); } finally {
        setPendingClear((m) => { const x = { ...m }; delete x[n.id]; return x; });
      }
    }, 5000);
    setPendingClear((m) => ({ ...m, [n.id]: t }));
  };
  const undoClear = (id) => {
    const t = pendingClear[id];
    if (t) clearTimeout(t);
    setPendingClear((m) => { const x = { ...m }; delete x[id]; return x; });
  };

  useEffect(() => {
    const onDoc = (e) => {
      const insidePlus = (plusRefDesk.current && plusRefDesk.current.contains(e.target));
      if (!insidePlus) setPlusOpen(false);

      if (avatarRef.current && !avatarRef.current.contains(e.target)) setAvatarOpen(false);
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
      // close notifications dropdown on outside click
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useLayoutEffect(() => {
    function recompute() {
      const wrap = navWrapRef.current;
      if (!wrap) return;

      // Use overflow + "More" below 1640px. At ≥1640px, always show all items.
      const enableMore = window.matchMedia('(max-width: 1639.98px)').matches;
      if (!enableMore) {
        // XL desktop: show all tabs and ensure More is closed/hidden
        setVisibleCount(NAV_ITEMS.length);
        setMoreOpen(false);
        return;
      }

      const avail = wrap.clientWidth;
      const widths = NAV_ITEMS.map((_, i) => measureRefs.current[i]?.offsetWidth || 0);
      const moreW = moreMeasureRef.current?.offsetWidth || 64;

      // Try the largest that fits; if not all fit, reserve space for More
      let k = widths.length;
      for (; k >= 0; k--) {
        let sum = 0;
        for (let i = 0; i < k; i++) sum += widths[i];
        if (k < widths.length) sum += moreW; // room for More if overflowing
        if (sum <= avail) break;
      }
      setVisibleCount(k);
    }

    recompute();
    const on = () => recompute();
    window.addEventListener('resize', on);
    const id = setInterval(recompute, 300); // catch font/label reflows
    return () => { window.removeEventListener('resize', on); clearInterval(id); };
  }, []);

  // Derive 2-letter initials for the avatar from the signed-in user
  const userInitials = React.useMemo(() => {
    const fromField = (v) => (v ? String(v).trim().slice(0, 2).toUpperCase() : "");
    // Prefer explicit initials if provided
    if (user?.initials) {
      const x = fromField(user.initials);
      if (x) return x;
    }
    // Build from name parts (first letters of first and last)
    const name = (user?.name || "").trim();
    if (name) {
      const parts = name.split(/\s+/).filter(Boolean);
      const letters = parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
      if (letters) return letters.slice(0, 2);
      const collapsed = name.replace(/\s+/g, "").slice(0, 2).toUpperCase();
      if (collapsed) return collapsed;
    }
    // Fallbacks
    const id2 = fromField((user?.id || "").replace(/^u-/, ""));
    if (id2) return id2;
    return "ME";
  }, [user]);

  useEffect(() => {
    setPlusOpen(false); setAvatarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const openStudent = () => setCreateKind("student");
    const openFuture  = () => setCreateKind("future");
    const openAlumni  = () => setCreateKind("alumni");
    window.addEventListener("open:add-student", openStudent);
    window.addEventListener("open:add-future", openFuture);
    window.addEventListener("open:add-alumni", openAlumni);
    return () => {
      window.removeEventListener("open:add-student", openStudent);
      window.removeEventListener("open:add-future", openFuture);
      window.removeEventListener("open:add-alumni", openAlumni);
    };
  }, []);

  const NavBtn = ({ to, icon:Icon, label }) => (
    <NavLink to={to} className={({isActive}) => `nav-btn ${isActive ? "active" : ""}`}>
      <div className="ico"><Icon size={18} /></div>
      <div>{label}</div>
    </NavLink>
  );

  const handleCreated = (created) => {
    setCreateKind(null);
    setPlusOpen(false);
    if (created?.id) navigate(`/admin/students/${created.id}`); else navigate("/admin/students");
  };

  // helper: relative time for notifications
  const timeAgo = (ts) => {
    const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  };

  // Compute best link/target for a notification
  const resolveNotifTarget = (n) => {
    if (!n) return null;
    // Highest priority: explicit link, but normalize common placeholders
    if (n.link) {
      let link = String(n.link);
      // Accept patterns like "/admin/students/:id" or "/admin/students:id" or "/admin/students/{id}"
      const sid = n.studentId || n.sid || n.id || "";
      if (/^\/admin\/students(?::id|\{id\})?$/.test(link)) {
        if (sid) return `/admin/students/${sid}`;
      }
      // Replace any :id or {id} tokens anywhere in the string
      if (/:id|\{id\}/.test(link)) {
        if (sid) link = link.replace(/:id|\{id\}/g, sid);
      }
      // Fix accidental missing slash: "/admin/students:id" -> "/admin/students/<id>"
      const m = link.match(/^\/admin\/students:([^/?#]+)(.*)$/);
      if (m) {
        link = `/admin/students/${m[1]}${m[2] || ""}`;
      }
      // If link is just the students collection but we have an id, append it
      if (link === "/admin/students" && sid) {
        link = `/admin/students/${sid}`;
      }
      // Normalize old server links like "/students/:id?..." to the admin route
      if (/^\/students\//.test(link)) {
        link = link.replace(/^\/students\//, "/admin/students/");
      }
      return link;
    }

    // No special query routing for form submissions; handled via onClick state navigation

    // Envelope/doc and other student-scoped notifications
    if (n.studentId) {
      const nk = String(n.kind || "").toLowerCase();
      const tab = ["note", "sms", "email"].includes(nk) ? "activity" : "documents";
      return `/admin/students/${n.studentId}?tab=${tab}`;
    }

    return null;
  };

  // Only show notifications that are global (no 'to') or addressed to me
  const myNotifications = (data?.notifications || []).filter(n => !n.to || String(n.to) === String(user?.id));

  // unread count for red dot indicator (for my notifications only)
  const unreadCount = myNotifications.filter(n => !n.read).length;

  // NEW: filtered + sorted notifications for dropdown
  const notifList = myNotifications
    .filter(n => (showRead ? true : !n.read))
    .slice()
    .sort((a, b) => (b.at || 0) - (a.at || 0));

  // NEW: theme state + persist + apply to <html data-theme="...">
  const [theme, setTheme] = React.useState(() => {
    return localStorage.getItem("dsm:theme") || "dark";
  });

  React.useEffect(() => {
    const t = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("dsm:theme", t);
  }, [theme]);

  return (
    <>
      <header className="topnav" role="navigation" aria-label="Global" data-app-header>
      <div className="top-left">
        <button className="logo" aria-label="DSM Logo" onClick={() => navigate("/admin/dashboard")}>
          <div className="mark">DSM</div>
          <div className="text">Discipleship School of Ministry</div>
        </button>

        <nav className="nav-icons" aria-label="Primary" ref={navWrapRef}>
          {NAV_ITEMS.slice(0, visibleCount).map((it) => (
            <NavBtn key={it.to} to={it.to} icon={it.icon} label={it.label} />
          ))}
          {visibleCount < NAV_ITEMS.length && (
            <div className="more-wrap" ref={moreRef} style={{ position:'relative' }}>
              <button
                className="nav-btn"
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen(v => !v)}
                title="More"
              >
                <div className="ico"><i className="fa-solid fa-bars" /></div>
                <div>More</div>
              </button>
              <div className={`dropdown ${moreOpen ? 'show' : ''}`} role="menu" aria-label="More">
                {NAV_ITEMS.slice(visibleCount).map((it) => (
                  <button key={it.to} className="item" onClick={() => { setMoreOpen(false); navigate(it.to); }}>
                    <it.icon className="mi" /> {it.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </nav>
      </div>

      <div className="top-right">
        <div className="top-actions" style={{ position: "relative" }} ref={plusRefDesk}>
          <button
            className="plus-btn"
            aria-haspopup="menu"
            aria-expanded={plusOpen}
            onClick={()=>setPlusOpen(v=>!v)}
            title="Quick add"
          >
            <FaPlus />
          </button>

          <div className={`dropdown ${plusOpen ? "show" : ""}`} role="menu" aria-label="Quick Add">
            <button className="item" onClick={()=>{ setPlusOpen(false); setCreateKind("student"); }}>
              <FaUserPlus className="mi" /> Add Student
            </button>
            <button className="item" onClick={()=>{ setPlusOpen(false); setCreateKind("future"); }}>
              <FaSeedling className="mi" /> Add Future Applicant
            </button>
            <button className="item" onClick={()=>{ setPlusOpen(false); setCreateKind("alumni"); }}>
              <FaGraduationCap className="mi" /> Add Alumni Record
            </button>
          </div>
        </div>

        <div className="top-search" role="search">
          <div className="magnify" aria-hidden><FaSearch size={14} /></div>
          <input
            placeholder="Search jobs, contacts, tasks, etc."
            onChange={e => setSearch?.(e.target.value)}
          />
        </div>

        <button
          className="icon-btn"
          aria-label="Messages"
          onClick={()=>setPanels(p=>({...p, messages:true}))}
          title="Messages"
        >
          <FaComments />
        </button>

        {/* Notifications with red dot inside the bell button */}
        <div style={{ position: "relative", display: "inline-block" }} ref={notifRef}>
          <button
            className="icon-btn"
            aria-label="Notifications"
            aria-haspopup="menu"
            aria-expanded={notifOpen}
            onClick={() => setNotifOpen(v => !v)}
            title="Notifications"
            style={{ position: "relative" }}
          >
            <FaBell />
            {unreadCount > 0 && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  top: 6,
                  left: 6,
                  width: 8,
                  height: 8,
                  background: "#ff4d4f",
                  borderRadius: "50%",
                }}
              />
            )}
          </button>
          <div className={`dropdown ${notifOpen ? "show" : ""}`} role="menu" aria-label="Notifications">
            <div className="item" style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
              <button className="item" onClick={() => api.markAllNotificationsRead()}>Mark all read</button>
              <button className="item" onClick={() => api.clearNotifications()}>Clear</button>
            </div>

            {/* Notifications count as plain text (not a button/item) */}
            <div style={{ padding: "8px 10px" }}>
              <span style={{ fontSize: 12, opacity: 0.85 }}>Notifications ({unreadCount})</span>
            </div>

            <div className="item" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span>Show Read</span>
              <label style={{ position: "relative", display: "inline-block", width: 38, height: 20 }}>
                <input
                  type="checkbox"
                  checked={showRead}
                  onChange={(e) => setShowRead(e.target.checked)}
                  aria-label="Toggle showing read notifications"
                  style={{ display: "none" }}
                />
                <span
                  aria-hidden
                  style={{
                    position: "absolute", inset: 0, cursor: "pointer",
                    background: showRead ? "#2b4fd7" : "#3a4265",
                    borderRadius: 999, transition: "background .15s",
                  }}
                >
                  <span
                    style={{
                      position: "absolute", top: 2, left: showRead ? 20 : 2,
                      width: 16, height: 16, borderRadius: "50%",
                      background: "#fff", transition: "left .15s",
                    }}
                  />
                </span>
              </label>
            </div>

            {notifList.length ? (
              notifList.map((n) => {
                const isPending = !!pendingClear[n.id];
                if (isPending) {
                  // Undo strip replaces the notification for up to 5s
                  return (
                    <div
                      key={n.id}
                      className="item"
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}
                      title="Notification cleared — undo available for 5s"
                    >
                      <div style={{ display: "grid" }}>
                        <span style={{ fontWeight: 700 }}>Notification cleared</span>
                        <span style={{ opacity: 0.8, fontSize: 12 }}>Tap Undo to restore</span>
                      </div>
                      <button
                        className="btn"
                        onClick={(e) => { e.stopPropagation(); undoClear(n.id); }}
                        title="Undo"
                      >
                        Undo
                      </button>
                    </div>
                  );
                }

                // Normal notification row
                return (
                  <div
                    key={n.id}
                    className="item"
                    role="button"
                    onClick={() => {
                      api.markNotificationRead(n.id);
                      setNotifOpen(false);
                      if (n.action === "open:messages") {
                        setPanels((p) => ({ ...p, messages: true }));
                        return;
                      }
                      if (String(n.kind || "").toLowerCase() === "form-submission") {
                        navigate("/admin/docs-center", { state: { openMode: "form-subs" } });
                        return;
                      }
                      const target = resolveNotifTarget(n);
                      if (target) navigate(target);
                    }}
                    title={n.body || n.title}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
                  >
                    <div style={{ display: "grid" }}>
                      <span style={{ fontWeight: n.read ? 500 : 800 }}>{n.title}</span>
                      {n.body && <span style={{ opacity: 0.8, fontSize: 12 }}>{n.body}</span>}
                      <span style={{ opacity: 0.7, fontSize: 11 }}>{timeAgo(n.at)}</span>
                    </div>
                    {/* NEW: per-item Clear with undo */}
                    <button
                      className="btn"
                      onClick={(e) => { e.stopPropagation(); startUndo(n); }}
                      title="Clear"
                    >
                      Clear
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="item">
                <em>{showRead ? "No notifications" : "No unread notifications"}</em>
              </div>
            )}
          </div>
        </div>

        <div style={{ position:"relative" }} ref={avatarRef}>
          <button
            className="avatar"
            aria-haspopup="menu"
            aria-expanded={avatarOpen}
            onClick={()=>setAvatarOpen(v=>!v)}
            title="Account"
          >
            {userInitials}
          </button>

          <div className={`dropdown ${avatarOpen ? "show" : ""}`} role="menu" aria-label="User Menu">
            <button className="item" onClick={()=>{ setAvatarOpen(false); navigate("/admin/profile"); }}>
              <FaUser className="mi" /> Profile
            </button>
            <button className="item" onClick={()=>{ setAvatarOpen(false); navigate("/admin/password-reset"); }}>
              <FaKey className="mi" /> Password
            </button>
            <button className="item" onClick={()=>{ setAvatarOpen(false); navigate("/admin/teams"); }}>
              <FaUserFriends className="mi" /> Team
            </button>
            <button className="item" onClick={()=>{ setAvatarOpen(false); navigate("/admin/settings"); }}>
              <FaCog className="mi" /> Settings
            </button>
            <button className="item" onClick={()=>{ setAvatarOpen(false); navigate("/admin/docs-center"); }}>
              <FaFileAlt className="mi" /> Documents
            </button>
            {/* <button className="item" onClick={()=>{ setAvatarOpen(false); alert("Automation (placeholder)"); }}>
              <FaRobot className="mi" /> Automation
            </button> */}
            <button
              className="item"
              onClick={() => { setAvatarOpen(false); setTheme("dark"); }}
              title="Switch to Dark mode"
            >
              <FaMoon className="mi" /> Dark mode {theme !== "dark" ? "" : "✓"}
            </button>
            <button
              className="item"
              onClick={() => { setAvatarOpen(false); setTheme("light"); }}
              title="Switch to Light mode"
            >
              <FaSun className="mi" /> Light mode {theme !== "light" ? "" : "✓"}
            </button>
            <div className="sep" />
            <button
              className="item"
              onClick={() => { setAvatarOpen(false); logout(); }}
            >
              <FaSignOutAlt className="mi" /> Logout
            </button>
          </div>
        </div>
      </div>

      {/* Off-screen measurer for nav items */}
      <div style={{ position:'absolute', visibility:'hidden', height:0, overflow:'hidden', pointerEvents:'none' }} aria-hidden>
        {NAV_ITEMS.map((it, i) => (
          <div key={`m-${it.to}`} className="nav-btn" ref={el => (measureRefs.current[i] = el)} style={{ display:'inline-flex' }}>
            <div className="ico"><it.icon size={18} /></div>
            <div>{it.label}</div>
          </div>
        ))}
        <div className="nav-btn" ref={moreMeasureRef} style={{ display:'inline-flex' }}>
          <div className="ico"><i className="fa-solid fa-bars" /></div>
          <div>More</div>
        </div>
      </div>

      {createKind && (
        <AddPersonModal
          kind={createKind}
          api={api}
          dorms={(data?.settings?.dorms || []).map(d => d.name)}
          onClose={()=>setCreateKind(null)}
          onCreated={handleCreated}
        />
      )}
    </header>
      {panels?.messages && (
        <QuickMessagesPanel
          api={api}
          user={user}
          onClose={() => setPanels((p) => ({ ...p, messages: false }))}
        />
      )}
    </>
  );
}
