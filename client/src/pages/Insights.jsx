import React from "react";
import { useApp } from "../context/AppContext";
import Chart from "chart.js/auto"; // Chart.js v4 (auto registers controllers)

/* ---------------- Small reusable chart wrapper ---------------- */
function ChartBox({ type, data, options, height = 260 }) {
  const canvasRef = React.useRef(null);
  const chartRef = React.useRef(null);

  React.useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, { type, data, options });
    return () => chartRef.current?.destroy();
  }, [type, data, options]);

  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

/* ---------------- Helpers ---------------- */
const toDate = (v) => (v ? new Date(v) : null);
const fmtMonth = (d) => d.toLocaleString(undefined, { month: "short" });
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);

const PALETTE = [
  "#61d0ff",
  "#3b6fff",
  "#7ad1b8",
  "#f4c95d",
  "#f28f8f",
  "#c792ea",
  "#84a59d",
  "#9fb4de",
  "#e07a5f",
];

function hexToRgba(hex, alpha = 0.7) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h;
  const bigint = parseInt(full, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
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
  const [settings, setSettings] = React.useState(null);

  React.useEffect(() => {
    (async () => {
      setStudents(await api.getAll("students"));
      setSettings(await api.get("settings", "settings"));
    })();
  }, [api]);

  // Months (last 12)
  const months = React.useMemo(() => {
    const arr = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) arr.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
    return arr;
  }, []);

  // Map dormId -> name
  const dormMap = React.useMemo(() => {
    const ds = settings?.dorms || [];
    return new Map(ds.map((d) => [d.id, d.name]));
  }, [settings]);

  // Normalize students so charts always have the fields they expect
  const normStudents = React.useMemo(() => {
    return (students || []).map((s) => {
      const recordType =
        s.recordType ||
        (s.status === "Current"
          ? "Resident"
          : s.status === "Waitlist"
          ? "Applicant"
          : s.status === "Alumni"
          ? "Alumni"
          : "Prospect");
      const dorm = s.dorm || dormMap.get(s.dormId) || s.dormId || "—";
      const squad = s.squad || "Unassigned";
      const intakeDate = s.intakeDate || s.createdAt || null;
      const exitDate = s.exitDate || ((s.status === "Alumni" || s.archived) ? s.updatedAt : null) || null;
      return { ...s, recordType, dorm, squad, intakeDate, exitDate };
    });
  }, [students, dormMap]);

  // Derived data
  const derived = React.useMemo(() => {
    const byStatus = countBy(normStudents, (s) => s.status || "Unknown");
    const byRecordType = countBy(normStudents, (s) => s.recordType || "Unknown");
    const current = normStudents.filter((s) => s.status === "Current");

    const byPhase = countBy(current, (s) => (s.phase ? String(s.phase) : "1"));
    const bySquad = countBy(current, (s) => (s.squad && String(s.squad).trim()) || "Unassigned");
    const byDorm = countBy(current, (s) => s.dorm || "—");

    // Intakes per month (count if intakeDate falls in that month)
    const intakeByMonth = months.map((m) => {
      const m0 = startOfMonth(m);
      const m1 = endOfMonth(m);
      return normStudents.filter((s) => {
        const d = toDate(s.intakeDate);
        return d && d >= m0 && d <= m1;
      }).length;
    });

    // Active across months
    const activeByMonth = months.map((m) => {
      const m0 = startOfMonth(m);
      const m1 = endOfMonth(m);
      return normStudents.filter((s) => {
        if (s.status !== "Current") return false;
        const inD = toDate(s.intakeDate) || new Date(0);
        const outD = toDate(s.exitDate);
        const afterStart = inD <= m1;
        const notExited = !outD || outD >= m0;
        return afterStart && notExited;
      }).length;
    });

    // Admissions funnel
    const funnelLabels = [
      "Prospect",
      "Applicant / Waitlist",
      "Current — Phase 1",
      "Current — Phase 2",
      "Alumni",
    ];
    const funnelValues = [
      normStudents.filter((s) => s.recordType === "Prospect").length,
      normStudents.filter((s) => s.recordType === "Applicant" || s.status === "Waitlist").length,
      normStudents.filter((s) => s.status === "Current" && (!s.phase || String(s.phase) === "1")).length,
      normStudents.filter((s) => s.status === "Current" && String(s.phase) === "2").length,
      normStudents.filter((s) => s.status === "Alumni" || s.recordType === "Alumni").length,
    ];

    return {
      byStatus,
      byRecordType,
      byPhase,
      bySquad,
      byDorm,
      intakeByMonth,
      activeByMonth,
      funnel: { labels: funnelLabels, values: funnelValues },
    };
  }, [normStudents, months]);

  // Convenience arrays for charts
  const statusLabels = React.useMemo(() => Array.from(derived.byStatus.keys()), [derived]);
  const statusValues = React.useMemo(() => Array.from(derived.byStatus.values()), [derived]);

  const recordLabels = React.useMemo(() => Array.from(derived.byRecordType.keys()), [derived]);
  const recordValues = React.useMemo(() => Array.from(derived.byRecordType.values()), [derived]);

  // Sort record types by count (desc) for a clearer horizontal bar chart
  const recordPairs = React.useMemo(() => Array.from(derived.byRecordType.entries()), [derived]);
  const sortedRecords = React.useMemo(() => [...recordPairs].sort((a, b) => b[1] - a[1]), [recordPairs]);
  const recordBarLabels = React.useMemo(() => sortedRecords.map(([k]) => k), [sortedRecords]);
  const recordBarValues = React.useMemo(() => sortedRecords.map(([, v]) => v), [sortedRecords]);

  const phaseLabels = React.useMemo(() => Array.from(derived.byPhase.keys()), [derived]);
  const phaseValues = React.useMemo(() => Array.from(derived.byPhase.values()), [derived]);

  const dormLabels = React.useMemo(() => Array.from(derived.byDorm.keys()), [derived]);
  const dormValues = React.useMemo(() => Array.from(derived.byDorm.values()), [derived]);

  const squadPairs = React.useMemo(() => Array.from(derived.bySquad.entries()), [derived]);
  const sortedSquads = React.useMemo(() => {
    const arr = [...squadPairs];
    // Keep A/B/C first, push Unassigned to the end, otherwise alpha-sort
    arr.sort((a, b) => {
      const aU = a[0] === "Unassigned";
      const bU = b[0] === "Unassigned";
      if (aU && !bU) return 1;
      if (bU && !aU) return -1;
      return String(a[0]).localeCompare(String(b[0]));
    });
    return arr;
  }, [squadPairs]);
  const squadChartLabels = React.useMemo(() => sortedSquads.map(([k]) => k), [sortedSquads]);
  const squadChartValues = React.useMemo(() => sortedSquads.map(([, v]) => v), [sortedSquads]);
  const squadColors = React.useMemo(
    () => squadChartValues.map((_, i) => hexToRgba(PALETTE[i % PALETTE.length], 0.75)),
    [squadChartValues]
  );
  const squadBorderColors = React.useMemo(
    () => squadChartValues.map((_, i) => hexToRgba(PALETTE[i % PALETTE.length], 1)),
    [squadChartValues]
  );

  const monthLabels = months.map((m) => fmtMonth(m));

  /* ---------------- Page ---------------- */
  return (
    <section className="page active" aria-label="Insights">
      <style>{`
        .ins-grid{ display:grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap:12px; }
        .chart.card{ overflow:hidden; }
        .chart h3{ margin:0 0 8px 0; }
      `}</style>

      <div className="ins-grid">
        {/* 1. Status distribution (Doughnut) */}
        <div className="chart card">
          <h3>Status distribution</h3>
          <ChartBox
            type="doughnut"
            data={{
              labels: statusLabels,
              datasets: [{ data: statusValues, backgroundColor: PALETTE }],
            }}
            options={{
              plugins: { legend: { position: "right" } },
              maintainAspectRatio: false,
            }}
            height={260}
          />
        </div>

        {/* 2. Active students over last 12 months (Line) */}
        <div className="chart card">
          <h3>Active students (last 12 months)</h3>
          <ChartBox
            type="line"
            data={{
              labels: monthLabels,
              datasets: [
                {
                  label: "Active",
                  data: derived.activeByMonth,
                  borderColor: PALETTE[1],
                  backgroundColor: "rgba(59,111,255,.2)",
                  tension: 0.3,
                  fill: true,
                },
              ],
            }}
            options={{
              plugins: { legend: { display: true } },
              scales: { y: { beginAtZero: true } },
              maintainAspectRatio: false,
            }}
            height={260}
          />
        </div>

        {/* 3. Intakes per month (Bar) */}
        <div className="chart card">
          <h3>New intakes per month</h3>
          <ChartBox
            type="bar"
            data={{
              labels: monthLabels,
              datasets: [
                {
                  label: "Intakes",
                  data: derived.intakeByMonth,
                  backgroundColor: PALETTE[0],
                },
              ],
            }}
            options={{
              scales: { y: { beginAtZero: true } },
              maintainAspectRatio: false,
            }}
            height={260}
          />
        </div>

        {/* 4. Admissions funnel (Horizontal Bar) */}
        <div className="chart card">
          <h3>Admissions funnel</h3>
          <ChartBox
            type="bar"
            data={{
              labels: derived.funnel.labels,
              datasets: [
                {
                  label: "People",
                  data: derived.funnel.values,
                  backgroundColor: (ctx) => PALETTE[ctx.dataIndex % PALETTE.length],
                },
              ],
            }}
            options={{
              indexAxis: "y",
              scales: { x: { beginAtZero: true } },
              maintainAspectRatio: false,
            }}
            height={280}
          />
        </div>

        {/* 5. Phase breakdown among Current (Pie) */}
        <div className="chart card">
          <h3>Phase (Current only)</h3>
          <ChartBox
            type="pie"
            data={{
              labels: phaseLabels,
              datasets: [{ data: phaseValues, backgroundColor: PALETTE }],
            }}
            options={{ plugins: { legend: { position: "right" } }, maintainAspectRatio: false }}
            height={260}
          />
        </div>

        {/* 6. Squad distribution (Polar Area) */}
        <div className="chart card">
          <h3>Squads</h3>
          <ChartBox
            type="polarArea"
            data={{
              labels: squadChartLabels,
              datasets: [
                {
                  label: "Squad size",
                  data: squadChartValues,
                  backgroundColor: squadColors,
                  borderColor: squadBorderColors,
                  borderWidth: 1,
                  hoverBorderWidth: 1,
                },
              ],
            }}
            options={{
              plugins: {
                legend: { position: "top", labels: { boxWidth: 14 } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.formattedValue}` } },
              },
              scales: {
                r: {
                  ticks: { display: false },
                  grid: { color: "rgba(255,255,255,0.07)" },
                  angleLines: { color: "rgba(255,255,255,0.07)" },
                  suggestedMin: 0,
                  suggestedMax: Math.max(...squadChartValues, 1),
                },
              },
              animation: { animateRotate: true, animateScale: true },
              maintainAspectRatio: false,
            }}
            height={300}
          />
        </div>

        {/* 7. Dorm occupancy (Horizontal Bar) */}
        <div className="chart card" style={{ gridColumn: "1 / -1" }}>
          <h3>Dorm occupancy (Current)</h3>
          <ChartBox
            type="bar"
            data={{
              labels: dormLabels,
              datasets: [
                {
                  label: "Students",
                  data: dormValues,
                  backgroundColor: PALETTE[2],
                },
              ],
            }}
            options={{ indexAxis: "y", scales: { x: { beginAtZero: true } }, maintainAspectRatio: false }}
            height={320}
          />
        </div>

        {/* 8. Record types (Horizontal Bar for better readability) */}
        <div className="chart card">
          <h3>Record Types</h3>
          <ChartBox
            type="bar"
            data={{
              labels: recordBarLabels,
              datasets: [
                {
                  label: "Count",
                  data: recordBarValues,
                  backgroundColor: recordBarValues.map((_, i) => PALETTE[i % PALETTE.length]),
                  borderRadius: 8,
                  maxBarThickness: 36,
                },
              ],
            }}
            options={{
              indexAxis: "y",
              plugins: { legend: { display: true }, tooltip: { enabled: true } },
              scales: {
                x: { beginAtZero: true, grid: { color: "rgba(255,255,255,0.06)" } },
                y: { grid: { display: false } },
              },
              maintainAspectRatio: false,
            }}
            height={300}
          />
        </div>
      </div>
    </section>
  );
}
