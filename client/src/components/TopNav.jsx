// src/components/TopNav.jsx
import React, { useRef, useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useApp } from "../context/AppContext";
import dsmLogo from "../assets/images/DSM LOGO.png";
import {
  FaHome, FaUsers, FaCalendarAlt, FaChartLine, FaColumns,
  FaComments, FaPlus, FaBell, FaSearch, FaUser, FaKey,
  FaUserFriends, FaCog, FaFileAlt, FaSignOutAlt, FaShieldAlt,
  FaClipboardList, FaPenNib, FaToolbox, FaChevronDown, FaAt,
  FaFileContract, FaBars, FaTimes, FaSun, FaMoon, FaChevronRight,
  FaFilePdf, FaCheckDouble, FaSlidersH, FaEnvelopeOpenText, FaSignature
} from "react-icons/fa";

const NAV_ITEMS = [
  { to: "/admin/home",      label: "Home",      icon: FaHome },
  { to: "/admin/students",  label: "Students",  icon: FaUsers },
  { to: "/admin/calendar",  label: "Calendar",  icon: FaCalendarAlt },
  { to: "/admin/docs-center", label: "Documents", icon: FaFilePdf },
  { to: "/admin/insights",  label: "Insights",  icon: FaChartLine },
  { to: "/admin/boards",    label: "Boards",    icon: FaColumns },
];

const MGMT_ITEMS = [
  { to: "/admin/teams",        label: "Teams",        icon: FaUserFriends },
  { to: "/admin/forms",        label: "Forms",        icon: FaClipboardList },
  { to: "/admin/form-builder", label: "Form Builder", icon: FaPenNib },
  { to: "/admin/docs-center",  label: "Docs Center",  icon: FaFileAlt },
  { to: "/admin/engage",       label: "Engage",       icon: FaComments },
];

function relTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function TopNav() {
  const { setSearch, setPanels, api, data, panels, user, logout, presenceFor, setPresence, setModal, setToast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const [avatarOpen, setAvatarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mgmtOpen, setMgmtOpen] = useState(false);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showPrefModal, setShowPrefModal] = useState(false);

  const isAdmin = String(user?.role || "").toLowerCase() === "admin";
  const myPresence = presenceFor(user);

  const avatarRef = useRef(null);
  const notifRef = useRef(null);
  const mgmtRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target)) setAvatarOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (mgmtRef.current && !mgmtRef.current.contains(e.target)) setMgmtOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const notifications = (data?.notifications || []).filter(n => !n.to || n.to === user?.id);
  const unreadCount = notifications.filter(n => !n.read).length;
  const userInitials = (user?.name || "AD").split(/\s+/).map(p => p[0]).join("").toUpperCase().slice(0, 2);

  const handleStatusChange = async (s) => {
    try { await setPresence(s); setAvatarOpen(false); } catch {}
  };

  const [theme, setTheme] = React.useState(() => localStorage.getItem("dsm:theme") || "dark");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("dsm:theme", theme);
  }, [theme]);

  const markAllRead = async () => {
    try {
      const unread = notifications.filter(n => !n.read);
      await Promise.all(unread.map(n => api.put('notifications', { ...n, read: true })));
      setToast("All notifications marked as read");
    } catch {
      setToast({ type: 'error', text: "Failed to update notifications" });
    }
  };

  const openCreateStudent = (kind = "student") => {
    const presets = {
      student: { status: "Current", recordType: "Resident" },
      future: { status: "Future Applicant", recordType: "Applicant" },
      alumni: { status: "Alumni", recordType: "Alumni", exitDate: new Date().toISOString().slice(0, 10) },
    };
    const prefill = presets[kind] || presets.student;

    setModal({
      open: true,
      type: "student",
      props: {
        existing: prefill,
        cardStyle: { maxWidth: "min(1100px, 95vw)" },
        onSaved: (created) => {
          if (created?.id) navigate(`/admin/students/${created.id}`);
          else navigate("/admin/students");
        }
      }
    });
  };

  const getNotifIcon = (type) => {
    switch (type) {
      case 'mention': return <FaAt />;
      case 'document_signed': return <FaFileContract />;
      case 'message': return <FaComments />;
      case 'admin_sig_required': return <FaSignature />;
      case 'form_submitted': return <FaClipboardList />;
      default: return <FaBell />;
    }
  };

  return (
    <>
      <header className="dsm-topnav">
        {/* Left: Branding & Desktop Nav */}
        <div className="dsm-nav-left">
          <button className="dsm-logo" onClick={() => navigate("/admin/home")} aria-label="Go to home">
            <div className="dsm-logo-mark">
              <img src={dsmLogo} alt="Discipleship School of Ministry" />
            </div>
            <div className="dsm-logo-stack">
              <span className="dsm-logo-text">DSM</span>
              <span className="dsm-logo-sub">School of Ministry</span>
            </div>
          </button>

          <nav className="dsm-desktop-nav">
            {NAV_ITEMS.map(it => (
              <NavLink key={it.to} to={it.to} className={({isActive}) => `dsm-nav-item ${isActive ? 'active' : ''}`}>
                <it.icon /> <span>{it.label}</span>
              </NavLink>
            ))}

            <div className="dsm-dropdown-wrap" ref={mgmtRef}>
              <button 
                className={`dsm-nav-item ${mgmtOpen ? 'active' : ''}`} 
                onClick={() => setMgmtOpen(!mgmtOpen)}
              >
                <FaToolbox /> <span>Management</span> <FaChevronDown style={{ fontSize: 10, marginLeft: 4 }} />
              </button>
              {mgmtOpen && (
                <div className="dsm-dropdown show">
                  <div className="dsm-dropdown-header">System Operations</div>
                  {MGMT_ITEMS.map(it => (
                    <button 
                      key={it.to} 
                      className="dsm-dropdown-item" 
                      onClick={() => { setMgmtOpen(false); navigate(it.to); }}
                    >
                      <it.icon /> {it.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </nav>
        </div>

        {/* Center: Search */}
        <div className="dsm-nav-center">
          <div className="dsm-search-bar">
            <FaSearch className="dsm-search-icon" />
            <input placeholder="Search records..." onChange={e => setSearch?.(e.target.value)} />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="dsm-nav-right">
          <button className="dsm-action-btn" onClick={() => openCreateStudent()} title="Add Record">
            <FaPlus />
          </button>

          <button className="dsm-action-btn" onClick={() => setPanels(p => ({ ...p, messages: true }))} title="Messages">
            <FaComments />
          </button>

          <div className="dsm-dropdown-wrap" ref={notifRef}>
            <button className={`dsm-action-btn ${unreadCount > 0 ? 'has-unread' : ''}`} onClick={() => setNotifOpen(!notifOpen)}>
              <FaBell />
              {unreadCount > 0 && <span className="dsm-unread-badge">{unreadCount}</span>}
            </button>
            {notifOpen && (
              <div className="dsm-dropdown right show notif-dropdown">
                <header className="notif-dropdown-header">
                  <div className="title-group">
                    <h3>Activity Feed</h3>
                    {unreadCount > 0 && <span className="unread-pill">{unreadCount} New</span>}
                  </div>
                  <div className="action-group">
                    <button onClick={markAllRead} title="Mark all as read"><FaCheckDouble /></button>
                    <button onClick={() => { setNotifOpen(false); setShowPrefModal(true); }} title="Preferences"><FaSlidersH /></button>
                  </div>
                </header>
                <div className="dsm-notif-list">
                  {notifications.length ? 
                    [...notifications].reverse().slice(0, 15).map(n => (
                    <div 
                      key={n.id} 
                      className={`notif-card ${n.read ? 'read' : 'unread'}`} 
                      onClick={async () => {
                        if (!n.read) await api.put('notifications', { ...n, read: true });
                        setNotifOpen(false);
                        if (n.type === 'mention' || n.type === 'message' || n.threadId) navigate('/admin/engage');
                        else if (n.type === 'document_signed' || n.type === 'admin_sig_required') navigate('/admin/docs-center');
                        else if (n.type === 'form_submitted') navigate('/admin/docs-center', { state: { openMode: 'form-subs' } });
                      }}
                    >
                      <div className={`notif-icon-wrap ${n.type || 'alert'}`}>
                        {getNotifIcon(n.type)}
                      </div>
                      <div className="notif-details">
                        <div className="notif-title">{n.title}</div>
                        <div className="notif-text">{n.text}</div>
                        <div className="notif-meta">
                          <span className="time">{relTime(n.createdAt)}</span>
                          {!n.read && <span className="unread-dot" />}
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="notif-empty">
                      <FaBell />
                      <p>You're all caught up!</p>
                      <span>No recent activity found.</span>
                    </div>
                  )}
                </div>
                <footer className="notif-dropdown-footer">
                  <button onClick={() => { setNotifOpen(false); navigate('/admin/history'); }}>View Full History</button>
                </footer>
              </div>
            )}
          </div>

          <div className="dsm-dropdown-wrap" ref={avatarRef}>
            <button className="dsm-avatar-btn" onClick={() => setAvatarOpen(!avatarOpen)}>
              {userInitials}
              <span className={`dsm-presence-dot ${myPresence}`} />
            </button>
            {avatarOpen && (
              <div className="dsm-dropdown right show">
                {isAdmin && (
                  <div className="dsm-status-section">
                    <div className="dsm-dropdown-label">Status</div>
                    <div className="dsm-status-grid">
                      {["online", "away", "offline"].map(s => (
                        <button key={s} onClick={() => handleStatusChange(s)} className={`dsm-status-opt ${myPresence === s ? 'active' : ''}`}>
                          <span className={`dot ${s}`} /> {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="dsm-dropdown-sep" />
                <button className="dsm-dropdown-item" onClick={() => { setAvatarOpen(false); navigate("/admin/profile"); }}><FaUser /> Profile</button>
                <button className="dsm-dropdown-item" onClick={() => { setAvatarOpen(false); navigate("/admin/settings"); }}><FaCog /> Settings</button>
                <button className="dsm-dropdown-item" onClick={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); setAvatarOpen(false); }}>
                  {theme === 'dark' ? <><FaSun /> Light Mode</> : <><FaMoon /> Dark Mode</>}
                </button>
                <div className="dsm-dropdown-sep" />
                <button className="dsm-dropdown-item danger" onClick={logout}><FaSignOutAlt /> Logout</button>
              </div>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button className="dsm-mobile-toggle" onClick={() => setMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <FaTimes /> : <FaBars />}
          </button>
        </div>
      </header>

      {/* Notification Preferences Modal */}
      {showPrefModal && (
        <div className="dsm-modal-overlay" onClick={() => setShowPrefModal(false)}>
          <div className="dsm-modal-card pref-modal" onClick={e => e.stopPropagation()}>
            <header className="dsm-modal-header">
              <h3>Notification Preferences</h3>
              <button className="dsm-close-btn" onClick={() => setShowPrefModal(false)}><FaTimes /></button>
            </header>
            <div className="dsm-modal-body">
              <p className="pref-intro">Control which events trigger system-wide alerts and desktop notifications.</p>
              
              <div className="pref-section">
                <h4>Communications</h4>
                <PrefToggle label="Direct Messages" desc="Alert when someone sends you a private message." checked />
                <PrefToggle label="Staff Mentions" desc="Alert when tagged using @name in Engage hub." checked />
              </div>

              <div className="pref-section">
                <h4>Documents & Forms</h4>
                <PrefToggle label="Admin Signatures Required" desc="Get notified when a document is waiting for your signature." checked />
                <PrefToggle label="Student Submissions" desc="Alert when a student completes a form or signs a PDF." checked />
                <PrefToggle label="Envelope Completion" desc="Get notified when all parties have finished signing a document." checked />
              </div>
            </div>
            <div className="dsm-modal-footer">
              <button className="dsm-btn-primary" onClick={() => { setShowPrefModal(false); setToast("Preferences saved"); }}>Save Preferences</button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sidebar Navigation */}
      <div className={`dsm-mobile-sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="dsm-mobile-header">
          <div className="dsm-logo">
            <div className="dsm-logo-mark">
              <img src={dsmLogo} alt="DSM" />
            </div>
            <div className="dsm-logo-stack">
              <span className="dsm-logo-text">DSM</span>
              <span className="dsm-logo-sub">School of Ministry</span>
            </div>
          </div>
          <button className="dsm-close-btn" onClick={() => setMobileMenuOpen(false)}><FaTimes /></button>
        </div>
        <nav className="dsm-mobile-nav">
          <div className="dsm-dropdown-label" style={{ padding: '0 16px', marginTop: 12 }}>Main Navigation</div>
          {NAV_ITEMS.map(it => (
            <NavLink key={it.to} to={it.to} className="dsm-mobile-nav-item" onClick={() => setMobileMenuOpen(false)}>
              <it.icon /> <span>{it.label}</span>
              <FaChevronRight className="arrow" />
            </NavLink>
          ))}
          
          ))}
          
          <div className="dsm-dropdown-label" style={{ padding: '0 16px', marginTop: 24 }}>Preferences</div>
          <NavLink to="/admin/settings" className="dsm-mobile-nav-item" onClick={() => setMobileMenuOpen(false)}>
            <FaCog /> <span>Settings</span>
            <FaChevronRight className="arrow" />
          </NavLink>
        </nav>
        <div className="dsm-mobile-footer">
          <button className="dsm-btn-logout" onClick={logout}><FaSignOutAlt /> Sign Out</button>
        </div>
      </div>

      <style>{NAV_EXT_CSS}</style>
    </>
  );
}

function PrefToggle({ label, desc, checked }) {
  const [val, setVal] = useState(checked);
  return (
    <div className="pref-row">
      <div className="pref-info">
        <div className="lab">{label}</div>
        <div className="desc">{desc}</div>
      </div>
      <button className={`pref-switch ${val ? 'on' : 'off'}`} onClick={() => setVal(!val)}>
        <div className="thumb" />
      </button>
    </div>
  );
}

const NAV_EXT_CSS = `
  .notif-dropdown { width: 380px !important; padding: 0 !important; overflow: hidden; display: flex; flex-direction: column; max-height: 540px; }
  .notif-dropdown-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; background: var(--bg); }
  .notif-dropdown-header h3 { margin: 0; font-size: 15px; font-weight: 800; color: var(--text); }
  .unread-pill { padding: 2px 8px; background: var(--primary); color: white; border-radius: 99px; font-size: 10px; font-weight: 800; margin-left: 10px; }
  .notif-dropdown-header .action-group { display: flex; gap: 12px; }
  .notif-dropdown-header .action-group button { color: var(--text-muted); font-size: 14px; transition: 0.2s; }
  .notif-dropdown-header .action-group button:hover { color: var(--primary); transform: scale(1.1); }

  .dsm-notif-list { flex: 1; overflow-y: auto; background: var(--surface); }
  .notif-card { display: flex; gap: 16px; padding: 16px 20px; border-bottom: 1px solid var(--border); cursor: pointer; transition: 0.2s; position: relative; }
  .notif-card:last-child { border-bottom: none; }
  .notif-card:hover { background: rgba(99, 102, 241, 0.03); }
  .notif-card.unread { background: rgba(99, 102, 241, 0.01); }
  
  .notif-icon-wrap { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; font-size: 16px; flex-shrink: 0; }
  .notif-icon-wrap.mention { background: #eef2ff; color: #4f46e5; }
  .notif-icon-wrap.document_signed { background: #ecfdf5; color: #10b981; }
  .notif-icon-wrap.message { background: #fff7ed; color: #f59e0b; }
  .notif-icon-wrap.admin_sig_required { background: #fff1f2; color: #ef4444; }
  .notif-icon-wrap.form_submitted { background: #f5f3ff; color: #8b5cf6; }
  .notif-icon-wrap.alert { background: #f1f5f9; color: #64748b; }

  .notif-details { flex: 1; min-width: 0; }
  .notif-title { font-size: 13px; font-weight: 800; color: var(--text); margin-bottom: 2px; }
  .notif-text { font-size: 12px; color: var(--text-muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .notif-meta { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; }
  .notif-meta .time { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }
  .unread-dot { width: 8px; height: 8px; background: var(--primary); border-radius: 50%; }

  .notif-empty { padding: 60px 40px; text-align: center; color: var(--text-muted); }
  .notif-empty svg { font-size: 40px; margin-bottom: 16px; opacity: 0.2; }
  .notif-empty p { margin: 0; font-weight: 800; font-size: 15px; color: var(--text); }
  .notif-empty span { font-size: 13px; opacity: 0.7; }

  .notif-dropdown-footer { padding: 12px; border-top: 1px solid var(--border); background: var(--bg); text-align: center; }
  .notif-dropdown-footer button { font-size: 11px; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: 0.5px; }

  .pref-modal { max-width: 500px; }
  .pref-intro { font-size: 14px; color: var(--text-muted); margin-bottom: 24px; line-height: 1.5; }
  .pref-section { margin-bottom: 24px; }
  .pref-section h4 { font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--primary); letter-spacing: 1px; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
  .pref-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 12px 0; border-bottom: 1px solid rgba(0,0,0,0.03); }
  :root[data-theme="dark"] .pref-row { border-bottom-color: rgba(255,255,255,0.03); }
  .pref-row:last-child { border-bottom: none; }
  .pref-info .lab { font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 2px; }
  .pref-info .desc { font-size: 12px; color: var(--text-muted); line-height: 1.4; }
  .pref-switch { width: 44px; height: 24px; border-radius: 99px; position: relative; transition: 0.3s; }
  .pref-switch.on { background: var(--primary); }
  .pref-switch.off { background: var(--border); }
  .pref-switch .thumb { width: 18px; height: 18px; background: white; border-radius: 50%; position: absolute; top: 3px; left: 3px; transition: 0.3s; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
  .pref-switch.on .thumb { left: 23px; }

  /* ============================================================================
     Mobile breakpoints for nav dropdowns / pref modal
     ============================================================================ */
  @media (max-width: 768px) {
    .notif-dropdown {
      width: calc(100vw - 20px) !important;
      max-width: 380px;
      max-height: 70vh;
    }
    .notif-card { padding: 14px 16px; gap: 12px; }
    .notif-icon-wrap { width: 36px; height: 36px; font-size: 14px; }
    .notif-title { font-size: 13px; }
    .notif-text { font-size: 12px; }
    .notif-empty { padding: 40px 22px; }

    .pref-modal { max-width: 100%; }
    .pref-row { flex-wrap: wrap; gap: 12px; padding: 14px 0; }
    .pref-info { flex: 1 1 100%; }
  }

  @media (max-width: 480px) {
    .notif-dropdown-header { padding: 12px 14px; }
    .notif-dropdown-header h3 { font-size: 14px; }
    .notif-card { padding: 12px 14px; }
  }
`;
