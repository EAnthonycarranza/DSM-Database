// src/pages/User/UserForms.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { 
  FaFileAlt, FaClock, FaCheckCircle, FaArchive, FaCalendarAlt, 
  FaSearch, FaChartLine, FaStar, FaArrowRight, FaClipboardList 
} from 'react-icons/fa';

export default function UserForms() {
  const { api, user, data } = useApp();
  const navigate = useNavigate();

  const [forms, setForms] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [envelopes, setEnvelopes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('available'); // all | available | completed | assigned
  const [searchTerm, setSearchTerm] = useState('');

  // Resolve the student record for this user (used to filter envelope recipients)
  const student = useMemo(() => {
    const students = Array.isArray(data?.students) ? data.students : [];
    const sid = String(user?.studentId || '').trim();
    if (sid) return students.find(s => String(s.id) === sid);
    const email = String(user?.email || '').trim().toLowerCase();
    if (email) return students.find(s => String(s.email || '').trim().toLowerCase() === email);
    return null;
  }, [data?.students, user?.studentId, user?.email]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = student?.id ? { studentId: student.id } : {};
        const [list, subs, envs] = await Promise.all([
          api?.getAll('forms', { status: 'active' }),
          api?.getAll('formSubmissions'),
          api?.getAll('envelopes', params)
        ]);
        setForms(Array.isArray(list) ? list : []);
        const mySubs = Array.isArray(subs) ? subs.filter(s => String(s.submittedBy || '') === String(user?.id || '')) : [];
        setSubmissions(mySubs);
        setEnvelopes(Array.isArray(envs) ? envs : []);
      } catch (e) {
        setForms([]); setSubmissions([]); setEnvelopes([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [api, user?.id, student?.id]);

  const hasSubmission = (formId) => submissions.some(s => String(s.formId) === String(formId));
  const isCompleted = (formId) => submissions.some(s => String(s.formId) === String(formId) && String(s.status || '').toLowerCase() === 'completed');
  const isPending = (formId) => submissions.some(s => String(s.formId) === String(formId) && String(s.status || '').toLowerCase() === 'pending');

  // Map of formId → envelope (when admin sent that form via Docs Center)
  const envelopeByFormId = useMemo(() => {
    const map = new Map();
    for (const env of envelopes) {
      if (!env.formId) continue;
      const me = (env.recipients || []).find(r =>
        String(r.userId) === String(user?.id) ||
        String(r.studentId) === String(student?.id)
      );
      if (me && String(me.status || '').toLowerCase() !== 'completed') {
        map.set(String(env.formId), env);
      }
    }
    return map;
  }, [envelopes, user?.id, student?.id]);

  const isAssigned = (formId) => envelopeByFormId.has(String(formId));

  const filteredForms = useMemo(() => {
    let arr = forms;
    if (filter === 'completed') arr = arr.filter(f => isCompleted(f.id));
    if (filter === 'available') arr = arr.filter(f => !hasSubmission(f.id));
    if (filter === 'assigned') arr = arr.filter(f => isAssigned(f.id));
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      arr = arr.filter(f => (f.title||'').toLowerCase().includes(q) || (f.description||'').toLowerCase().includes(q) || (f.category||'').toLowerCase().includes(q));
    }
    return arr;
  }, [forms, submissions, filter, searchTerm]);

  const stats = useMemo(() => ({
    total: forms.length,
    completed: forms.filter(f => isCompleted(f.id)).length,
    pending: forms.filter(f => isPending(f.id)).length,
    toFill: forms.filter(f => !hasSubmission(f.id)).length,
    assigned: forms.filter(f => isAssigned(f.id)).length,
  }), [forms, submissions, envelopeByFormId]);

  const getPriorityColor = (p) => p === 'high' ? '#ef4444' : p === 'medium' ? '#f59e0b' : p === 'low' ? '#10b981' : '#64748b';

  return (
    <div className="uf-container">
      <style>{UF_CSS}</style>

      <div className="uf-header">
        <div>
          <h1 className="uf-title"><FaClipboardList /> Forms Workspace</h1>
          <p className="uf-subtitle">Review and complete your assigned documentation and surveys.</p>
        </div>
      </div>

      <div className="uf-stats">
        <div className="uf-stat-card">
          <div className="uf-stat-icon all"><FaFileAlt /></div>
          <div className="uf-stat-info">
            <div className="val">{stats.total}</div>
            <div className="lab">Total Forms</div>
          </div>
        </div>
        <div className="uf-stat-card">
          <div className="uf-stat-icon done"><FaCheckCircle /></div>
          <div className="uf-stat-info">
            <div className="val">{stats.completed}</div>
            <div className="lab">Completed</div>
          </div>
        </div>
        <div className="uf-stat-card">
          <div className="uf-stat-icon wait"><FaClock /></div>
          <div className="uf-stat-info">
            <div className="val">{stats.pending}</div>
            <div className="lab">Pending Review</div>
          </div>
        </div>
        <div className="uf-stat-card">
          <div className="uf-stat-icon assigned"><FaStar /></div>
          <div className="uf-stat-info">
            <div className="val">{stats.assigned}</div>
            <div className="lab">Assigned by Admin</div>
          </div>
        </div>
      </div>

      <div className="uf-toolbar">
        <div className="uf-search">
          <FaSearch className="search-icon" />
          <input placeholder="Search forms by title or category..." value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} />
        </div>
        <div className="uf-tabs">
          <button className={`uf-tab ${filter==='available'?'active':''}`} onClick={()=>setFilter('available')}>Available</button>
          <button className={`uf-tab ${filter==='assigned'?'active':''}`} onClick={()=>setFilter('assigned')}>
            Assigned {stats.assigned > 0 && <span className="uf-tab-count">{stats.assigned}</span>}
          </button>
          <button className={`uf-tab ${filter==='completed'?'active':''}`} onClick={()=>setFilter('completed')}>Completed</button>
          <button className={`uf-tab ${filter==='all'?'active':''}`} onClick={()=>setFilter('all')}>All Forms</button>
        </div>
      </div>

      {loading ? (
        <div className="uf-loading"><div className="uf-spinner" /><span>Loading your workspace...</span></div>
      ) : filteredForms.length === 0 ? (
        <div className="uf-empty">
          <div className="uf-empty-icon"><FaArchive /></div>
          <h3>No records found</h3>
          <p>{filter==='completed' ? "You haven't submitted any forms yet." : filter==='available' ? "You're all caught up! No forms need your attention." : "Try adjusting your search or filters."}</p>
        </div>
      ) : (
        <div className="uf-grid">
          {filteredForms.map((f)=>{
            const completed = isCompleted(f.id);
            const pending = isPending(f.id);
            const assignedEnv = envelopeByFormId.get(String(f.id));
            const assigned = !!assignedEnv;
            const href = assigned ? `/form/${f.id}?envelopeId=${assignedEnv.id}` : `/form/${f.id}`;
            return (
              <div key={f.id} className={`uf-card ${completed?'completed':''} ${pending && !completed ? 'pending' : ''} ${assigned && !completed ? 'assigned' : ''}`} onClick={() => navigate(href)}>
                {completed && (<div className="uf-badge completed"><FaCheckCircle /> Completed</div>)}
                {!completed && pending && (<div className="uf-badge pending"><FaClock /> Under Review</div>)}
                {!completed && !pending && assigned && (<div className="uf-badge assigned"><FaStar /> Assigned by Admin</div>)}
                
                <div className="uf-card-body">
                  <div className="uf-card-head">
                    <h3 className="uf-card-title">
                      {f.priority && (<span className="priority-dot" style={{ background:getPriorityColor(f.priority) }} title={`${f.priority} priority`}/>) }
                      {f.title || 'Untitled Form'}
                    </h3>
                    <div className="uf-cat-tag">{f.category || 'General'}</div>
                  </div>
                  
                  {f.description && (<p className="uf-card-desc">{f.description}</p>)}
                  
                  <div className="uf-card-meta">
                    <div className="item"><FaFileAlt /> {(f.fields?.length)||f.fields||0} fields</div>
                    {f.estimatedTime && (<div className="item"><FaClock /> {f.estimatedTime}</div>)}
                    {f.dueDate && (<div className="item"><FaCalendarAlt /> {new Date(f.dueDate).toLocaleDateString()}</div>)}
                  </div>
                </div>
                
                <div className="uf-card-footer">
                  <span>{completed ? "View Submission" : "Start Form"}</span>
                  <FaArrowRight />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const UF_CSS = `
  .uf-container { padding: 32px; background: #f8fafc; min-height: 100vh; font-family: 'Inter', system-ui, sans-serif; }
  .uf-header { margin-bottom: 32px; display: flex; align-items: center; justify-content: space-between; }
  .uf-title { font-size: 28px; font-weight: 800; margin: 0; display: flex; align-items: center; gap: 12px; color: #0f172a; letter-spacing: -0.5px; }
  .uf-subtitle { font-size: 14px; color: #64748b; margin: 4px 0 0; font-weight: 500; }

  .uf-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-bottom: 32px; }
  .uf-stat-card { background: #fff; padding: 20px; border-radius: 20px; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  .uf-stat-icon { width: 48px; height: 48px; border-radius: 12px; display: grid; place-items: center; font-size: 20px; }
  .uf-stat-icon.all { background: #eef2ff; color: #4f46e5; }
  .uf-stat-icon.done { background: #ecfdf5; color: #10b981; }
  .uf-stat-icon.wait { background: #fff7ed; color: #f59e0b; }
  .uf-stat-icon.assigned { background: #fef3c7; color: #b45309; }
  .uf-stat-info .val { font-size: 24px; font-weight: 800; color: #0f172a; line-height: 1; }
  .uf-stat-info .lab { font-size: 12px; color: #64748b; font-weight: 600; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }

  .uf-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 24px; flex-wrap: wrap; }
  .uf-search { flex: 1; min-width: 300px; position: relative; }
  .uf-search input { width: 100%; padding: 12px 12px 12px 44px; border-radius: 14px; border: 1px solid #e2e8f0; background: #fff; font-size: 14px; transition: all 0.2s; }
  .uf-search input:focus { border-color: #4f46e5; box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1); outline: none; }
  .search-icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #94a3b8; }

  .uf-tabs { display: flex; background: #f1f5f9; padding: 4px; border-radius: 12px; gap: 4px; }
  .uf-tab { padding: 8px 16px; border: none; background: none; border-radius: 8px; font-size: 13px; font-weight: 700; color: #64748b; cursor: pointer; transition: all 0.2s; }
  .uf-tab.active { background: #fff; color: #4f46e5; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
  .uf-tab-count { display: inline-block; margin-left: 6px; padding: 2px 6px; background: #f59e0b; color: #fff; border-radius: 10px; font-size: 10px; font-weight: 800; }

  .uf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 24px; }
  .uf-card { background: #fff; border-radius: 24px; border: 1px solid #e2e8f0; cursor: pointer; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); position: relative; overflow: hidden; display: flex; flex-direction: column; }
  .uf-card:hover { transform: translateY(-4px); box-shadow: 0 12px 24px -4px rgba(0,0,0,0.1); border-color: #cbd5e1; }
  .uf-card.completed { border-color: #10b981; }
  .uf-card.pending { border-color: #f59e0b; }
  .uf-card.assigned { border-color: #f59e0b; box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1); }

  .uf-badge { position: absolute; top: 16px; right: 16px; padding: 6px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; display: flex; align-items: center; gap: 6px; text-transform: uppercase; z-index: 2; }
  .uf-badge.completed { background: #ecfdf5; color: #065f46; }
  .uf-badge.pending { background: #fff7ed; color: #9a3412; }
  .uf-badge.assigned { background: #fef3c7; color: #92400e; }

  .uf-card-body { padding: 24px; flex: 1; }
  .uf-card-head { margin-bottom: 12px; }
  .uf-card-title { font-size: 18px; font-weight: 800; color: #0f172a; margin: 0; display: flex; align-items: center; gap: 8px; line-height: 1.2; }
  .priority-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .uf-cat-tag { display: inline-block; padding: 4px 10px; background: #f1f5f9; color: #475569; font-size: 11px; font-weight: 700; border-radius: 6px; text-transform: uppercase; margin-top: 8px; }
  .uf-card-desc { font-size: 14px; color: #64748b; line-height: 1.5; margin: 12px 0 20px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  
  .uf-card-meta { display: flex; gap: 16px; border-top: 1px solid #f1f5f9; padding-top: 16px; }
  .uf-card-meta .item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #94a3b8; font-weight: 600; }

  .uf-card-footer { padding: 16px 24px; background: #f8fafc; border-top: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 700; color: #4f46e5; transition: all 0.2s; }
  .uf-card:hover .uf-card-footer { background: #f1f5f9; }

  .uf-loading { padding: 100px 0; text-align: center; color: #64748b; font-weight: 600; display: flex; flex-direction: column; align-items: center; gap: 16px; }
  .uf-spinner { width: 32px; height: 32px; border: 3px solid #e2e8f0; border-top-color: #4f46e5; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .uf-empty { text-align: center; padding: 80px 24px; background: #fff; border-radius: 24px; border: 1px dashed #e2e8f0; color: #94a3b8; }
  .uf-empty-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.3; }
  .uf-empty h3 { font-size: 18px; font-weight: 800; color: #1e293b; margin: 0; }
  .uf-empty p { font-size: 14px; margin: 8px 0 0; }

  @media (max-width: 900px) {
    .uf-container { padding: 24px 18px; }
    .uf-stats { grid-template-columns: repeat(2, 1fr); gap: 14px; margin-bottom: 24px; }
    .uf-grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 18px; }
  }

  @media (max-width: 640px) {
    .uf-container { padding: 16px 12px; }
    .uf-header { margin-bottom: 20px; flex-direction: column; align-items: flex-start; gap: 6px; }
    .uf-title { font-size: 22px; gap: 8px; }
    .uf-subtitle { font-size: 13px; }

    /* 2-up compact stat cards */
    .uf-stats { grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 18px; }
    .uf-stat-card { padding: 12px; gap: 10px; border-radius: 16px; }
    .uf-stat-icon { width: 38px; height: 38px; font-size: 16px; border-radius: 10px; }
    .uf-stat-info .val { font-size: 18px; }
    .uf-stat-info .lab { font-size: 10px; letter-spacing: 0.3px; }

    .uf-toolbar { flex-direction: column; align-items: stretch; gap: 12px; margin-bottom: 16px; }
    .uf-search { min-width: 0; }
    .uf-search input { padding: 14px 14px 14px 44px; font-size: 16px; /* prevent iOS zoom */ }

    .uf-tabs {
      overflow-x: auto;
      overflow-y: hidden;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      padding: 4px;
      gap: 2px;
    }
    .uf-tabs::-webkit-scrollbar { display: none; }
    .uf-tab { flex: 0 0 auto; padding: 10px 14px; min-height: 40px; font-size: 13px; white-space: nowrap; }

    .uf-grid { grid-template-columns: 1fr; gap: 14px; }
    .uf-card { border-radius: 18px; }
    .uf-card:hover { transform: none; }
    .uf-card-body { padding: 18px; }
    .uf-card-title { font-size: 16px; }
    .uf-card-desc { font-size: 13px; margin: 8px 0 14px; }
    .uf-card-meta { gap: 12px; flex-wrap: wrap; padding-top: 12px; }
    .uf-card-footer { padding: 14px 18px; min-height: 48px; font-size: 14px; }

    .uf-empty { padding: 48px 18px; }
    .uf-empty-icon { font-size: 36px; }
    .uf-badge { top: 12px; right: 12px; padding: 5px 10px; font-size: 10px; }
  }

  @media (max-width: 380px) {
    .uf-stats { grid-template-columns: 1fr; }
    .uf-card-meta { flex-direction: column; gap: 6px; align-items: flex-start; }
  }
`;
