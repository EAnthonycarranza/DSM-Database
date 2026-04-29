import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { todayISO } from "../utils/helpers";
import { FaUserGraduate, FaExchangeAlt, FaUserCheck, FaUserClock, FaUserPlus, FaUsers, FaSearch, FaIdCard } from "react-icons/fa";

import {
  DndContext, PointerSensor, useSensor, useSensors, DragOverlay, 
  closestCorners, useDroppable
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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
        <div className="brd-kanban">
          {PIPE.map(col => (
            <div className="brd-column" key={col.key}>
              <div className="brd-column-head" style={{ borderTopColor: col.color }}>
                <col.icon style={{ color: col.color }} />
                <h4>{col.title}</h4>
                <span className="count">{lanes[col.key]?.length || 0}</span>
              </div>
              <SortableContext id={col.key} items={lanes[col.key]?.map(s=>s.id) || []} strategy={verticalListSortingStrategy}>
                <Lane id={col.key}>
                  {(lanes[col.key] || []).map(s => <StudentCard key={s.id} student={s} color={col.color} />)}
                </Lane>
              </SortableContext>
            </div>
          ))}
        </div>

        <DragOverlay>
          {activeId ? <div className="card-overlay">Moving Record...</div> : null}
        </DragOverlay>
      </DndContext>
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

function StudentCard({ student, color }) {
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

  .brd-kanban { flex: 1; display: grid; grid-template-columns: repeat(5, 1fr); gap: 20px; overflow-x: auto; padding-bottom: 20px; min-height: 0; }
  
  .brd-column { display: flex; flex-direction: column; min-width: 240px; background: var(--bg); border-radius: 20px; border: 1px solid var(--border); overflow: hidden; }
  
  .brd-column-head { display: flex; align-items: center; gap: 10px; padding: 16px 20px; background: var(--surface); border-bottom: 1px solid var(--border); border-top: 4px solid #6366f1; }
  .brd-column-head h4 { margin: 0; font-size: 14px; font-weight: 800; flex: 1; color: var(--text); }
  .brd-column-head .count { background: var(--bg); padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 800; color: var(--text-muted); }

  .brd-lane { flex: 1; padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; transition: background 0.2s; }
  .brd-lane.drag-over { background: rgba(99, 102, 241, 0.05); }
  .lane-spacer { min-height: 60px; }

  .brd-card { background: var(--surface); border-radius: 16px; padding: 16px; border: 1px solid var(--border); box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: all 0.2s; position: relative; }
  .brd-card:hover { transform: translateY(-2px); border-color: var(--primary); box-shadow: var(--shadow-lg); }
  
  .brd-card-top { display: flex; align-items: center; gap: 12px; }
  .brd-card-av { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; color: white; font-weight: 800; font-size: 12px; flex-shrink: 0; }
  .brd-card-details .name { font-size: 14px; font-weight: 700; color: var(--text); line-height: 1.2; }
  .brd-card-details .meta { font-size: 11px; font-weight: 600; color: var(--text-muted); margin-top: 2px; }
  
  .brd-card-badge { margin-top: 12px; display: inline-block; padding: 4px 8px; background: var(--bg); color: var(--text-muted); border-radius: 6px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid var(--border); }

  .card-overlay { padding: 16px; background: var(--primary); color: white; border-radius: 16px; font-weight: 800; font-size: 14px; box-shadow: var(--shadow-lg); }

  @media (max-width: 1400px) {
    .brd-kanban { grid-template-columns: repeat(2, 1fr); }
  }

  @media (max-width: 900px) {
    .brd-header { flex-direction: column; align-items: stretch; gap: 12px; padding-bottom: 18px; }
    .brd-search { width: 100%; }
    .brd-search input { padding: 12px 14px 12px 40px; font-size: 16px; min-height: 46px; }

    /* Horizontal-scroll Kanban — natural mobile pattern */
    .brd-kanban {
      grid-template-columns: none;
      grid-auto-flow: column;
      grid-auto-columns: 78vw;
      gap: 14px;
      padding-bottom: 14px;
      -webkit-overflow-scrolling: touch;
      scroll-snap-type: x mandatory;
    }
    .brd-column { min-width: 0; scroll-snap-align: start; }
    .brd-column-head { padding: 14px 16px; }
    .brd-card { padding: 14px; border-radius: 14px; }
    .brd-card:hover { transform: none; }
    .brd-title { font-size: 22px; }
    .brd-subtitle { font-size: 13px; }
  }

  @media (max-width: 480px) {
    .brd-kanban { grid-auto-columns: 86vw; }
  }
`;
