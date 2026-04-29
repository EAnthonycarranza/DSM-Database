import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { DEFAULT_WEEKLY_SCHEDULE } from "../assets/schedule";
import { parseWeeklySchedule, minsToStr, withTime, fmtDate } from "../utils/helpers";
import { 
  FaCalendarPlus, FaChevronLeft, FaChevronRight, FaCalendarDay, 
  FaCalendarWeek, FaCalendarAlt, FaUpload, FaSearch, FaFilter 
} from "react-icons/fa";

import TuiCalendarView from "../components/calendar/TuiCalendarView";
import CalendarSidebar from "../components/calendar/CalendarSidebar";

/* ---------- navigation helpers ---------- */
const addDays   = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addWeeks  = (d, n) => addDays(d, 7 * n);
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };

const titleFor = (date, view) => {
  if (view === "month") return date.toLocaleString(undefined, { month: "long", year: "numeric" });
  if (view === "week") { 
    const s = new Date(date); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); 
    const e = new Date(s); e.setDate(s.getDate() + 6); 
    return `${s.toLocaleDateString([], {month:'short', day:'numeric'})} – ${e.toLocaleDateString([], {month:'short', day:'numeric'})}`; 
  }
  if (view === "day") return date.toLocaleDateString(undefined, { weekday:"long", month:"short", day:"numeric" });
  return "Schedule";
};

function Toolbar({ view, cursor, onPrev, onNext, onToday, onChangeView }) {
  return (
    <div className="cal-toolbar">
      <div className="nav-group">
        <button className="nav-btn" onClick={onPrev} title="Previous"><FaChevronLeft /></button>
        <button className="today-btn" onClick={onToday}>Today</button>
        <button className="nav-btn" onClick={onNext} title="Next"><FaChevronRight /></button>
      </div>
      
      <h2 className="cursor-title">{titleFor(cursor, view)}</h2>
      
      <div className="view-switcher">
        <button className={view === "day" ? "active" : ""} onClick={() => onChangeView("day")}>
          <FaCalendarDay /> <span>Day</span>
        </button>
        <button className={view === "week" ? "active" : ""} onClick={() => onChangeView("week")}>
          <FaCalendarWeek /> <span>Week</span>
        </button>
        <button className={view === "month" ? "active" : ""} onClick={() => onChangeView("month")}>
          <FaCalendarAlt /> <span>Month</span>
        </button>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const { api, setToast } = useApp();
  const calRef = useRef(null);

  const [cursor, setCursor] = useState(new Date());
  const [view, setView]     = useState("month");
  const [events, setEvents] = useState([]);
  const [users, setUsers]   = useState([]);
  const [selectedCalendars, setSelectedCalendars] = useState(["DSM Schedule"]);

  useEffect(() => { 
    (async () => {
      setEvents(await api.getAll("events"));
      setUsers(await api.getAll("users"));
    })(); 
  }, [api]);

  const calendars = useMemo(() => {
    const s = new Set(["DSM Schedule"]);
    for (const ev of events || []) if (ev.calendar) s.add(ev.calendar);
    return Array.from(s);
  }, [events]);

  useEffect(() => {
    setSelectedCalendars(prev => {
      const n = new Set(prev); calendars.forEach(c => n.add(c)); return Array.from(n);
    });
  }, [calendars]);

  const shiftCursor = (delta) => {
    setCursor(prev => {
      if (view === "month") return addMonths(prev, delta);
      if (view === "week")  return addWeeks(prev, delta);
      return addDays(prev, delta);
    });
  };

  const onPrev       = () => { calRef.current?.prev();  shiftCursor(-1); };
  const onNext       = () => { calRef.current?.next();  shiftCursor( 1); };
  const onToday      = () => { calRef.current?.today(); setCursor(new Date()); };
  const onChangeView = (v)  => { setView(v); calRef.current?.changeView(v); };

  const handleCreate = async (payload) => {
    await api.add("events", payload);
    setEvents(await api.getAll("events"));
    setToast("Event scheduled successfully");
    return payload;
  };

  const handleUpdate = async (changes) => {
    await api.put("events", changes);
    setEvents(await api.getAll("events"));
    setToast("Schedule updated");
    return changes;
  };

  const handleDelete = async (id) => {
    await api.del("events", id);
    setEvents(await api.getAll("events"));
    setToast("Event removed from calendar");
  };

  const loadSchedule = () => {
    const defaultCal = selectedCalendars[0] || "DSM Schedule";
    const form = (
      <ScheduleLoader
        defaultCalendar={defaultCal}
        calendars={calendars}
        onApply={async (items, start, weeks, calName) => {
          const batch = [];
          for(let w=0; w<weeks; w++){
            for(const item of items){
              const d = new Date(start); d.setDate(d.getDate()+item.dow + w*7);
              const sdt = withTime(d, item.startMin);
              const edt = withTime(d, item.endMin ?? item.startMin+60);
              const obj = { id: crypto.randomUUID(), title:item.title, date:sdt.toISOString(), duration:(edt-sdt)/60000, calendar:calName };
              await api.add("events", obj);
              batch.push(obj);
            }
          }
          calRef.current?.addEvents?.(batch);
          window.dispatchEvent(new Event("close-modal"));
          setEvents(await api.getAll("events"));
          setToast("Weekly schedule bulk-loaded");
        }}
      />
    );
    window.dispatchEvent(new CustomEvent("open-modal", { detail: { title: "Bulk Schedule Loader", content: form } }));
  };

  return (
    <section className="cal-page fade-in">
      <style>{CAL_CSS}</style>
      
      <div className="cal-layout">
        <aside className="cal-sidebar-wrap">
          <CalendarSidebar
            users={users}
            calendars={calendars}
            selectedCalendars={selectedCalendars}
            onToggleCalendar={(name, on) => setSelectedCalendars(prev => on ? Array.from(new Set([...prev, name])) : prev.filter(x => x !== name))}
            onAddEvent={() => calRef.current?.openCreatePopupNow?.()}
            onLoadSchedule={loadSchedule}
          />
        </aside>

        <main className="cal-main">
          <Toolbar
            view={view}
            cursor={cursor}
            onPrev={onPrev}
            onNext={onNext}
            onToday={onToday}
            onChangeView={onChangeView}
          />

          <div className="calendar-container">
            <TuiCalendarView
              ref={calRef}
              height="calc(100vh - 200px)"
              events={events}
              calendars={calendars}
              selectedCalendars={selectedCalendars}
              onCreate={handleCreate}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onNavigate={() => setCursor(new Date())}
              onViewChange={(v) => setView(v)}
            />
          </div>
        </main>
      </div>
    </section>
  );
}

function ScheduleLoader({ onApply, defaultCalendar="DSM Schedule", calendars=[] }) {
  const [text, setText] = useState(DEFAULT_WEEKLY_SCHEDULE);
  const [start, setStart] = useState(() => {
    const now=new Date(); const dow=(now.getDay()+6)%7; const s=new Date(now); s.setDate(now.getDate()-dow); return fmtDate(s);
  });
  const [weeks, setWeeks] = useState(8);
  const [calendarSel, setCalendarSel] = useState(defaultCalendar);
  const [newCal, setNewCal] = useState("");
  const rows = useMemo(()=> parseWeeklySchedule(text).slice(0,10), [text]);

  return (
    <div className="schedule-loader">
      <div className="loader-form">
        <div className="form-group">
          <label>Start Week (Mon)</label>
          <input type="date" value={start} onChange={e=>setStart(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Weeks Duration</label>
          <input type="number" min={1} max={26} value={weeks} onChange={e=>setWeeks(parseInt(e.target.value||"8",10))}/>
        </div>
        <div className="form-group">
          <label>Calendar Layer</label>
          <select value={calendarSel} onChange={e=>setCalendarSel(e.target.value)}>
            {[...new Set(["DSM Schedule", ...calendars])].map(c=><option key={c} value={c}>{c}</option>)}
            <option value="__new">+ New Layer...</option>
          </select>
        </div>
        {calendarSel==="__new" && (
          <div className="form-group">
            <label>New Layer Name</label>
            <input value={newCal} onChange={e=>setNewCal(e.target.value)} placeholder="e.g. Outreach"/>
          </div>
        )}
      </div>

      <div className="text-area-group">
        <label>Weekly Pattern (Plain Text)</label>
        <textarea rows={12} value={text} onChange={e=>setText(e.target.value)} placeholder="Mon 08:00 - 09:00 Bible Study..." />
      </div>

      <div className="loader-preview">
        <h4>Pattern Preview</h4>
        <div className="preview-grid">
          {rows.map((r,i)=>(
            <div key={i} className="preview-row">
              <span className="day">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][r.dow]}</span>
              <span className="time">{minsToStr(r.startMin)}</span>
              <span className="title">{r.title}</span>
            </div>
          ))}
          {rows.length === 0 && <p className="empty">No valid patterns detected</p>}
        </div>
      </div>

      <div className="loader-footer">
        <button className="dsm-btn-primary" onClick={()=>{
          const calName = calendarSel==="__new" ? (newCal||"").trim() : calendarSel;
          if(!calName) return alert("Please specify a calendar.");
          onApply(parseWeeklySchedule(text), new Date(start), weeks, calName);
        }}>Generate Schedule</button>
      </div>
    </div>
  );
}

const CAL_CSS = `
  .cal-page { height: 100%; display: flex; flex-direction: column; }
  .cal-layout { display: grid; grid-template-columns: 280px 1fr; gap: 24px; height: 100%; }
  
  .cal-sidebar-wrap { background: var(--surface); border-radius: 24px; border: 1px solid var(--border); box-shadow: var(--shadow); padding: 8px; overflow-y: auto; }
  .cal-main { background: var(--surface); border-radius: 24px; border: 1px solid var(--border); box-shadow: var(--shadow); display: flex; flex-direction: column; overflow: hidden; }

  .cal-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 20px 32px; border-bottom: 1px solid var(--border); background: var(--surface); }
  
  .nav-group { display: flex; align-items: center; gap: 8px; }
  .nav-btn { width: 36px; height: 36px; border-radius: 10px; background: var(--bg); color: var(--text); display: grid; place-items: center; transition: all 0.2s; }
  .nav-btn:hover { background: #e2e8f0; }
  .today-btn { height: 36px; padding: 0 16px; border-radius: 10px; background: var(--primary); color: white; font-weight: 700; font-size: 13px; transition: all 0.2s; }
  .today-btn:hover { background: var(--primary-hover); transform: translateY(-1px); }

  .cursor-title { font-size: 20px; font-weight: 800; margin: 0; color: var(--text); min-width: 200px; text-align: center; }

  .view-switcher { display: flex; background: var(--bg); padding: 4px; border-radius: 12px; gap: 4px; }
  .view-switcher button { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 700; color: var(--text-muted); transition: all 0.2s; }
  .view-switcher button.active { background: var(--surface); color: var(--primary); box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
  .view-switcher button:hover:not(.active) { color: var(--text); }

  .calendar-container { flex: 1; position: relative; }

  /* Loader Component Styles */
  .schedule-loader { padding: 8px; }
  .loader-form { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
  .form-group { display: flex; flex-direction: column; gap: 6px; }
  .form-group label { font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px; }
  .form-group input, .form-group select { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg); font-weight: 600; font-size: 14px; outline: none; }
  
  .text-area-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; }
  .text-area-group label { font-size: 11px; font-weight: 800; color: var(--text-muted); }
  .text-area-group textarea { padding: 16px; border-radius: 16px; border: 1px solid var(--border); background: var(--bg); font-family: 'Fira Code', monospace; font-size: 13px; resize: vertical; outline: none; }

  .loader-preview h4 { margin: 0 0 12px; font-size: 14px; font-weight: 800; }
  .preview-grid { display: flex; flex-wrap: wrap; gap: 8px; max-height: 120px; overflow-y: auto; padding: 4px; }
  .preview-row { background: var(--bg); padding: 6px 12px; border-radius: 8px; font-size: 12px; display: flex; gap: 8px; align-items: center; border: 1px solid var(--border); }
  .preview-row .day { font-weight: 800; color: var(--primary); }
  .preview-row .time { font-weight: 600; opacity: 0.7; }
  .preview-row .title { font-weight: 700; }

  .loader-footer { margin-top: 24px; display: flex; justify-content: flex-end; }

  @media (max-width: 1024px) {
    .cal-layout { grid-template-columns: 1fr; gap: 14px; }
    .cal-sidebar-wrap { display: none; }
  }

  @media (max-width: 768px) {
    .cal-main { border-radius: 16px; }
    .cal-toolbar {
      padding: 12px 14px;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .nav-group { order: 1; }
    .cursor-title { order: 2; flex: 1 1 100%; min-width: 0; font-size: 16px; }
    .view-switcher { order: 3; flex: 1 1 100%; }
    .view-switcher button { flex: 1; justify-content: center; padding: 10px 8px; font-size: 12px; }
    .nav-btn { width: 40px; height: 40px; }
    .today-btn { height: 40px; }

    .loader-form { grid-template-columns: 1fr; gap: 12px; }
    .form-group input, .form-group select { padding: 14px; font-size: 16px; min-height: 48px; }
    .text-area-group textarea { padding: 14px; font-size: 14px; }
    .loader-footer .dsm-btn-primary { width: 100%; min-height: 50px; justify-content: center; }
  }

  @media (max-width: 480px) {
    .view-switcher button .label { display: none; }
    .view-switcher button { padding: 10px; }
  }
`;
