import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { 
  FaPlus, FaEdit, FaTrash, FaEye, FaCopy, 
  FaUsers, FaCalendarAlt, FaSearch, FaFilter, 
  FaChevronRight, FaClipboardList, FaCheckCircle, 
  FaTimesCircle, FaEllipsisV, FaSync, FaArchive,
  FaCheck, FaTimes, FaLayerGroup
} from 'react-icons/fa';

export default function FormManager() {
  const { api, setToast } = useApp();
  const navigate = useNavigate();
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => { loadForms(); }, []);

  const loadForms = async () => {
    setLoading(true);
    try {
      const list = await api.getAll('forms');
      setForms(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filteredForms = useMemo(() => {
    return forms.filter(f => {
      const matchSearch = (f.title||'').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (f.description||'').toLowerCase().includes(searchTerm.toLowerCase());
      const matchFilter = filterStatus === 'all' || f.status === filterStatus;
      return matchSearch && matchFilter;
    });
  }, [forms, searchTerm, filterStatus]);

  const stats = useMemo(() => ({
    total: forms.length,
    active: forms.filter(f => f.status === 'active').length,
    archived: forms.filter(f => f.status === 'archived').length,
    subs: forms.reduce((s, f) => s + (f.submissions || 0), 0)
  }), [forms]);

  // Selection Logic
  const toggleSelect = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredForms.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredForms.map(f => f.id)));
    }
  };

  const handleStatusUpdate = async (id, newStatus) => {
    try {
      const form = forms.find(f => f.id === id);
      await api.put('forms', { ...form, status: newStatus });
      setForms(prev => prev.map(f => f.id === id ? { ...f, status: newStatus } : f));
      setToast(`Form marked as ${newStatus}`);
    } catch {
      setToast({ type: 'error', text: "Failed to update status" });
    }
  };

  const handleBulkStatus = async (newStatus) => {
    const targets = Array.from(selectedIds);
    setLoading(true);
    try {
      await Promise.all(targets.map(id => {
        const f = forms.find(x => x.id === id);
        return api.put('forms', { ...f, status: newStatus });
      }));
      setForms(prev => prev.map(f => targets.includes(f.id) ? { ...f, status: newStatus } : f));
      setToast(`Updated ${targets.length} forms to ${newStatus}`);
      setSelectedIds(new Set());
    } catch {
      setToast({ type: 'error', text: "Bulk update failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Permanently delete ${selectedIds.size} forms?`)) return;
    const targets = Array.from(selectedIds);
    setLoading(true);
    try {
      await Promise.all(targets.map(id => api.del('forms', id)));
      setForms(prev => prev.filter(f => !targets.includes(f.id)));
      setToast(`Deleted ${targets.length} forms`);
      setSelectedIds(new Set());
    } catch {
      setToast({ type: 'error', text: "Bulk delete failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Permanently delete this form?")) return;
    try {
      await api.del('forms', id);
      setForms(prev => prev.filter(f => f.id !== id));
      setToast("Form deleted successfully");
    } catch {
      setToast("Error deleting form");
    }
  };

  return (
    <section className="fm-page fade-in">
      <style>{FM_CSS}</style>

      <header className="fm-header">
        <div>
          <h1 className="fm-title">Form Manager</h1>
          <p className="fm-subtitle">Create and manage interactive student forms and surveys.</p>
        </div>
        <div className="fm-actions">
          <button className="fm-btn" onClick={loadForms}><FaSync /> Sync</button>
          <button className="fm-btn primary" onClick={() => navigate('/admin/form-builder')}>
            <FaPlus /> New Form
          </button>
        </div>
      </header>

      <div className="fm-stats-grid">
        <div className="fm-stat-card">
          <div className="icon all"><FaClipboardList /></div>
          <div className="info">
            <div className="val">{stats.total}</div>
            <div className="lab">Managed Forms</div>
          </div>
        </div>
        <div className="fm-stat-card">
          <div className="icon active"><FaCheckCircle /></div>
          <div className="info">
            <div className="val">{stats.active}</div>
            <div className="lab">Active Forms</div>
          </div>
        </div>
        <div className="fm-stat-card">
          <div className="icon archived"><FaArchive /></div>
          <div className="info">
            <div className="val">{stats.archived}</div>
            <div className="lab">Archived</div>
          </div>
        </div>
      </div>

      <div className="fm-workspace">
        {selectedIds.size > 0 ? (
          <div className="fm-bulk-toolbar slide-down">
            <div className="bulk-info">
              <FaLayerGroup />
              <span>{selectedIds.size} Forms Selected</span>
            </div>
            <div className="bulk-btns">
              <button onClick={() => handleBulkStatus('active')}><FaCheck /> Set Active</button>
              <button onClick={() => handleBulkStatus('inactive')}><FaTimes /> Set Inactive</button>
              <button onClick={() => handleBulkStatus('archived')}><FaArchive /> Archive</button>
              <button className="del" onClick={handleBulkDelete}><FaTrash /> Delete</button>
              <button className="cancel" onClick={() => setSelectedIds(new Set())}><FaTimes /> Cancel</button>
            </div>
          </div>
        ) : (
          <div className="fm-toolbar">
            <div className="fm-search">
              <FaSearch />
              <input placeholder="Filter forms by name or description..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <div className="fm-filters">
              <div className="filter-group">
                <FaFilter />
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="all">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                  <option value="archived">Archived Only</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="fm-table-container">
          {loading ? (
            <div className="fm-loading">Synchronizing records...</div>
          ) : filteredForms.length === 0 ? (
            <div className="fm-empty">No forms found matching your filters.</div>
          ) : (
            <table className="fm-table">
              <thead>
                <tr>
                  <th className="select-col">
                    <input 
                      type="checkbox" 
                      checked={selectedIds.size === filteredForms.length && filteredForms.length > 0}
                      onChange={toggleSelectAll} 
                    />
                  </th>
                  <th>Form Details</th>
                  <th>Fields</th>
                  <th>Submissions</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                  <th className="actions-col"></th>
                </tr>
              </thead>
              <tbody>
                {filteredForms.map((f) => (
                  <tr key={f.id} className={selectedIds.has(f.id) ? 'selected' : ''}>
                    <td className="select-col">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.has(f.id)} 
                        onChange={() => toggleSelect(f.id)} 
                      />
                    </td>
                    <td className="details-cell" onClick={() => toggleSelect(f.id)}>
                      <div className="title">{f.title || 'Untitled Form'}</div>
                      <div className="desc">{f.description || 'No description provided'}</div>
                    </td>
                    <td><span className="count-badge">{f.fields?.length || 0}</span></td>
                    <td>
                      <div className="sub-stat"><FaUsers /> {f.submissions || 0}</div>
                    </td>
                    <td>
                      <div className="status-cell">
                        <select 
                          className={`status-select ${f.status || 'inactive'}`}
                          value={f.status || 'inactive'}
                          onChange={(e) => handleStatusUpdate(f.id, e.target.value)}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="archived">Archived</option>
                        </select>
                      </div>
                    </td>
                    <td>
                      <div className="date-stat"><FaCalendarAlt /> {new Date(f.updatedAt || f.createdAt).toLocaleDateString()}</div>
                    </td>
                    <td className="actions-col">
                      <div className="btn-group">
                        <button className="row-btn" title="Preview" onClick={() => navigate(`/form/${f.id}`)}><FaEye /></button>
                        <button className="row-btn" title="Edit" onClick={() => navigate(`/admin/form-builder?id=${f.id}`)}><FaEdit /></button>
                        <button className="row-btn del" title="Delete" onClick={() => handleDelete(f.id)}><FaTrash /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

const FM_CSS = `
  .fm-page { padding: 8px 0; max-width: 1200px; margin: 0 auto; }
  .fm-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; padding: 0 4px; }
  .fm-title { font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -0.5px; color: var(--text); }
  .fm-subtitle { color: var(--text-muted); margin: 4px 0 0; font-size: 15px; font-weight: 500; }

  .fm-actions { display: flex; gap: 12px; }
  .fm-btn { height: 44px; padding: 0 20px; border-radius: 12px; font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px; transition: all 0.2s; cursor: pointer; background: var(--surface); border: 1px solid var(--border); color: var(--text); }
  .fm-btn:hover { background: var(--bg); border-color: var(--text-muted); }
  .fm-btn.primary { background: var(--primary); border: none; color: white; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2); }

  .fm-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; margin-bottom: 32px; }
  .fm-stat-card { background: var(--surface); border-radius: 24px; border: 1px solid var(--border); padding: 24px; display: flex; align-items: center; gap: 20px; box-shadow: var(--shadow); }
  .fm-stat-card .icon { width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center; font-size: 22px; }
  .fm-stat-card .icon.all { background: rgba(99, 102, 241, 0.1); color: var(--primary); }
  .fm-stat-card .icon.active { background: rgba(16, 185, 129, 0.1); color: var(--secondary); }
  .fm-stat-card .icon.archived { background: var(--bg); color: var(--text-muted); border: 1px solid var(--border); }
  .fm-stat-card .info .val { font-size: 24px; font-weight: 800; color: var(--text); line-height: 1; }
  .fm-stat-card .info .lab { font-size: 12px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }

  .fm-workspace { background: var(--surface); border-radius: 24px; border: 1px solid var(--border); box-shadow: var(--shadow); overflow: hidden; position: relative; }
  .fm-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 24px; border-bottom: 1px solid var(--border); gap: 20px; }
  
  .fm-bulk-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; background: #0f172a; color: white; z-index: 10; }
  :root[data-theme="dark"] .fm-bulk-toolbar { background: #1e293b; }
  .bulk-info { display: flex; align-items: center; gap: 12px; font-weight: 700; }
  .bulk-btns { display: flex; gap: 10px; }
  .bulk-btns button { height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: white; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s; }
  .bulk-btns button:hover { background: rgba(255,255,255,0.2); }
  .bulk-btns button.del { color: #fca5a5; border-color: rgba(239, 68, 68, 0.3); }
  .bulk-btns button.del:hover { background: #7f1d1d; }
  .bulk-btns button.cancel { background: none; border: none; opacity: 0.7; }

  .fm-search { flex: 1; position: relative; }
  .fm-search svg { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--text-muted); }
  .fm-search input { width: 100%; padding: 12px 16px 12px 44px; border-radius: 14px; border: 1px solid var(--border); background: var(--bg); font-size: 14px; outline: none; transition: 0.2s; color: var(--text); }
  .fm-search input:focus { border-color: var(--primary); background: var(--surface); box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }

  .fm-filters .filter-group { display: flex; align-items: center; gap: 10px; background: var(--bg); border: 1px solid var(--border); padding: 0 16px; border-radius: 12px; height: 44px; color: var(--text-muted); }
  .fm-filters select { background: none; border: none; font-weight: 700; font-size: 13px; color: var(--text); outline: none; }

  .fm-table-container { overflow-x: auto; }
  .fm-table { width: 100%; border-collapse: collapse; min-width: 900px; }
  .fm-table th { background: var(--bg); padding: 16px 24px; text-align: left; font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid var(--border); }
  .fm-table td { padding: 16px 24px; font-size: 14px; color: var(--text); border-bottom: 1px solid var(--border); }
  .fm-table tr:hover { background: rgba(0,0,0,0.02); }
  :root[data-theme="dark"] .fm-table tr:hover { background: rgba(255,255,255,0.02); }
  .fm-table tr.selected { background: rgba(99, 102, 241, 0.05); }

  .select-col { width: 50px; text-align: center; }
  .select-col input { width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary); }

  .details-cell .title { font-weight: 800; color: var(--text); margin-bottom: 2px; font-size: 15px; }
  .details-cell .desc { font-size: 13px; color: var(--text-muted); max-width: 340px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .count-badge { padding: 4px 10px; background: var(--bg); border-radius: 8px; font-weight: 800; font-size: 12px; color: var(--text-muted); border: 1px solid var(--border); }
  .sub-stat { display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--text); }
  .date-stat { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--text-muted); }

  .status-select { padding: 6px 12px; border-radius: 10px; font-size: 11px; font-weight: 800; text-transform: uppercase; border: 1px solid var(--border); outline: none; cursor: pointer; transition: 0.2s; color: inherit; }
  .status-select.active { background: #ecfdf5; color: #065f46; border-color: #10b981; }
  .status-select.inactive { background: var(--bg); color: var(--text-muted); border-color: var(--border); }
  .status-select.archived { background: #fff1f2; color: #9f1239; border-color: #fecaca; }
  :root[data-theme="dark"] .status-select.active { background: #064e3b; color: #34d399; }
  :root[data-theme="dark"] .status-select.archived { background: #4c0519; color: #fb7185; }

  .btn-group { display: flex; gap: 8px; }
  .row-btn { width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); color: var(--text-muted); display: grid; place-items: center; transition: all 0.2s; cursor: pointer; }
  .row-btn:hover { border-color: var(--primary); color: var(--primary); background: rgba(99, 102, 241, 0.05); }
  .row-btn.del:hover { border-color: #ef4444; color: #ef4444; background: #fff1f2; }
  :root[data-theme="dark"] .row-btn.del:hover { background: #451a1a; }

  .fm-loading { padding: 64px; text-align: center; color: var(--text-muted); font-weight: 700; }
  .fm-empty { padding: 64px; text-align: center; color: var(--text-muted); font-weight: 600; }

  @media (max-width: 1024px) {
    .fm-stats-grid { grid-template-columns: repeat(2, 1fr); }
  }

  @media (max-width: 768px) {
    .fm-page { padding: 0; }
    .fm-header { flex-direction: column; align-items: stretch; gap: 14px; margin-bottom: 18px; }
    .fm-title { font-size: 22px; }
    .fm-subtitle { font-size: 13px; }
    .fm-actions { gap: 10px; flex-wrap: wrap; }
    .fm-actions .fm-btn { flex: 1; justify-content: center; height: 44px; }

    .fm-stats-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 18px; }
    .fm-stat-card { padding: 14px 12px; gap: 10px; border-radius: 16px; }
    .fm-stat-card .icon { width: 40px; height: 40px; font-size: 18px; }
    .fm-stat-card .info .val { font-size: 18px; }
    .fm-stat-card .info .lab { font-size: 10px; }

    .fm-workspace { border-radius: 16px; }
    .fm-toolbar { flex-direction: column; align-items: stretch; padding: 14px; gap: 10px; }
    .fm-search input { padding: 14px 14px 14px 44px; font-size: 16px; min-height: 46px; }
    .fm-filters .filter-group { height: 46px; }

    .fm-bulk-toolbar { padding: 12px 14px; flex-wrap: wrap; gap: 10px; }
    .bulk-btns { flex: 1 1 100%; justify-content: stretch; }
    .bulk-btns button { flex: 1; justify-content: center; min-height: 40px; }

    /* Table → cards */
    .fm-table { min-width: 0; display: block; }
    .fm-table thead { display: none; }
    .fm-table tbody, .fm-table tbody tr { display: block; }
    .fm-table tbody tr {
      padding: 14px;
      border: 1px solid var(--border);
      border-radius: 14px;
      margin: 12px 14px;
      background: var(--surface);
    }
    .fm-table tbody tr.selected { background: rgba(99, 102, 241, 0.05); border-color: var(--primary); }
    .fm-table td { padding: 6px 0; border: none; font-size: 13px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .fm-table td.select-col { padding-bottom: 8px; border-bottom: 1px solid var(--border); margin-bottom: 8px; }
    .details-cell .desc { white-space: normal; max-width: none; }

    .btn-group { width: 100%; justify-content: flex-end; }
    .row-btn { width: 40px; height: 40px; }
  }

  @media (max-width: 420px) {
    .fm-stats-grid { grid-template-columns: 1fr; }
  }
`;
