import React, { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { BarChart } from "../components/ChartCanvas";
import { startOfMonth, endOfMonth } from "../utils/helpers";

export default function Home(){
  const { api, setModal, setToast } = useApp();
  const [kpi, setKpi] = useState({occ:"0 / 0", pct:0, service:0, phase:{}, events:[]});

  useEffect(()=>{ (async ()=>{
    const students = await api.getAll("students");
    const settings = (await api.get("settings","settings")) || {capacity:21};
    const current = students.filter(s=> s.status==="Current" && !s.archived);
    const occ = `${current.length} / ${settings.capacity}`;
    const pct = Math.min(100, Math.round((current.length/settings.capacity)*100));
    const phase = {};
    current.forEach(s=> { const k=s.phase||"N/A"; phase[k]=(phase[k]||0)+1; });

    const svc = await api.getAll("service");
    const first = startOfMonth(new Date()).getTime();
    const last = endOfMonth(new Date()).getTime();
    const hrs = svc.filter(x=> x.at>=first && x.at<=last).reduce((a,b)=>a+(b.hours||0),0);

    // Use server event fields: start/end/attendees
    const rawEvents = await api.getAll("events");
    const now = Date.now();
    const events = (Array.isArray(rawEvents) ? rawEvents : [])
      .filter(ev => ev?.start && new Date(ev.start).getTime() >= now)
      .sort((a,b)=> new Date(a.start) - new Date(b.start))
      .slice(0,6);

    setKpi({occ,pct, service:hrs, phase, events});
  })(); }, [api]);

  function openAbout(){
    setModal({
      open:true,
      title:"About DSM",
      content:<div><p>This CRM tracks students across phases, dorms, schedules classes and service, and keeps an auditable history of care.</p></div>,
      primary:<button className="btn small primary" onClick={()=>setModal(m=>({...m, open:false}))}>Close</button>
    });
  }

  return (
    <section className="page active" aria-label="Home">
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8}}>
        <h2 style={{margin:0}}>Dashboard</h2>
        <span className="link" onClick={openAbout}>About DSM</span>
      </div>
      <div className="grid">
        <div className="card">
          <h3>Current Occupancy</h3>
          <div className="kpi">{kpi.occ}</div>
          <div style={{height:10, background:"#0b1430", border:"1px solid #22305a", borderRadius:999, overflow:"hidden", marginTop:8}}>
            <div style={{height:"100%", width:kpi.pct+"%", background:"linear-gradient(90deg,#3f8bff,#61d0ff)"}} />
          </div>
        </div>
        <div className="card">
          <h3>Phase Distribution</h3>
          <BarChart labels={Object.keys(kpi.phase)} values={Object.values(kpi.phase)} width={640} height={180} />
        </div>
        <div className="card">
          <h3>Service Hours (This Month)</h3>
          <div className="kpi">{kpi.service} hrs</div>
        </div>
        <div className="card">
          <h3>Upcoming Classes/Events</h3>
          <ul style={{margin:0, paddingLeft:18}}>
            {kpi.events.map(ev=>(
              <li key={ev.id} onClick={()=>setToast("Open calendar to edit")} style={{cursor:"pointer"}}>
                {new Date(ev.start).toLocaleString()} — {ev.title}{ev.attendees?` (${ev.attendees})`:''}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
