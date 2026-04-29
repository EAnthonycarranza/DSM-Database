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
          <div className="head-left">
            <h3>Quick Roster</h3>
            <span>{rows.length} Total Students</span>
          </div>
          <button className="std-add-btn" onClick={() => openStudentModal(null)} title="New Student">
            <FaPlus /> <span>Add Student</span>
          </button>
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
  .std-page { 
    padding: 24px 32px; 
    max-width: 1600px; 
    margin: 0 auto; 
    background: var(--bg);
    min-height: 100%;
  }
  .std-roster-section { margin-bottom: 40px; }
  .std-section-head { 
    display: flex; align-items: center; justify-content: space-between; 
    margin-bottom: 24px; padding: 0 8px; 
  }
  .head-left h3 { font-size: 24px; font-weight: 900; margin: 0; color: var(--text); letter-spacing: -0.8px; }
  .head-left span { font-size: 14px; font-weight: 700; color: var(--primary); background: var(--primary-soft); padding: 4px 14px; border-radius: 20px; margin-top: 4px; display: inline-block; }

  .std-add-btn {
    height: 52px; padding: 0 24px; border-radius: 18px; 
    background: var(--primary); color: white; border: none;
    font-weight: 800; font-size: 15px; display: flex; align-items: center; gap: 10px;
    cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: var(--shadow-brand);
  }
  .std-add-btn:hover { transform: translateY(-4px); box-shadow: 0 12px 24px -6px rgba(var(--primary-rgb), 0.4); filter: brightness(1.1); }
  .std-add-btn:active { transform: translateY(-1px); }

  .std-roster-scroll { 
    display: flex; gap: 20px; overflow-x: auto; 
    padding: 8px 8px 24px; 
    scrollbar-width: none; 
    -webkit-overflow-scrolling: touch;
  }
  .std-roster-scroll::-webkit-scrollbar { display: none; }

  .std-chip { 
    flex: 0 0 260px; display: flex; align-items: center; gap: 16px; 
    padding: 18px 20px; background: var(--surface); 
    border: 2px solid var(--border); border-radius: 24px; 
    cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
    box-shadow: var(--shadow-lg); 
  }
  .std-chip:hover { transform: translateY(-4px) scale(1.02); border-color: var(--primary); box-shadow: var(--shadow-xl); }
  
  .std-chip-av { 
    width: 52px; height: 52px; border-radius: 18px; 
    display: grid; place-items: center; color: white; 
    font-weight: 900; font-size: 16px; 
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }
  .std-chip-body { text-align: left; }
  .std-chip-name { font-size: 16px; font-weight: 800; color: var(--text); white-space: nowrap; }
  .std-chip-status { font-size: 12px; font-weight: 800; display: flex; align-items: center; gap: 6px; margin-top: 4px; }

  .std-workspace-card { 
    background: var(--surface); border-radius: 32px; 
    border: 2px solid var(--border); box-shadow: var(--shadow-lg); 
    overflow: hidden; 
  }
  
  .std-toolbar { 
    display: flex; align-items: center; justify-content: space-between; 
    padding: 32px; border-bottom: 2px solid var(--border); 
    gap: 24px; flex-wrap: wrap; 
  }
  
  .std-search { flex: 1; min-width: 350px; position: relative; }
  .std-search svg { position: absolute; left: 20px; top: 50%; transform: translateY(-50%); color: var(--primary); font-size: 18px; }
  .std-search input { 
    width: 100%; padding: 16px 20px 16px 56px; 
    border-radius: 20px; border: 2px solid var(--border); 
    background: var(--bg); font-size: 15px; font-weight: 600;
    outline: none; transition: all 0.3s ease; color: var(--text); 
  }
  .std-search input:focus { border-color: var(--primary); background: var(--surface); box-shadow: 0 0 0 5px rgba(var(--primary-rgb), 0.1); }

  .std-actions { display: flex; align-items: center; gap: 16px; }
  .std-btn { 
    height: 52px; padding: 0 24px; border-radius: 18px; 
    font-weight: 800; font-size: 14px; display: flex; align-items: center; gap: 10px; 
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
    cursor: pointer; background: var(--surface); border: 2px solid var(--border); color: var(--text); 
  }
  .std-btn:hover { border-color: var(--primary); transform: translateY(-2px); box-shadow: var(--shadow); }
  .std-btn.secondary { color: var(--primary); border-color: var(--primary); background: transparent; }
  .std-btn.secondary:hover { background: var(--primary-soft); }
  .std-btn.danger { background: #ef4444; color: white; border: none; }
  .std-btn.danger:hover { background: #dc2626; transform: translateY(-2px); box-shadow: 0 8px 20px rgba(239, 68, 68, 0.3); }

  .std-btn-group { display: flex; border-radius: 18px; border: 2px solid var(--border); overflow: hidden; }
  .std-btn-group .std-btn { border: none; border-radius: 0; border-right: 2px solid var(--border); }
  .std-btn-group .std-btn:last-child { border-right: none; }

  .std-table-container { 
    overflow-x: auto; 
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }
  .std-table { width: 100%; border-collapse: separate; border-spacing: 0; min-width: 1200px; }
  .std-table thead th { 
    background: var(--bg); padding: 20px 28px; 
    text-align: left; font-size: 11px; font-weight: 900; 
    color: var(--text-muted); text-transform: uppercase; 
    letter-spacing: 1.5px; border-bottom: 2px solid var(--border); 
    position: sticky; top: 0; z-index: 10;
  }
  .std-table tbody tr { border-bottom: 1px solid var(--border); cursor: pointer; transition: all 0.2s; }
  .std-table tbody tr:hover { background: var(--surface-2); }
  .std-table tbody tr.selected { background: var(--primary-soft); }
  .std-table td { padding: 20px 28px; font-size: 14px; color: var(--text); border-bottom: 1px solid var(--border); }

  .select-col { width: 60px; text-align: center; }
  .select-col input { width: 22px; height: 22px; cursor: pointer; accent-color: var(--primary); }

  .name-cell .main-text { font-size: 16px; font-weight: 800; color: var(--text); }
  .name-cell .sub-text { font-size: 13px; color: var(--text-muted); margin-top: 4px; font-weight: 600; }
  
  .main-text { font-weight: 700; color: var(--text); }
  .sub-text { font-size: 12px; color: var(--text-muted); margin-top: 4px; font-weight: 600; }

  .std-badge { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 12px; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
  .phase-text { font-weight: 800; color: var(--primary); }
  .duration-tag { padding: 6px 10px; background: var(--bg); border-radius: 10px; font-size: 13px; font-weight: 800; color: var(--text-muted); border: 1px solid var(--border); }
  
  .doc-count { display: flex; gap: 10px; }
  .doc-count span { padding: 4px 8px; background: var(--bg); border-radius: 8px; font-size: 12px; font-weight: 900; color: var(--primary); border: 1.5px solid var(--border); }

  .action-col { width: 80px; text-align: right; }
  .row-arrow { color: var(--border); font-size: 20px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
  tr:hover .row-arrow { color: var(--primary); transform: translateX(8px); }

  .std-empty-state { padding: 80px 32px; text-align: center; color: var(--text-muted); font-weight: 800; font-size: 17px; background: var(--surface); }

  @media (min-width: 1101px) and (max-width: 1366px) {
    .std-page { padding: 20px 24px; }
    .std-toolbar { padding: 24px; gap: 16px; }
    .std-search { min-width: 250px; }
    .std-chip { flex: 0 0 240px; padding: 16px; }
    
    .std-table { min-width: 0; table-layout: fixed; }
    .std-table td, .std-table th { padding: 14px 12px; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    
    .std-table th:nth-child(6), .std-table td:nth-child(6),
    .std-table th:nth-child(8), .std-table td:nth-child(8),
    .std-table th:nth-child(9), .std-table td:nth-child(9) {
      display: none;
    }
  }

  @media (max-width: 1100px) {
    .std-page { padding: 0; background: var(--bg); }
    .std-roster-section { margin-bottom: 20px; padding-top: 12px; }
    .std-section-head { padding: 0 24px; }
    .std-roster-scroll { padding: 8px 24px 20px; gap: 16px; }
    .std-chip { flex: 0 0 240px; }
    
    .std-add-btn span { display: none; }
    .std-add-btn { width: 52px; height: 52px; padding: 0; display: grid; place-items: center; border-radius: 16px; }

    .std-workspace-card { border-radius: 0; border: none; background: transparent; box-shadow: none; }
    .std-toolbar { 
      background: var(--surface); border-bottom: 2px solid var(--border); 
      position: sticky; top: 0; z-index: 100; box-shadow: 0 4px 15px rgba(0,0,0,0.05); 
      padding: 20px 24px; gap: 16px;
    }
    
    .std-search { min-width: 100%; order: 1; }
    .std-actions { width: 100%; order: 2; overflow-x: auto; padding-bottom: 4px; gap: 12px; }
    .std-actions::-webkit-scrollbar { display: none; }
    .std-btn { height: 48px; padding: 0 20px; font-size: 13px; flex-shrink: 0; }

    .std-table-container { padding: 16px 24px; overflow: visible; }
    .std-table { display: block; min-width: 0; }
    .std-table thead { display: none; }
    .std-table tbody { 
      display: grid; 
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); 
      gap: 16px; 
    }
    
    @media (max-width: 700px) {
      .std-table tbody { grid-template-columns: 1fr; }
    }

    .std-table tbody tr {
      display: block; background: var(--surface); border-radius: 24px; 
      border: 2px solid var(--border); padding: 24px; 
      position: relative; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: var(--shadow);
    }
    .std-table tbody tr:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); border-color: var(--primary); }
    .std-table tbody tr.selected { border-color: var(--primary); background: var(--primary-soft); }
    
    .std-table td { display: block; padding: 0; border: none; }
    .std-table td.select-col { position: absolute; top: 24px; left: 24px; z-index: 2; width: auto; }
    .std-table td.name-cell { margin-left: 48px; margin-bottom: 20px; }
    .std-table td.name-cell .main-text { font-size: 18px; letter-spacing: -0.5px; }
    
    .std-table td:nth-of-type(3) { margin-bottom: 20px; }
    
    .std-table td:nth-of-type(4),
    .std-table td:nth-of-type(5),
    .std-table td:nth-of-type(7),
    .std-table td:nth-of-type(10) { 
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 12px; font-size: 13px; font-weight: 600; color: var(--text-muted);
    }
    .std-table td:nth-of-type(4)::before { content: "Phase"; }
    .std-table td:nth-of-type(5)::before { content: "Intake Date"; }
    .std-table td:nth-child(7)::before { content: "Program Duration"; }
    .std-table td:nth-child(10)::before { content: "Files & Photos"; }

    .std-table td:nth-child(6), .std-table td:nth-child(8), .std-table td:nth-child(9) { display: none; }
    
    .std-table td.action-col { position: absolute; top: 26px; right: 24px; }
    .row-arrow { color: var(--primary); font-size: 20px; }
  }

  @media (max-width: 480px) {
    .std-section-head { padding: 0 16px; margin-bottom: 16px; }
    .head-left h3 { font-size: 20px; }
    .std-add-btn { width: 48px; height: 48px; border-radius: 14px; }

    .std-roster-scroll { padding: 8px 16px 20px; gap: 12px; }
    .std-chip { flex: 0 0 200px; padding: 14px 16px; border-radius: 20px; }
    .std-chip-av { width: 44px; height: 44px; border-radius: 14px; font-size: 14px; }
    .std-chip-name { font-size: 14px; }

    .std-toolbar { padding: 16px; gap: 12px; }
    .std-search input { padding: 12px 16px 12px 44px; font-size: 14px; border-radius: 14px; }
    .std-search svg { left: 16px; font-size: 16px; }
    
    .std-actions { gap: 8px; }
    .std-btn { height: 44px; padding: 0 16px; font-size: 12px; border-radius: 14px; }

    .std-table-container { padding: 12px 16px; }
    .std-table tbody tr { padding: 20px; border-radius: 22px; }
    .std-table td.select-col { top: 20px; left: 20px; }
    .std-table td.name-cell { margin-left: 44px; margin-bottom: 16px; }
    .std-table td.name-cell .main-text { font-size: 16px; }
    .std-table td.name-cell .sub-text { font-size: 12px; }
    
    .std-table td:nth-of-type(4), .std-table td:nth-of-type(5), 
    .std-table td:nth-of-type(7), .std-table td:nth-of-type(10) {
      font-size: 12px; margin-bottom: 10px;
    }
    
    .std-table td.action-col { top: 22px; right: 20px; }
    .row-arrow { font-size: 18px; }
  }
`;
