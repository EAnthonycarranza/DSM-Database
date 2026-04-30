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

            <div className="ins-summary-row">
              <div className="ins-summary-card">
                <div className="ins-summary-label">Total Raised ({filterRange})</div>
                <div className="ins-summary-value pos">{fmtCurrency(fin.totalDonations)}</div>
              </div>
              <div className="ins-summary-card">
                <div className="ins-summary-label">Donations</div>
                <div className="ins-summary-value">{fin.donationCount}</div>
              </div>
              <div className="ins-summary-card">
                <div className="ins-summary-label">Average Gift</div>
                <div className="ins-summary-value">{fmtCurrency(fin.avgDonation)}</div>
              </div>
              <div className="ins-summary-card">
                <div className="ins-summary-label">Top Category</div>
                <div className="ins-summary-value sm">
                  {Array.from(fin.donByCat.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'}
                </div>
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

            <div className="ins-summary-row">
              <div className="ins-summary-card">
                <div className="ins-summary-label">Total Spent ({filterRange})</div>
                <div className="ins-summary-value neg">{fmtCurrency(fin.totalExpenses)}</div>
              </div>
              <div className="ins-summary-card">
                <div className="ins-summary-label">Line Items</div>
                <div className="ins-summary-value">{expenses.filter(e => new Date(e.date) >= new Date(new Date().setFullYear(new Date().getFullYear() - (filterRange === 'year' ? 1 : 0)))).length || expenses.length}</div>
              </div>
              <div className="ins-summary-card">
                <div className="ins-summary-label">Avg Expense</div>
                <div className="ins-summary-value">{fmtCurrency(expenses.length ? fin.totalExpenses / Math.max(1, expenses.length) : 0)}</div>
              </div>
              <div className="ins-summary-card">
                <div className="ins-summary-label">Top Category</div>
                <div className="ins-summary-value sm">
                  {Array.from(fin.expByCat.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'}
                </div>
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
          {!data.length && (
            <tr><td colSpan="6" className="empty-state">
              <div className="ins-empty-illustration">
                {type === 'donations' ? <FaDonate /> : <FaWallet />}
              </div>
              <h4>{type === 'donations' ? 'No donations recorded yet' : 'No expenses logged yet'}</h4>
              <p>{type === 'donations'
                ? 'Track your first contribution by clicking the Add New button above, or import a CSV.'
                : 'Log your first operational cost by clicking the Log Item button above, or import a CSV.'}
              </p>
            </td></tr>
          )}
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

  // Compute live total of the visible grid for the header pill
  const liveTotal = grid.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const validRows = grid.filter(r => (r.donor || r.item) && r.amount).length;

  return (
    <div className="spreadsheet-container">
      <div className="sheet-header">
        <div className="sheet-headline">
          <h3 className="sheet-title">
            <FaTable /> Bulk Editor
            <span className="sheet-mode-tag">{mode === "donations" ? "Donations" : "Expenses"}</span>
          </h3>
          <p className="sheet-helper">Spreadsheet-style data entry. Changes only persist after you commit.</p>
        </div>
        <div className="sheet-actions-bar">
          <div className="sheet-tabs">
            <button className={mode === "donations" ? "active" : ""} onClick={() => setMode("donations")}>Donations</button>
            <button className={mode === "budget" ? "active" : ""} onClick={() => setMode("budget")}>Expenses</button>
          </div>
          <button className="sheet-btn add" onClick={addRow}><FaPlus /> New Row</button>
          <button className="sheet-btn save" onClick={handleSave}><FaSave /> Commit Changes</button>
        </div>
      </div>

      <div className="sheet-stats-bar">
        <div className="sheet-stat">
          <span className="lab">Total Rows</span>
          <span className="val">{grid.length}</span>
        </div>
        <div className="sheet-stat">
          <span className="lab">Ready to Commit</span>
          <span className="val pos">{validRows}</span>
        </div>
        <div className="sheet-stat">
          <span className="lab">Incomplete</span>
          <span className={`val ${grid.length - validRows > 0 ? 'warn' : ''}`}>{grid.length - validRows}</span>
        </div>
        <div className="sheet-stat">
          <span className="lab">Total Amount</span>
          <span className="val">{fmtCurrency(liveTotal)}</span>
        </div>
      </div>

      <div className="sheet-viewport-hint">← swipe to see all columns →</div>
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
            {grid.length === 0 && (
              <tr className="sheet-empty-row">
                <td colSpan={headers.length + 2}>
                  <div className="sheet-empty">
                    <FaTable />
                    <h4>No rows yet</h4>
                    <p>Click <strong>+ New Row</strong> to start entering {mode === "donations" ? "donation" : "expense"} data, then hit <strong>Commit Changes</strong> when you're done.</p>
                    <button className="sheet-btn add" onClick={addRow}><FaPlus /> Add Your First Row</button>
                  </div>
                </td>
              </tr>
            )}
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
                  <button onClick={() => deleteRow(row._tempId)} title="Delete row"><FaTimes /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sheet-footer">
        <span className="sheet-footer-hint"><FaSave /> Use <strong>Commit Changes</strong> to save — unsaved edits will be lost on tab change.</span>
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
  .ins-page {
    padding: 24px 28px;
    width: 100%;
    max-width: 1680px;
    margin: 0 auto;
    align-self: center; /* needed because parent .content is display:flex column */
    min-height: 100vh;
    min-width: 0;
    overflow-x: hidden;
    box-sizing: border-box;
  }
  .ins-tab-content, .ins-view { width: 100%; min-width: 0; max-width: 100%; }

  /* Hero header — feels like a real dashboard top-bar */
  .ins-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 24px; padding: 24px 32px; gap: 24px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 22px;
    box-shadow: var(--shadow);
    position: relative;
    overflow: hidden;
  }
  .ins-header::before {
    content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, var(--primary), var(--accent), var(--primary));
  }
  .ins-title { font-size: 30px; font-weight: 900; margin: 0; color: var(--text); letter-spacing: -1px; line-height: 1.1; }
  .ins-subtitle { color: var(--text-muted); margin: 6px 0 0; font-size: 14px; font-weight: 500; }

  .ins-actions { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  .ins-range-selector { display: flex; background: var(--bg); padding: 4px; border-radius: 14px; border: 1px solid var(--border); box-shadow: inset 0 2px 4px rgba(0,0,0,0.04); }
  .ins-range-selector button { padding: 9px 18px; border-radius: 10px; font-size: 13px; font-weight: 800; color: var(--text-muted); transition: 0.2s; }
  .ins-range-selector button:hover:not(.active) { color: var(--text); }
  .ins-range-selector button.active { background: var(--surface); color: var(--primary); box-shadow: 0 4px 12px rgba(var(--primary-rgb), 0.18); }

  /* Tab bar styled as a clean filter strip */
  .ins-tabs-wrap {
    position: relative; margin-bottom: 24px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 6px;
    box-shadow: var(--shadow);
  }
  .ins-tabs { display: flex; gap: 4px; padding: 0; border-bottom: none; }
  .ins-tabs button {
    flex: 1;
    padding: 12px 18px; font-size: 14px; font-weight: 800;
    color: var(--text-muted);
    display: flex; align-items: center; justify-content: center; gap: 10px;
    transition: 0.2s;
    border-bottom: none;
    border-radius: 12px;
    margin-bottom: 0;
  }
  .ins-tabs button.active {
    color: var(--primary);
    background: var(--primary-soft);
    box-shadow: inset 0 0 0 1px rgba(var(--primary-rgb), 0.2);
  }
  .ins-tabs button:hover:not(.active) { color: var(--text); background: var(--bg); border-radius: 12px; }

  /* Stat cards: 4-up on desktop, with a subtle accent stripe and tighter padding */
  .ins-stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 24px; padding: 0; }
  .ins-stat-card {
    display: flex; align-items: center; gap: 18px;
    padding: 22px 24px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    box-shadow: var(--shadow);
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
  }
  .ins-stat-card::before {
    content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
    background: var(--primary); opacity: 0.6;
  }
  .ins-stat-card:nth-child(2)::before { background: #10b981; }
  .ins-stat-card:nth-child(3)::before { background: #ef4444; }
  .ins-stat-card:nth-child(4)::before { background: #3b82f6; }
  .ins-stat-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: rgba(var(--primary-rgb), 0.3); }
  .ins-stat-icon { width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center; background: rgba(var(--primary-rgb), 0.1); color: var(--primary); font-size: 22px; flex-shrink: 0; }
  .ins-stat-icon.donation { background: rgba(16, 185, 129, 0.12); color: #10b981; }
  .ins-stat-icon.expense { background: rgba(239, 68, 68, 0.12); color: #ef4444; }
  .ins-stat-icon.balance { background: rgba(59, 130, 246, 0.12); color: #3b82f6; }
  .ins-stat-card > div:last-child { min-width: 0; flex: 1; }
  .ins-stat-label { font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ins-stat-value { font-size: 26px; font-weight: 900; color: var(--text); margin-top: 4px; line-height: 1.1; letter-spacing: -0.5px; }

  /* Chart grid: 12-col asymmetric layout for a real dashboard feel */
  .ins-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 22px;
    padding: 0;
  }
  .ins-card {
    background: var(--surface);
    border-radius: 22px;
    border: 1px solid var(--border);
    padding: 26px 28px;
    box-shadow: var(--shadow);
    transition: box-shadow 0.2s, border-color 0.2s;
    min-width: 0;
  }
  .ins-card:hover { border-color: rgba(var(--primary-rgb), 0.25); box-shadow: var(--shadow-lg); }
  .ins-card.wide { grid-column: 1 / -1; }
  .ins-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .ins-card-head h3 { font-size: 16px; font-weight: 900; margin: 0; color: var(--text); display: flex; align-items: center; gap: 10px; }
  .ins-card-head h3 svg { color: var(--primary); }
  .ins-card-head span { font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 1.2px; padding: 4px 10px; background: var(--bg); border-radius: 8px; border: 1px solid var(--border); }

  /* Wider screens: more padding, larger numbers */
  @media (min-width: 1440px) {
    .ins-page { padding: 28px 40px; }
    .ins-stat-row { gap: 22px; }
    .ins-stat-card { padding: 24px 26px; }
    .ins-stat-value { font-size: 28px; }
    .ins-grid { gap: 24px; }
    .ins-card { padding: 28px 32px; }
  }

  @media (max-width: 1100px) {
    .ins-stat-row { grid-template-columns: repeat(2, 1fr); }
    .ins-grid { grid-template-columns: 1fr; }
  }

  .ins-action-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 20px; padding: 22px 28px; gap: 20px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    box-shadow: var(--shadow);
  }
  .ins-action-header h3 { font-size: 22px; font-weight: 900; margin: 0; letter-spacing: -0.5px; }
  .ins-action-header p { color: var(--text-muted); margin: 4px 0 0; font-size: 14px; font-weight: 500; }
  .ins-button-group { display: flex; gap: 10px; flex-shrink: 0; }
  .ins-btn { height: 44px; padding: 0 18px; border-radius: 12px; font-weight: 800; font-size: 13px; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; transition: 0.2s; background: var(--surface); border: 1px solid var(--border); color: var(--text); }
  .ins-btn:hover { border-color: var(--primary); color: var(--primary); }
  .ins-btn.primary { background: var(--primary); color: white; border-color: var(--primary); box-shadow: 0 4px 14px rgba(var(--primary-rgb), 0.25); }
  .ins-btn.primary:hover { transform: translateY(-1px); filter: brightness(1.05); color: white; }
  .ins-btn.secondary { color: var(--text); }

  /* Summary row above tables (Donations / Budget) */
  .ins-summary-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 20px;
  }
  .ins-summary-card {
    padding: 18px 22px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: var(--shadow);
    transition: box-shadow 0.2s, transform 0.2s;
  }
  .ins-summary-card:hover { box-shadow: var(--shadow-lg); transform: translateY(-2px); }
  .ins-summary-label { font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.8px; }
  .ins-summary-value { font-size: 22px; font-weight: 900; color: var(--text); margin-top: 6px; letter-spacing: -0.4px; line-height: 1.1; }
  .ins-summary-value.pos { color: #10b981; }
  .ins-summary-value.neg { color: #ef4444; }
  .ins-summary-value.sm { font-size: 16px; word-break: break-word; }

  @media (max-width: 1100px) {
    .ins-summary-row { grid-template-columns: repeat(2, 1fr); }
  }

  .ins-table-container { background: var(--surface); border-radius: 22px; border: 1px solid var(--border); overflow: hidden; box-shadow: var(--shadow); margin: 0; }
  .ins-modern-table { width: 100%; border-collapse: collapse; }
  .ins-modern-table th { background: var(--bg); padding: 16px 24px; text-align: left; font-size: 11px; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid var(--border); }
  .ins-modern-table td { padding: 18px 24px; font-size: 14px; border-bottom: 1px solid var(--border); color: var(--text); }
  .ins-modern-table tr { transition: background 0.15s; }
  .ins-modern-table tbody tr:hover { background: var(--bg); }
  .ins-modern-table td.bold { font-weight: 800; color: var(--text); }
  .ins-modern-table td.amount { font-family: 'JetBrains Mono', monospace; font-weight: 800; color: #10b981; font-size: 14px; }
  .ins-modern-table td.amount.neg { color: #ef4444; }
  .ins-badge { padding: 4px 10px; background: rgba(var(--primary-rgb), 0.1); color: var(--primary); border-radius: 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
  .ins-badge.alt { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; }

  /* Action buttons in modern table */
  .ins-modern-table td.actions { white-space: nowrap; text-align: right; }
  .ins-modern-table td.actions button {
    width: 34px; height: 34px; border-radius: 9px;
    border: 1px solid var(--border); background: var(--surface);
    color: var(--text-muted); margin-left: 6px;
    display: inline-grid; place-items: center;
    transition: 0.15s;
  }
  .ins-modern-table td.actions button:hover { color: var(--primary); border-color: var(--primary); background: var(--primary-soft); }
  .ins-modern-table td.actions button.del:hover { color: #ef4444; border-color: #ef4444; background: rgba(239, 68, 68, 0.08); }
  .ins-modern-table th.actions { text-align: right; }

  /* Empty state inside modern table */
  .ins-modern-table td.empty-state {
    padding: 64px 24px !important;
    text-align: center;
  }
  .ins-empty-illustration {
    width: 72px; height: 72px;
    border-radius: 50%;
    background: var(--primary-soft);
    color: var(--primary);
    display: grid; place-items: center;
    margin: 0 auto 16px;
    font-size: 30px;
  }
  .ins-modern-table td.empty-state h4 {
    margin: 0 0 6px; font-size: 18px; font-weight: 800; color: var(--text); letter-spacing: -0.3px;
  }
  .ins-modern-table td.empty-state p {
    margin: 0; font-size: 14px; color: var(--text-muted); max-width: 460px; margin: 0 auto; line-height: 1.5;
  }

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
    background: var(--surface);
    border-radius: 22px;
    border: 1px solid var(--border);
    padding: 24px;
    box-shadow: var(--shadow);
    margin: 0;
    display: flex;
    flex-direction: column;
    min-height: 600px;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }
  
  .sheet-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 24px; margin-bottom: 16px;
  }
  .sheet-headline { flex: 1; min-width: 0; }
  .sheet-title { font-size: 18px; font-weight: 900; margin: 0; display: flex; align-items: center; gap: 12px; color: var(--text); letter-spacing: -0.3px; }
  .sheet-title svg { color: var(--primary); }
  .sheet-mode-tag {
    font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;
    padding: 4px 10px; background: var(--primary-soft); color: var(--primary);
    border-radius: 6px; border: 1px solid rgba(var(--primary-rgb), 0.18);
  }
  .sheet-helper { font-size: 13px; color: var(--text-muted); margin: 6px 0 0; }

  .sheet-actions-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; flex-shrink: 0; }
  .sheet-controls { display: flex; align-items: center; gap: 12px; }

  /* Stats bar between header and grid */
  .sheet-stats-bar {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 16px;
    padding: 14px 18px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 14px;
  }
  .sheet-stat { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .sheet-stat .lab { font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.6px; }
  .sheet-stat .val { font-size: 18px; font-weight: 900; color: var(--text); letter-spacing: -0.3px; }
  .sheet-stat .val.pos { color: #10b981; }
  .sheet-stat .val.warn { color: #f59e0b; }

  /* Empty state inside the grid */
  .sheet-empty-row td { background: transparent !important; padding: 0 !important; border: none !important; }
  .sheet-empty {
    padding: 56px 24px;
    text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px;
    color: var(--text-muted);
  }
  .sheet-empty svg { font-size: 40px; color: var(--border); margin-bottom: 4px; }
  .sheet-empty h4 { margin: 0; font-size: 18px; font-weight: 800; color: var(--text); letter-spacing: -0.3px; }
  .sheet-empty p { margin: 0 0 10px; font-size: 14px; max-width: 460px; line-height: 1.5; }
  .sheet-empty .sheet-btn { margin-top: 4px; }

  /* Footer hint */
  .sheet-footer-hint { display: inline-flex; align-items: center; gap: 8px; }
  .sheet-footer-hint svg { color: var(--primary); }
  
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
    min-width: 0;
    max-width: 100%;
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

  /* Mobile-only swipe hint above the spreadsheet viewport */
  .sheet-viewport-hint { display: none; }

  @media (max-width: 1024px) {
    .ins-stat-row { grid-template-columns: repeat(2, 1fr); gap: 16px; padding: 0 8px; }
    .ins-grid { grid-template-columns: 1fr; padding: 0 8px; gap: 18px; }
    .ins-card { padding: 24px; }
  }

  @media (max-width: 768px) {
    .ins-page {
      padding: 0;
      width: 100%;
      max-width: 100vw;
      overflow-x: hidden;
    }
    .ins-tab-content, .ins-view, .ins-view.spreadsheet-tab {
      width: 100%;
      max-width: 100%;
      min-width: 0;
      overflow-x: hidden;
    }

    .ins-header {
      flex-direction: column; align-items: stretch; gap: 12px;
      padding: 14px; margin: 12px 14px 14px;
      text-align: left;
      border-radius: 16px;
    }
    .ins-title { font-size: 22px; letter-spacing: -0.5px; }
    .ins-subtitle { font-size: 13px; }

    /* Range pills + sync btn on one row */
    .ins-actions { display: flex; gap: 8px; align-items: center; }
    .ins-range-selector { flex: 1; min-width: 0; padding: 3px; }
    .ins-range-selector button { flex: 1; padding: 8px 4px; font-size: 12px; min-height: 38px; }
    .ins-btn { height: 38px; padding: 0 12px; font-size: 12px; flex-shrink: 0; }

    /* Tabs: 2x2 grid so all 4 are visible at once on iPhone */
    .ins-tabs-wrap {
      margin: 0 14px 14px;
      padding: 4px;
      border-radius: 14px;
    }
    .ins-tabs-wrap::after { display: none; }
    .ins-tabs {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 0; padding: 0 14px;
      border-bottom: none;
      overflow: visible;
    }
    .ins-tabs button {
      padding: 12px 8px; font-size: 13px;
      min-height: 46px; gap: 8px;
      border-bottom: 3px solid transparent;
      justify-content: center;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .ins-tabs button.active { background: var(--primary-soft); border-radius: 10px 10px 0 0; }

    /* Stats: 2-up grid even on iPhone, super compact */
    .ins-stat-row {
      grid-template-columns: repeat(2, 1fr);
      gap: 8px; padding: 0 14px; margin-bottom: 14px;
    }
    .ins-stat-card {
      padding: 12px 12px; gap: 10px; border-radius: 14px;
      flex-direction: row; align-items: center;
      min-height: 60px;
    }
    .ins-stat-card:hover { transform: none; }
    .ins-stat-icon {
      width: 36px; height: 36px; font-size: 14px;
      border-radius: 10px; box-shadow: none; flex-shrink: 0;
    }
    .ins-stat-label {
      font-size: 9px; letter-spacing: 0.3px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .ins-stat-value {
      font-size: 16px; margin-top: 2px; line-height: 1.1;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .ins-stat-card > div:last-child { min-width: 0; flex: 1; }

    /* Charts/cards single column */
    .ins-grid { grid-template-columns: 1fr; padding: 0 14px; gap: 14px; }
    .ins-card { padding: 18px 16px; border-radius: 20px; }
    .ins-card-head { margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
    .ins-card-head h3 { font-size: 15px; gap: 10px; }

    /* Action header (donations/budget) — flat on mobile */
    .ins-action-header {
      flex-direction: column; align-items: stretch; gap: 12px;
      padding: 14px 14px 0;
      background: transparent; border: none; box-shadow: none;
      margin-bottom: 12px;
    }
    .ins-action-header h3 { font-size: 20px; }
    .ins-action-header p { font-size: 13px; }

    /* Summary row stacks 2-up on phones */
    .ins-summary-row {
      grid-template-columns: repeat(2, 1fr);
      gap: 8px; padding: 0 14px;
      margin-bottom: 14px;
    }
    .ins-summary-card { padding: 12px 14px; border-radius: 12px; }
    .ins-summary-label { font-size: 9px; letter-spacing: 0.4px; }
    .ins-summary-value { font-size: 17px; }
    .ins-summary-value.sm { font-size: 13px; }
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

    /* Spreadsheet on phones: horizontal scroll with proper column widths */
    .spreadsheet-container { padding: 14px; margin: 0 14px; border-radius: 16px; min-height: 0; box-shadow: var(--shadow); }
    .sheet-header { flex-direction: column; align-items: stretch; gap: 10px; margin-bottom: 12px; }
    .sheet-headline { padding: 0 2px; }
    .sheet-title { font-size: 16px; }
    .sheet-mode-tag { font-size: 9px; padding: 3px 8px; }
    .sheet-helper { font-size: 12px; }
    .sheet-actions-bar { flex-direction: column; gap: 8px; align-items: stretch; }
    .sheet-controls { flex-direction: column; gap: 8px; }
    .sheet-tabs { width: 100%; padding: 3px; }
    .sheet-tabs button { flex: 1; padding: 10px 12px; font-size: 13px; min-height: 40px; }
    .sheet-btn { width: 100%; justify-content: center; min-height: 46px; font-size: 13px; }

    /* Stats bar: 2x2 on phone */
    .sheet-stats-bar { grid-template-columns: repeat(2, 1fr); padding: 10px 12px; gap: 10px; }
    .sheet-stat .lab { font-size: 9px; }
    .sheet-stat .val { font-size: 15px; }

    .sheet-empty { padding: 40px 16px; }
    .sheet-empty svg { font-size: 32px; }
    .sheet-empty h4 { font-size: 16px; }
    .sheet-empty p { font-size: 13px; }
    .sheet-empty .sheet-btn { width: auto; min-width: 200px; }

    /* The viewport scrolls; force the table to its natural min-width so columns aren't crushed */
    .sheet-viewport {
      border-radius: 12px;
      overflow-x: auto;
      overflow-y: visible;
      -webkit-overflow-scrolling: touch;
      width: 100%;
      max-width: 100%;
      min-width: 0;
    }
    .dsm-spreadsheet { min-width: 620px; table-layout: fixed; }

    /* Sticky # column for orientation while scrolling */
    .dsm-spreadsheet th.row-num,
    .dsm-spreadsheet td.row-num {
      position: sticky; left: 0; z-index: 6;
      width: 40px; min-width: 40px;
      background: #f1f5f9;
      box-shadow: 1px 0 0 #e2e8f0;
      font-size: 11px;
    }

    /* Sticky delete column on the right */
    .dsm-spreadsheet th.sheet-actions,
    .dsm-spreadsheet td.sheet-actions {
      position: sticky; right: 0; z-index: 6;
      width: 48px; min-width: 48px;
      background: white;
      box-shadow: -1px 0 0 #e2e8f0;
    }
    .dsm-spreadsheet th.sheet-actions { background: #f1f5f9; }

    /* Per-column widths for the editable cells (sized to total ~620px) */
    .dsm-spreadsheet th { padding: 10px 10px; font-size: 10px; }
    .dsm-spreadsheet th:nth-child(2) { min-width: 140px; } /* Donor / Item */
    .dsm-spreadsheet th:nth-child(3) { min-width: 90px; }  /* Amount */
    .dsm-spreadsheet th:nth-child(4) { min-width: 120px; } /* Date */
    .dsm-spreadsheet th:nth-child(5) { min-width: 120px; } /* Category */
    .dsm-spreadsheet th:nth-child(6) { min-width: 160px; } /* Notes */

    .dsm-spreadsheet input {
      height: 46px; padding: 0 12px;
      font-size: 16px; /* prevent iOS zoom on focus */
      font-weight: 600;
    }
    .dsm-spreadsheet .sheet-actions button {
      width: 36px; height: 36px;
      font-size: 14px;
    }

    .sheet-footer { padding: 14px 6px; font-size: 12px; }

    /* Dark-mode adjustments for sticky columns */
    :root[data-theme="dark"] .dsm-spreadsheet th.row-num,
    :root[data-theme="dark"] .dsm-spreadsheet td.row-num { background: var(--surface-2); box-shadow: 1px 0 0 var(--border); }
    :root[data-theme="dark"] .dsm-spreadsheet td.sheet-actions { background: var(--surface); box-shadow: -1px 0 0 var(--border); }
    :root[data-theme="dark"] .dsm-spreadsheet th.sheet-actions { background: var(--surface-2); box-shadow: -1px 0 0 var(--border); }

    /* Hint text above the viewport so users know to swipe */
    .sheet-viewport-hint {
      display: block;
      font-size: 11px; font-weight: 700;
      color: var(--text-muted);
      text-align: center;
      padding: 6px 0 8px;
      letter-spacing: 0.4px;
      text-transform: uppercase;
    }
  }

  @media (max-width: 480px) {
    .ins-header { padding: 12px 12px 0; gap: 10px; margin-bottom: 10px; }
    .ins-title { font-size: 19px; }
    .ins-subtitle { font-size: 12px; }

    /* Keep stats 2-up on iPhone for density */
    .ins-stat-row { grid-template-columns: repeat(2, 1fr); gap: 7px; padding: 0 12px; margin-bottom: 12px; }
    .ins-stat-card { padding: 10px; gap: 8px; border-radius: 12px; min-height: 56px; }
    .ins-stat-icon { width: 32px; height: 32px; font-size: 13px; border-radius: 9px; }
    .ins-stat-value { font-size: 14px; }
    .ins-stat-label { font-size: 9px; letter-spacing: 0.2px; }

    /* Tabs: still 2x2 grid, tighter */
    .ins-tabs { padding: 0 12px; }
    .ins-tabs button { padding: 10px 6px; font-size: 12px; gap: 6px; min-height: 44px; }
    .ins-tabs button svg { font-size: 13px; flex-shrink: 0; }

    /* Action / range selector */
    .ins-actions { gap: 6px; }
    .ins-range-selector button { padding: 8px 2px; font-size: 11px; min-height: 36px; }
    .ins-btn { height: 36px; padding: 0 10px; font-size: 11px; }
    .ins-btn svg { font-size: 12px; }

    /* Charts/cards full bleed */
    .ins-grid, .ins-action-header { padding: 0 12px; gap: 12px; }
    .ins-table-container, .spreadsheet-container { margin: 0 12px; }
    .ins-card { padding: 14px 12px; border-radius: 14px; }
    .ins-card-head { margin-bottom: 12px; }
    .ins-card-head h3 { font-size: 14px; gap: 8px; }
    .ins-card-head span { font-size: 9px; letter-spacing: 0.4px; }

    /* Chart canvas height shorter on iPhone */
    .chart-box-outer { height: 220px !important; }
  }

  @media (max-width: 380px) {
    .ins-tabs button .ins-tab-text,
    .ins-tabs button span:not(.ins-badge) {
      font-size: 11px;
    }
    .chart-box-outer { height: 200px !important; }
  }
`;
