import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import Modal from "../components/Modal";
import { 
  FaUserGraduate, FaFileExport, FaFileImport, FaSearch, 
  FaFilter, FaChevronRight, FaPlus, FaCheckCircle, 
  FaClock, FaUserClock, FaArchive, FaUserTag, FaTrash, FaCheck
} from "react-icons/fa";

/* helpers */
const STATUS_META = { 
  Current: { color: "#10b981", bg: "rgba(16, 185, 129, 0.1)", icon: FaCheckCircle }, 
  Alumni: { color: "#3b82f6", bg: "rgba(59, 130, 246, 0.1)", icon: FaUserGraduate }, 
  Waitlist: { color: "#f59e0b", bg: "rgba(245, 158, 11, 0.1)", icon: FaClock }, 
  "Future Applicant": { color: "#f59e0b", bg: "rgba(245, 158, 11, 0.1)", icon: FaUserClock }, 
  Withdrawn: { color: "#ef4444", bg: "rgba(239, 68, 68, 0.1)", icon: FaArchive } 
};

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : "");

const durationInProgram = (intake, exit) => {
  if (!intake) return "";
  const end = exit ? new Date(exit) : new Date();
  const start = new Date(intake);
  const days = Math.max(0, Math.floor((end - start) / 86400000));
  if (days < 31) return `${days}d`;
  const months = Math.floor(days / 30);
  const rem = days % 30;
  return `${months}m${rem ? ` ${rem}d` : ""}`;
};

function StudentChip({ student, onClick }) {
  const s = student;
  const meta = STATUS_META[s.status] || { color: "#64748b", bg: "rgba(100, 116, 139, 0.1)", icon: FaUserTag };
  const initials = `${s.firstName?.[0] ?? ""}${s.lastName?.[0] ?? ""}` || "S";
  
  return (
    <button className="std-chip" onClick={onClick}>
      <div className="std-chip-av" style={{ background: `linear-gradient(135deg, ${meta.color}, #6366f1)` }}>
        {initials}
      </div>
      <div className="std-chip-body">
        <div className="std-chip-name">{s.firstName} {s.lastName}</div>
        <div className="std-chip-status" style={{ color: meta.color }}>
          <meta.icon size={10} /> {s.status}
        </div>
      </div>
    </button>
  );
}

export default function Students() {
  const { api, data, setModal, setToast } = useApp();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const importRef = React.useRef(null);

  const toggleSelect = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleDeleteSelected = () => {
    if (!selectedIds.size) return;
    
    setModal({
      open: true,
      type: "confirm",
      title: "Delete Students",
      props: {
        message: `Are you sure you want to permanently delete ${selectedIds.size} student record(s)? This will remove all associated documents, photos, and history. This action cannot be undone.`,
        confirmText: `Delete ${selectedIds.size} Records`,
        onConfirm: async () => {
          try {
            await Promise.all(Array.from(selectedIds).map(id => api.del("students", id)));
            setToast({ text: `${selectedIds.size} students removed successfully`, type: "success" });
            setSelectedIds(new Set());
          } catch (err) {
            setToast({ text: "Failed to delete some student records", type: "error" });
          }
        }
      }
    });
  };

  const onlyStudents = React.useCallback((list) => {
    const arr = Array.isArray(list) ? list : [];
    return arr.filter((s) => {
      const role = String(s.role || "").toLowerCase();
      if (role === "user" || role === "admin" || role === "staff") return false;
      const hasStudentFields = s.firstName || s.lastName || s.status || s.intakeDate || s.recordType;
      const hasUserFields = s.username || s.password;
      if (hasUserFields && !hasStudentFields) return false;
      return (!role || role === "student") && hasStudentFields;
    });
  }, []);

  useEffect(() => {
    setRows(onlyStudents(data?.students));
  }, [data?.students, onlyStudents]);

  const openStudentModal = React.useCallback((prefill = null) => {
    setModal((m) => ({
      ...m,
      open: true,
      type: "student",
      props: {
        existing: prefill,
        cardStyle: { maxWidth: "min(1100px, 95vw)" },
        onSaved: async (created) => {
          const list = onlyStudents(await api.getAll("students"));
          setRows(list);
          if (created?.id) navigate(`/admin/students/${created.id}`);
        }
      },
    }));
  }, [setModal, api, onlyStudents, navigate]);

  const filtered = useMemo(() => {
    const txt = q.trim().toLowerCase();
    if (!txt) return rows;
    return rows.filter((r) => 
      `${r.firstName} ${r.lastName} ${r.email} ${r.status}`.toLowerCase().includes(txt)
    );
  }, [rows, q]);

  async function handleImportChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const pack = JSON.parse(text);
      if (!window.confirm("Import will replace ALL current students. Continue?")) return;
      const res = await api.importStudentsPack(pack, { replace: true, clearDocuments: true });
      const list = onlyStudents(await api.getAll("students"));
      setRows(list);
      setToast(`Imported ${res.students} students.`);
    } catch (err) {
      setToast({ text: "Import failed. Check file format.", type: "error" });
    }
  }

  const docCounts = useMemo(() => {
    const map = {};
    const list = Array.isArray(data?.documents) ? data.documents : [];
    for (const d of list) {
      if (!d?.studentId) continue;
      if (!map[d.studentId]) map[d.studentId] = { files: 0, photos: 0 };
      if (String(d.kind).toLowerCase() === "photo") map[d.studentId].photos += 1;
      else map[d.studentId].files += 1;
    }
    return map;
  }, [data?.documents]);

  return (
    <section className="std-page fade-in">
      <style>{STD_CSS}</style>

      <div className="std-roster-section">
        <div className="std-section-head">
          <h3>Quick Roster</h3>
          <span>{rows.length} Total Students</span>
        </div>
        <div className="std-roster-scroll">
          {rows.map((s) => (
            <StudentChip key={s.id} student={s} onClick={() => navigate(`/admin/students/${s.id}`)} />
          ))}
        </div>
      </div>

      <div className="std-workspace-card">
        <div className="std-toolbar">
          <div className="std-search">
            <FaSearch />
            <input placeholder="Search name, email, or status..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          
          <div className="std-actions">
            {selectedIds.size > 0 ? (
              <button className="std-btn danger" onClick={handleDeleteSelected}>
                <FaTrash /> Delete ({selectedIds.size})
              </button>
            ) : (
              <button className="std-btn secondary" onClick={() => navigate("/admin/dashboard")}>
                <FaFilter /> Filters
              </button>
            )}
            
            <div className="std-btn-group">
              <button className="std-btn" onClick={() => importRef.current?.click()} title="Import JSON">
                <FaFileImport /> Import
              </button>
              <button className="std-btn" onClick={async () => {
                const list = await api.getAll("students");
                const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `dsm-export-${new Date().toISOString().slice(0,10)}.json`;
                a.click();
              }}>
                <FaFileExport /> Export
              </button>
            </div>
            <button className="std-btn primary" onClick={() => openStudentModal(null)}>
              <FaPlus /> New Student
            </button>
          </div>
        </div>

        <div className="std-table-container">
          <table className="std-table">
            <thead>
              <tr>
                <th className="select-col">
                  <input 
                    type="checkbox" 
                    checked={selectedIds.size === filtered.length && filtered.length > 0}
                    onChange={() => {
                      if (selectedIds.size === filtered.length) setSelectedIds(new Set());
                      else setSelectedIds(new Set(filtered.map(s => s.id)));
                    }}
                  />
                </th>
                <th>Student Name</th>
                <th>Status</th>
                <th>Phase</th>
                <th>Intake</th>
                <th>Graduation</th>
                <th>Program Duration</th>
                <th>App / Bg Check</th>
                <th>Dorm / Squad</th>
                <th>Docs</th>
                <th className="action-col"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const meta = STATUS_META[s.status] || { color: "var(--text-muted)", bg: "rgba(148, 163, 184, 0.1)", icon: FaUserTag };
                const isSelected = selectedIds.has(s.id);
                return (
                  <tr key={s.id} className={isSelected ? 'selected' : ''} onClick={() => navigate(`/admin/students/${s.id}`)}>
                    <td className="select-col" onClick={e => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={isSelected} 
                        onChange={() => toggleSelect(s.id)} 
                      />
                    </td>
                    <td className="name-cell">
                      <div className="main-text">{s.firstName} {s.lastName}</div>
                      <div className="sub-text">{s.email || "No email"}</div>
                    </td>
                    <td>
                      <span className="std-badge" style={{ color: meta.color, background: meta.bg }}>
                        <meta.icon size={10} /> {s.status}
                      </span>
                    </td>
                    <td>
                      <span className="phase-text">{s.phase ? `Phase ${s.phase}` : "—"}</span>
                    </td>
                    <td>{fmtDate(s.intakeDate)}</td>
                    <td>{fmtDate(s.graduationDate) || "—"}</td>
                    <td>
                      <span className="duration-tag">{durationInProgram(s.intakeDate, s.graduationDate || s.exitDate)}</span>
                    </td>
                    <td>
                      <div className="main-text" style={{ fontSize: '12px' }}>{s.applicationStatus || '—'}</div>
                      <div className="sub-text">BG: {s.backgroundStatus || '—'}</div>
                    </td>
                    <td>
                      <div className="main-text">{s.dorm || "—"}</div>
                      <div className="sub-text">{s.squad ? `Squad ${s.squad}` : ""}</div>
                    </td>
                    <td>
                      <div className="doc-count">
                        <span title="Documents">{docCounts[s.id]?.files || 0}F</span>
                        <span title="Photos">{docCounts[s.id]?.photos || 0}P</span>
                      </div>
                    </td>
                    <td className="action-col">
                      <FaChevronRight className="row-arrow" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length && <div className="std-empty-state">No matching student records found</div>}
        </div>
      </div>

      <input ref={importRef} type="file" accept=".json" onChange={handleImportChange} style={{ display: "none" }} />
      <Modal />
    </section>
  );
}

const STD_CSS = `
  .std-page { padding: 8px 0; max-width: 1400px; margin: 0 auto; }
  
  .std-roster-section { margin-bottom: 32px; }
  .std-section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; padding: 0 4px; }
  .std-section-head h3 { font-size: 18px; font-weight: 800; margin: 0; color: var(--text); }
  .std-section-head span { font-size: 13px; font-weight: 600; color: var(--text-muted); }

  .std-roster-scroll { display: flex; gap: 16px; overflow-x: auto; padding: 4px 4px 16px; scrollbar-width: none; }
  .std-roster-scroll::-webkit-scrollbar { display: none; }

  .std-chip { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; cursor: pointer; transition: all 0.2s; box-shadow: var(--shadow); }
  .std-chip:hover { transform: translateY(-2px); border-color: var(--primary); box-shadow: var(--shadow-lg); }
  
  .std-chip-av { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; color: white; font-weight: 800; font-size: 14px; }
  .std-chip-body { text-align: left; }
  .std-chip-name { font-size: 14px; font-weight: 700; color: var(--text); white-space: nowrap; }
  .std-chip-status { font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 4px; margin-top: 2px; }

  .std-workspace-card { background: var(--surface); border-radius: 24px; border: 1px solid var(--border); box-shadow: var(--shadow); overflow: hidden; }
  
  .std-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 24px; border-bottom: 1px solid var(--border); gap: 20px; flex-wrap: wrap; }
  
  .std-search { flex: 1; min-width: 300px; position: relative; }
  .std-search svg { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--text-muted); }
  .std-search input { width: 100%; padding: 12px 16px 12px 44px; border-radius: 14px; border: 1px solid var(--border); background: var(--bg); font-size: 14px; outline: none; transition: all 0.2s; color: var(--text); }
  .std-search input:focus { border-color: var(--primary); background: var(--surface); box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }

  .std-actions { display: flex; align-items: center; gap: 12px; }
  .std-btn { height: 44px; padding: 0 20px; border-radius: 12px; font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px; transition: all 0.2s; cursor: pointer; background: var(--surface); border: 1px solid var(--border); color: var(--text); }
  .std-btn:hover { background: var(--bg); border-color: var(--text-muted); }
  .std-btn.primary { background: var(--primary); border: none; color: white; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2); }
  .std-btn.primary:hover { background: var(--primary-hover); transform: translateY(-1px); }
  .std-btn.secondary { color: var(--primary); border-color: var(--primary); background: transparent; }
  .std-btn.secondary:hover { background: rgba(99, 102, 241, 0.05); }
  .std-btn.danger { background: #ef4444; color: white; border: none; }
  .std-btn.danger:hover { background: #dc2626; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2); }

  .std-btn-group { display: flex; border-radius: 12px; border: 1px solid var(--border); overflow: hidden; }
  .std-btn-group .std-btn { border: none; border-radius: 0; border-right: 1px solid var(--border); }
  .std-btn-group .std-btn:last-child { border-right: none; }

  .std-table-container { overflow-x: auto; }
  .std-table { width: 100%; border-collapse: collapse; min-width: 1000px; }
  .std-table thead th { background: var(--bg); padding: 16px 24px; text-align: left; font-size: 12px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid var(--border); }
  .std-table tbody tr { border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.2s; }
  .std-table tbody tr:hover { background: rgba(0,0,0,0.02); }
  :root[data-theme="dark"] .std-table tbody tr:hover { background: rgba(255,255,255,0.02); }
  .std-table tbody tr.selected { background: rgba(99, 102, 241, 0.05); }
  .std-table td { padding: 16px 24px; font-size: 14px; color: var(--text); }

  .select-col { width: 50px; text-align: center; }
  .select-col input { width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary); }

  .name-cell .main-text { font-weight: 700; color: var(--text); }
  .name-cell .sub-text { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
  
  .main-text { font-weight: 600; }
  .sub-text { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

  .std-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 10px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
  .phase-text { font-weight: 700; color: var(--primary); }
  .duration-tag { padding: 4px 8px; background: var(--bg); border-radius: 6px; font-size: 12px; font-weight: 700; color: var(--text-muted); border: 1px solid var(--border); }
  
  .doc-count { display: flex; gap: 8px; }
  .doc-count span { padding: 2px 6px; background: var(--bg); border-radius: 4px; font-size: 11px; font-weight: 800; color: var(--text-muted); border: 1px solid var(--border); }

  .action-col { width: 60px; text-align: right; }
  .row-arrow { color: var(--border); transition: transform 0.2s, color 0.2s; }
  tr:hover .row-arrow { color: var(--primary); transform: translateX(4px); }

  .std-empty-state { padding: 64px; text-align: center; color: var(--text-muted); font-weight: 600; font-size: 15px; background: var(--surface); }

  @media (max-width: 1024px) {
    .std-toolbar { flex-direction: column; align-items: stretch; padding: 16px; }
    .std-actions { 
      overflow-x: auto; 
      padding-bottom: 8px; 
      scrollbar-width: none; 
      -webkit-overflow-scrolling: touch;
      display: flex;
      width: 100%;
    }
    .std-actions::-webkit-scrollbar { display: none; }
    .std-actions > * { flex: 0 0 auto; }
    .std-btn-group { flex-shrink: 0; }
  }

  /* ============================================================================
     Mobile: Convert table to premium profile cards
     ============================================================================ */
  @media (max-width: 768px) {
    .std-page { padding: 0; background: var(--bg); }
    .std-roster-section { margin-bottom: 24px; padding-top: 12px; }
    .std-section-head { padding: 0 20px; }
    .std-roster-scroll { padding: 8px 20px 24px; gap: 14px; }
    
    .std-workspace-card { border-radius: 0; border: none; background: transparent; box-shadow: none; }
    .std-toolbar { background: var(--surface); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
    
    .std-table-container { padding: 12px 16px; }
    .std-table { display: block; min-width: 0; }
    .std-table thead { display: none; }
    .std-table tbody { display: grid; gap: 12px; }
    
    .std-table tbody tr {
      display: block;
      background: var(--surface);
      border-radius: 20px;
      border: 1px solid var(--border);
      padding: 16px;
      position: relative;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 4px 10px rgba(0,0,0,0.02);
    }
    .std-table tbody tr:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.06); }
    .std-table tbody tr.selected { border-color: var(--primary); background: rgba(99, 102, 241, 0.02); }
    
    .std-table td { display: block; padding: 0; border: none; }
    
    /* Layout */
    .std-table td.select-col { position: absolute; top: 16px; left: 16px; z-index: 2; width: auto; }
    .std-table td.name-cell { margin-left: 32px; margin-bottom: 12px; }
    .std-table td.name-cell .main-text { font-size: 17px; letter-spacing: -0.3px; }
    
    .std-table td:nth-of-type(3) { margin-bottom: 12px; } /* Status */
    
    /* Meta Grid */
    .std-table td:nth-of-type(4), 
    .std-table td:nth-of-type(5),
    .std-table td:nth-of-type(6),
    .std-table td:nth-of-type(7),
    .std-table td:nth-of-type(8),
    .std-table td:nth-of-type(9),
    .std-table td:nth-of-type(10) { 
      display: none; 
    }

    /* Custom Mobile Meta View */
    .std-table tbody tr::after {
      content: "";
      display: block;
      height: 1px;
      background: var(--border);
      margin: 12px 0;
      opacity: 0.5;
    }

    /* Repurpose Phase/Intake into a more compact sub-row if needed, 
       but for extreme mobile we focus on name/status/actions */
    
    .std-table td.action-col { position: absolute; top: 18px; right: 16px; }
    .row-arrow { color: var(--primary); font-size: 16px; opacity: 0.8; }
    
    .std-btn.primary { 
      position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
      z-index: 1000; width: calc(100% - 64px); max-width: 400px;
      height: 56px; border-radius: 28px; font-size: 15px;
      box-shadow: 0 12px 30px rgba(99, 102, 241, 0.4);
    }
  }

  @media (max-width: 480px) {
    .std-table-container { padding: 8px 12px; }
    .std-table td.name-cell .main-text { font-size: 16px; }
    .std-btn.primary { width: calc(100% - 40px); bottom: 24px; }
  }
`;
