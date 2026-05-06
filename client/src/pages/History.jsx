import React, { useMemo } from "react";
import { useApp } from "../context/AppContext";
import { FaHistory, FaUser, FaStickyNote, FaFileUpload, FaPaperPlane, FaTrash, FaChevronRight, FaTimes, FaCalendarAlt, FaSync } from "react-icons/fa";
import { useNavigate } from "react-router-dom";

export default function History() {
  const { history, removeHistoryItem, data, goToStudent, refreshAll } = useApp();
  const navigate = useNavigate();

  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => b.timestamp - a.timestamp);
  }, [history]);

  // Group history by "logical types" for horizontal separation
  const groups = useMemo(() => {
    return {
      access: sortedHistory.filter(h => h.type === 'student_view'),
      updates: sortedHistory.filter(h => h.type === 'note_added' || h.type === 'file_upload'),
      comm: sortedHistory.filter(h => h.type === 'message_sent')
    };
  }, [sortedHistory]);

  const getIcon = (type) => {
    switch (type) {
      case 'student_view': return <FaUser />;
      case 'note_added': return <FaStickyNote />;
      case 'file_upload': return <FaFileUpload />;
      case 'message_sent': return <FaPaperPlane />;
      default: return <FaHistory />;
    }
  };

  const relTime = (ts) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  const handleNavigate = (item) => {
    if (item.type === 'message_sent') {
      navigate(`/admin/engage?threadId=${item.threadId || ''}`);
    } else if (item.targetId) {
      // Direct navigation via React Router
      navigate(`/admin/students/${item.targetId}`);
    }
  };

  const HistoryItem = ({ item }) => {
    // Check if student still exists (for student-related actions)
    const isStudentAction = ['student_view', 'note_added', 'file_upload'].includes(item.type);
    const studentExists = isStudentAction ? data.students.some(s => s.id === item.targetId) : true;
    
    if (!studentExists) return null;

    return (
      <div className="hist-item fade-in">
        <div className={`hist-type-ico ${item.type}`}>
          {getIcon(item.type)}
        </div>
        <div className="hist-content">
          <div className="hist-subject">{item.targetName || 'Subject'}</div>
          <div className="hist-meta-row">
            <span className="hist-time">{relTime(item.timestamp)}</span>
            {item.meta && <span className="hist-meta-text">• {item.meta}</span>}
          </div>
          {item.text && <div className="hist-preview">{item.text}</div>}
        </div>
        <div className="hist-actions">
          {(item.targetId || item.type === 'message_sent') && (
            <button className="hist-btn-go" onClick={() => handleNavigate(item)} title="Open">
              <FaChevronRight />
            </button>
          )}
          <button className="hist-btn-del" onClick={() => removeHistoryItem(item.id)} title="Remove">
            <FaTimes />
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className="hist-page">
      <style>{HIST_CSS}</style>
      <header className="hist-header">
        <div className="hist-title-wrap">
          <div className="hist-ico-main"><FaHistory /></div>
          <div style={{ flex: 1 }}>
            <h1 className="hist-title">Activity Dashboard</h1>
            <p className="hist-subtitle">Real-time history of your administrative actions.</p>
          </div>
          <button 
            className={`hist-btn-refresh ${refreshing ? 'spinning' : ''}`} 
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <FaSync /> {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className="hist-grid">
        <div className="hist-lane">
          <div className="lane-head">
            <div className="lane-ico view"><FaUser /></div>
            <h3>Student Access</h3>
          </div>
          <div className="lane-content">
            {groups.access.length > 0 ? (
              groups.access.map(h => <HistoryItem key={h.id} item={h} />)
            ) : (
              <div className="lane-empty">No recent profile views.</div>
            )}
          </div>
        </div>

        <div className="hist-lane">
          <div className="lane-head">
            <div className="lane-ico update"><FaStickyNote /></div>
            <h3>Record Updates</h3>
          </div>
          <div className="lane-content">
            {groups.updates.length > 0 ? (
              groups.updates.map(h => <HistoryItem key={h.id} item={h} />)
            ) : (
              <div className="lane-empty">No notes or uploads recorded.</div>
            )}
          </div>
        </div>

        <div className="hist-lane">
          <div className="lane-head">
            <div className="lane-ico comm"><FaPaperPlane /></div>
            <h3>Communication</h3>
          </div>
          <div className="lane-content">
            {groups.comm.length > 0 ? (
              groups.comm.map(h => <HistoryItem key={h.id} item={h} />)
            ) : (
              <div className="lane-empty">No recent messages sent.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const HIST_CSS = `
  .hist-page { padding: 40px; height: 100%; overflow-y: auto; background: var(--bg); transition: background 0.3s; }
  .hist-header { margin-bottom: 40px; }
  .hist-title-wrap { display: flex; align-items: center; gap: 24px; }
  
  .hist-ico-main { 
    width: 72px; height: 72px; background: var(--primary); color: var(--bg); 
    border-radius: 20px; display: grid; place-items: center; font-size: 32px; 
    box-shadow: var(--shadow-brand); 
  }
  
  .hist-title { font-size: 42px; font-weight: 800; margin: 0; color: var(--text); letter-spacing: -2px; }
  .hist-subtitle { color: var(--text-muted); margin: 8px 0 0; font-size: 18px; font-weight: 500; opacity: 0.8; }

  .hist-btn-refresh { 
    display: flex; align-items: center; gap: 10px; padding: 14px 28px; 
    background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
    font-size: 14px; font-weight: 800; color: var(--text); cursor: pointer; transition: 0.2s;
    box-shadow: var(--shadow-sm);
  }
  .hist-btn-refresh:hover:not(:disabled) { 
    background: var(--bg); border-color: var(--primary); 
    transform: translateY(-2px); box-shadow: var(--shadow-md); 
  }
  .hist-btn-refresh:disabled { opacity: 0.6; cursor: not-allowed; }
  .hist-btn-refresh.spinning svg { animation: spin 1s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  .hist-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; align-items: start; }
  
  /* --- DSM Brand Integrated Palette --- */
  .hist-lane { 
    background: var(--surface); border: 1px solid var(--border); border-radius: 28px; 
    padding: 28px; display: flex; flex-direction: column; gap: 24px; min-height: 450px; 
    box-shadow: var(--shadow-sm); transition: 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  [data-theme='dark'] .hist-lane {
    background: var(--surface);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-lg);
  }

  .lane-head { display: flex; align-items: center; gap: 16px; }
  .lane-ico { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; font-size: 18px; }
  
  .lane-ico.view { background: var(--primary-soft); color: var(--primary); }
  .lane-ico.update { background: rgba(229, 181, 96, 0.1); color: #E5B560; }
  .lane-ico.comm { background: rgba(155, 48, 65, 0.1); color: var(--brand-burgundy-light); }
  
  .lane-head h3 { margin: 0; font-size: 18px; font-weight: 800; color: var(--text); letter-spacing: -0.5px; }

  .lane-content { display: flex; flex-direction: column; gap: 14px; }
  .lane-empty { 
    padding: 50px 20px; text-align: center; color: var(--text-muted); 
    font-size: 14px; font-style: italic; border: 2px dashed var(--border); border-radius: 20px; 
  }

  .hist-item { 
    display: flex; gap: 14px; padding: 16px; background: var(--bg); 
    border: 1px solid var(--border); border-radius: 20px; transition: 0.2s ease-out;
  }
  
  [data-theme='dark'] .hist-item {
    background: var(--surface-2);
    border-color: var(--border);
  }

  .hist-item:hover { 
    transform: translateY(-4px) scale(1.01); 
    border-color: var(--primary); 
    box-shadow: var(--shadow-lg); 
  }
  
  .hist-type-ico { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; font-size: 14px; flex-shrink: 0; }
  .hist-type-ico.student_view { background: var(--primary-soft); color: var(--primary); }
  .hist-type-ico.note_added { background: rgba(229, 181, 96, 0.1); color: #E5B560; }
  .hist-type-ico.file_upload { background: rgba(111, 178, 134, 0.1); color: #6FB286; }
  .hist-type-ico.message_sent { background: rgba(155, 48, 65, 0.1); color: var(--brand-burgundy-light); }

  .hist-content { flex: 1; min-width: 0; }
  .hist-subject { font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
  .hist-meta-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); font-weight: 600; }
  .hist-preview { 
    font-size: 13px; color: var(--text-muted); margin-top: 10px; 
    background: var(--surface-2); padding: 12px; border-radius: 12px; 
    border: 1px solid var(--border); line-height: 1.5;
  }
  
  [data-theme='dark'] .hist-preview {
    background: var(--bg);
    border-color: var(--border);
    color: var(--text-muted);
  }

  .hist-actions { display: flex; flex-direction: column; gap: 6px; }
  .hist-btn-go, .hist-btn-del { 
    width: 32px; height: 32px; border-radius: 8px; border: none; 
    display: grid; place-items: center; cursor: pointer; transition: 0.2s; 
    background: var(--surface-2); color: var(--text-muted); font-size: 11px; 
  }
  
  .hist-btn-go:hover { background: var(--primary); color: var(--bg); }
  .hist-btn-del:hover { background: #fee2e2; color: #ef4444; }

  [data-theme='dark'] .hist-btn-go, [data-theme='dark'] .hist-btn-del {
    background: var(--surface);
    color: var(--text-muted);
  }
  [data-theme='dark'] .hist-btn-go:hover { background: var(--primary); color: var(--bg); }

  @media (max-width: 1200px) {
    .hist-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 768px) {
    .hist-page { padding: 24px; }
    .hist-title { font-size: 32px; letter-spacing: -1px; }
    .hist-grid { grid-template-columns: 1fr; }
    .hist-lane { padding: 20px; min-height: auto; border-radius: 20px; }
    .hist-ico-main { width: 56px; height: 56px; font-size: 24px; }
  }
`;
