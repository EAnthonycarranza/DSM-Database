import React from "react";
import { useApp } from "../context/AppContext";
import Chart from "chart.js/auto";
import { FaChartBar, FaChartLine, FaChartPie, FaFilter, FaSync, FaUsers, FaUserPlus, FaUserSlash, FaDollarSign, FaVenusMars } from "react-icons/fa";

/* ---------------- Small reusable chart wrapper ---------------- */
function ChartBox({ type, data, options, height = 260 }) {
  const canvasRef = React.useRef(null);
  const chartRef = React.useRef(null);

  React.useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    
    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: options?.plugins?.legend?.display ?? true,
          position: options?.plugins?.legend?.position ?? 'bottom',
          labels: {
            usePointStyle: true,
            padding: 20,
            font: { size: 11, weight: '600' }
          }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          padding: 12,
          cornerRadius: 8,
        }
      },
      ...options
    };

    chartRef.current = new Chart(canvasRef.current, { type, data, options: baseOptions });
    return () => chartRef.current?.destroy();
  }, [type, data, options]);

  return (
    <div className="chart-box-outer" style={{ height }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

const PALETTE = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];
function hexToRgba(hex, alpha = 0.7) {
  const h = hex.replace('#', '');
  const bigint = parseInt(h, 16);
  return `rgba(${(bigint >> 16) & 255}, ${(bigint >> 8) & 255}, ${bigint & 255}, ${alpha})`;
}

function countBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const k = keyFn(item) ?? "Unknown";
    map.set(k, (map.get(k) || 0) + 1);
  }
  return map;
}

export default function Insights() {
  const { api } = useApp();
  const [students, setStudents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const stds = await api.getAll("students");
        setStudents(stds);
      } finally { setLoading(false); }
    })();
  }, [api]);

  const derived = React.useMemo(() => {
    const list = students || [];
    const current = list.filter(s => s.status === "Current");

    // Board minutes 4.2: $500/month background check budget at $75/applicant
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthFees = list
      .filter(s => s.backgroundPaidDate && new Date(s.backgroundPaidDate) >= monthStart)
      .reduce((sum, s) => sum + (Number(s.backgroundFee) || 0), 0);

    return {
      phase: countBy(current, s => s.phase ? `Phase ${s.phase}` : "Phase 1"),
      squad: countBy(current, s => s.squad || "Unassigned"),
      dorm: countBy(current, s => s.dorm || "—"),
      gender: countBy(current, s => s.gender || "Unspecified"),
      totalIntakes: list.filter(s => s.intakeDate).length,
      totalDismissals: list.filter(s => s.dismissed).length,
      currentCount: current.length,
      bgCheckMonthSpent: monthFees,
      bgCheckBudget: 500,
    };
  }, [students]);

  if (loading) return <div className="ins-loading">Analyzing data...</div>;

  return (
    <section className="ins-page fade-in">
      <style>{INS_CSS}</style>

      <header className="ins-header">
        <div>
          <h1 className="ins-title">System Insights</h1>
          <p className="ins-subtitle">Comprehensive analytics and program growth tracking.</p>
        </div>
        <div className="ins-actions">
          <button className="ins-btn" onClick={() => window.location.reload()}><FaSync /> Refresh</button>
          <button className="ins-btn primary"><FaFilter /> Filter Data</button>
        </div>
      </header>

      <div className="ins-stat-row">
        <div className="ins-stat-card">
          <div className="ins-stat-icon"><FaUsers /></div>
          <div>
            <div className="ins-stat-label">Current Students</div>
            <div className="ins-stat-value">{derived.currentCount}</div>
          </div>
        </div>
        <div className="ins-stat-card">
          <div className="ins-stat-icon intake"><FaUserPlus /></div>
          <div>
            <div className="ins-stat-label">Total Intakes</div>
            <div className="ins-stat-value">{derived.totalIntakes}</div>
          </div>
        </div>
        <div className="ins-stat-card">
          <div className="ins-stat-icon dismiss"><FaUserSlash /></div>
          <div>
            <div className="ins-stat-label">Dismissals</div>
            <div className="ins-stat-value">{derived.totalDismissals}</div>
          </div>
        </div>
        <div className="ins-stat-card">
          <div className="ins-stat-icon budget"><FaDollarSign /></div>
          <div>
            <div className="ins-stat-label">Background Checks (this month)</div>
            <div className="ins-stat-value">${derived.bgCheckMonthSpent.toFixed(0)} <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 600 }}>/ ${derived.bgCheckBudget}</span></div>
          </div>
        </div>
      </div>

      <div className="ins-grid">
        <div className="ins-card">
          <div className="ins-card-head">
            <h3><FaChartPie /> Phase Distribution</h3>
            <span>Current Residents</span>
          </div>
          <ChartBox
            type="doughnut"
            data={{
              labels: Array.from(derived.phase.keys()),
              datasets: [{
                data: Array.from(derived.phase.values()),
                backgroundColor: PALETTE,
                borderWidth: 0,
                cutout: '70%'
              }]
            }}
            height={260}
          />
        </div>

        <div className="ins-card">
          <div className="ins-card-head">
            <h3><FaUsers /> Squad Sizes</h3>
            <span>Team Allocation</span>
          </div>
          <ChartBox
            type="bar"
            data={{
              labels: Array.from(derived.squad.keys()),
              datasets: [{
                data: Array.from(derived.squad.values()),
                backgroundColor: hexToRgba(PALETTE[0], 0.8),
                borderRadius: 6
              }]
            }}
            height={260}
          />
        </div>

        <div className="ins-card">
          <div className="ins-card-head">
            <h3><FaChartBar /> Housing Occupancy</h3>
            <span>Current Dorm Residents</span>
          </div>
          <ChartBox
            type="bar"
            data={{
              labels: Array.from(derived.dorm.keys()),
              datasets: [{
                data: Array.from(derived.dorm.values()),
                backgroundColor: hexToRgba(PALETTE[4], 0.8),
                borderRadius: 6
              }]
            }}
            options={{ indexAxis: 'y' }}
            height={260}
          />
        </div>

        <div className="ins-card">
          <div className="ins-card-head">
            <h3><FaVenusMars /> Gender Breakdown</h3>
            <span>Current Residents</span>
          </div>
          <ChartBox
            type="doughnut"
            data={{
              labels: Array.from(derived.gender.keys()),
              datasets: [{
                data: Array.from(derived.gender.values()),
                backgroundColor: PALETTE,
                borderWidth: 0,
                cutout: '70%'
              }]
            }}
            height={260}
          />
        </div>
      </div>
    </section>
  );
}

const INS_CSS = `
  .ins-page { padding: 8px 0; max-width: 1400px; margin: 0 auto; }
  .ins-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; padding: 0 4px; }
  .ins-title { font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -0.5px; }
  .ins-subtitle { color: var(--text-muted); margin: 4px 0 0; font-size: 15px; font-weight: 500; }
  
  .ins-actions { display: flex; gap: 12px; }
  .ins-btn { height: 44px; padding: 0 20px; border-radius: 12px; font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px; transition: all 0.2s; cursor: pointer; background: var(--surface); border: 1px solid var(--border); color: var(--text); }
  .ins-btn:hover { background: var(--bg); border-color: #cbd5e1; }
  .ins-btn.primary { background: var(--primary); border: none; color: white; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2); }

  .ins-stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .ins-stat-card { display: flex; align-items: center; gap: 16px; padding: 20px 24px; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; box-shadow: var(--shadow); }
  .ins-stat-icon { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; background: rgba(99, 102, 241, 0.1); color: #6366f1; font-size: 20px; }
  .ins-stat-icon.intake { background: rgba(16, 185, 129, 0.1); color: #10b981; }
  .ins-stat-icon.dismiss { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
  .ins-stat-icon.budget { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
  .ins-stat-label { font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.6px; }
  .ins-stat-value { font-size: 24px; font-weight: 800; color: var(--text); margin-top: 2px; }

  .ins-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(440px, 1fr)); gap: 24px; }
  .ins-card { background: var(--surface); border-radius: 24px; border: 1px solid var(--border); padding: 28px; box-shadow: var(--shadow); transition: transform 0.2s; }
  .ins-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); }

  .ins-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
  .ins-card-head h3 { font-size: 16px; font-weight: 800; margin: 0; display: flex; align-items: center; gap: 10px; color: var(--text); }
  .ins-card-head span { font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 1px; }

  .ins-loading { height: 400px; display: grid; place-items: center; font-weight: 700; color: var(--text-muted); font-size: 18px; }

  @media (max-width: 768px) {
    .ins-page { padding: 0; }
    .ins-header { flex-direction: column; align-items: stretch; gap: 12px; margin-bottom: 18px; }
    .ins-title { font-size: 22px; }
    .ins-subtitle { font-size: 13px; }
    .ins-actions { gap: 10px; }
    .ins-actions .ins-btn { flex: 1; justify-content: center; height: 44px; }

    .ins-stat-row { grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 18px; }
    .ins-stat-card { padding: 14px 12px; gap: 10px; border-radius: 14px; }
    .ins-stat-icon { width: 38px; height: 38px; font-size: 16px; border-radius: 10px; }
    .ins-stat-label { font-size: 10px; letter-spacing: 0.3px; }
    .ins-stat-value { font-size: 18px; }

    .ins-grid { grid-template-columns: 1fr; gap: 14px; }
    .ins-card { padding: 20px 18px; border-radius: 18px; }
    .ins-card:hover { transform: none; }
    .ins-card-head { margin-bottom: 16px; }
    .ins-card-head h3 { font-size: 14px; }
  }

  @media (max-width: 380px) {
    .ins-stat-row { grid-template-columns: 1fr; }
  }
`;
