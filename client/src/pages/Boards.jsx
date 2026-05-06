import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { todayISO } from "../utils/helpers";
import { FaUserGraduate, FaExchangeAlt, FaUserCheck, FaUserClock, FaUserPlus, FaUsers, FaSearch, FaIdCard, FaEllipsisV, FaChevronRight, FaTimes } from "react-icons/fa";

import {
  DndContext, PointerSensor, TouchSensor, KeyboardSensor, 
  useSensor, useSensors, DragOverlay, closestCorners, useDroppable
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const PIPE = [
  { key: "applicant", title: "Applicants", icon: FaIdCard, color: "#6366f1" },
  { key: "accepted",  title: "Waitlist", icon: FaExchangeAlt, color: "#f59e0b" },
  { key: "phase1",    title: "Phase 1", icon: FaUsers, color: "#10b981" },
  { key: "phase2",    title: "Phase 2", icon: FaUserCheck, color: "#3b82f6" },
  { key: "alumni",    title: "Alumni", icon: FaUserGraduate, color: "#ec4899" }
];

export default function Boards() {
  const { api, setToast } = useApp();
  const [students, setStudents] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [searchQ, setSearchQ] = useState("");
  const [moveModal, setMoveModal] = useState(null); // { student, fromLane }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const [activeLane, setActiveLane] = useState(PIPE[0].key);

  useEffect(() => { 
    (async () => setStudents(await api.getAll("students")))(); 
  }, [api]);

  function laneOf(s) {
    if(!s || s.archived) return null;
    if(s.pipeline && PIPE.some(p=>p.key===s.pipeline)) return s.pipeline;
    if(s.status==='Waitlist') return 'accepted';
    if(s.status==='Current' && (s.phase==='1' || s.phase==='')) return 'phase1';
    if(s.status==='Current' && s.phase==='2') return 'phase2';
    if(s.status==='Alumni' || s.recordType==='Alumni') return 'alumni';
    return 'applicant';
  }

  function applyLane(next, dest) {
    const s = { ...next, pipeline: dest };
    if(dest==='applicant'){ s.recordType='Applicant'; s.status='Future Applicant'; s.phase=''; }
    if(dest==='accepted'){  s.recordType='Applicant'; s.status='Waitlist';          s.phase=''; }
    if(dest==='phase1'){    s.recordType='Resident';  s.status='Current';           s.phase='1'; }
    if(dest==='phase2'){    s.recordType='Resident';  s.status='Current';           s.phase='2'; }
    if(dest==='alumni'){    s.recordType='Alumni';    s.status='Alumni';            s.exitDate = s.exitDate || todayISO(); }
    s.updatedAt = Date.now();
    return s;
  }

  const lanes = useMemo(() => {
    const map = Object.fromEntries(PIPE.map(p=>[p.key, []]));
    const q = searchQ.trim().toLowerCase();
    for(const s of students){
      const k = laneOf(s);
      const name = `${s.firstName} ${s.lastName}`.toLowerCase();
      if(k && (!q || name.includes(q))) map[k].push(s);
    }
    return map;
  }, [students, searchQ]);

  function laneContainingStudentId(id) {
    for(const key of Object.keys(lanes)) {
      if(lanes[key].some(s=> s.id===id)) return key;
    }
    return null;
  }

  async function persistMove(id, dest, source) {
    try {
      const fromDb = await api.get("students", id);
      const final  = applyLane(fromDb, dest);
      await api.put("students", final);
      setToast("Board updated");
    } catch {
      setStudents(cur => cur.map(x => x.id===id ? applyLane(x, source) : x));
      setToast("Error: Reverted move");
    }
  }

  function handleDragStart(e) { setActiveId(e.active.id); }
  function handleDragEnd(e) {
    const { active, over } = e;
    setActiveId(null);
    if(!over) return;
    const draggedId = active.id;
    const overId    = over.id;
    const fromLane = laneContainingStudentId(draggedId);
    const toLane   = PIPE.some(p=>p.key===overId) ? overId : laneContainingStudentId(overId);
    if(!fromLane || !toLane) return;
    if(fromLane === toLane) return;
    setStudents(cur => cur.map(s => s.id===draggedId ? applyLane(s, toLane) : s));
    persistMove(draggedId, toLane, fromLane);
  }

  return (
    <section className="brd-page fade-in">
      <style>{BRD_CSS}</style>
      
      <header className="brd-header">
        <div>
          <h1 className="brd-title">Student Pipeline</h1>
          <p className="brd-subtitle">Track journey from applicant to graduate.</p>
        </div>
        <div className="brd-search">
          <FaSearch />
          <input placeholder="Quick filter cards..." value={searchQ} onChange={e=>setSearchQ(e.target.value)} />
        </div>
      </header>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="brd-mobile-nav">
          {PIPE.map(col => (
            <button 
              key={col.key} 
              className={`brd-nav-item ${activeLane === col.key ? 'active' : ''}`}
              onClick={() => setActiveLane(col.key)}
            >
              <col.icon />
              <span>{col.title}</span>
              {lanes[col.key]?.length > 0 && <span className="m-count">{lanes[col.key].length}</span>}
            </button>
          ))}
        </div>

        <div className="brd-kanban">
          {PIPE.map(col => (
            <div className={`brd-column ${activeLane === col.key ? 'm-active' : ''}`} key={col.key}>
              <div className="brd-column-head" style={{ borderTopColor: col.color }}>
                <col.icon style={{ color: col.color }} />
                <h4>{col.title}</h4>
                <span className="count">{lanes[col.key]?.length || 0}</span>
              </div>
              <SortableContext id={col.key} items={lanes[col.key]?.map(s=>s.id) || []} strategy={verticalListSortingStrategy}>
                <Lane id={col.key}>
                  {(lanes[col.key] || []).length === 0 ? (
                    <div className="empty-lane-hint">No students in this phase.</div>
                  ) : (
                    (lanes[col.key] || []).map(s => (
                      <StudentCard 
                        key={s.id} 
                        student={s} 
                        color={col.color} 
                        onMoveClick={() => setMoveModal({ student: s, fromLane: col.key })}
                      />
                    ))
                  )}
                </Lane>
              </SortableContext>
            </div>
          ))}
        </div>

        <DragOverlay>
          {activeId ? <div className="card-overlay">Moving Record...</div> : null}
        </DragOverlay>
      </DndContext>

      {/* Move Stage Modal */}
      {moveModal && (
        <div className="dsm-modal-overlay" onClick={() => setMoveModal(null)}>
          <div className="dsm-modal-card move-stage-modal" onClick={e => e.stopPropagation()}>
            <header className="dsm-modal-header">
              <h3>Change Pipeline Stage</h3>
              <button className="dsm-close-btn" onClick={() => setMoveModal(null)}><FaTimes /></button>
            </header>
            <div className="dsm-modal-body">
              <div className="move-subject">
                <div className="subj-label">Moving Student</div>
                <div className="subj-name">{moveModal.student.firstName} {moveModal.student.lastName}</div>
                <div className="subj-current">
                  Currently in <strong>{PIPE.find(p=>p.key===moveModal.fromLane)?.title}</strong>
                </div>
              </div>

              <div className="move-grid">
                {PIPE.map(p => {
                  const isCurrent = p.key === moveModal.fromLane;
                  return (
                    <button 
                      key={p.key} 
                      className={`move-opt-card ${isCurrent ? 'current' : ''}`}
                      disabled={isCurrent}
                      onClick={async () => {
                        const s = moveModal.student;
                        const dest = p.key;
                        const from = moveModal.fromLane;
                        setStudents(cur => cur.map(x => x.id === s.id ? applyLane(x, dest) : x));
                        setMoveModal(null);
                        await persistMove(s.id, dest, from);
                      }}
                    >
                      <div className="opt-icon" style={{ background: p.color + '15', color: p.color }}><p.icon /></div>
                      <div className="opt-label">{p.title}</div>
                      {isCurrent && <div className="curr-badge">Current</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Lane({ id, children }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`brd-lane ${isOver ? "drag-over" : ""}`}>
      {children}
      <div className="lane-spacer" />
    </div>
  );
}

function StudentCard({ student, color, onMoveClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: student.id });
  const initials = (student.firstName?.[0] || "") + (student.lastName?.[0] || "");
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    cursor: "grab"
  };

  return (
    <div ref={setNodeRef} style={style} className="brd-card" {...attributes} {...listeners}>
      <div className="brd-card-top">
        <div className="brd-card-av" style={{ background: color }}>{initials}</div>
        <div className="brd-card-details">
          <div className="name">{student.firstName} {student.lastName}</div>
          <div className="meta">{student.recordType || 'Student'}</div>
        </div>
        
        <button 
          className="brd-kebab" 
          onClick={(e) => { e.stopPropagation(); onMoveClick(); }}
          title="Move Student"
        >
          <FaEllipsisV />
        </button>
      </div>
      {student.phase && (
        <div className="brd-card-badge">Phase {student.phase}</div>
      )}
    </div>
  );
}

const BRD_CSS = `
  .brd-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
  .brd-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 0 32px; }
  .brd-title { font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -0.5px; }
  .brd-subtitle { color: var(--text-muted); margin: 4px 0 0; font-size: 15px; font-weight: 500; }

  .brd-search { position: relative; width: 300px; }
  .brd-search svg { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
  .brd-search input { width: 100%; padding: 10px 14px 10px 40px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); outline: none; transition: 0.2s; font-size: 14px; color: var(--text); }
  .brd-search input:focus { border-color: var(--primary); box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }

  .brd-mobile-nav { display: none; }
  .brd-kanban { flex: 1; display: grid; grid-template-columns: repeat(5, 1fr); gap: 20px; overflow-x: auto; padding-bottom: 20px; min-height: 0; }
  
  .brd-column { display: flex; flex-direction: column; min-width: 240px; background: var(--bg); border-radius: 20px; border: 1px solid var(--border); overflow: hidden; }
  .brd-column-head { display: flex; align-items: center; gap: 10px; padding: 16px 20px; background: var(--surface); border-bottom: 1px solid var(--border); border-top: 4px solid #6366f1; }
  .brd-column-head h4 { margin: 0; font-size: 14px; font-weight: 800; flex: 1; color: var(--text); }
  .brd-column-head .count { background: var(--bg); padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 800; color: var(--text-muted); }

  .brd-lane { flex: 1; padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; transition: background 0.2s; }
  .brd-lane.drag-over { background: rgba(99, 102, 241, 0.05); }
  .lane-spacer { min-height: 60px; }
  .empty-lane-hint { padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 13px; font-style: italic; opacity: 0.6; }

  .brd-card { background: var(--surface); border-radius: 16px; padding: 16px; border: 1px solid var(--border); box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: all 0.2s; position: relative; }
  .brd-card:hover { transform: translateY(-2px); border-color: var(--primary); box-shadow: var(--shadow-lg); }
  
  .brd-card-top { display: flex; align-items: center; gap: 12px; }
  .brd-card-av { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; color: white; font-weight: 800; font-size: 12px; flex-shrink: 0; }
  .brd-card-details { flex: 1; min-width: 0; }
  .brd-card-details .name { font-size: 14px; font-weight: 700; color: var(--text); line-height: 1.2; }
  .brd-card-details .meta { font-size: 11px; font-weight: 600; color: var(--text-muted); margin-top: 2px; }
  .brd-card-handle { margin-left: auto; color: var(--text-muted); opacity: 0.4; font-size: 12px; }
  
  .brd-card-badge { margin-top: 12px; display: inline-block; padding: 4px 8px; background: var(--bg); color: var(--text-muted); border-radius: 6px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid var(--border); }

  .brd-card-actions { position: relative; margin-left: auto; z-index: 10; }
  .brd-kebab { 
    width: 32px; height: 32px; display: grid; place-items: center; 
    border-radius: 8px; color: var(--text-muted); transition: 0.2s;
    background: transparent; border: none; cursor: pointer;
  }
  .brd-kebab:hover, .brd-kebab.active { background: var(--bg); color: var(--primary); }

  .move-stage-modal { max-width: 440px; }
  .move-subject { background: var(--bg); padding: 20px; border-radius: 16px; margin-bottom: 24px; border: 1px solid var(--border); }
  .subj-label { font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; letter-spacing: 0.5px; }
  .subj-name { font-size: 18px; font-weight: 800; color: var(--text); margin-bottom: 4px; }
  .subj-current { font-size: 13px; color: var(--text-muted); }
  .subj-current strong { color: var(--primary); }

  .move-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .move-opt-card { 
    display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 20px 12px; 
    background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
    transition: all 0.2s; cursor: pointer; position: relative;
  }
  .move-opt-card:not(:disabled):hover { border-color: var(--primary); transform: translateY(-2px); box-shadow: var(--shadow-md); }
  .move-opt-card:disabled { opacity: 0.5; cursor: not-allowed; border-style: dashed; }
  .move-opt-card.current { background: var(--bg); }
  .opt-icon { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; font-size: 18px; }
  .opt-label { font-size: 13px; font-weight: 700; color: var(--text); }
  .curr-badge { position: absolute; top: 8px; right: 8px; font-size: 9px; font-weight: 800; padding: 2px 6px; background: var(--primary); color: white; border-radius: 4px; text-transform: uppercase; }

  .card-overlay { padding: 16px; background: var(--primary); color: white; border-radius: 16px; font-weight: 800; font-size: 14px; box-shadow: var(--shadow-lg); opacity: 0.9; }

  @media (max-width: 1400px) {
    .brd-kanban { grid-template-columns: repeat(2, 1fr); }
  }

  @media (max-width: 800px) {
    .brd-header { flex-direction: column; align-items: stretch; gap: 12px; padding-bottom: 18px; }
    .brd-search { width: 100%; }
    .brd-title { font-size: 24px; }

    .brd-mobile-nav { 
      display: flex; gap: 8px; overflow-x: auto; padding: 4px 0 20px; 
      margin-bottom: 8px; border-bottom: 1px solid var(--border);
      -webkit-overflow-scrolling: touch;
    }
    .brd-nav-item { 
      display: flex; align-items: center; gap: 8px; padding: 10px 16px; 
      background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
      white-space: nowrap; font-size: 13px; font-weight: 700; color: var(--text-muted);
      transition: 0.2s; cursor: pointer; position: relative;
    }
    .brd-nav-item.active { background: var(--primary); color: white; border-color: var(--primary); box-shadow: var(--shadow-brand); }
    .brd-nav-item .m-count { font-size: 10px; padding: 2px 6px; background: rgba(0,0,0,0.1); border-radius: 6px; margin-left: 4px; }
    .brd-nav-item.active .m-count { background: rgba(255,255,255,0.2); }

    .brd-kanban { display: flex; flex-direction: column; overflow: visible; height: auto; grid-template-columns: none; }
    .brd-column { display: none; margin-bottom: 24px; min-height: 300px; min-width: 0; }
    .brd-column.m-active { display: flex; }
    
    .brd-card { padding: 18px; border-radius: 20px; }
    .brd-card-av { width: 44px; height: 44px; font-size: 14px; }
    .brd-card-details .name { font-size: 16px; }
  }
`;
