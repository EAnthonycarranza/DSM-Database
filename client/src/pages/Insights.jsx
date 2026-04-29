import React, { useState, useEffect, useMemo, useRef } from "react";
import { useApp } from "../context/AppContext";
import Chart from "chart.js/auto";
import { 
  FaChartBar, FaChartLine, FaChartPie, FaFilter, FaSync, FaUsers, 
  FaUserPlus, FaUserSlash, FaDollarSign, FaVenusMars, FaDonate, 
  FaWallet, FaPlus, FaCalendarAlt, FaChevronRight, FaTrash, FaEdit,
  FaArrowUp, FaArrowDown, FaPiggyBank, FaHistory
} from "react-icons/fa";

/* ---------------- Reusable Chart Component ---------------- */
function ChartBox({ type, data, options, height = 260 }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    
    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: options?.plugins?.legend?.display ?? true,
          position: options?.plugins?.legend?.position ?? 'bottom',
          labels: { usePointStyle: true, padding: 20, font: { size: 11, weight: '600' } }
        },
        tooltip: { backgroundColor: '#0f172a', padding: 12, cornerRadius: 8 }
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

const PALETTE = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444"];
const hexToRgba = (hex, alpha = 0.7) => {
  const h = hex.replace('#', '');
  const bigint = parseInt(h, 16);
  return `rgba(${(bigint >> 16) & 255}, ${(bigint >> 8) & 255}, ${bigint & 255}, ${alpha})`;
};

const countBy = (list, keyFn) => {
  const map = new Map();
  for (const item of list) {
    const k = keyFn(item) ?? "Unknown";
    map.set(k, (map.get(k) || 0) + 1);
  }
  return map;
};

const fmtCurrency = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0);

/* ---------------- Main Insights Component ---------------- */
export default function Insights() {
  const { api, data, setToast, setModal } = useApp();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [filterRange, setFilterRange] = useState("year"); // month, quarter, year
  
  // Data State
  const [students, setStudents] = useState([]);
  const [donations, setDonations] = useState([]);
  const [expenses, setExpenses] = useState([]);

  const refresh = async () => {
    setLoading(true);
    try {
      const [s, d, e] = await Promise.all([
        api.getAll("students"),
        api.getAll("donations"),
        api.getAll("budget")
      ]);
      setStudents(s || []);
      setDonations(d || []);
      setExpenses(e || []);
    } catch (err) {
      setToast({ type: "error", text: "Failed to load financial data" });
    } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  // Financial Calculations
  const fin = useMemo(() => {
    const now = new Date();
    const filterDate = new Date();
    if (filterRange === "month") filterDate.setMonth(now.getMonth() - 1);
    else if (filterRange === "quarter") filterDate.setMonth(now.getMonth() - 3);
    else if (filterRange === "year") filterDate.setFullYear(now.getFullYear() - 1);

    const filteredDonations = donations.filter(d => new Date(d.date) >= filterDate);
    const filteredExpenses = expenses.filter(e => new Date(e.date) >= filterDate);

    const totalDonations = filteredDonations.reduce((sum, d) => sum + Number(d.amount), 0);
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    
    // Grouping
    const donByCat = new Map();
    filteredDonations.forEach(d => {
      const c = d.category || "General";
      donByCat.set(c, (donByCat.get(c) || 0) + Number(d.amount));
    });

    const expByCat = new Map();
    filteredExpenses.forEach(e => {
      const c = e.category || "Miscellaneous";
      expByCat.set(c, (expByCat.get(c) || 0) + Number(e.amount));
    });

    return {
      totalDonations,
      totalExpenses,
      net: totalDonations - totalExpenses,
      donByCat,
      expByCat,
      donationCount: filteredDonations.length,
      avgDonation: filteredDonations.length ? totalDonations / filteredDonations.length : 0
    };
  }, [donations, expenses, filterRange]);

  // Demographic Calculations
  const dem = useMemo(() => {
    const current = (students || []).filter(s => s.status === "Current");
    return {
      currentCount: current.length,
      phase: countBy(current, s => s.phase ? `Phase ${s.phase}` : "Phase 1"),
      squad: countBy(current, s => s.squad || "Unassigned"),
      dorm: countBy(current, s => s.dorm || "—"),
      gender: countBy(current, s => s.gender || "Unspecified"),
      intakes: students.filter(s => s.intakeDate).length,
      dismissals: students.filter(s => s.dismissed).length
    };
  }, [students]);

  const openDonationModal = (existing = null) => {
    setModal({
      open: true,
      title: existing ? "Edit Donation" : "Add New Donation",
      node: (
        <DonationForm 
          existing={existing} 
          onSave={async (item) => {
            if (existing) await api.put("donations", item);
            else await api.add("donations", { ...item, id: crypto.randomUUID() });
            refresh();
            setModal({ open: false });
            setToast({ type: "success", text: "Donation record updated" });
          }} 
          onClose={() => setModal({ open: false })}
        />
      )
    });
  };

  const openBudgetModal = (existing = null) => {
    setModal({
      open: true,
      title: existing ? "Edit Expense" : "Add New Expense",
      node: (
        <BudgetForm 
          existing={existing} 
          onSave={async (item) => {
            if (existing) await api.put("budget", item);
            else await api.add("budget", { ...item, id: crypto.randomUUID() });
            refresh();
            setModal({ open: false });
            setToast({ type: "success", text: "Budget item updated" });
          }} 
          onClose={() => setModal({ open: false })}
        />
      )
    });
  };

  if (loading && !students.length) return <div className="ins-loading">Analyzing school metrics...</div>;

  return (
    <section className="ins-page fade-in">
      <style>{INS_CSS}</style>

      <header className="ins-header">
        <div>
          <h1 className="ins-title">Command Insights</h1>
          <p className="ins-subtitle">Financial tracking and program analytics.</p>
        </div>
        <div className="ins-actions">
          <div className="ins-range-selector">
            <button className={filterRange === "month" ? "active" : ""} onClick={() => setFilterRange("month")}>Month</button>
            <button className={filterRange === "quarter" ? "active" : ""} onClick={() => setFilterRange("quarter")}>Quarter</button>
            <button className={filterRange === "year" ? "active" : ""} onClick={() => setFilterRange("year")}>Year</button>
          </div>
          <button className="ins-btn" onClick={refresh}><FaSync /> Sync</button>
        </div>
      </header>

      <nav className="ins-tabs">
        <button className={activeTab === "dashboard" ? "active" : ""} onClick={() => setActiveTab("dashboard")}>
          <FaChartBar /> Dashboard
        </button>
        <button className={activeTab === "donations" ? "active" : ""} onClick={() => setActiveTab("donations")}>
          <FaDonate /> Donations
        </button>
        <button className={activeTab === "budget" ? "active" : ""} onClick={() => setActiveTab("budget")}>
          <FaWallet /> Budget
        </button>
      </nav>

      {activeTab === "dashboard" && (
        <div className="ins-content">
          <div className="ins-stat-row">
            <div className="ins-stat-card">
              <div className="ins-stat-icon"><FaUsers /></div>
              <div>
                <div className="ins-stat-label">Current Residents</div>
                <div className="ins-stat-value">{dem.currentCount}</div>
              </div>
            </div>
            <div className="ins-stat-card">
              <div className="ins-stat-icon donation"><FaArrowUp /></div>
              <div>
                <div className="ins-stat-label">Revenue ({filterRange})</div>
                <div className="ins-stat-value">{fmtCurrency(fin.totalDonations)}</div>
              </div>
            </div>
            <div className="ins-stat-card">
              <div className="ins-stat-icon expense"><FaArrowDown /></div>
              <div>
                <div className="ins-stat-label">Expenses ({filterRange})</div>
                <div className="ins-stat-value">{fmtCurrency(fin.totalExpenses)}</div>
              </div>
            </div>
            <div className="ins-stat-card">
              <div className="ins-stat-icon balance"><FaPiggyBank /></div>
              <div>
                <div className="ins-stat-label">Net Balance</div>
                <div className="ins-stat-value" style={{ color: fin.net >= 0 ? '#10b981' : '#ef4444' }}>
                  {fmtCurrency(fin.net)}
                </div>
              </div>
            </div>
          </div>

          <div className="ins-grid">
            <div className="ins-card wide">
              <div className="ins-card-head">
                <h3><FaChartLine /> Cash Flow Overview</h3>
                <span>{filterRange.toUpperCase()} PERFORMANCE</span>
              </div>
              <ChartBox 
                type="line"
                data={{
                  labels: ["Start", "Mid", "Current"],
                  datasets: [
                    {
                      label: 'Revenue',
                      data: [0, fin.totalDonations * 0.4, fin.totalDonations],
                      borderColor: '#10b981',
                      backgroundColor: hexToRgba('#10b981', 0.1),
                      fill: true,
                      tension: 0.4
                    },
                    {
                      label: 'Expenses',
                      data: [0, fin.totalExpenses * 0.6, fin.totalExpenses],
                      borderColor: '#ef4444',
                      backgroundColor: hexToRgba('#ef4444', 0.1),
                      fill: true,
                      tension: 0.4
                    }
                  ]
                }}
                height={300}
              />
            </div>

            <div className="ins-card">
              <div className="ins-card-head">
                <h3><FaChartPie /> Donation Sources</h3>
                <span>BY CATEGORY</span>
              </div>
              <ChartBox 
                type="doughnut"
                data={{
                  labels: Array.from(fin.donByCat.keys()),
                  datasets: [{
                    data: Array.from(fin.donByCat.values()),
                    backgroundColor: PALETTE,
                    borderWidth: 0,
                    cutout: '70%'
                  }]
                }}
              />
            </div>

            <div className="ins-card">
              <div className="ins-card-head">
                <h3><FaChartBar /> Resident Demographics</h3>
                <span>PHASE DISTRIBUTION</span>
              </div>
              <ChartBox 
                type="bar"
                data={{
                  labels: Array.from(dem.phase.keys()),
                  datasets: [{
                    data: Array.from(dem.phase.values()),
                    backgroundColor: hexToRgba(PALETTE[0], 0.8),
                    borderRadius: 6
                  }]
                }}
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === "donations" && (
        <div className="ins-content">
          <div className="ins-action-header">
            <h3>Recent Contributions</h3>
            <button className="ins-btn primary" onClick={() => openDonationModal()}><FaPlus /> Add Donation</button>
          </div>
          
          <div className="ins-table-wrap">
            <table className="ins-table">
              <thead>
                <tr>
                  <th>Donor</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Notes</th>
                  <th className="actions"></th>
                </tr>
              </thead>
              <tbody>
                {[...donations].reverse().map(d => (
                  <tr key={d.id}>
                    <td className="bold">{d.donor}</td>
                    <td className="amount">{fmtCurrency(d.amount)}</td>
                    <td>{new Date(d.date).toLocaleDateString()}</td>
                    <td><span className="ins-tag">{d.category}</span></td>
                    <td className="muted">{d.notes || "—"}</td>
                    <td className="actions">
                      <button onClick={() => openDonationModal(d)}><FaEdit /></button>
                      <button className="del" onClick={async () => {
                        if (window.confirm("Delete this donation record?")) {
                          await api.del("donations", d.id);
                          refresh();
                        }
                      }}><FaTrash /></button>
                    </td>
                  </tr>
                ))}
                {!donations.length && <tr><td colSpan="6" className="empty">No donations recorded yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "budget" && (
        <div className="ins-content">
          <div className="ins-action-header">
            <h3>Program Expenses</h3>
            <button className="ins-btn primary" onClick={() => openBudgetModal()}><FaPlus /> Log Expense</button>
          </div>

          <div className="ins-table-wrap">
            <table className="ins-table">
              <thead>
                <tr>
                  <th>Expense Item</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Category</th>
                  <th className="actions"></th>
                </tr>
              </thead>
              <tbody>
                {[...expenses].reverse().map(e => (
                  <tr key={e.id}>
                    <td className="bold">{e.item}</td>
                    <td className="amount expense">-{fmtCurrency(e.amount)}</td>
                    <td>{new Date(e.date).toLocaleDateString()}</td>
                    <td><span className="ins-tag purple">{e.category}</span></td>
                    <td className="actions">
                      <button onClick={() => openBudgetModal(e)}><FaEdit /></button>
                      <button className="del" onClick={async () => {
                        if (window.confirm("Delete this expense?")) {
                          await api.del("budget", e.id);
                          refresh();
                        }
                      }}><FaTrash /></button>
                    </td>
                  </tr>
                ))}
                {!expenses.length && <tr><td colSpan="5" className="empty">No expenses logged yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------- Internal Components ---------------- */

function DonationForm({ existing, onSave, onClose }) {
  const [v, setV] = useState(existing || { donor: "", amount: "", date: new Date().toISOString().slice(0,10), category: "Individual", notes: "" });
  return (
    <div className="ins-form">
      <div className="group">
        <label>Donor Name</label>
        <input value={v.donor} onChange={e => setV({...v, donor: e.target.value})} placeholder="Full name or organization" />
      </div>
      <div className="group">
        <label>Amount ($)</label>
        <input type="number" value={v.amount} onChange={e => setV({...v, amount: e.target.value})} placeholder="0.00" />
      </div>
      <div className="group">
        <label>Date</label>
        <input type="date" value={v.date} onChange={e => setV({...v, date: e.target.value})} />
      </div>
      <div className="group">
        <label>Category</label>
        <select value={v.category} onChange={e => setV({...v, category: e.target.value})}>
          <option>Individual</option>
          <option>Corporate</option>
          <option>Church Grant</option>
          <option>Government</option>
          <option>Other</option>
        </select>
      </div>
      <div className="group full">
        <label>Notes</label>
        <textarea value={v.notes} onChange={e => setV({...v, notes: e.target.value})} placeholder="Optional donation details..." />
      </div>
      <div className="ins-form-footer">
        <button className="dsm-btn-ghost" onClick={onClose}>Cancel</button>
        <button className="dsm-btn-primary" onClick={() => onSave(v)}>Save Donation</button>
      </div>
    </div>
  );
}

function BudgetForm({ existing, onSave, onClose }) {
  const [v, setV] = useState(existing || { item: "", amount: "", date: new Date().toISOString().slice(0,10), category: "Operations" });
  return (
    <div className="ins-form">
      <div className="group">
        <label>Expense Name</label>
        <input value={v.item} onChange={e => setV({...v, item: e.target.value})} placeholder="Rent, Utilities, Supplies..." />
      </div>
      <div className="group">
        <label>Amount ($)</label>
        <input type="number" value={v.amount} onChange={e => setV({...v, amount: e.target.value})} placeholder="0.00" />
      </div>
      <div className="group">
        <label>Date</label>
        <input type="date" value={v.date} onChange={e => setV({...v, date: e.target.value})} />
      </div>
      <div className="group">
        <label>Category</label>
        <select value={v.category} onChange={e => setV({...v, category: e.target.value})}>
          <option>Operations</option>
          <option>Food / Supplies</option>
          <option>Maintenance</option>
          <option>Staffing</option>
          <option>Marketing</option>
          <option>Miscellaneous</option>
        </select>
      </div>
      <div className="ins-form-footer">
        <button className="dsm-btn-ghost" onClick={onClose}>Cancel</button>
        <button className="dsm-btn-primary" onClick={() => onSave(v)}>Log Expense</button>
      </div>
    </div>
  );
}

/* ---------------- Styles ---------------- */

const INS_CSS = `
  .ins-page { padding: 16px 0; max-width: 1400px; margin: 0 auto; }
  .ins-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding: 0 8px; }
  .ins-title { font-size: 32px; font-weight: 900; margin: 0; color: var(--text); letter-spacing: -1px; }
  .ins-subtitle { color: var(--text-muted); margin: 4px 0 0; font-size: 16px; font-weight: 500; }
  
  .ins-range-selector { display: flex; background: var(--bg); padding: 4px; border-radius: 12px; border: 1px solid var(--border); }
  .ins-range-selector button { padding: 6px 16px; border-radius: 8px; font-size: 13px; font-weight: 700; color: var(--text-muted); transition: 0.2s; }
  .ins-range-selector button.active { background: var(--surface); color: var(--primary); box-shadow: var(--shadow); }

  .ins-tabs { display: flex; gap: 8px; margin-bottom: 32px; padding: 0 8px; border-bottom: 1px solid var(--border); }
  .ins-tabs button { padding: 12px 24px; font-size: 14px; font-weight: 800; color: var(--text-muted); display: flex; align-items: center; gap: 10px; transition: 0.2s; border-bottom: 3px solid transparent; }
  .ins-tabs button.active { color: var(--primary); border-bottom-color: var(--primary); }
  .ins-tabs button:hover { color: var(--text); }

  .ins-stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; margin-bottom: 32px; padding: 0 8px; }
  .ins-stat-card { display: flex; align-items: center; gap: 20px; padding: 24px; background: var(--surface); border: 1px solid var(--border); border-radius: 24px; box-shadow: var(--shadow); }
  .ins-stat-icon { width: 56px; height: 56px; border-radius: 16px; display: grid; place-items: center; background: rgba(99, 102, 241, 0.1); color: #6366f1; font-size: 24px; }
  .ins-stat-icon.donation { background: rgba(16, 185, 129, 0.1); color: #10b981; }
  .ins-stat-icon.expense { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
  .ins-stat-icon.balance { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
  
  .ins-stat-label { font-size: 12px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.8px; }
  .ins-stat-value { font-size: 28px; font-weight: 900; color: var(--text); margin-top: 4px; }

  .ins-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 24px; padding: 0 8px; }
  .ins-card { background: var(--surface); border-radius: 28px; border: 1px solid var(--border); padding: 32px; box-shadow: var(--shadow); }
  .ins-card.wide { grid-column: 1 / -1; }
  .ins-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
  .ins-card-head h3 { font-size: 18px; font-weight: 900; margin: 0; color: var(--text); display: flex; align-items: center; gap: 12px; }
  .ins-card-head span { font-size: 12px; font-weight: 800; color: var(--text-muted); letter-spacing: 1px; }

  .ins-action-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding: 0 8px; }
  .ins-action-header h3 { font-size: 22px; font-weight: 900; margin: 0; }

  .ins-table-wrap { background: var(--surface); border-radius: 24px; border: 1px solid var(--border); overflow: hidden; box-shadow: var(--shadow); margin: 0 8px; }
  .ins-table { width: 100%; border-collapse: collapse; }
  .ins-table th { background: var(--bg); padding: 16px 24px; text-align: left; font-size: 12px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; border-bottom: 1px solid var(--border); }
  .ins-table td { padding: 18px 24px; font-size: 15px; border-bottom: 1px solid var(--border); color: var(--text); }
  .ins-table tr:last-child td { border-bottom: none; }
  .ins-table td.bold { font-weight: 700; }
  .ins-table td.amount { font-family: monospace; font-size: 16px; font-weight: 800; color: #10b981; }
  .ins-table td.amount.expense { color: #ef4444; }
  
  .ins-tag { padding: 4px 10px; background: rgba(99, 102, 241, 0.1); color: #6366f1; border-radius: 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
  .ins-tag.purple { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; }

  .ins-table td.actions { text-align: right; }
  .ins-table td.actions button { padding: 8px; color: var(--text-muted); transition: 0.2s; border-radius: 8px; }
  .ins-table td.actions button:hover { background: var(--bg); color: var(--primary); }
  .ins-table td.actions button.del:hover { color: #ef4444; }

  .ins-form { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 8px; }
  .ins-form .group { display: flex; flex-direction: column; gap: 8px; }
  .ins-form .group.full { grid-column: 1 / -1; }
  .ins-form label { font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); margin-left: 4px; }
  .ins-form input, .ins-form select, .ins-form textarea { padding: 12px 16px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg); font-weight: 600; font-size: 15px; outline: none; }
  .ins-form textarea { min-height: 100px; resize: vertical; }
  .ins-form-footer { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 12px; padding-top: 20px; margin-top: 10px; border-top: 1px solid var(--border); }

  @media (max-width: 768px) {
    .ins-page { padding: 0; }
    .ins-header { flex-direction: column; align-items: stretch; gap: 16px; text-align: center; }
    .ins-tabs { overflow-x: auto; scrollbar-width: none; }
    .ins-tabs::-webkit-scrollbar { display: none; }
    .ins-tabs button { padding: 10px 16px; font-size: 13px; white-space: nowrap; }
    .ins-stat-row { grid-template-columns: 1fr 1fr; gap: 12px; }
    .ins-stat-card { padding: 16px; gap: 12px; border-radius: 18px; }
    .ins-stat-icon { width: 42px; height: 42px; font-size: 18px; border-radius: 12px; }
    .ins-stat-value { font-size: 20px; }
    .ins-grid { grid-template-columns: 1fr; }
    .ins-table-wrap { border-radius: 16px; margin: 0; }
    .ins-table th:nth-child(3), .ins-table td:nth-child(3),
    .ins-table th:nth-child(5), .ins-table td:nth-child(5) { display: none; }
  }
`;
