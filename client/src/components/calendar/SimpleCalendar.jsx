// src/components/calendar/SimpleCalendar.jsx
import React, { useMemo, useState, useRef, useEffect } from "react";
import { useApp } from "../../context/AppContext";
import { 
  FaChevronLeft, FaChevronRight, FaCalendarDay, FaCalendarWeek, 
  FaCalendarDays, FaPlus, FaClock, FaLocationDot, FaTag, 
  FaUserGroup, FaXmark, FaFloppyDisk, FaTrashCan, FaPenToSquare,
  FaCheck, FaRepeat
} from "react-icons/fa6";

/* ============================================================================
   Helpers
   ============================================================================ */
const uuid = () => crypto.randomUUID?.() || Math.random().toString(36).slice(2);
const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const minutesOfDay = (d) => d.getHours() * 60 + d.getMinutes();
const startOfWeek = (d) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0,0,0,0); return x; };
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const fmt12 = (mins) => { 
  let h = Math.floor(mins / 60); 
  const m = mins % 60; 
  const am = h < 12; 
  const h12 = h % 12 === 0 ? 12 : h % 12; 
  return `${h12}:${pad(m)} ${am ? "AM" : "PM"}`; 
};

const styleForCategory = (color = "#6366f1", alpha = 0.15) => ({
  backgroundColor: `rgba(${parseInt(color.slice(1,3),16)}, ${parseInt(color.slice(3,5),16)}, ${parseInt(color.slice(5,7),16)}, ${alpha})`,
  borderColor: color,
  color: color
});

/**
 * Expands recurring events into instances for a given range.
 * Supported rules: { frequency: 'daily'|'weekly'|'monthly'|'yearly',
 *   interval?: number, byDay?: ['MO'..'SU'], until?: ISOString, count?: number }
 */
function getInstances(events, rangeStart, rangeEnd) {
  const instances = [];
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  const dayMap = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  const pushInstance = (ev, instanceStart, duration) => {
    const instanceEnd = new Date(instanceStart.getTime() + duration);
    instances.push({
      ...ev,
      id: `${ev.id}-${instanceStart.getTime()}`,
      masterId: ev.id,
      start: instanceStart.toISOString(),
      end: instanceEnd.toISOString(),
      _isInstance: true,
    });
  };

  for (const ev of events) {
    const evStart = new Date(ev.start);
    const evEnd = ev.end ? new Date(ev.end) : new Date(evStart.getTime() + 3600000);
    const duration = evEnd.getTime() - evStart.getTime();

    if (!ev.recurrence) {
      if (evStart.getTime() < endMs && evEnd.getTime() > startMs) {
        instances.push({ ...ev, _isInstance: false });
      }
      continue;
    }

    const rec = ev.recurrence;
    const interval = Math.max(1, rec.interval || 1);
    const untilMs = rec.until ? new Date(rec.until).getTime() : Infinity;
    const maxCount = rec.count ? Math.max(1, rec.count) : Infinity;
    const hardStop = Math.min(endMs, untilMs);

    const freq = rec.frequency;
    const MAX_ITER = 800; // generous bound

    if (freq === 'daily') {
      let occurrence = 0;
      for (let i = 0; i < MAX_ITER; i++) {
        const d = new Date(evStart);
        d.setDate(d.getDate() + i * interval);
        if (d.getTime() >= hardStop) break;
        if (++occurrence > maxCount) break;
        if (d.getTime() + duration > startMs) pushInstance(ev, d, duration);
      }
    } else if (freq === 'weekly') {
      const days = rec.byDay && rec.byDay.length ? rec.byDay.map(d => dayMap[d]) : [evStart.getDay()];
      // Iterate week by week from the event's start week
      const firstWeek = startOfWeek(evStart);
      let occurrence = 0;
      for (let w = 0; w < MAX_ITER; w++) {
        const weekBase = new Date(firstWeek);
        weekBase.setDate(weekBase.getDate() + w * 7 * interval);
        if (weekBase.getTime() > hardStop + 7 * 86400000) break;
        for (let off = 0; off < 7; off++) {
          const d = new Date(weekBase);
          d.setDate(d.getDate() + off);
          if (!days.includes(d.getDay())) continue;
          if (d.getTime() < evStart.getTime() - 86400000) continue;
          d.setHours(evStart.getHours(), evStart.getMinutes(), evStart.getSeconds(), 0);
          if (d.getTime() >= hardStop) { off = 7; break; }
          if (++occurrence > maxCount) { w = MAX_ITER; break; }
          if (d.getTime() + duration > startMs) pushInstance(ev, d, duration);
        }
      }
    } else if (freq === 'monthly') {
      let occurrence = 0;
      for (let i = 0; i < MAX_ITER; i++) {
        const d = new Date(evStart);
        d.setMonth(d.getMonth() + i * interval);
        if (d.getTime() >= hardStop) break;
        if (++occurrence > maxCount) break;
        if (d.getTime() + duration > startMs) pushInstance(ev, d, duration);
      }
    } else if (freq === 'yearly') {
      let occurrence = 0;
      for (let i = 0; i < MAX_ITER; i++) {
        const d = new Date(evStart);
        d.setFullYear(d.getFullYear() + i * interval);
        if (d.getTime() >= hardStop) break;
        if (++occurrence > maxCount) break;
        if (d.getTime() + duration > startMs) pushInstance(ev, d, duration);
      }
    }
  }
  return instances;
}

/* ============================================================================
   Main Calendar Component
   ============================================================================ */
export default function SimpleCalendar({
  initialDate = new Date(),
  initialCategories = [
    { id: "default", name: "General", color: "#6366f1" },
    { id: "meeting", name: "Meeting", color: "#10b981" },
    { id: "class", name: "Class", color: "#f59e0b" },
  ],
  onCreate, onUpdate, onDelete
}) {
  const { data, api, ready, setToast } = useApp();
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(startOfDay(initialDate));
  const [categories, setCategories] = useState(initialCategories);
  const [modal, setModal] = useState(null);

  const rawEvents = ready ? (data.events || []) : [];
  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);

  // Compute instances based on current view range
  const instances = useMemo(() => {
    let start, end;
    if (view === 'month') {
      start = startOfWeek(startOfMonth(cursor));
      end = addDays(start, 42);
    } else if (view === 'week') {
      start = startOfWeek(cursor);
      end = addDays(start, 7);
    } else {
      start = startOfDay(cursor);
      end = addDays(start, 1);
    }
    return getInstances(rawEvents, start, end);
  }, [rawEvents, cursor, view]);

  const goPrev = () => setCursor(prev => view === "month" ? addMonths(prev, -1) : addDays(prev, view === "week" ? -7 : -1));
  const goNext = () => setCursor(prev => view === "month" ? addMonths(prev, 1) : addDays(prev, view === "week" ? 7 : 1));
  const goToday = () => setCursor(startOfDay(new Date()));

  const handleSave = async (payload) => {
    try {
      if (modal.mode === "create") {
        const created = await api.add("events", payload);
        onCreate?.(created);
      } else {
        // If it's a recurring instance, we update the master
        const toSave = payload.masterId ? rawEvents.find(e => e.id === payload.masterId) : payload;
        if (payload.masterId) {
          // Note: Full recurring series update logic would go here. 
          // For now, we update the master record.
          Object.assign(toSave, { title: payload.title, location: payload.location, categoryId: payload.categoryId });
        }
        await api.put("events", toSave);
        onUpdate?.(toSave);
      }
      setModal(null);
      setToast("Schedule synchronized");
    } catch { setToast({ type: 'error', text: "Sync failed" }); }
  };

  const handleDelete = async (ev) => {
    if (!window.confirm("Permanently delete this event?")) return;
    const targetId = ev.masterId || ev.id;
    try {
      await api.del("events", targetId);
      onDelete?.(targetId);
      setModal(null);
      setToast("Event removed");
    } catch { setToast({ type: 'error', text: "Delete failed" }); }
  };

  return (
    <div className="sc-workspace fade-in">
      <style>{CAL_CSS}</style>
      
      <header className="sc-toolbar">
        <div className="sc-nav-group">
          <button className="sc-btn-icon" onClick={goPrev}><FaChevronLeft /></button>
          <button className="sc-btn-today" onClick={goToday}>Today</button>
          <button className="sc-btn-icon" onClick={goNext}><FaChevronRight /></button>
          <h2 className="sc-cursor-title">
            {cursor.toLocaleString(undefined, { 
              month: 'long', 
              year: 'numeric', 
              day: view === 'month' ? undefined : 'numeric' 
            })}
          </h2>
        </div>

        <div className="sc-view-switcher">
          {["day", "week", "month"].map(v => (
            <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
              {v === 'day' && <FaCalendarDay />}
              {v === 'week' && <FaCalendarWeek />}
              {v === 'month' && <FaCalendarDays />}
              <span>{v.charAt(0).toUpperCase() + v.slice(1)}</span>
            </button>
          ))}
        </div>

        <button className="sc-btn-primary" onClick={() => setModal({ mode: "create", draft: { title: "", start: new Date().toISOString(), categoryId: categories[0].id } })}>
          <FaPlus /> <span>New Event</span>
        </button>
      </header>

      <main className="sc-content">
        {view === "month" && (
          <MonthView 
            cursor={cursor} 
            events={instances} 
            catById={catById} 
            onDayClick={(d) => setModal({ mode: "create", draft: { title: "", start: d.toISOString(), allDay: true, categoryId: categories[0].id } })} 
            onEventClick={(ev) => setModal({ mode: "edit", draft: ev })} 
          />
        )}
        {view === "week" && (
          <WeekView 
            cursor={cursor} 
            events={instances} 
            catById={catById} 
            onGridClick={(d, mins, endMins) => {
              const start = new Date(d);
              start.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
              const end = new Date(d);
              const finalEndMins = endMins || (mins + 60);
              end.setHours(Math.floor(finalEndMins / 60), finalEndMins % 60, 0, 0);
              setModal({ mode: "create", draft: { title: "", start: start.toISOString(), end: end.toISOString(), categoryId: categories[0].id } });
            }}
            onEventClick={(ev) => setModal({ mode: "edit", draft: ev })}
          />
        )}
        {view === "day" && (
          <DayView 
            cursor={cursor} 
            events={instances} 
            catById={catById} 
            onGridClick={(mins, endMins) => {
              const start = new Date(cursor);
              start.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
              const end = new Date(cursor);
              const finalEndMins = endMins || (mins + 60);
              end.setHours(Math.floor(finalEndMins / 60), finalEndMins % 60, 0, 0);
              setModal({ mode: "create", draft: { title: "", start: start.toISOString(), end: end.toISOString(), categoryId: categories[0].id } });
            }}
            onEventClick={(ev) => setModal({ mode: "edit", draft: ev })}
          />
        )}
      </main>

      {modal && (
        <EventModal 
          mode={modal.mode} 
          initial={modal.draft} 
          categories={categories} 
          onSave={handleSave} 
          onDelete={() => handleDelete(modal.draft)} 
          onClose={() => setModal(null)} 
        />
      )}
    </div>
  );
}

/* ============================================================================
   Views
   ============================================================================ */

function MonthView({ cursor, events, catById, onDayClick, onEventClick }) {
  const start = startOfWeek(startOfMonth(cursor));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const [expanded, setExpanded] = useState(null); // { dayKey, events }

  const handleCellMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  // Group events per day key for stable rendering
  const byDay = useMemo(() => {
    const map = new Map();
    for (const ev of events) {
      const key = toYmd(new Date(ev.start));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
    // sort by start time
    map.forEach(list => list.sort((a, b) => new Date(a.start) - new Date(b.start)));
    return map;
  }, [events]);

  const MAX_VISIBLE = 3;

  return (
    <div className="month-grid">
      <div className="day-names">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(n => <div key={n}>{n}</div>)}
      </div>
      <div className="cells">
        {days.map(d => {
          const key = toYmd(d);
          const isToday = sameDay(d, new Date());
          const isDim = d.getMonth() !== cursor.getMonth();
          const dayEvents = byDay.get(key) || [];
          const extra = Math.max(0, dayEvents.length - MAX_VISIBLE);

          return (
            <div
              key={key}
              className={`cell ${isToday ? 'today' : ''} ${isDim ? 'dim' : ''}`}
              onClick={() => onDayClick(d)}
              onMouseMove={handleCellMove}
            >
              <div className="cell-glow" aria-hidden />
              <div className="cell-head">
                <span className="date">{d.getDate()}</span>
                {dayEvents.length > 0 && <span className="count-dot" title={`${dayEvents.length} event(s)`}>{dayEvents.length}</span>}
              </div>
              <div className="event-stack">
                {dayEvents.slice(0, MAX_VISIBLE).map(ev => {
                  const color = catById[ev.categoryId]?.color || "#6366f1";
                  const s = new Date(ev.start);
                  return (
                    <button
                      key={ev.id}
                      className="chip"
                      style={styleForCategory(color, 0.14)}
                      onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                      title={`${ev.title || 'Untitled'}${ev.allDay ? '' : ' — ' + fmt12(minutesOfDay(s))}`}
                    >
                      <span className="chip-dot" style={{ background: color }} />
                      {ev.recurrence && <FaRepeat className="chip-icon" />}
                      {!ev.allDay && <span className="chip-time">{fmt12(minutesOfDay(s)).replace(':00','')}</span>}
                      <span className="chip-title">{ev.title || "Untitled"}</span>
                    </button>
                  );
                })}
                {extra > 0 && (
                  <button
                    className="more"
                    onClick={(e) => { e.stopPropagation(); setExpanded({ key, day: d, events: dayEvents }); }}
                  >
                    +{extra} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {expanded && (
        <div className="day-popover-overlay" onClick={() => setExpanded(null)}>
          <div className="day-popover" onClick={(e) => e.stopPropagation()}>
            <header>
              <div>
                <div className="pop-dow">{expanded.day.toLocaleDateString(undefined, { weekday: 'long' })}</div>
                <div className="pop-date">{expanded.day.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</div>
              </div>
              <button className="close-btn" onClick={() => setExpanded(null)}><FaXmark /></button>
            </header>
            <div className="pop-list">
              {expanded.events.map(ev => {
                const color = catById[ev.categoryId]?.color || "#6366f1";
                const s = new Date(ev.start);
                const e = new Date(ev.end || s.getTime() + 3600000);
                return (
                  <button
                    key={ev.id}
                    className="pop-item"
                    style={{ '--cat-color': color }}
                    onClick={() => { onEventClick(ev); setExpanded(null); }}
                  >
                    <span className="pop-dot" />
                    <span className="pop-title">
                      {ev.recurrence && <FaRepeat style={{ fontSize: 10, marginRight: 6, opacity: 0.6 }} />}
                      {ev.title || 'Untitled'}
                    </span>
                    {!ev.allDay && <span className="pop-time">{fmt12(minutesOfDay(s))} – {fmt12(minutesOfDay(e))}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WeekView({ cursor, events, catById, onGridClick, onEventClick }) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const [drag, setDrag] = useState(null);

  const handlePointerDown = (e, day) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    let y = e.clientY - rect.top;
    y = Math.round(y / 15) * 15;
    setDrag({ day, startY: y, currentY: y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    let y = e.clientY - rect.top;
    y = Math.round(y / 15) * 15;
    if (!drag) {
      y = Math.max(0, Math.min(y, 1440 - 60));
      e.currentTarget.style.setProperty('--hover-top', `${y}px`);
      return;
    }
    setDrag(prev => ({ ...prev, currentY: Math.max(0, Math.min(y, 1440)) }));
  };

  const handlePointerUp = (e) => {
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const startMins = Math.floor((Math.min(drag.startY, drag.currentY) / rect.height) * 1440);
    const endMins = Math.floor((Math.max(drag.startY, drag.currentY) / rect.height) * 1440);
    const finalEnd = Math.max(endMins, startMins + 15);
    onGridClick(drag.day, startMins, finalEnd);
    setDrag(null);
  };

  return (
    <div className="timeline-view">
      <div className="timeline-head">
        <div className="gutter-space" />
        {days.map(d => (
          <div key={toYmd(d)} className={`head-col ${sameDay(d, new Date()) ? 'today' : ''}`}>
            <span className="day-name">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
            <span className="day-date">{d.getDate()}</span>
          </div>
        ))}
      </div>
      <div className="timeline-body">
        <div className="time-gutter">
          {Array.from({ length: 24 }, (_, i) => (
            <div key={i} className="hour-marker">{i === 0 ? null : <span>{fmt12(i * 60)}</span>}</div>
          ))}
        </div>
        <div className="grid-cols">
          {days.map(d => (
            <div 
              key={toYmd(d)} 
              className="grid-col" 
              onPointerDown={(e) => handlePointerDown(e, d)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {drag && sameDay(drag.day, d) && (
                <div className="drag-selection" style={{
                  top: Math.min(drag.startY, drag.currentY),
                  height: Math.max(Math.abs(drag.currentY - drag.startY), 2)
                }} />
              )}
              {events.filter(ev => !ev.allDay && sameDay(new Date(ev.start), d)).map(ev => {
                const s = new Date(ev.start);
                const e = new Date(ev.end || s.getTime() + 3600000);
                const top = (minutesOfDay(s) / 1440) * 100;
                const height = Math.max(((minutesOfDay(e) - minutesOfDay(s)) / 1440) * 100, 1.5);
                return (
                  <div key={ev.id} className="time-event" style={{ ...styleForCategory(catById[ev.categoryId]?.color, 0.2), top: `${top}%`, height: `${height}%` }} onClick={() => onEventClick(ev)}>
                    <div className="title">
                      {ev.recurrence && <FaRepeat style={{ fontSize: 8, marginRight: 4 }} />}
                      {ev.title}
                    </div>
                    <div className="time">{fmt12(minutesOfDay(s))}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DayView({ cursor, events, catById, onGridClick, onEventClick }) {
  const isToday = sameDay(cursor, new Date());
  const [drag, setDrag] = useState(null);

  const handlePointerDown = (e) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    let y = e.clientY - rect.top;
    y = Math.round(y / 15) * 15;
    setDrag({ startY: y, currentY: y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    let y = e.clientY - rect.top;
    y = Math.round(y / 15) * 15;
    if (!drag) {
      y = Math.max(0, Math.min(y, 1440 - 60));
      e.currentTarget.style.setProperty('--hover-top', `${y}px`);
      return;
    }
    setDrag(prev => ({ ...prev, currentY: Math.max(0, Math.min(y, 1440)) }));
  };

  const handlePointerUp = (e) => {
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const startMins = Math.floor((Math.min(drag.startY, drag.currentY) / rect.height) * 1440);
    const endMins = Math.floor((Math.max(drag.startY, drag.currentY) / rect.height) * 1440);
    const finalEnd = Math.max(endMins, startMins + 15);
    onGridClick(startMins, finalEnd);
    setDrag(null);
  };
  
  return (
    <div className="timeline-view single-day">
      <div className="timeline-head">
        <div className="gutter-space" />
        <div className={`head-col ${isToday ? 'today' : ''}`}>
          <span className="day-name">{cursor.toLocaleDateString(undefined, { weekday: 'long' })}</span>
          <span className="day-date">{cursor.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</span>
        </div>
      </div>
      <div className="timeline-body">
        <div className="time-gutter">
          {Array.from({ length: 24 }, (_, i) => (
            <div key={i} className="hour-marker">{i === 0 ? null : <span>{fmt12(i * 60)}</span>}</div>
          ))}
        </div>
        <div className="grid-cols">
          <div
            className="grid-col" 
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {drag && (
              <div className="drag-selection" style={{
                top: Math.min(drag.startY, drag.currentY),
                height: Math.max(Math.abs(drag.currentY - drag.startY), 2)
              }} />
            )}
            {events.filter(ev => !ev.allDay && sameDay(new Date(ev.start), cursor)).map(ev => {
              const s = new Date(ev.start);
              const e = new Date(ev.end || s.getTime() + 3600000);
              const top = (minutesOfDay(s) / 1440) * 100;
              const height = Math.max(((minutesOfDay(e) - minutesOfDay(s)) / 1440) * 100, 2);
              return (
                <div key={ev.id} className="time-event large" style={{ ...styleForCategory(catById[ev.categoryId]?.color, 0.2), top: `${top}%`, height: `${height}%` }} onClick={() => onEventClick(ev)}>
                  <div className="event-content">
                    <div className="title">
                      {ev.recurrence && <FaRepeat style={{ fontSize: 12, marginRight: 8 }} />}
                      {ev.title}
                    </div>
                    <div className="time">
                      <FaClock style={{ marginRight: 6, opacity: 0.6 }} />
                      {fmt12(minutesOfDay(s))} - {fmt12(minutesOfDay(e))}
                    </div>
                    {ev.location && <div className="loc"><FaLocationDot style={{ marginRight: 6, opacity: 0.6 }} /> {ev.location}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   Modals
   ============================================================================ */

function EventModal({ mode, initial, categories, onSave, onDelete, onClose }) {
  const [draft, setDraft] = useState({
    title: "",
    location: "",
    start: new Date().toISOString(),
    end: new Date(Date.now() + 3600000).toISOString(),
    categoryId: categories[0]?.id || "default",
    ...initial
  });

  const set = (k, v) => setDraft(prev => ({ ...prev, [k]: v }));

  const toLocalIso = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };

  return (
    <div className="sc-modal-overlay" onClick={(e) => e.target.className === 'sc-modal-overlay' && onClose()}>
      <div className="sc-modal-card">
        <header className="modal-head">
          <div className="title-area">
            <FaCalendarDays className="head-ico" />
            <h3>{mode === 'create' ? 'Schedule Event' : 'Modify Schedule'}</h3>
          </div>
          <button className="close-btn" onClick={onClose}><FaXmark /></button>
        </header>
        
        <div className="modal-body">
          <div className="form-group">
            <label><FaTag /> Event Purpose</label>
            <input 
              value={draft.title} 
              onChange={e => set("title", e.target.value)} 
              placeholder="e.g. Morning Bible Study" 
              autoFocus
            />
          </div>

          <div className="form-group">
            <label><FaLocationDot /> Location</label>
            <input 
              value={draft.location || ""} 
              onChange={e => set("location", e.target.value)} 
              placeholder="e.g. Main Sanctuary or Room 202" 
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label><FaClock /> Start Time</label>
              <input 
                type="datetime-local" 
                value={toLocalIso(draft.start)} 
                onChange={e => set("start", new Date(e.target.value).toISOString())} 
              />
            </div>
            <div className="form-group">
              <label><FaClock /> End Time</label>
              <input 
                type="datetime-local" 
                value={toLocalIso(draft.end || draft.start)} 
                onChange={e => set("end", new Date(e.target.value).toISOString())} 
              />
            </div>
          </div>

          <div className="form-group">
            <label><FaCheck /> Classification</label>
            <div className="cat-grid">
              {categories.map(c => (
                <button 
                  key={c.id} 
                  type="button"
                  className={`cat-opt ${draft.categoryId === c.id ? 'active' : ''}`}
                  onClick={() => set("categoryId", c.id)}
                  style={{ '--cat-color': c.color }}
                >
                  <span className="dot" />
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <RecurrenceEditor
            recurrence={draft.recurrence}
            startIso={draft.start}
            onChange={(rec) => set("recurrence", rec)}
          />
        </div>

        <footer className="modal-foot">
          {mode === 'edit' && (
            <button className="sc-btn danger" onClick={() => onDelete(draft.id)}>
              <FaTrashCan /> <span className="btn-text">Remove</span>
            </button>
          )}
          <div className="spacer" />
          <button className="sc-btn ghost" onClick={onClose}>Cancel</button>
          <button className="sc-btn primary" onClick={() => onSave(draft)}>
            <FaFloppyDisk /> <span className="btn-text">{mode === 'create' ? 'Create Event' : 'Save Changes'}</span>
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ============================================================================
   Advanced Recurrence Editor
   ============================================================================ */
function RecurrenceEditor({ recurrence, startIso, onChange }) {
  const enabled = !!recurrence;
  const rec = recurrence || null;
  const start = startIso ? new Date(startIso) : new Date();

  const FREQS = [
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'yearly', label: 'Yearly' },
  ];

  const DAYS = [
    { id: 'MO', label: 'M' },
    { id: 'TU', label: 'T' },
    { id: 'WE', label: 'W' },
    { id: 'TH', label: 'T' },
    { id: 'FR', label: 'F' },
    { id: 'SA', label: 'S' },
    { id: 'SU', label: 'S' },
  ];

  const endMode = rec?.until ? 'until' : rec?.count ? 'count' : 'never';

  const update = (patch) => onChange({ ...(rec || { frequency: 'weekly', interval: 1, byDay: [] }), ...patch });

  const toggle = () => {
    if (enabled) onChange(null);
    else {
      const dayMap = ['SU','MO','TU','WE','TH','FR','SA'];
      onChange({ frequency: 'weekly', interval: 1, byDay: [dayMap[start.getDay()]] });
    }
  };

  const summary = () => {
    if (!rec) return '';
    const every = rec.interval > 1 ? `every ${rec.interval} ` : 'every ';
    const base = {
      daily: `${every}${rec.interval > 1 ? 'days' : 'day'}`,
      weekly: `${every}${rec.interval > 1 ? 'weeks' : 'week'}${rec.byDay?.length ? ' on ' + rec.byDay.join(', ') : ''}`,
      monthly: `${every}${rec.interval > 1 ? 'months' : 'month'}`,
      yearly: `${every}${rec.interval > 1 ? 'years' : 'year'}`,
    }[rec.frequency] || '';
    let end = '';
    if (rec.count) end = ` · ${rec.count} times`;
    else if (rec.until) end = ` · until ${new Date(rec.until).toLocaleDateString()}`;
    return `Repeats ${base}${end}`;
  };

  return (
    <div className="form-group recurrence-section">
      <label><FaRepeat /> Recurrence</label>
      <div className="recurrence-controls">
        <button
          type="button"
          className={`sc-btn ghost-toggle ${enabled ? 'active' : ''}`}
          onClick={toggle}
        >
          <FaRepeat />
          <span>{enabled ? 'Repeating' : 'Does not repeat'}</span>
        </button>

        {enabled && (
          <div className="rec-panel">
            <div className="rec-row">
              <span className="rec-label">Every</span>
              <input
                type="number"
                min="1"
                max="99"
                className="rec-interval"
                value={rec.interval || 1}
                onChange={(e) => update({ interval: Math.max(1, parseInt(e.target.value || '1', 10)) })}
              />
              <div className="rec-freq">
                {FREQS.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    className={rec.frequency === f.id ? 'active' : ''}
                    onClick={() => update({ frequency: f.id, byDay: f.id === 'weekly' ? (rec.byDay?.length ? rec.byDay : [['SU','MO','TU','WE','TH','FR','SA'][start.getDay()]]) : undefined })}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {rec.frequency === 'weekly' && (
              <div className="rec-row">
                <span className="rec-label">On</span>
                <div className="day-picker">
                  {DAYS.map((d, i) => (
                    <button
                      key={d.id}
                      type="button"
                      className={rec.byDay?.includes(d.id) ? 'active' : ''}
                      onClick={() => {
                        const current = rec.byDay || [];
                        const next = current.includes(d.id)
                          ? current.filter(x => x !== d.id)
                          : [...current, d.id];
                        update({ byDay: next });
                      }}
                      title={['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][['SU','MO','TU','WE','TH','FR','SA'].indexOf(d.id)]}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="rec-row">
              <span className="rec-label">Ends</span>
              <div className="rec-end">
                <div className="rec-end-tabs">
                  {[
                    { id: 'never', label: 'Never' },
                    { id: 'until', label: 'On date' },
                    { id: 'count', label: 'After' },
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className={endMode === t.id ? 'active' : ''}
                      onClick={() => {
                        if (t.id === 'never') update({ until: undefined, count: undefined });
                        else if (t.id === 'until') update({ count: undefined, until: new Date(start.getTime() + 90*86400000).toISOString() });
                        else update({ until: undefined, count: 10 });
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {endMode === 'until' && (
                  <input
                    type="date"
                    className="rec-end-input"
                    value={rec.until ? new Date(rec.until).toISOString().slice(0, 10) : ''}
                    onChange={(e) => update({ until: e.target.value ? new Date(e.target.value + 'T23:59:59').toISOString() : undefined })}
                  />
                )}
                {endMode === 'count' && (
                  <div className="rec-count-wrap">
                    <input
                      type="number"
                      min="1"
                      max="999"
                      className="rec-end-input"
                      value={rec.count || 1}
                      onChange={(e) => update({ count: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                    />
                    <span className="rec-count-suffix">occurrence{(rec.count || 1) > 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="rec-summary">{summary()}</div>
          </div>
        )}
      </div>
    </div>
  );
}

const CAL_CSS = `
  .sc-workspace { height: 100%; width: 100%; max-width: 100%; display: flex; flex-direction: column; background: var(--bg); overflow-x: hidden; min-width: 0; }
  .sc-toolbar { background: var(--surface); padding: 16px 32px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; z-index: 20; min-width: 0; }
  
  .sc-nav-group { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1 1 auto; }
  .sc-btn-icon { width: 36px; height: 36px; border-radius: 10px; background: var(--bg); display: grid; place-items: center; color: var(--text); border: 1px solid var(--border); transition: 0.2s; cursor: pointer; }
  .sc-btn-icon:hover { background: var(--primary); color: white; border-color: var(--primary); transform: translateY(-1px); box-shadow: 0 4px 10px rgba(99,102,241,0.25); }
  .sc-btn-today { height: 36px; padding: 0 16px; border-radius: 10px; background: var(--surface); border: 1px solid var(--border); font-weight: 700; font-size: 13px; transition: 0.2s; cursor: pointer; }
  .sc-btn-today:hover { border-color: var(--primary); color: var(--primary); transform: translateY(-1px); }
  .sc-view-switcher button { cursor: pointer; border: none; background: transparent; }
  .sc-view-switcher button:hover:not(.active) { color: var(--text); background: rgba(99,102,241,0.06); }
  .sc-btn-primary { cursor: pointer; }
  .sc-btn-primary:hover { background: var(--primary-hover); transform: translateY(-1px); box-shadow: 0 6px 18px rgba(99, 102, 241, 0.32); }
  .sc-cursor-title { font-size: 18px; font-weight: 800; margin: 0 0 0 12px; color: var(--text); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .sc-view-switcher { display: flex; background: var(--bg); padding: 4px; border-radius: 12px; gap: 4px; }
  .sc-view-switcher button { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 700; color: var(--text-muted); transition: 0.2s; }
  .sc-view-switcher button.active { background: var(--surface); color: var(--primary); box-shadow: 0 2px 4px rgba(0,0,0,0.05); }

  .sc-btn-primary { height: 40px; padding: 0 20px; border-radius: 10px; background: var(--primary); color: white; border: none; font-weight: 700; display: flex; align-items: center; gap: 10px; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2); transition: 0.2s; }

  .sc-content { flex: 1; padding: 24px; overflow: hidden; display: flex; flex-direction: column; min-width: 0; max-width: 100%; }
  
  .month-grid { background: var(--surface); border-radius: 24px; border: 1px solid var(--border); box-shadow: var(--shadow); height: 100%; display: flex; flex-direction: column; overflow: hidden; position: relative; }
  .day-names { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); background: var(--bg); border-bottom: 1px solid var(--border); }
  .day-names div { padding: 12px; text-align: center; font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; }
  .cells { flex: 1; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-template-rows: repeat(6, minmax(0, 1fr)); min-height: 0; }
  .cell {
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    padding: 8px 8px 6px;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.15s ease;
    min-height: 0;
    min-width: 0;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow: hidden;
    --mx: -9999px; --my: -9999px;
  }
  .cell:nth-child(7n) { border-right: none; }
  .cell:nth-last-child(-n+7) { border-bottom: none; }
  .cell.dim { background: rgba(148, 163, 184, 0.04); }
  .cell.dim .date { opacity: 0.45; }
  .cell.today { background: rgba(99, 102, 241, 0.05); }
  .cell:hover { background: rgba(99, 102, 241, 0.04); }
  .cell .cell-glow {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(180px circle at var(--mx) var(--my), rgba(99,102,241,0.12), transparent 60%);
    opacity: 0;
    transition: opacity 0.2s ease;
  }
  .cell:hover .cell-glow { opacity: 1; }
  .cell-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-shrink: 0; }
  .date { font-size: 13px; font-weight: 800; color: var(--text); line-height: 1; }
  .cell.today .date {
    background: var(--primary); color: white;
    width: 24px; height: 24px; border-radius: 8px;
    display: grid; place-items: center;
    box-shadow: 0 2px 8px rgba(99,102,241,0.35);
  }
  .count-dot {
    font-size: 10px; font-weight: 800;
    min-width: 18px; height: 18px; padding: 0 6px;
    border-radius: 9px; background: rgba(99,102,241,0.12); color: var(--primary);
    display: grid; place-items: center;
    opacity: 0; transition: opacity 0.15s ease;
  }
  .cell:hover .count-dot { opacity: 1; }

  .event-stack {
    display: flex; flex-direction: column; gap: 3px;
    min-height: 0; flex: 1; overflow: hidden;
  }
  .chip {
    display: flex; align-items: center; gap: 5px;
    padding: 3px 7px;
    border-radius: 6px;
    border: none;
    border-left: 3px solid;
    font-size: 11px; font-weight: 700;
    line-height: 1.4;
    white-space: nowrap; overflow: hidden;
    text-align: left;
    cursor: pointer;
    transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
    min-width: 0; width: 100%;
  }
  .chip:hover {
    transform: translateX(2px);
    filter: brightness(0.96) saturate(1.15);
    box-shadow: 0 2px 8px rgba(15,23,42,0.08);
  }
  .chip-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; display: none; }
  .chip-icon { font-size: 8px; opacity: 0.7; flex-shrink: 0; }
  .chip-time { font-size: 10px; font-weight: 800; opacity: 0.75; flex-shrink: 0; }
  .chip-title { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .more {
    font-size: 10px; font-weight: 800;
    color: var(--text-muted);
    padding: 2px 6px; border-radius: 6px;
    background: transparent; border: none;
    text-align: left; cursor: pointer;
    transition: 0.15s;
  }
  .more:hover { background: rgba(99,102,241,0.1); color: var(--primary); }

  /* Day popover */
  .day-popover-overlay {
    position: fixed; inset: 0; z-index: 2500;
    background: rgba(15,23,42,0.35); backdrop-filter: blur(4px);
    display: grid; place-items: center; padding: 20px;
    animation: fadeIn 0.15s ease;
  }
  .day-popover {
    width: 100%; max-width: 380px;
    background: var(--surface); border-radius: 20px;
    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
    overflow: hidden; display: flex; flex-direction: column;
    animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .day-popover header { padding: 18px 22px; display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 1px solid var(--border); }
  .pop-dow { font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; }
  .pop-date { font-size: 18px; font-weight: 800; color: var(--text); margin-top: 2px; }
  .pop-list { padding: 10px; display: flex; flex-direction: column; gap: 4px; max-height: 50vh; overflow-y: auto; }
  .pop-item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px;
    border-radius: 12px;
    background: transparent; border: 1px solid transparent;
    text-align: left; cursor: pointer; transition: 0.15s;
    min-width: 0;
  }
  .pop-item:hover { background: var(--bg); border-color: var(--border); transform: translateX(2px); }
  .pop-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--cat-color); flex-shrink: 0; box-shadow: 0 0 0 3px color-mix(in srgb, var(--cat-color) 20%, transparent); }
  .pop-title { font-size: 13px; font-weight: 700; color: var(--text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; }
  .pop-time { font-size: 11px; font-weight: 700; color: var(--text-muted); flex-shrink: 0; }
  @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

  .timeline-view { background: var(--surface); border-radius: 24px; border: 1px solid var(--border); box-shadow: var(--shadow); height: 100%; width: 100%; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
  .timeline-head { display: grid; grid-template-columns: 80px repeat(7, minmax(0, 1fr)); background: var(--bg); border-bottom: 1px solid var(--border); min-width: 0; }
  .head-col { padding: 16px; text-align: center; display: flex; flex-direction: column; gap: 4px; border-right: 1px solid var(--border); }
  .day-name { font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); }
  .day-date { font-size: 20px; font-weight: 800; color: var(--text); }

  .timeline-body { flex: 1; display: grid; grid-template-columns: 80px minmax(0, 1fr); overflow-y: auto; overflow-x: hidden; background: var(--surface); min-width: 0; }
  .time-gutter { background: var(--bg); border-right: 1px solid var(--border); position: relative; }
  .hour-marker { height: 60px; position: relative; }
  .hour-marker span { position: absolute; top: 0; right: 12px; transform: translateY(-50%); font-size: 11px; font-weight: 700; color: var(--text-muted); background: var(--bg); padding: 0 4px; white-space: nowrap; pointer-events: none; }
  
  .grid-cols {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    position: relative;
    height: 1440px;
    min-width: 0;
    background-image: linear-gradient(to bottom, var(--border) 1px, transparent 1px);
    background-size: 100% 60px;
  }
  .timeline-view.single-day .timeline-head { grid-template-columns: 80px minmax(0, 1fr); }
  .timeline-view.single-day .grid-cols { grid-template-columns: minmax(0, 1fr); }
  .grid-col { position: relative; border-right: 1px solid var(--border); transition: background 0.2s; cursor: pointer; }

  .grid-col { --hover-top: -9999px; }
  .grid-col:hover::before {
    content: ''; position: absolute; left: 0; right: 0;
    top: var(--hover-top); height: 60px;
    background: linear-gradient(90deg, rgba(99,102,241,0.10), rgba(99,102,241,0.04));
    border-top: 1.5px dashed rgba(99,102,241,0.45);
    border-bottom: 1.5px dashed rgba(99,102,241,0.45);
    pointer-events: none; z-index: 0;
    border-radius: 6px;
  }
  .drag-selection { position: absolute; left: 4px; right: 4px; background: rgba(99,102,241,0.18); border: 1.5px solid var(--primary); border-radius: 8px; pointer-events: none; z-index: 2; }
  .time-event { position: absolute; left: 4px; right: 4px; border-radius: 8px; border-left: 4px solid; padding: 8px; cursor: pointer; transition: all 0.2s; overflow: hidden; z-index: 1; }
  .time-event:hover { transform: translateX(2px) scale(1.01); box-shadow: 0 6px 16px rgba(15,23,42,0.12); z-index: 3; }
  .time-event.large { padding: 16px; left: 12px; right: 12px; border-radius: 16px; }
  .time-event .title { font-size: 12px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; }
  .time-event.large .title { font-size: 16px; margin-bottom: 4px; }
  .time-event .time { font-size: 10px; font-weight: 700; opacity: 0.8; margin-top: 2px; }
  .time-event.large .loc { font-size: 12px; font-weight: 600; opacity: 0.7; margin-top: 8px; display: flex; align-items: center; }

  .sc-modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(8px); z-index: 3000; display: grid; place-items: center; padding: 20px; animation: fadeIn 0.2s ease-out; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .sc-modal-card { width: 100%; max-width: 520px; min-width: 0; background: var(--surface); border-radius: 28px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); display: flex; flex-direction: column; }
  
  .modal-head { padding: 24px 32px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); background: var(--surface); }
  .modal-head .title-area { display: flex; align-items: center; gap: 12px; }
  .modal-head .head-ico { color: var(--primary); font-size: 18px; }
  .modal-head h3 { font-size: 20px; font-weight: 800; margin: 0; color: var(--text); letter-spacing: -0.5px; }
  
  .close-btn { width: 36px; height: 36px; border-radius: 12px; background: var(--bg); display: grid; place-items: center; color: var(--text-muted); transition: 0.2s; border: none; cursor: pointer; }
  .close-btn:hover { background: #fff1f2; color: #ef4444; transform: rotate(90deg); }
  
  .modal-body { padding: 32px; display: flex; flex-direction: column; gap: 24px; overflow-y: auto; overflow-x: hidden; max-height: 70vh; min-width: 0; }

  .form-group { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .form-group input, .form-group select { min-width: 0; width: 100%; box-sizing: border-box; }
  .form-group label { font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 8px; }
  .form-group label svg { font-size: 12px; color: var(--primary); opacity: 0.7; }
  
  .form-group input, .form-group select { padding: 14px 18px; border-radius: 16px; border: 1.5px solid var(--border); background: var(--bg); color: var(--text); font-size: 15px; font-weight: 600; outline: none; transition: all 0.2s; font-family: inherit; }
  .form-group input:focus, .form-group select:focus { border-color: var(--primary); background: var(--surface); box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }
  .form-group input::placeholder { color: var(--text-muted); font-weight: 400; }

  .form-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; min-width: 0; }

  .cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
  .cat-opt { padding: 10px; border-radius: 12px; border: 1.5px solid var(--border); background: var(--bg); display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; color: var(--text); transition: 0.2s; cursor: pointer; }
  .cat-opt .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--cat-color); }
  .cat-opt:hover { border-color: var(--cat-color); background: var(--surface); }
  .cat-opt.active { border-color: var(--cat-color); background: var(--surface); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }

  .recurrence-controls { display: flex; flex-direction: column; gap: 14px; }
  .sc-btn.ghost-toggle { background: var(--bg); border: 1.5px solid var(--border); color: var(--text-muted); width: fit-content; height: 42px; gap: 8px; padding: 0 16px; }
  .sc-btn.ghost-toggle:hover { border-color: var(--primary); color: var(--primary); }
  .sc-btn.ghost-toggle.active { background: rgba(99, 102, 241, 0.1); border-color: var(--primary); color: var(--primary); }

  .day-picker { display: flex; gap: 6px; flex-wrap: wrap; }
  .day-picker button { width: 34px; height: 34px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--bg); color: var(--text-muted); font-size: 11px; font-weight: 800; cursor: pointer; transition: 0.2s; }
  .day-picker button:hover { border-color: var(--primary); color: var(--primary); transform: translateY(-1px); }
  .day-picker button.active { background: var(--primary); border-color: var(--primary); color: white; box-shadow: 0 4px 10px rgba(99,102,241,0.25); }

  .rec-panel {
    display: flex; flex-direction: column; gap: 14px;
    padding: 16px; border-radius: 16px;
    background: linear-gradient(180deg, rgba(99,102,241,0.04), rgba(99,102,241,0.01));
    border: 1px dashed rgba(99,102,241,0.3);
    animation: slideUp 0.2s ease;
  }
  .rec-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; min-width: 0; }
  .rec-label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); min-width: 48px; }
  .rec-interval {
    width: 64px; height: 38px;
    padding: 0 10px;
    border-radius: 10px; border: 1.5px solid var(--border);
    background: var(--surface); color: var(--text);
    font-size: 14px; font-weight: 800; text-align: center;
    outline: none; transition: 0.15s;
  }
  .rec-interval:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
  .rec-freq { display: flex; gap: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 3px; }
  .rec-freq button {
    padding: 7px 12px; border-radius: 7px; border: none; background: transparent;
    font-size: 12px; font-weight: 700; color: var(--text-muted);
    cursor: pointer; transition: 0.15s;
  }
  .rec-freq button:hover:not(.active) { background: rgba(99,102,241,0.08); color: var(--primary); }
  .rec-freq button.active { background: var(--primary); color: white; box-shadow: 0 2px 6px rgba(99,102,241,0.25); }

  .rec-end { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; flex: 1; min-width: 0; }
  .rec-end-tabs { display: flex; gap: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 3px; }
  .rec-end-tabs button { padding: 7px 12px; border-radius: 7px; border: none; background: transparent; font-size: 12px; font-weight: 700; color: var(--text-muted); cursor: pointer; transition: 0.15s; }
  .rec-end-tabs button:hover:not(.active) { background: rgba(99,102,241,0.08); color: var(--primary); }
  .rec-end-tabs button.active { background: var(--primary); color: white; }
  .rec-end-input {
    height: 38px; padding: 0 12px;
    border-radius: 10px; border: 1.5px solid var(--border);
    background: var(--surface); color: var(--text);
    font-size: 13px; font-weight: 700; outline: none;
    font-family: inherit;
  }
  .rec-end-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
  .rec-count-wrap { display: flex; align-items: center; gap: 8px; }
  .rec-count-wrap .rec-end-input { width: 72px; text-align: center; }
  .rec-count-suffix { font-size: 12px; font-weight: 700; color: var(--text-muted); }

  .rec-summary {
    margin-top: 2px;
    font-size: 12px; font-weight: 700;
    color: var(--primary);
    background: rgba(99,102,241,0.08);
    padding: 8px 12px; border-radius: 10px;
    display: flex; align-items: center; gap: 8px;
  }
  .rec-summary::before { content: '🔁'; font-size: 12px; }

  .modal-foot { padding: 24px 32px; background: var(--bg); border-top: 1px solid var(--border); display: flex; align-items: center; gap: 12px; }
  .sc-btn { height: 52px; padding: 0 24px; border-radius: 16px; font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 10px; cursor: pointer; transition: all 0.2s; border: none; }
  .sc-btn.primary { background: var(--primary); color: white; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2); flex: 1; justify-content: center; }
  .sc-btn.primary:hover { background: var(--primary-hover); transform: translateY(-2px); box-shadow: 0 6px 15px rgba(99, 102, 241, 0.3); }
  .sc-btn.ghost { background: transparent; color: var(--text-muted); }
  .sc-btn.danger { background: #fff1f2; color: #ef4444; border: 1.5px solid #fecdd3; }

  @media (max-width: 640px) {
    .sc-modal-card { max-width: 100%; border-radius: 28px 28px 0 0; position: fixed; bottom: 0; animation: slideUpMobile 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes slideUpMobile { from { transform: translateY(100%); } to { transform: translateY(0); } }
    .form-row { grid-template-columns: 1fr; }
    .modal-body { padding: 24px; gap: 20px; }
    .modal-foot { padding: 20px 24px; flex-direction: column-reverse; }
    .modal-foot .sc-btn { width: 100%; }
    .modal-foot .spacer { display: none; }
    .btn-text { flex: 1; text-align: center; }
  }
`;
