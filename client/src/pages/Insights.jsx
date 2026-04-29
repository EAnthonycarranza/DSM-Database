import React, { useState, useEffect, useMemo, useRef } from "react";
import { useApp } from "../context/AppContext";
import Chart from "chart.js/auto";
import { 
  FaChartBar, FaChartLine, FaChartPie, FaFilter, FaSync, FaUsers, 
  FaUserPlus, FaUserSlash, FaDollarSign, FaVenusMars, FaDonate, 
  FaWallet, FaPlus, FaCalendarAlt, FaChevronRight, FaTrash, FaEdit,
  FaArrowUp, FaArrowDown, FaPiggyBank, FaHistory, FaFileCsv, FaFileCode,
  FaTable, FaDownload, FaUpload, FaCheck, FaTimes, FaSave
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

/* ---------------- CSV Utilities ---------------- */
const jsonToCsv = (items, headers) => {
  const headerRow = headers.join(",");
  const dataRows = items.map(it => headers.map(h => `"${String(it[h] || '').replace(/"/g, '""')}"`).join(","));
  return [headerRow, ...dataRows].join("\n");
};

const csvToJson = (csv, headers) => {
  const lines = csv.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  const rows = [];
  const fileHeaders = lines[0].split(",").map(h => h.trim().replace(/"/g, ''));
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    const obj = {};
    fileHeaders.forEach((h, idx) => {
      if (headers.includes(h)) obj[h] = values[idx];
    });
    rows.push(obj);
  }
  return rows;
};

/* ---------------- Main Insights Component ---------------- */
export default function Insights() {
  const { api, data, setToast, setModal } = useApp();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [filterRange, setFilterRange] = useState("year"); 
  
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

    const totalDonations = filteredDonations.reduce((sum, d) => sum + Number(d.amount || 0), 0);
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    
    const donByCat = new Map();
    filteredDonations.forEach(d => {
      const c = d.category || "General";
      donByCat.set(c, (donByCat.get(c) || 0) + Number(d.amount || 0));
    });

    const expByCat = new Map();
    filteredExpenses.forEach(e => {
      const c = e.category || "Miscellaneous";
      expByCat.set(c, (expByCat.get(c) || 0) + Number(e.amount || 0));
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
    };
  }, [students]);

  const openDonationModal = (existing = null) => {
    setModal({
      open: true,
      type: "node",
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
      type: "node",
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

  const exportData = (type) => {
    const target = type === 'donations' ? donations : expenses;
    const headers = type === 'donations' ? ["donor", "amount", "date", "category", "notes"] : ["item", "amount", "date", "category"];
    const csv = jsonToCsv(target, headers);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DSM_${type}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  const importFile = (type) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const content = evt.target.result;
        let parsed = [];
        try {
          if (file.name.endsWith('.json')) parsed = JSON.parse(content);
          else {
            const headers = type === 'donations' ? ["donor", "amount", "date", "category", "notes"] : ["item", "amount", "date", "category"];
            parsed = csvToJson(content, headers);
          }
          
          if (!Array.isArray(parsed)) throw new Error("Invalid format");
          
          setLoading(true);
          await api.bulkUpdate(type, parsed);
          setToast({ type: "success", text: `Successfully imported ${parsed.length} records` });
          refresh();
        } catch (err) {
          setToast({ type: "error", text: "Failed to parse file. Ensure format is correct." });
          setLoading(false);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  if (loading && !students.length) return <div className="ins-loading">Syncing data engine...</div>;

  return (
    <section className="ins-page fade-in">
      <style>{INS_CSS}</style>

      <header className="ins-header">
        <div>
          <h1 className="ins-title">Command Insights</h1>
          <p className="ins-subtitle">Institutional intelligence & financial hub.</p>
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

      <div className="ins-tabs-wrap">
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
          <button className={activeTab === "spreadsheet" ? "active" : ""} onClick={() => setActiveTab("spreadsheet")}>
            <FaTable /> Bulk Editor
          </button>
        </nav>
      </div>

      <div className="ins-tab-content">
        {activeTab === "dashboard" && (
          <div className="ins-view">
            <div className="ins-stat-row">
              <div className="ins-stat-card">
                <div className="ins-stat-icon"><FaUsers /></div>
                <div>
                  <div className="ins-stat-label">Residents</div>
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
                  <h3><FaChartLine /> Performance Curve</h3>
                  <span>{filterRange.toUpperCase()} TRENDS</span>
                </div>
                <ChartBox 
                  type="line"
                  data={{
                    labels: ["Past", "Current", "Projected"],
                    datasets: [
                      {
                        label: 'Inflow',
                        data: [fin.totalDonations * 0.7, fin.totalDonations, fin.totalDonations * 1.1],
                        borderColor: '#10b981',
                        backgroundColor: hexToRgba('#10b981', 0.1),
                        fill: true, tension: 0.4
                      },
                      {
                        label: 'Outflow',
                        data: [fin.totalExpenses * 0.8, fin.totalExpenses, fin.totalExpenses * 0.95],
                        borderColor: '#ef4444',
                        backgroundColor: hexToRgba('#ef4444', 0.1),
                        fill: true, tension: 0.4
                      }
                    ]
                  }}
                  height={300}
                />
              </div>

              <div className="ins-card">
                <div className="ins-card-head">
                  <h3><FaChartPie /> Revenue Mix</h3>
                  <span>DONOR ORIGIN</span>
                </div>
                <ChartBox 
                  type="doughnut"
                  data={{
                    labels: Array.from(fin.donByCat.keys()),
                    datasets: [{
                      data: Array.from(fin.donByCat.values()),
                      backgroundColor: PALETTE,
                      borderWidth: 0, cutout: '70%'
                    }]
                  }}
                />
              </div>

              <div className="ins-card">
                <div className="ins-card-head">
                  <h3><FaChartBar /> Resident Status</h3>
                  <span>PROGRAM PHASES</span>
                </div>
                <ChartBox 
                  type="bar"
                  data={{
                    labels: Array.from(dem.phase.keys()),
                    datasets: [{
                      data: Array.from(dem.phase.values()),
                      backgroundColor: hexToRgba(PALETTE[0], 0.8),
                      borderRadius: 8
                    }]
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === "donations" && (
          <div className="ins-view">
            <div className="ins-action-header">
              <div>
                <h3>Donation Records</h3>
                <p>Track and manage philanthropic contributions.</p>
              </div>
              <div className="ins-button-group">
                <button className="ins-btn secondary" onClick={() => importFile('donations')}><FaUpload /> Import</button>
                <button className="ins-btn secondary" onClick={() => exportData('donations')}><FaDownload /> Export</button>
                <button className="ins-btn primary" onClick={() => openDonationModal()}><FaPlus /> Add New</button>
              </div>
            </div>
            <DataTable 
              data={donations} 
              type="donations" 
              onEdit={openDonationModal} 
              onDelete={async (id) => {
                if (window.confirm("Delete donation?")) { await api.del("donations", id); refresh(); }
              }}
            />
          </div>
        )}

        {activeTab === "budget" && (
          <div className="ins-view">
            <div className="ins-action-header">
              <div>
                <h3>Expense Log</h3>
                <p>Monitor program operational costs.</p>
              </div>
              <div className="ins-button-group">
                <button className="ins-btn secondary" onClick={() => importFile('budget')}><FaUpload /> Import</button>
                <button className="ins-btn secondary" onClick={() => exportData('budget')}><FaDownload /> Export</button>
                <button className="ins-btn primary" onClick={() => openBudgetModal()}><FaPlus /> Log Item</button>
              </div>
            </div>
            <DataTable 
              data={expenses} 
              type="budget" 
              onEdit={openBudgetModal} 
              onDelete={async (id) => {
                if (window.confirm("Delete expense?")) { await api.del("budget", id); refresh(); }
              }}
            />
          </div>
        )}

        {activeTab === "spreadsheet" && (
          <div className="ins-view spreadsheet-tab">
            <SpreadsheetEditor 
              donations={donations} 
              expenses={expenses} 
              onSave={async (d, e) => {
                setLoading(true);
                try {
                  // Bulk update collections
                  await api.bulkUpdate("donations", d);
                  await api.bulkUpdate("budget", e);
                  setToast({ type: "success", text: "Bulk changes saved successfully" });
                  refresh();
                } catch (err) {
                  setToast({ type: "error", text: "Failed to save bulk changes" });
                  setLoading(false);
                }
              }}
            />
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------------- Sub-Components ---------------- */

function DataTable({ data, type, onEdit, onDelete }) {
  const headers = type === 'donations' 
    ? ["Donor", "Amount", "Date", "Category", "Notes"] 
    : ["Expense Item", "Amount", "Date", "Category"];

  return (
    <div className="ins-table-container">
      <table className="ins-modern-table">
        <thead>
          <tr>
            {headers.map(h => <th key={h}>{h}</th>)}
            <th className="actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {[...data].reverse().map(item => (
            <tr key={item.id}>
              <td className="bold">{item.donor || item.item}</td>
              <td className={`amount ${type === 'budget' ? 'neg' : ''}`}>
                {type === 'budget' ? '-' : ''}{fmtCurrency(item.amount)}
              </td>
              <td>{new Date(item.date).toLocaleDateString()}</td>
              <td><span className={`ins-badge ${type === 'budget' ? 'alt' : ''}`}>{item.category}</span></td>
              {type === 'donations' && <td className="notes">{item.notes || "—"}</td>}
              <td className="actions">
                <button onClick={() => onEdit(item)}><FaEdit /></button>
                <button className="del" onClick={() => onDelete(item.id)}><FaTrash /></button>
              </td>
            </tr>
          ))}
          {!data.length && <tr><td colSpan="6" className="empty-state">No records found. Use the buttons above to add data.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function SpreadsheetEditor({ donations, expenses, onSave }) {
  const [mode, setMode] = useState("donations");
  const [grid, setGrid] = useState([]);

  useEffect(() => {
    const base = mode === "donations" ? donations : expenses;
    setGrid(base.map(it => ({ ...it, _tempId: crypto.randomUUID() })));
  }, [mode, donations, expenses]);

  const addRow = () => {
    const newRow = mode === "donations" 
      ? { donor: "", amount: "", date: new Date().toISOString().slice(0,10), category: "Individual", notes: "", _tempId: crypto.randomUUID() }
      : { item: "", amount: "", date: new Date().toISOString().slice(0,10), category: "Operations", _tempId: crypto.randomUUID() };
    setGrid([newRow, ...grid]);
  };

  const updateCell = (tempId, field, val) => {
    setGrid(grid.map(row => row._tempId === tempId ? { ...row, [field]: val } : row));
  };

  const deleteRow = (tempId) => {
    setGrid(grid.filter(row => row._tempId !== tempId));
  };

  const handleSave = () => {
    // Basic validation
    const cleaned = grid.map(({ _tempId, ...rest }) => rest).filter(r => (r.donor || r.item) && r.amount);
    if (mode === "donations") onSave(cleaned, expenses);
    else onSave(donations, cleaned);
  };

  const headers = mode === "donations" 
    ? [{f: "donor", l: "Donor"}, {f: "amount", l: "Amount"}, {f: "date", l: "Date"}, {f: "category", l: "Category"}, {f: "notes", l: "Notes"}]
    : [{f: "item", l: "Item"}, {f: "amount", l: "Amount"}, {f: "date", l: "Date"}, {f: "category", l: "Category"}];

  return (
    <div className="spreadsheet-container">
      <div className="sheet-header">
        <div className="sheet-controls">
          <div className="sheet-tabs">
            <button className={mode === "donations" ? "active" : ""} onClick={() => setMode("donations")}>Donations</button>
            <button className={mode === "budget" ? "active" : ""} onClick={() => setMode("budget")}>Expenses</button>
          </div>
          <button className="sheet-btn add" onClick={addRow}><FaPlus /> New Row</button>
        </div>
        <button className="sheet-btn save" onClick={handleSave}><FaSave /> Commit Changes</button>
      </div>

      <div className="sheet-viewport">
        <table className="dsm-spreadsheet">
          <thead>
            <tr>
              <th className="row-num">#</th>
              {headers.map(h => <th key={h.f}>{h.l}</th>)}
              <th className="sheet-actions"></th>
            </tr>
          </thead>
          <tbody>
            {grid.map((row, idx) => (
              <tr key={row._tempId}>
                <td className="row-num">{grid.length - idx}</td>
                {headers.map(h => (
                  <td key={h.f}>
                    <input 
                      type={h.f === 'amount' ? 'number' : h.f === 'date' ? 'date' : 'text'}
                      value={row[h.f] || ''} 
                      onChange={(e) => updateCell(row._tempId, h.f, e.target.value)}
                      placeholder="..."
                    />
                  </td>
                ))}
                <td className="sheet-actions">
                  <button onClick={() => deleteRow(row._tempId)}><FaTimes /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sheet-footer">
        Showing {grid.length} rows in Spreadsheet Mode. Changes are only saved when you click "Commit".
      </div>
    </div>
  );
}

function DonationForm({ existing, onSave, onClose }) {
  const [v, setV] = useState(existing || { donor: "", amount: "", date: new Date().toISOString().slice(0,10), category: "Individual", notes: "" });
  return (
    <div className="ins-form">
      <div className="group">
        <label>Donor</label>
        <input value={v.donor} onChange={e => setV({...v, donor: e.target.value})} placeholder="Name" />
      </div>
      <div className="group">
        <label>Amount</label>
        <input type="number" value={v.amount} onChange={e => setV({...v, amount: e.target.value})} placeholder="0.00" />
      </div>
      <div className="group">
        <label>Date</label>
        <input type="date" value={v.date} onChange={e => setV({...v, date: e.target.value})} />
      </div>
      <div className="group">
        <label>Category</label>
        <select value={v.category} onChange={e => setV({...v, category: e.target.value})}>
          <option>Individual</option><option>Corporate</option><option>Church Grant</option><option>Government</option><option>Other</option>
        </select>
      </div>
      <div className="group full">
        <label>Notes</label>
        <textarea value={v.notes} onChange={e => setV({...v, notes: e.target.value})} placeholder="..." />
      </div>
      <div className="ins-form-footer">
        <button className="dsm-btn-ghost" onClick={onClose}>Cancel</button>
        <button className="dsm-btn-primary" onClick={() => onSave(v)}>Save Record</button>
      </div>
    </div>
  );
}

function BudgetForm({ existing, onSave, onClose }) {
  const [v, setV] = useState(existing || { item: "", amount: "", date: new Date().toISOString().slice(0,10), category: "Operations" });
  return (
    <div className="ins-form">
      <div className="group">
        <label>Expense</label>
        <input value={v.item} onChange={e => setV({...v, item: e.target.value})} placeholder="Title" />
      </div>
      <div className="group">
        <label>Amount</label>
        <input type="number" value={v.amount} onChange={e => setV({...v, amount: e.target.value})} placeholder="0.00" />
      </div>
      <div className="group">
        <label>Date</label>
        <input type="date" value={v.date} onChange={e => setV({...v, date: e.target.value})} />
      </div>
      <div className="group">
        <label>Category</label>
        <select value={v.category} onChange={e => setV({...v, category: e.target.value})}>
          <option>Operations</option><option>Supplies</option><option>Maintenance</option><option>Staffing</option><option>Marketing</option><option>Miscellaneous</option>
        </select>
      </div>
      <div className="ins-form-footer">
        <button className="dsm-btn-ghost" onClick={onClose}>Cancel</button>
        <button className="dsm-btn-primary" onClick={() => onSave(v)}>Log Item</button>
      </div>
    </div>
  );
}

/* ---------------- Styles ---------------- */

const INS_CSS = `
  .ins-page { padding: 12px 0; max-width: 1400px; margin: 0 auto; min-height: 100vh; }
  .ins-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding: 0 12px; }
  .ins-title { font-size: 34px; font-weight: 900; margin: 0; color: var(--text); letter-spacing: -1.2px; }
  .ins-subtitle { color: var(--text-muted); margin: 4px 0 0; font-size: 16px; font-weight: 500; }
  
  .ins-range-selector { display: flex; background: var(--bg); padding: 4px; border-radius: 14px; border: 1px solid var(--border); box-shadow: inset 0 2px 4px rgba(0,0,0,0.05); }
  .ins-range-selector button { padding: 8px 18px; border-radius: 10px; font-size: 13px; font-weight: 800; color: var(--text-muted); transition: 0.25s; }
  .ins-range-selector button.active { background: var(--surface); color: var(--primary); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }

  .ins-tabs-wrap { position: relative; margin-bottom: 24px; }
  .ins-tabs { display: flex; gap: 12px; padding: 0 12px; border-bottom: 2px solid var(--bg); }
  .ins-tabs button { padding: 14px 28px; font-size: 14px; font-weight: 800; color: var(--text-muted); display: flex; align-items: center; gap: 10px; transition: 0.3s; border-bottom: 4px solid transparent; margin-bottom: -2px; }
  .ins-tabs button.active { color: var(--primary); border-bottom-color: var(--primary); background: rgba(99, 102, 241, 0.03); }
  .ins-tabs button:hover:not(.active) { color: var(--text); background: var(--bg); border-radius: 12px 12px 0 0; }

  .ins-stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin-bottom: 32px; padding: 0 12px; }
  .ins-stat-card { display: flex; align-items: center; gap: 24px; padding: 28px; background: var(--surface); border: 1px solid var(--border); border-radius: 28px; box-shadow: var(--shadow); transition: transform 0.2s; }
  .ins-stat-card:hover { transform: translateY(-3px); }
  .ins-stat-icon { width: 64px; height: 64px; border-radius: 20px; display: grid; place-items: center; background: rgba(99, 102, 241, 0.1); color: #6366f1; font-size: 28px; box-shadow: 0 8px 20px rgba(99, 102, 241, 0.15); }
  .ins-stat-icon.donation { background: rgba(16, 185, 129, 0.1); color: #10b981; box-shadow: 0 8px 20px rgba(16, 185, 129, 0.15); }
  .ins-stat-icon.expense { background: rgba(239, 68, 68, 0.1); color: #ef4444; box-shadow: 0 8px 20px rgba(239, 68, 68, 0.15); }
  .ins-stat-icon.balance { background: rgba(59, 130, 246, 0.1); color: #3b82f6; box-shadow: 0 8px 20px rgba(59, 130, 246, 0.15); }
  .ins-stat-label { font-size: 13px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 1px; }
  .ins-stat-value { font-size: 32px; font-weight: 900; color: var(--text); margin-top: 4px; }

  .ins-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(440px, 1fr)); gap: 28px; padding: 0 12px; }
  .ins-card { background: var(--surface); border-radius: 32px; border: 1px solid var(--border); padding: 36px; box-shadow: var(--shadow); }
  .ins-card.wide { grid-column: 1 / -1; }
  .ins-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
  .ins-card-head h3 { font-size: 20px; font-weight: 900; margin: 0; color: var(--text); display: flex; align-items: center; gap: 14px; }

  .ins-action-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding: 0 12px; }
  .ins-action-header h3 { font-size: 26px; font-weight: 900; margin: 0; letter-spacing: -0.5px; }
  .ins-action-header p { color: var(--text-muted); margin: 4px 0 0; font-size: 15px; font-weight: 500; }
  .ins-button-group { display: flex; gap: 12px; }

  .ins-table-container { background: var(--surface); border-radius: 28px; border: 1px solid var(--border); overflow: hidden; box-shadow: var(--shadow); margin: 0 12px; }
  .ins-modern-table { width: 100%; border-collapse: collapse; }
  .ins-modern-table th { background: var(--bg); padding: 18px 28px; text-align: left; font-size: 13px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; border-bottom: 1px solid var(--border); }
  .ins-modern-table td { padding: 20px 28px; font-size: 16px; border-bottom: 1px solid var(--border); color: var(--text); }
  .ins-modern-table td.bold { font-weight: 700; color: var(--text); }
  .ins-modern-table td.amount { font-family: 'JetBrains Mono', monospace; font-weight: 800; color: #10b981; }
  .ins-modern-table td.amount.neg { color: #ef4444; }
  .ins-badge { padding: 6px 12px; background: rgba(99, 102, 241, 0.1); color: #6366f1; border-radius: 10px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
  .ins-badge.alt { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; }

  /* --- Premium Form & Input Styling --- */
  .ins-form { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 12px; }
  .ins-form .group { display: flex; flex-direction: column; gap: 10px; position: relative; }
  .ins-form .group.full { grid-column: 1 / -1; }
  
  .ins-form label { 
    font-size: 12px; 
    font-weight: 800; 
    text-transform: uppercase; 
    color: var(--primary); 
    letter-spacing: 1.2px; 
    margin-left: 2px;
    opacity: 0.8;
  }
  
  .ins-form input, .ins-form select, .ins-form textarea { 
    padding: 14px 18px; 
    border-radius: 16px; 
    border: 2px solid var(--border); 
    background: white; 
    font-weight: 600; 
    font-size: 15px; 
    color: var(--text);
    outline: none; 
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 4px rgba(0,0,0,0.02);
  }

  .ins-form input:focus, .ins-form select:focus, .ins-form textarea:focus { 
    border-color: var(--primary); 
    background: white;
    box-shadow: 0 0 0 4px rgba(123, 31, 44, 0.1), 0 8px 20px rgba(0,0,0,0.05);
    transform: translateY(-1px);
  }

  .ins-form select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%237B1F2C' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 16px center; background-size: 18px; padding-right: 45px; }

  .ins-form textarea { min-height: 120px; resize: vertical; line-height: 1.6; }

  .ins-form-footer { 
    grid-column: 1 / -1; 
    display: flex; 
    justify-content: flex-end; 
    gap: 16px; 
    padding-top: 24px; 
    margin-top: 12px; 
    border-top: 1px solid var(--border); 
  }

  /* --- Enhanced Spreadsheet Editor --- */
  .spreadsheet-container { 
    background: white; 
    border-radius: 32px; 
    border: 1px solid var(--border); 
    padding: 28px; 
    box-shadow: 0 20px 50px rgba(0,0,0,0.08); 
    margin: 0 12px; 
    display: flex; 
    flex-direction: column; 
    min-height: 650px; 
  }
  
  .sheet-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
  .sheet-controls { display: flex; align-items: center; gap: 24px; }
  
  .sheet-tabs { 
    display: flex; 
    background: #f1f5f9; 
    padding: 5px; 
    border-radius: 14px; 
    border: 1px solid #e2e8f0;
  }
  
  .sheet-tabs button { 
    padding: 10px 24px; 
    border-radius: 10px; 
    font-size: 14px; 
    font-weight: 800; 
    color: #64748b; 
    transition: all 0.2s ease; 
  }
  
  .sheet-tabs button.active { 
    background: white; 
    color: var(--primary); 
    box-shadow: 0 4px 12px rgba(0,0,0,0.05); 
  }
  
  .sheet-btn { 
    height: 48px; 
    padding: 0 24px; 
    border-radius: 14px; 
    font-weight: 800; 
    font-size: 14px; 
    display: flex; 
    align-items: center; 
    gap: 10px; 
    transition: all 0.3s ease; 
  }
  
  .sheet-btn.add { 
    color: var(--primary); 
    background: rgba(123, 31, 44, 0.05);
    border: 1px solid rgba(123, 31, 44, 0.2); 
  }
  .sheet-btn.add:hover { 
    background: rgba(123, 31, 44, 0.1); 
    transform: scale(1.02);
  }
  
  .sheet-btn.save { 
    background: var(--primary); 
    color: white; 
    border: none; 
    box-shadow: 0 8px 20px rgba(123, 31, 44, 0.3); 
  }
  .sheet-btn.save:hover { 
    transform: translateY(-2px); 
    box-shadow: 0 12px 28px rgba(123, 31, 44, 0.4); 
    filter: brightness(1.1);
  }

  .sheet-viewport { 
    flex: 1; 
    overflow: auto; 
    border: 1px solid #e2e8f0; 
    border-radius: 20px; 
    background: #f8fafc; 
    box-shadow: inset 0 2px 10px rgba(0,0,0,0.02);
  }
  
  .dsm-spreadsheet { width: 100%; border-collapse: separate; border-spacing: 0; }
  .dsm-spreadsheet th { 
    position: sticky; 
    top: 0; 
    z-index: 10; 
    background: #f1f5f9; 
    padding: 14px 20px; 
    border-right: 1px solid #e2e8f0; 
    border-bottom: 2px solid #e2e8f0; 
    text-align: left; 
    font-size: 11px; 
    font-weight: 900; 
    color: #475569; 
    text-transform: uppercase; 
    letter-spacing: 0.5px;
  }
  
  .dsm-spreadsheet td { 
    padding: 0; 
    border-right: 1px solid #e2e8f0; 
    border-bottom: 1px solid #e2e8f0; 
    background: white; 
  }
  
  .dsm-spreadsheet tr:hover td { background: #fdfdfd; }
  
  .dsm-spreadsheet input { 
    width: 100%; 
    height: 52px; 
    border: none; 
    padding: 0 20px; 
    background: transparent; 
    font-size: 15px; 
    font-weight: 600; 
    color: #1e293b; 
    outline: none; 
    transition: background 0.2s;
  }
  
  .dsm-spreadsheet input:focus { 
    background: #fff; 
    box-shadow: inset 0 0 0 2px var(--primary); 
    z-index: 5; 
    position: relative;
  }
  
  .dsm-spreadsheet .row-num { 
    width: 50px; 
    background: #f1f5f9; 
    text-align: center; 
    font-size: 12px; 
    font-weight: 900; 
    color: #94a3b8; 
    border-right: 2px solid #e2e8f0;
  }
  
  .dsm-spreadsheet .sheet-actions { width: 60px; text-align: center; }
  .dsm-spreadsheet .sheet-actions button { 
    color: #cbd5e1; 
    padding: 12px; 
    transition: all 0.2s; 
    border-radius: 12px;
  }
  .dsm-spreadsheet .sheet-actions button:hover { 
    color: #ef4444; 
    background: #fee2e2; 
    transform: scale(1.1);
  }

  .sheet-footer { padding: 20px; font-size: 13px; color: #64748b; font-weight: 700; text-align: center; letter-spacing: 0.3px; }

  @media (max-width: 1024px) {
    .ins-stat-row { grid-template-columns: repeat(2, 1fr); gap: 16px; padding: 0 8px; }
    .ins-grid { grid-template-columns: 1fr; padding: 0 8px; gap: 18px; }
    .ins-card { padding: 24px; }
  }

  @media (max-width: 768px) {
    .ins-page { padding: 0; }

    .ins-header { flex-direction: column; align-items: stretch; gap: 14px; padding: 0 14px; margin-bottom: 16px; }
    .ins-title { font-size: 22px; letter-spacing: -0.5px; }
    .ins-subtitle { font-size: 13px; }

    /* Range pills + sync btn on one scroll row */
    .ins-actions { display: flex; gap: 10px; }
    .ins-range-selector {
      flex: 1; min-width: 0; overflow-x: auto;
      -webkit-overflow-scrolling: touch; scrollbar-width: none;
    }
    .ins-range-selector::-webkit-scrollbar { display: none; }
    .ins-range-selector button { padding: 10px 14px; font-size: 12px; flex-shrink: 0; min-height: 40px; }
    .ins-btn { height: 40px; padding: 0 14px; font-size: 12px; flex-shrink: 0; }

    /* Tabs: scroll horizontally with right-edge fade indicator */
    .ins-tabs-wrap { margin-bottom: 16px; padding: 0; }
    .ins-tabs-wrap::after {
      content: "";
      position: absolute; top: 0; right: 0; bottom: 6px; width: 32px;
      background: linear-gradient(to right, transparent, var(--bg) 90%);
      pointer-events: none; z-index: 2;
    }
    .ins-tabs {
      overflow-x: auto; overflow-y: hidden;
      -webkit-overflow-scrolling: touch; scrollbar-width: none;
      padding: 0 14px 4px; gap: 4px;
    }
    .ins-tabs::-webkit-scrollbar { display: none; }
    .ins-tabs button { padding: 12px 16px; font-size: 13px; flex-shrink: 0; white-space: nowrap; min-height: 44px; }

    /* Stats: 2-up, compact */
    .ins-stat-row { grid-template-columns: repeat(2, 1fr); gap: 10px; padding: 0 14px; margin-bottom: 18px; }
    .ins-stat-card { padding: 14px 12px; gap: 12px; border-radius: 18px; }
    .ins-stat-card:hover { transform: none; }
    .ins-stat-icon { width: 42px; height: 42px; font-size: 17px; border-radius: 12px; box-shadow: none; }
    .ins-stat-label { font-size: 10px; letter-spacing: 0.4px; }
    .ins-stat-value { font-size: 18px; margin-top: 2px; }

    /* Charts/cards single column */
    .ins-grid { grid-template-columns: 1fr; padding: 0 14px; gap: 14px; }
    .ins-card { padding: 18px 16px; border-radius: 20px; }
    .ins-card-head { margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
    .ins-card-head h3 { font-size: 15px; gap: 10px; }

    /* Action header (donations/budget) */
    .ins-action-header { flex-direction: column; align-items: stretch; gap: 12px; padding: 0 14px; }
    .ins-action-header h3 { font-size: 20px; }
    .ins-action-header p { font-size: 13px; }
    .ins-button-group { gap: 8px; flex-wrap: wrap; }
    .ins-button-group .ins-btn { flex: 1; min-width: 110px; justify-content: center; min-height: 42px; }

    /* Modern table → readable cards */
    .ins-table-container { margin: 0 14px; border-radius: 18px; }
    .ins-modern-table { display: block; }
    .ins-modern-table thead { display: none; }
    .ins-modern-table tbody, .ins-modern-table tbody tr { display: block; }
    .ins-modern-table tbody tr {
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
    }
    .ins-modern-table td {
      display: flex; justify-content: space-between; align-items: center;
      padding: 4px 0; font-size: 14px;
      border: none;
    }
    .ins-modern-table td::before {
      content: attr(data-label);
      font-size: 10px; font-weight: 800; text-transform: uppercase;
      color: var(--text-muted); letter-spacing: 0.5px;
    }
    .ins-modern-table td.bold { order: -1; padding-bottom: 6px; }
    .ins-modern-table td.bold::before { display: none; }
    .ins-modern-table td.bold { font-size: 15px; font-weight: 800; }

    /* Form modal */
    .ins-form { grid-template-columns: 1fr; gap: 14px; padding: 8px; }
    .ins-form input, .ins-form select, .ins-form textarea {
      padding: 14px; font-size: 16px; border-radius: 12px; min-height: 48px;
    }
    .ins-form textarea { min-height: 100px; }
    .ins-form-footer {
      flex-direction: column-reverse; gap: 8px;
      padding-top: 16px;
    }
    .ins-form-footer button { width: 100%; min-height: 48px; }

    /* Spreadsheet: horizontal scroll, smaller cells */
    .spreadsheet-container { padding: 12px; margin: 0 14px; border-radius: 18px; min-height: 0; box-shadow: var(--shadow); }
    .sheet-header { flex-direction: column; align-items: stretch; gap: 12px; margin-bottom: 14px; }
    .sheet-controls { flex-direction: column; gap: 10px; }
    .sheet-tabs { width: 100%; padding: 4px; }
    .sheet-tabs button { flex: 1; padding: 10px 12px; font-size: 13px; min-height: 40px; }
    .sheet-btn { width: 100%; justify-content: center; min-height: 46px; }
    .sheet-viewport { border-radius: 12px; }
    .dsm-spreadsheet th { padding: 10px 12px; font-size: 10px; }
    .dsm-spreadsheet input { height: 44px; padding: 0 12px; font-size: 13px; }
    .dsm-spreadsheet .row-num { width: 36px; font-size: 11px; }
    .dsm-spreadsheet .sheet-actions { width: 44px; }
  }

  @media (max-width: 480px) {
    .ins-header { padding: 0 10px; }
    .ins-title { font-size: 19px; }
    .ins-stat-row { grid-template-columns: 1fr; padding: 0 10px; }
    .ins-tabs { padding: 0 10px 4px; }
    .ins-grid, .ins-action-header, .ins-table-container, .spreadsheet-container { padding-left: 10px; padding-right: 10px; margin-left: 0; margin-right: 0; }
    .ins-card { padding: 16px 14px; border-radius: 16px; }
    .ins-stat-card { padding: 12px 10px; }
    .ins-stat-icon { width: 38px; height: 38px; font-size: 15px; }
    .ins-stat-value { font-size: 16px; }
    .ins-stat-label { font-size: 9px; }
  }
`;
