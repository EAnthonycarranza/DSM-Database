import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { FileText, Clock, CheckCircle, Archive, Calendar, Search, Activity, Star } from 'lucide-react';

export default function UserForms() {
  const { api, user } = useApp();
  const navigate = useNavigate();

  const [forms, setForms] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('available'); // all | available | completed
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const list = await api?.getAll('forms', { status: 'active' }) || [];
        setForms(Array.isArray(list) ? list : []);
        const subs = await api?.getAll('formSubmissions') || [];
        const mySubs = Array.isArray(subs) ? subs.filter(s => String(s.submittedBy || '') === String(user?.id || '')) : [];
        setSubmissions(mySubs);
      } catch (e) {
        setForms([]);
        setSubmissions([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [api, user?.id]);

  const hasSubmission = (formId) => submissions.some(s => String(s.formId) === String(formId));
  const isCompleted = (formId) => submissions.some(s => String(s.formId) === String(formId) && String(s.status || '').toLowerCase() === 'completed');
  const isPending = (formId) => submissions.some(s => String(s.formId) === String(formId) && String(s.status || '').toLowerCase() === 'pending');

  const filteredForms = useMemo(() => {
    let arr = forms;
    if (filter === 'completed') arr = arr.filter(f => isCompleted(f.id));
    // Available = not yet submitted by this user (explicitly excludes pending/completed)
    if (filter === 'available') arr = arr.filter(f => !hasSubmission(f.id));
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
  }), [forms, submissions]);

  const getPriorityColor = (p) => p === 'high' ? '#ef4444' : p === 'medium' ? '#f59e0b' : p === 'low' ? '#10b981' : '#6b7280';
  const iconFor = (cat) => {
    const c = String(cat||'').toLowerCase();
    if (c === 'survey') return <Activity size={16}/>;
    if (c === 'request') return <FileText size={16}/>;
    if (c === 'review') return <Star size={16}/>;
    return <FileText size={16}/>;
  };

  return (
    <div className="user-forms-container">
      <style>{`
        .user-forms-container{min-height:100vh;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
        .forms-wrapper{max-width:1200px;margin:0 auto}
        .forms-header{margin-bottom:32px}
        .forms-header h1{display:flex;align-items:center;gap:12px;margin:0 0 8px 0;font-size:32px;font-weight:800}
        .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px}
        .stat-card{background:rgba(255,255,255,.95);border-radius:16px;padding:20px;display:flex;align-items:center;gap:14px;box-shadow:0 10px 40px rgba(0,0,0,.1)}
        .stat-value{font-size:24px;font-weight:800;color:#1f2937;margin:0}
        .stat-label{font-size:13px;color:#6b7280;margin:0}
        .controls-bar{background:rgba(255,255,255,.95);border-radius:16px;padding:16px;margin-bottom:20px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;box-shadow:0 10px 40px rgba(0,0,0,.08)}
        .search-box{flex:1;min-width:240px;position:relative}
        .search-input{width:100%;padding:12px 16px 12px 44px;border:2px solid #e5e7eb;border-radius:12px;font-size:15px}
        .search-input:focus{outline:none;border-color:#667eea;box-shadow:0 0 0 3px rgba(102,126,234,.1)}
        .search-icon{position:absolute;left:16px;top:50%;transform:translateY(-50%);color:#9ca3af}
        .filter-tabs{display:flex;gap:8px;background:#f3f4f6;padding:4px;border-radius:10px}
        .filter-tab{padding:8px 16px;border:none;background:transparent;color:#6b7280;font-weight:500;border-radius:8px;cursor:pointer}
        .filter-tab.active{background:#fff;color:#667eea;box-shadow:0 2px 8px rgba(0,0,0,.08)}
        .forms-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px}
        .form-card{background:#fff;border-radius:16px;padding:20px;cursor:pointer;transition:.3s;box-shadow:0 4px 20px rgba(0,0,0,.08);position:relative}
        .form-card:hover{transform:translateY(-4px);box-shadow:0 12px 40px rgba(0,0,0,.12)}
        .form-card.completed{opacity:.75;background:#f9fafb}
        .form-card.pending{outline:2px solid rgba(251, 146, 60, .25)}
        .form-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
        .form-title{font-size:18px;font-weight:700;color:#1f2937;margin:0 0 6px 0;display:flex;align-items:center;gap:8px}
        .form-category{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#f3f4f6;border-radius:6px;font-size:12px;color:#6b7280;font-weight:500}
        .form-description{color:#6b7280;font-size:14px;line-height:1.5;margin:0 0 14px 0}
        .form-meta{display:flex;gap:18px;padding-top:12px;border-top:1px solid #f3f4f6}
        .meta-item{display:flex;align-items:center;gap:6px;font-size:13px;color:#6b7280}
        .completed-badge{position:absolute;top:16px;right:16px;background:#10b981;padding:6px 10px;border-radius:20px;font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px}
        .pending-badge{position:absolute;top:16px;right:16px;background:#fb923c;padding:6px 10px;border-radius:20px;font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;color:#111827}
        .empty-state{text-align:center;padding:80px 20px;background:rgba(255,255,255,.95);border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.1)}
      `}</style>

      <div className="forms-wrapper">
        <div className="forms-header">
          <h1><FileText size={36}/> Forms Center</h1>
          <p style={{opacity:.9}}>Complete required forms and surveys at your convenience</p>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div style={{width:48,height:48,borderRadius:12,display:'grid',placeItems:'center',background:'#dbeafe',color:'#3b82f6'}}><FileText size={24}/></div>
            <div>
              <p className="stat-value">{stats.total}</p>
              <p className="stat-label">Total Forms</p>
            </div>
          </div>
          <div className="stat-card">
            <div style={{width:48,height:48,borderRadius:12,display:'grid',placeItems:'center',background:'#d1fae5',color:'#10b981'}}><CheckCircle size={24}/></div>
            <div>
              <p className="stat-value">{stats.completed}</p>
              <p className="stat-label">Completed</p>
            </div>
          </div>
          <div className="stat-card">
            <div style={{width:48,height:48,borderRadius:12,display:'grid',placeItems:'center',background:'#fff7ed',color:'#f97316'}}><Clock size={24}/></div>
            <div>
              <p className="stat-value">{stats.pending}</p>
              <p className="stat-label">Pending Review</p>
            </div>
          </div>
        </div>

        <div className="controls-bar">
          <div className="search-box">
            <Search className="search-icon" size={18}/>
            <input className="search-input" placeholder="Search forms..." value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} />
          </div>
          <div className="filter-tabs">
            <button className={`filter-tab ${filter==='all'?'active':''}`} onClick={()=>setFilter('all')}>All</button>
            <button className={`filter-tab ${filter==='available'?'active':''}`} onClick={()=>setFilter('available')}>To Fill</button>
            <button className={`filter-tab ${filter==='completed'?'active':''}`} onClick={()=>setFilter('completed')}>Completed</button>
          </div>
        </div>

        {loading ? (
          <div className="empty-state"><p>Loading forms...</p></div>
        ) : filteredForms.length === 0 ? (
          <div className="empty-state">
            <Archive size={56}/>
            <h3>No forms found</h3>
            <p>{filter==='completed' ? "You haven't completed any forms yet" : filter==='available' ? "No forms need your attention right now" : "There are no forms matching your search"}</p>
          </div>
        ) : (
          <div className="forms-grid">
            {filteredForms.map((f)=>{
              const completed = isCompleted(f.id);
              const pending = isPending(f.id);
              return (
                <div
                  key={f.id}
                  className={`form-card ${completed?'completed':''} ${pending && !completed ? 'pending' : ''}`}
                  onClick={() => navigate(`/form/${f.id}`)}
                >
                  {completed && (<div className="completed-badge"><CheckCircle size={14}/>Completed</div>)}
                  {!completed && pending && (<div className="pending-badge"><Clock size={14}/>Pending Review</div>)}
                  <div className="form-header">
                    <div className="form-title-section">
                      <h3 className="form-title">
                        {f.priority && (<span className="priority-indicator" style={{ background:getPriorityColor(f.priority) }}/>) }
                        {f.title || 'Untitled Form'}
                      </h3>
                      {f.category && (<span className="form-category">{iconFor(f.category)}{f.category}</span>)}
                    </div>
                  </div>
                  {f.description && (<p className="form-description">{f.description}</p>)}
                  <div className="form-meta">
                    <div className="meta-item"><FileText size={14}/>{(f.fields?.length)||f.fields||0} fields</div>
                    {f.estimatedTime && (<div className="meta-item"><Clock size={14}/>{f.estimatedTime}</div>)}
                    {f.dueDate && (<div className="meta-item"><Calendar size={14}/>{new Date(f.dueDate).toLocaleDateString()}</div>)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
