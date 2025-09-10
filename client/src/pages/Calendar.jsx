import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { DEFAULT_WEEKLY_SCHEDULE } from "../assets/schedule";
import { parseWeeklySchedule, minsToStr, withTime, fmtDate } from "../utils/helpers";

import TuiCalendarView from "../components/calendar/TuiCalendarView";
import CalendarSidebar from "../components/calendar/CalendarSidebar";

/* ---------- title helpers ---------- */
const addDays   = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addWeeks  = (d, n) => addDays(d, 7 * n);
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const titleFor = (date, view) => {
  if (view === "month") return date.toLocaleString(undefined, { month: "long", year: "numeric" });
  if (view === "week") { const s = new Date(date); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); const e = new Date(s); e.setDate(s.getDate() + 6); return `${s.toLocaleDateString()} – ${e.toLocaleDateString()}`; }
  if (view === "day") return date.toLocaleDateString(undefined, { weekday:"long", month:"short", day:"numeric" });
  return "Calendar";
};

function Toolbar({ view, cursor, onPrev, onNext, onToday, onChangeView }) {
  return (
    <div className="cal-controls">
      <button className="btn small" onClick={onPrev}>◀</button>
      <div style={{ minWidth: 160 }}>{titleFor(cursor, view)}</div>
      <button className="btn small" onClick={onNext}>▶</button>
      <button className="btn small" onClick={onToday} style={{ marginLeft: 8 }}>Today</button>
      <div className="spacer" />
      <div role="tablist" aria-label="Calendar views" style={{ display: "flex", gap: 6 }}>
        <button className="btn small" onClick={() => onChangeView("day")}>Day</button>
        <button className="btn small" onClick={() => onChangeView("week")}>Week</button>
        <button className="btn small" onClick={() => onChangeView("month")}>Month</button>
      </div>
    </div>
  );
}

export default function CalendarPage(){
  const { api, setToast } = useApp();
  const calRef = useRef(null);

  const [cursor, setCursor] = useState(new Date());
  const [view, setView]     = useState("month");
  const [events, setEvents] = useState([]);
  const [users, setUsers]   = useState([]);
  const [selectedCalendars, setSelectedCalendars] = useState(["DSM Schedule"]);

  useEffect(() => { (async () => {
    setEvents(await api.getAll("events"));
    setUsers(await api.getAll("users"));
  })(); }, [api]);

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

  /* toolbar actions (do not read from TUI to avoid getState crashes) */
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

  /* CRUD */
  const handleCreate = async (payload) => {
    await api.add("events", payload);
    setEvents(await api.getAll("events"));
    setToast("Event created");
    return payload;
  };
  const handleUpdate = async (changes) => {
    await api.put("events", changes);
    setEvents(await api.getAll("events"));
    setToast("Event updated");
    return changes;
  };
  const handleDelete = async (id) => {
    await api.del("events", id);
    setEvents(await api.getAll("events"));
    setToast("Event deleted");
  };

  /* weekly schedule loader */
  function ScheduleLoader({ onApply, defaultCalendar="DSM Schedule", calendars=[] }){
    const [text, setText] = useState(DEFAULT_WEEKLY_SCHEDULE);
    const [start, setStart] = useState(()=>{
      const now=new Date(); const dow=(now.getDay()+6)%7; const s=new Date(now); s.setDate(now.getDate()-dow); return fmtDate(s);
    });
    const [weeks, setWeeks] = useState(8);
    const [calendarSel, setCalendarSel] = useState(defaultCalendar);
    const [newCal, setNewCal] = useState("");
    const rows = useMemo(()=> parseWeeklySchedule(text).slice(0,30), [text]);

    return (
      <div>
        <div className="form-grid">
          <label className="field"><span>Start week (Monday)</span>
            <input className="input" type="date" value={start} onChange={e=>setStart(e.target.value)} />
          </label>
          <label className="field"><span>Weeks to create</span>
            <input className="input" type="number" min={1} max={26} value={weeks} onChange={e=>setWeeks(parseInt(e.target.value||"8",10))}/>
          </label>
          <label className="field"><span>Calendar</span>
            <select className="input" value={calendarSel} onChange={e=>setCalendarSel(e.target.value)}>
              {[...new Set(["DSM Schedule", ...calendars])].map(c=><option key={c} value={c}>{c}</option>)}
              <option value="__new">＋ Create new…</option>
            </select>
          </label>
          {calendarSel==="__new" && (
            <label className="field"><span>New calendar name</span>
              <input className="input" value={newCal} onChange={e=>setNewCal(e.target.value)} placeholder="e.g., Youth Events"/>
            </label>
          )}
          <label className="field wide"><span>Paste or edit schedule</span>
            <textarea className="textarea" rows={10} value={text} onChange={e=>setText(e.target.value)} />
          </label>
        </div>

        <p style={{marginTop:10}}>Preview (first 30 rows):</p>
        <div className="preview">
          <table>
            <thead><tr><th>Day</th><th>Start</th><th>End</th><th>Title</th><th>Group</th></tr></thead>
            <tbody>
              {rows.map((r,i)=>(
                <tr key={i}>
                  <td>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][r.dow]}</td>
                  <td>{minsToStr(r.startMin)}</td>
                  <td>{r.endMin?minsToStr(r.endMin):""}</td>
                  <td>{r.title}</td><td>{r.group||""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{display:"flex", gap:8, justifyContent:"flex-end", marginTop:10}}>
          <button className="btn primary" onClick={()=>{
            const calName = calendarSel==="__new" ? (newCal||"").trim() : calendarSel;
            if(!calName) return alert("Please enter a calendar name.");
            onApply(parseWeeklySchedule(text), new Date(start), weeks, calName);
          }}>Apply to Calendar</button>
        </div>
      </div>
    );
  }

  const loadSchedule = () => {
    const defaultCal = selectedCalendars[0] || "DSM Schedule";
    const form = (
      <ScheduleLoader
        defaultCalendar={defaultCal}
        calendars={calendars}
        onApply={async (items, start, weeks, calName)=>{
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
          setToast("Schedule loaded");
        }}
      />
    );
    window.dispatchEvent(new CustomEvent("open-modal", {detail:{title:"Load Weekly Schedule", content: form}}));
  };

  const toggleCalendar = (name, on) => {
    setSelectedCalendars(prev => on ? Array.from(new Set([...prev, name])) : prev.filter(x => x !== name));
  };

  return (
    <section className="page active" aria-label="Calendar">
      <div className="calendar-wrap">
        <CalendarSidebar
          users={users}
          calendars={calendars}
          selectedCalendars={selectedCalendars}
          onToggleCalendar={toggleCalendar}
          onAddEvent={() => calRef.current?.openCreatePopupNow?.()}
          onLoadSchedule={loadSchedule}
        />

        <section className="cal-right">
          <Toolbar
            view={view}
            cursor={cursor}
            onPrev={onPrev}
            onNext={onNext}
            onToday={onToday}
            onChangeView={onChangeView}
          />

          {/* Give the calendar a definite height right here */}
          <div className="cal-grid" style={{ padding: 0 }}>
            <TuiCalendarView
              ref={calRef}
              height="calc(100vh - 220px)"   // <<< this fixes the blank render
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
        </section>
      </div>
    </section>
  );
}
