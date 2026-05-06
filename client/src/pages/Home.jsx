import React, { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { BarChart } from "../components/ChartCanvas";
import { startOfMonth, endOfMonth } from "../utils/helpers";
import { 
  FaUsers, FaChartPie, FaHandsHelping, FaCalendarCheck, 
  FaInfoCircle, FaArrowUp, FaBed, FaLayerGroup 
} from "react-icons/fa";

export default function Home() {
  const { api, setModal, setToast } = useApp();
  const [winW, setWinW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  const [kpi, setKpi] = useState({ occ: "0 / 0", current: 0, capacity: 0, pct: 0, service: 0, phase: {}, events: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleResize = () => setWinW(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const students = await api.getAll("students");
        const settings = (await api.get("settings", "settings")) || { capacity: 21 };
        const current = students.filter(s => s.status === "Current" && !s.archived);
        const occPct = Math.min(100, Math.round((current.length / settings.capacity) * 100));
        
        const phase = {};
        current.forEach(s => { const k = s.phase || "N/A"; phase[k] = (phase[k] || 0) + 1; });

        const svc = await api.getAll("service");
        const first = startOfMonth(new Date()).getTime();
        const last = endOfMonth(new Date()).getTime();
        const hrs = svc.filter(x => x.at >= first && x.at <= last).reduce((a, b) => a + (b.hours || 0), 0);

        const rawEvents = await api.getAll("events");
        const now = Date.now();
        const events = (Array.isArray(rawEvents) ? rawEvents : [])
          .filter(ev => ev?.start && new Date(ev.start).getTime() >= now)
          .sort((a, b) => new Date(a.start) - new Date(b.start))
          .slice(0, 6);

        setKpi({ 
          occ: `${current.length} / ${settings.capacity}`, 
          current: current.length,
          capacity: settings.capacity,
          pct: occPct, 
          service: hrs, 
          phase, 
          events 
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

  function openAbout() {
    setModal({
      open: true,
      title: "System Overview",
      content: (
        <div style={{ lineHeight: 1.6 }}>
          <p><strong>Discipleship School of Ministry (DSM)</strong> is a comprehensive management ecosystem designed to track student progress through transformative phases.</p>
          <ul style={{ paddingLeft: 20 }}>
            <li>Real-time occupancy and capacity tracking</li>
            <li>Phase-based progress visualization</li>
            <li>Integrated service hour auditing</li>
            <li>Centralized event and class scheduling</li>
          </ul>
        </div>
      ),
      primary: <button className="dsm-btn-primary" onClick={() => setModal(m => ({ ...m, open: false }))}>Understood</button>
    });
  }

  if (loading) return <div className="home-loading">Synchronizing workspace...</div>;

  const chartW = winW < 768 ? Math.max(winW - 80, 400) : 800;

  return (
    <section className="home-page fade-in">
      <style>{HOME_CSS}</style>
      
      <header className="home-header">
        <div>
          <h1 className="home-title">Welcome back, Admin</h1>
          <p className="home-subtitle">Here is what's happening at the school today.</p>
        </div>
        <button className="about-trigger" onClick={openAbout}>
          <FaInfoCircle /> System Info
        </button>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon occ"><FaBed /></div>
          <div className="stat-info">
            <div className="stat-label">Current Occupancy</div>
            <div className="stat-value">{kpi.occ}</div>
            <div className="stat-progress">
              <div className="bar" style={{ width: `${kpi.pct}%` }} />
            </div>
            <div className="stat-meta">{kpi.pct}% capacity utilized</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon svc"><FaHandsHelping /></div>
          <div className="stat-info">
            <div className="stat-label">Monthly Service</div>
            <div className="stat-value">{kpi.service} <small>hrs</small></div>
            <div className="stat-trend positive">
              <FaArrowUp /> Active Participation
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon std"><FaUsers /></div>
          <div className="stat-info">
            <div className="stat-label">Total Current</div>
            <div className="stat-value">{kpi.current}</div>
            <div className="stat-meta">Verified Residents</div>
          </div>
        </div>
      </div>

      <div className="main-grid">
        <div className="content-card chart-section">
          <div className="card-head">
            <h3><FaLayerGroup /> Phase Distribution</h3>
            <p>Breakdown of students across program levels.</p>
          </div>
          <div className="chart-wrapper">
            <div className="chart-scroll-hint">Scroll to explore →</div>
            <BarChart 
              labels={Object.keys(kpi.phase).map(p => `Phase ${p}`)} 
              values={Object.values(kpi.phase)} 
              width={chartW} 
              height={240} 
            />
          </div>
        </div>

        <div className="content-card events-section">
          <div className="card-head">
            <h3><FaCalendarCheck /> Upcoming Schedule</h3>
            <p>Classes and events for the next 7 days.</p>
          </div>
          <div className="event-list">
            {kpi.events.length ? kpi.events.map(ev => (
              <div key={ev.id} className="event-item" onClick={() => setToast("Calendar integration active")}>
                <div className="event-date">
                  <span className="day">{new Date(ev.start).getDate()}</span>
                  <span className="month">{new Date(ev.start).toLocaleString('default', { month: 'short' })}</span>
                </div>
                <div className="event-details">
                  <div className="event-name">{ev.title}</div>
                  <div className="event-time">
                    {new Date(ev.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {ev.attendees ? ` • ${ev.attendees} attending` : ''}
                  </div>
                </div>
              </div>
            )) : (
              <div className="empty-schedule">
                <FaCalendarCheck className="empty-icon" />
                <p>No upcoming events scheduled</p>
                <span>Check back later for new classes or meetings.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const HOME_CSS = `
  .home-page { padding: 12px 0; max-width: 1400px; margin: 0 auto; }
  .home-header { 
    display: flex; 
    align-items: center; 
    justify-content: space-between; 
    margin-bottom: 40px; 
    padding: 0 4px;
  }
  .home-title { font-family: 'Playfair Display', serif; font-size: 32px; font-weight: 900; margin: 0; color: var(--brand-burgundy); }
  .home-subtitle { color: var(--text-muted); margin: 6px 0 0; font-size: 16px; font-weight: 500; }
  
  .about-trigger { 
    display: flex; 
    align-items: center; 
    gap: 10px; 
    padding: 12px 20px; 
    border-radius: 16px; 
    background: var(--surface); 
    border: 1px solid var(--border); 
    font-weight: 700; 
    font-size: 14px; 
    color: var(--primary); 
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 4px rgba(0,0,0,0.04);
  }
  .about-trigger:hover { 
    background: var(--primary); 
    color: white; 
    box-shadow: var(--shadow-brand); 
    transform: translateY(-2px);
  }

  .stats-grid { 
    display: grid; 
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); 
    gap: 28px; 
    margin-bottom: 40px; 
  }
  .stat-card { 
    background: var(--surface); 
    border-radius: 30px; 
    padding: 30px; 
    display: flex; 
    align-items: flex-start; 
    gap: 24px; 
    border: 1px solid rgba(var(--accent-rgb), 0.1); 
    box-shadow: 0 10px 30px -5px rgba(0,0,0,0.05); 
    transition: all 0.3s ease; 
    position: relative;
    overflow: hidden;
  }
  .stat-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; width: 4px; height: 100%;
    background: var(--primary);
    opacity: 0;
    transition: 0.3s;
  }
  .stat-card:hover { transform: translateY(-6px); box-shadow: 0 20px 40px -10px rgba(0,0,0,0.1); }
  .stat-card:hover::before { opacity: 1; }
  
  .stat-icon { 
    width: 64px; height: 64px; 
    border-radius: 20px; 
    display: grid; place-items: center; 
    font-size: 26px; flex-shrink: 0; 
    background: var(--surface-2);
    box-shadow: inset 0 2px 6px rgba(0,0,0,0.04);
  }
  .stat-icon.occ { color: var(--brand-burgundy); background: rgba(123, 31, 44, 0.05); }
  .stat-icon.svc { color: var(--brand-forest); background: rgba(45, 95, 63, 0.05); }
  .stat-icon.std { color: var(--brand-gold-dark); background: rgba(201, 169, 97, 0.05); }

  .stat-info { flex: 1; }
  .stat-label { font-size: 13px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; }
  .stat-value { font-family: 'Playfair Display', serif; font-size: 38px; font-weight: 900; color: var(--text); margin: 6px 0; letter-spacing: -0.5px; }
  .stat-value small { font-size: 18px; font-weight: 700; opacity: 0.5; }
  
  .stat-progress { height: 12px; background: var(--bg); border-radius: 20px; overflow: hidden; margin: 16px 0 10px; border: 1px solid var(--border); }
  .stat-progress .bar { height: 100%; background: linear-gradient(90deg, var(--brand-burgundy), var(--brand-burgundy-light)); border-radius: 20px; transition: width 1s ease-out; }
  .stat-meta { font-size: 13px; color: var(--text-muted); font-weight: 600; }
  .stat-trend { font-size: 13px; font-weight: 800; display: flex; align-items: center; gap: 6px; }
  .stat-trend.positive { color: var(--brand-forest); }

  .main-grid { display: grid; grid-template-columns: 1fr 420px; gap: 32px; }
  .content-card { 
    background: var(--surface); 
    border-radius: 32px; 
    border: 1px solid rgba(var(--accent-rgb), 0.1); 
    padding: 36px; 
    box-shadow: 0 10px 30px -5px rgba(0,0,0,0.05); 
  }
  .card-head { margin-bottom: 30px; border-bottom: 1px solid var(--border); padding-bottom: 20px; }
  .card-head h3 { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 900; margin: 0; display: flex; align-items: center; gap: 12px; color: var(--brand-burgundy); }
  .card-head p { font-size: 15px; color: var(--text-muted); margin: 6px 0 0; font-weight: 500; }

  .chart-wrapper { 
    padding: 10px 0; 
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    cursor: grab;
    position: relative;
    display: flex;
    justify-content: center;
  }
  .chart-scroll-hint { 
    display: none; 
    position: absolute; 
    bottom: 0; 
    right: 0; 
    font-size: 11px; 
    font-weight: 800; 
    color: var(--primary); 
    background: var(--primary-soft); 
    padding: 4px 10px; 
    border-radius: 20px;
    animation: bounceRight 2s infinite;
  }
  @keyframes bounceRight { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(5px); } }

  .event-list { display: flex; flex-direction: column; gap: 14px; }
  .event-item { 
    display: flex; 
    align-items: center; 
    gap: 18px; 
    padding: 16px; 
    border-radius: 20px; 
    background: var(--surface-2);
    border: 1px solid transparent; 
    cursor: pointer; 
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); 
  }
  .event-item:hover { 
    background: var(--surface); 
    border-color: var(--brand-gold-light); 
    transform: scale(1.02);
    box-shadow: 0 4px 12px rgba(0,0,0,0.04);
  }
  
  .event-date { 
    width: 54px; height: 54px; 
    background: var(--surface); 
    border: 2px solid var(--primary-soft); 
    border-radius: 16px; 
    display: flex; flex-direction: column; align-items: center; justify-content: center; 
    flex-shrink: 0; 
    box-shadow: 0 2px 4px rgba(0,0,0,0.03);
  }
  .event-date .day { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 900; line-height: 1; color: var(--brand-burgundy); }
  .event-date .month { font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--brand-gold-dark); margin-top: 2px; }
  
  .event-details { flex: 1; min-width: 0; }
  .event-name { font-size: 15px; font-weight: 800; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .event-time { font-size: 13px; color: var(--text-muted); font-weight: 600; margin-top: 4px; display: flex; align-items: center; gap: 6px; }

  .empty-schedule { 
    padding: 40px 20px; 
    text-align: center; 
    background: var(--surface-2); 
    border-radius: 24px;
    border: 2px dashed var(--border);
    margin: 0 auto;
    width: 100%;
    max-width: 400px;
  }
  .empty-schedule .empty-icon { font-size: 32px; color: var(--text-muted); opacity: 0.3; margin-bottom: 12px; }
  .empty-schedule p { font-size: 16px; font-weight: 800; color: var(--text); margin: 0; }
  .empty-schedule span { font-size: 13px; color: var(--text-muted); margin-top: 4px; display: block; }

  .home-loading { height: calc(100vh - var(--nav-h)); display: grid; place-items: center; font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 900; color: var(--brand-burgundy); background: var(--bg); }

  @media (max-width: 1024px) {
    .main-grid { grid-template-columns: 1fr; }
  }

  @media (max-width: 768px) {
    .home-page { padding: 4px 0; width: 100%; overflow-x: hidden; }
    .home-header { 
      flex-direction: column; 
      align-items: stretch; 
      gap: 16px; 
      margin-bottom: 30px; 
      padding: 0 16px;
    }
    .home-title { font-size: 28px; line-height: 1.1; }
    .home-subtitle { font-size: 15px; margin-top: 4px; line-height: 1.4; }
    .about-trigger { width: 100%; justify-content: center; min-height: 50px; font-size: 14px; border-radius: 16px; }

    .stats-grid { 
      grid-template-columns: 1fr; 
      gap: 16px; 
      margin-bottom: 30px; 
      padding: 0 16px;
    }
    .stat-card { padding: 24px; border-radius: 26px; }
    .stat-icon { width: 56px; height: 56px; border-radius: 16px; font-size: 22px; }
    .stat-value { font-size: 32px; }

    .main-grid { gap: 20px; padding: 0 16px; width: 100%; }
    .content-card { padding: 28px 24px; border-radius: 28px; width: 100%; }
    .card-head { margin-bottom: 24px; }
    .card-head h3 { font-size: 20px; }

    .chart-wrapper > div { min-width: 420px; }
    .chart-scroll-hint { display: block; top: 10px; right: 10px; }
  }

  @media (max-width: 480px) {
    .home-header { padding: 0 12px; }
    .home-title { font-size: 24px; }
    .home-subtitle { font-size: 14px; }
    
    .stats-grid { padding: 0 12px; gap: 12px; }
    .stat-card { padding: 20px; gap: 16px; border-radius: 24px; }
    .stat-icon { width: 48px; height: 48px; font-size: 20px; }
    .stat-value { font-size: 28px; }
    
    .main-grid { padding: 0 12px; gap: 16px; }
    .content-card { padding: 24px 20px; border-radius: 24px; }
    
    .chart-wrapper > div { min-width: 360px; }
    .chart-scroll-hint { font-size: 10px; padding: 3px 8px; }

    .empty-schedule { padding: 30px 16px; }
    .empty-schedule .empty-icon { font-size: 28px; }
    .empty-schedule p { font-size: 15px; }
  }
`;
