import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { todayISO } from "../utils/helpers";

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCorners,
  useDroppable
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * Boards (Kanban) with @dnd-kit
 * - FIX: define and wire handleDragStart/End correctly to avoid "handleDragStart is not a function"
 * - FIX: allow dropping into empty lanes and keep "Intake Interview" by persisting `pipeline`
 */

const PIPE = [
  { key: "prospect",  title: "Prospect" },
  { key: "interview", title: "Intake Interview" },
  { key: "accepted",  title: "Accepted (Waitlist)" },
  { key: "phase1",    title: "Current (Phase 1)" },
  { key: "phase2",    title: "Phase 2" },
  { key: "alumni",    title: "Alumni" }
];

export default function Boards(){
  const { api, setToast } = useApp();
  const [students, setStudents] = useState([]);
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(()=>{ (async ()=> setStudents(await api.getAll("students")))(); }, [api]);

  // Determine lane. Prefer explicit pipeline value; otherwise infer from status/phase.
  function laneOf(s){
    if(!s || s.archived) return null;
    if(s.pipeline && PIPE.some(p=>p.key===s.pipeline)) return s.pipeline;
    if(s.status==='Waitlist' || (s.recordType==='Applicant' && s.status!=='Current')) return 'accepted';
    if(s.status==='Current' && (s.phase==='1' || s.phase==='')) return 'phase1';
    if(s.status==='Current' && s.phase==='2') return 'phase2';
    if(s.status==='Alumni' || s.recordType==='Alumni') return 'alumni';
    return 'prospect';
  }

  // Apply lane changes to a student record (optimistic update).
  function applyLane(next, dest){
    const s = { ...next, pipeline: dest };

    if(dest==='prospect'){  s.recordType='Prospect';  s.status='Future Applicant'; s.phase=''; }
    if(dest==='interview'){ s.recordType='Applicant'; s.status='Waitlist';          s.phase=''; }
    if(dest==='accepted'){  s.recordType='Applicant'; s.status='Waitlist';          s.phase=''; }
    if(dest==='phase1'){    s.recordType='Resident';  s.status='Current';           s.phase='1'; }
    if(dest==='phase2'){    s.recordType='Resident';  s.status='Current';           s.phase='2'; }
    if(dest==='alumni'){    s.recordType='Alumni';    s.status='Alumni';            s.exitDate = s.exitDate || todayISO(); }

    s.updatedAt = Date.now();
    return s;
  }

  // Lanes map for rendering
  const lanes = useMemo(()=>{
    const map = Object.fromEntries(PIPE.map(p=>[p.key, []]));
    for(const s of students){
      const k = laneOf(s);
      if(k) map[k].push(s);
    }
    return map;
  }, [students]);

  function laneContainingStudentId(id){
    for(const key of Object.keys(lanes)){
      if(lanes[key].some(s=> s.id===id)) return key;
    }
    return null;
  }

  async function persistMove(id, dest, source){
    try{
      const fromDb = await api.get("students", id);
      const final  = applyLane(fromDb, dest);
      await api.put("students", final);
      await api.logAudit('pipeline-move','student',id,[
        {field:'lane',   before: laneOf(fromDb),  after: dest},
        {field:'status', before: fromDb.status,   after: final.status},
        {field:'phase',  before: fromDb.phase,    after: final.phase}
      ]);
      setToast("Moved card");
    }catch{
      // revert on error
      setStudents(cur => cur.map(x => x.id===id ? applyLane(x, source) : x));
      setToast("Move failed — reverted");
    }
  }

  /* ---- DnD handlers (explicitly named "handle..." to avoid undefined) ---- */
  function handleDragStart(e){ setActiveId(e.active.id); }
  function handleDragOver(){ /* no-op */ }
  function handleDragEnd(e){
    const { active, over } = e;
    setActiveId(null);
    if(!over) return;

    const draggedId = active.id;
    const overId    = over.id;

    const fromLane = laneContainingStudentId(draggedId);
    // over target can be a lane id (empty container) or another card id
    const toLane   = PIPE.some(p=>p.key===overId) ? overId : laneContainingStudentId(overId);
    if(!fromLane || !toLane) return;

    if(fromLane === toLane){
      // Reorder inside same lane
      const ids = lanes[fromLane].map(s=> s.id);
      const oldIndex = ids.indexOf(draggedId);
      const newIndex = PIPE.some(p=>p.key===overId) ? ids.length - 1 : ids.indexOf(overId);
      if(oldIndex === newIndex || newIndex === -1) return;

      const reordered = arrayMove(ids, oldIndex, newIndex);
      setStudents(cur=>{
        const laneStudents = reordered.map(id => cur.find(s=> s.id===id));
        const others = cur.filter(s => laneOf(s)!==fromLane);
        return [...others, ...laneStudents];
      });
      return;
    }

    // Cross-lane move — optimistic UI (works for empty destination lanes)
    setStudents(cur => cur.map(s => s.id===draggedId ? applyLane(s, toLane) : s));
    persistMove(draggedId, toLane, fromLane);
  }

  return (
    <section className="page active" aria-label="Boards">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="kanban">
          {PIPE.map(col=>{
            const laneKey = col.key;
            const items   = lanes[laneKey] || [];
            return (
              <div className="column" key={laneKey}>
                <h4>{col.title}</h4>
                <SortableContext id={laneKey} items={items.map(s=>s.id)} strategy={verticalListSortingStrategy}>
                  <Lane id={laneKey}>
                    {items.map((s)=>(
                      <StudentCard key={s.id} student={s} />
                    ))}
                  </Lane>
                </SortableContext>
              </div>
            );
          })}
        </div>

        <DragOverlay>
          {activeId ? (
            <div className="card-item" style={{boxShadow:"0 10px 24px rgba(0,0,0,.35)"}}>
              {(() => {
                const s = students.find(x=> x.id===activeId);
                return s ? `${s.firstName} ${s.lastName} — ${s.status}${s.phase?` / P${s.phase}`:''}` : "";
              })()}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}

/* ------------------ Droppable Lane + Sortable Card ------------------ */

function Lane({ id, children }){
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`lane ${isOver ? "drag-over" : ""}`}
    >
      {children}
    </div>
  );
}

function StudentCard({ student }){
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: student.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.95 : 1,
    boxShadow: isDragging ? "0 8px 20px rgba(0,0,0,.35)" : "none",
    cursor: "grab"
  };
  return (
    <div ref={setNodeRef} style={style} className="card-item" {...attributes} {...listeners}>
      {student.firstName} {student.lastName} — {student.status}{student.phase?` / P${student.phase}`:''}
    </div>
  );
}
