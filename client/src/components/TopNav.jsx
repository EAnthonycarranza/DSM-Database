import React, { useRef, useState, useEffect, useMemo } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useApp } from "../context/AppContext";
import dsmLogo from "../assets/images/DSM LOGO.png";
import {
  FaHome, FaUsers, FaCalendarAlt, FaChartLine, FaColumns,
  FaComments, FaPlus, FaBell, FaSearch, FaUser, FaKey,
  FaUserFriends, FaCog, FaFileAlt, FaSignOutAlt, FaShieldAlt,
  FaClipboardList, FaPenNib, FaToolbox, FaChevronDown, FaAt,
  FaFileContract, FaBars, FaTimes, FaSun, FaMoon, FaChevronRight,
  FaFilePdf, FaCheckDouble, FaSlidersH, FaEnvelopeOpenText, FaSignature,
  FaHistory, FaFileUpload, FaExternalLinkAlt, FaKeyboard, FaSync
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
  const { setSearch, setPanels, api, data, panels, user, logout, presenceFor, setPresence, setModal, setToast, refreshAll } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const [avatarOpen, setAvatarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mgmtOpen, setMgmtOpen] = useState(false);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showPrefModal, setShowPrefModal] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

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

        {/* Center: Global Search Command Palette */}
        <div className="dsm-nav-center">
          <GlobalSearch setMobileSearchOpen={setMobileSearchOpen} />
        </div>

        {/* Right: Actions */}
        <div className="dsm-nav-right">
          <button className="dsm-action-btn mobile-search-trigger" onClick={() => setMobileSearchOpen(true)} title="Search System">
            <FaSearch />
          </button>

          <button className="dsm-action-btn" onClick={() => openCreateStudent()} title="Add Record">
            <FaPlus />
          </button>

          <button className="dsm-action-btn" onClick={() => navigate("/admin/history")} title="Activity History">
            <FaHistory />
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
                <button className="dsm-dropdown-item" onClick={() => { setAvatarOpen(false); refreshAll(); }}>
                  <FaSync /> Refresh System
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
          <div className="dsm-dropdown-label" style={{ padding: '0 16px', marginTop: 12 }}>Workspace</div>
          {NAV_ITEMS.map(it => (
            <NavLink key={it.to} to={it.to} className="dsm-mobile-nav-item" onClick={() => setMobileMenuOpen(false)}>
              <it.icon /> <span>{it.label}</span>
              <FaChevronRight className="arrow" />
            </NavLink>
          ))}

          <div className="dsm-dropdown-label" style={{ padding: '0 16px', marginTop: 24 }}>Forms &amp; Teams</div>
          <NavLink to="/admin/forms" className="dsm-mobile-nav-item" onClick={() => setMobileMenuOpen(false)}>
            <FaClipboardList /> <span>Forms</span>
            <FaChevronRight className="arrow" />
          </NavLink>
          <NavLink to="/admin/form-builder" className="dsm-mobile-nav-item" onClick={() => setMobileMenuOpen(false)}>
            <FaPenNib /> <span>Form Builder</span>
            <FaChevronRight className="arrow" />
          </NavLink>
          <NavLink to="/admin/teams" className="dsm-mobile-nav-item" onClick={() => setMobileMenuOpen(false)}>
            <FaUserFriends /> <span>Teams</span>
            <FaChevronRight className="arrow" />
          </NavLink>

          <div className="dsm-dropdown-label" style={{ padding: '0 16px', marginTop: 24 }}>More Tools</div>
          {MGMT_ITEMS.filter(it => !["/admin/forms", "/admin/form-builder", "/admin/teams"].includes(it.to)).map(it => (
            <NavLink key={it.to} to={it.to} className="dsm-mobile-nav-item" onClick={() => setMobileMenuOpen(false)}>
              <it.icon /> <span>{it.label}</span>
              <FaChevronRight className="arrow" />
            </NavLink>
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

      {/* Mobile Search Overlay */}
      {mobileSearchOpen && (
        <div className="dsm-mobile-search-overlay fade-in">
          <header className="ms-header">
            <div className="ms-title">
              <FaSearch /> Advanced Search
            </div>
            <button className="ms-close" onClick={() => setMobileSearchOpen(false)}>
              <FaTimes />
            </button>
          </header>
          <div className="ms-content">
            <GlobalSearch isMobile onClose={() => setMobileSearchOpen(false)} />
            <div className="ms-quick-nav">
              <div className="ms-nav-label">Quick Filters</div>
              <div className="ms-pill-grid">
                <button onClick={() => { setSearch?.("status:current"); setMobileSearchOpen(false); navigate("/admin/students"); }}>Current Students</button>
                <button onClick={() => { setSearch?.("type:resident"); setMobileSearchOpen(false); navigate("/admin/students"); }}>Residents</button>
                <button onClick={() => { setSearch?.("needs:id"); setMobileSearchOpen(false); navigate("/admin/docs-center"); }}>ID Required</button>
                <button onClick={() => { setMobileSearchOpen(false); navigate("/admin/calendar"); }}>Today's Events</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{NAV_EXT_CSS}</style>
    </>
  );
}

function GlobalSearch({ isMobile, onClose, setMobileSearchOpen }) {
  const { data, setSearch: setGlobalSearch, setModal } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem("dsm:search:history");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const searchRef = useRef(null);

  // Sync history to LS
  useEffect(() => {
    try { localStorage.setItem("dsm:search:history", JSON.stringify(history.slice(0, 5))); } catch {}
  }, [history]);

  // Close on outside click
  useEffect(() => {
    const click = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", click);
    return () => document.removeEventListener("mousedown", click);
  }, []);

  // Keyboard shortcut: / or Cmd/Ctrl+K to focus
  useEffect(() => {
    const k = (e) => {
      const isSlash = e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA";
      
      // Support both Cmd+K (Mac) and Ctrl+K (PC)
      const isK = (e.key === 'k' || e.key === 'K');
      const isCmdK = (e.metaKey || e.ctrlKey) && isK;

      if (isSlash || isCmdK) {
        e.preventDefault();
        e.stopPropagation();
        
        if (window.innerWidth <= 1100) {
          setMobileSearchOpen?.(true);
        } else {
          const input = searchRef.current?.querySelector("input");
          if (input) {
            input.focus();
            setIsOpen(true);
          }
        }
      }
    };
    window.addEventListener("keydown", k, true); // Use capture phase to be more certain
    return () => window.removeEventListener("keydown", k, true);
  }, [setMobileSearchOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      if (history.length) {
        return [{ 
          label: "Recent Searches", 
          items: history.map(h => ({ 
            id: "hist-" + h, 
            type: "History", 
            title: h, 
            sub: "Previous search query", 
            icon: FaHistory, 
            action: () => setQuery(h) 
          })) 
        }];
      }
      return [];
    }

    const out = [];

    // 1. Students
    const students = (data?.students || []).filter(s => 
      String(s.firstName + " " + s.lastName + " " + (s.email || "") + " " + s.id).toLowerCase().includes(q)
    ).slice(0, 5).map(s => ({
      id: "std-" + s.id,
      type: "Student",
      title: s.firstName + " " + s.lastName,
      sub: s.email || "ID: " + s.id,
      icon: FaUser,
      action: () => {
        addToHistory(s.firstName + " " + s.lastName);
        navigate("/admin/students/" + s.id);
      }
    }));
    if (students.length) out.push({ label: "Students", items: students });

    // 2. Staff/Users
    const users = (data?.users || []).filter(u => 
      String(u.name + " " + (u.email || "")).toLowerCase().includes(q)
    ).slice(0, 3).map(u => ({
      id: "usr-" + u.id,
      type: "Staff",
      title: u.name,
      sub: u.email || "Administrator",
      icon: FaShieldAlt,
      action: () => {
        addToHistory(u.name);
        navigate("/admin/teams");
      }
    }));
    if (users.length) out.push({ label: "Staff", items: users });

    // 3. Forms & Documents
    const forms = (data?.forms || []).filter(f => 
      String(f.name || "").toLowerCase().includes(q)
    ).slice(0, 3).map(f => ({
      id: "frm-" + f.id,
      type: "Form",
      title: f.name,
      sub: "Interactive Form Template",
      icon: FaClipboardList,
      action: () => navigate("/admin/forms")
    }));

    const docs = (data?.pdfTemplates || []).filter(d => 
      String(d.name || "").toLowerCase().includes(q)
    ).slice(0, 3).map(d => ({
      id: "doc-" + d.id,
      type: "Document",
      title: d.name,
      sub: "PDF Signature Template",
      icon: FaFilePdf,
      action: () => navigate("/admin/docs-center")
    }));
    
    if (forms.length || docs.length) {
      out.push({ label: "Forms & Documents", items: [...forms, ...docs] });
    }

    // 4. Quick Actions & Navigation
    const actions = [
      { id: "act-add-std", title: "Add New Student", sub: "Open creation wizard", icon: FaPlus, action: () => {
        setIsOpen(false);
        setModal({ open: true, type: "student", props: { existing: { status: "Current", recordType: "Resident" } } });
      }},
      { id: "act-calendar", title: "View Calendar", sub: "Check schedules and events", icon: FaCalendarAlt, action: () => navigate("/admin/calendar") },
      { id: "act-insights", title: "System Insights", sub: "View analytics and reports", icon: FaChartLine, action: () => navigate("/admin/insights") },
      { id: "act-engage", title: "Engage Hub", sub: "Go to messaging and chat", icon: FaComments, action: () => navigate("/admin/engage") },
      { id: "act-boards", title: "Activity Boards", sub: "Status and phase tracking", icon: FaColumns, action: () => navigate("/admin/boards") },
      { id: "act-settings", title: "System Settings", sub: "Manage lists and capacity", icon: FaCog, action: () => navigate("/admin/settings") },
      { id: "act-logout", title: "Sign Out", sub: "End current session", icon: FaSignOutAlt, action: () => navigate("/admin/login") },
    ].filter(a => a.title.toLowerCase().includes(q));
    
    if (actions.length) out.push({ label: "Quick Actions", items: actions });

    return out;
  }, [query, data, history, navigate, setModal]);

  const flatResults = useMemo(() => results.flatMap(g => g.items), [results]);

  const addToHistory = (txt) => {
    setHistory(prev => {
      const next = [txt, ...prev.filter(x => x !== txt)].slice(0, 5);
      return next;
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      setActiveIndex(prev => (prev + 1) % flatResults.length);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setActiveIndex(prev => (prev - 1 + flatResults.length) % flatResults.length);
      e.preventDefault();
    } else if (e.key === "Enter") {
      const item = flatResults[activeIndex];
      if (item) {
        if (item.type === "History") {
          setQuery(item.title);
        } else {
          item.action();
          setIsOpen(false);
          setQuery("");
          onClose?.();
        }
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className="dsm-search-palette" ref={searchRef}>
      <div className={"dsm-search-bar " + (isOpen ? "focused" : "")}>
        <FaSearch className="dsm-search-icon" />
        <input 
          placeholder="Search students, staff, docs... (Press /)" 
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setGlobalSearch?.(e.target.value);
            setIsOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {query && <button className="clear-btn" onClick={() => setQuery("")}><FaTimes /></button>}
        {!isMobile && (
          <div className="search-hint">
            <FaKeyboard style={{ fontSize: 10 }} /> K
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="dsm-search-results">
          <div className="results-scroll">
            {results.map((group, gIdx) => (
              <div key={group.label} className="result-group">
                <div className="group-label">{group.label}</div>
                {group.items.map((item) => {
                  const flatIdx = flatResults.indexOf(item);
                  const isActive = flatIdx === activeIndex;
                  return (
                    <div 
                      key={item.id} 
                      className={"result-item " + (isActive ? "active" : "")}
                      onClick={() => {
                        if (item.type === "History") {
                          setQuery(item.title);
                        } else {
                          item.action();
                          setIsOpen(false);
                          setQuery("");
                          onClose?.();
                        }
                      }}
                      onMouseEnter={() => setActiveIndex(flatIdx)}
                    >
                      <div className="item-icon"><item.icon /></div>
                      <div className="item-content">
                        <div className="item-title">{item.title}</div>
                        <div className="item-sub">{item.sub}</div>
                      </div>
                      {isActive && <FaChevronRight className="item-arrow" />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <footer className="search-footer">
            <div className="footer-hint"><span>↑↓</span> Navigate</div>
            <div className="footer-hint"><span>↵</span> Select</div>
            <div className="footer-hint"><span>ESC</span> Close</div>
          </footer>
        </div>
      )}
    </div>
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
      <button className={"pref-switch " + (val ? "on" : "off")} onClick={() => setVal(!val)}>
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

  /* Global Search Palette */
  .dsm-search-palette { position: relative; width: 100%; max-width: 500px; margin: 0 auto; z-index: 1000; }
  .dsm-search-palette .dsm-search-bar { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; }
  .dsm-search-palette .dsm-search-bar.focused { transform: scale(1.02); }
  .dsm-search-palette .dsm-search-bar input { padding-right: 80px; }
  
  .clear-btn { position: absolute; right: 45px; top: 50%; transform: translateY(-50%); color: var(--text-muted); padding: 4px; border-radius: 4px; font-size: 12px; border: none; background: transparent; cursor: pointer; }
  .clear-btn:hover { color: var(--primary); background: var(--bg); }
  
  .search-hint { 
    position: absolute; right: 12px; top: 50%; transform: translateY(-50%); 
    display: flex; align-items: center; gap: 4px; padding: 4px 8px; 
    background: var(--surface); border: 1px solid var(--border); 
    border-radius: 6px; font-size: 10px; font-weight: 800; color: var(--text-muted); 
    pointer-events: none;
  }

  .dsm-search-results {
    position: absolute; top: calc(100% + 12px); left: 0; right: 0; 
    background: var(--surface); border: 1px solid var(--border); border-radius: 20px; 
    box-shadow: var(--shadow-2xl); overflow: hidden; animation: searchPop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes searchPop { from { opacity: 0; transform: translateY(-10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

  .results-scroll { max-height: 480px; overflow-y: auto; padding: 12px; }
  .results-scroll::-webkit-scrollbar { width: 6px; }
  .results-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }

  .group-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px; color: var(--primary); padding: 16px 12px 8px; }
  .result-item { 
    display: flex; align-items: center; gap: 16px; padding: 12px; border-radius: 12px; 
    cursor: pointer; transition: all 0.2s; border: 1.5px solid transparent; margin-bottom: 2px;
  }
  .result-item.active { background: var(--primary-soft); border-color: var(--primary); }
  
  .item-icon { 
    width: 36px; height: 36px; border-radius: 10px; background: var(--surface-2); 
    display: grid; place-items: center; font-size: 16px; color: var(--text-muted); transition: 0.2s;
  }
  .result-item.active .item-icon { background: var(--primary); color: var(--bg); transform: scale(1.1); }
  
  .item-content { flex: 1; min-width: 0; }
  .item-title { font-size: 14px; font-weight: 700; color: var(--text); }
  .item-sub { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  
  .item-arrow { font-size: 12px; color: var(--primary); animation: arrowSlide 0.3s infinite alternate; }
  @keyframes arrowSlide { from { transform: translateX(0); } to { transform: translateX(4px); } }

  .search-footer { padding: 12px 20px; background: var(--bg); border-top: 1px solid var(--border); display: flex; gap: 20px; }
  .footer-hint { font-size: 10px; font-weight: 700; color: var(--text-muted); display: flex; align-items: center; gap: 6px; }
  .footer-hint span { padding: 2px 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; color: var(--text); }

  @media (max-width: 1024px) {
    .dsm-search-palette { max-width: 400px; }
  }
  @media (max-width: 1100px) {
    .dsm-nav-center { display: none; }
  }

  .dsm-notif-list { flex: 1; overflow-y: auto; background: var(--surface); }
  .notif-card { display: flex; gap: 16px; padding: 16px 20px; border-bottom: 1px solid var(--border); cursor: pointer; transition: 0.2s; position: relative; }
  .notif-card:last-child { border-bottom: none; }
  .notif-card:hover { background: var(--primary-soft); }
  .notif-card.unread { background: rgba(201, 169, 97, 0.02); }
  
  .notif-icon-wrap { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; font-size: 16px; flex-shrink: 0; }
  .notif-icon-wrap.mention { background: var(--primary-soft); color: var(--primary); }
  .notif-icon-wrap.document_signed { background: rgba(111, 178, 134, 0.1); color: #6FB286; }
  .notif-icon-wrap.message { background: rgba(229, 181, 96, 0.1); color: #E5B560; }
  .notif-icon-wrap.admin_sig_required { background: rgba(155, 48, 65, 0.1); color: var(--brand-burgundy-light); }
  .notif-icon-wrap.form_submitted { background: rgba(168, 85, 247, 0.1); color: #a855f7; }
  .notif-icon-wrap.alert { background: var(--surface-2); color: var(--text-muted); }

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

  /* Mobile Search Modal */
  .mobile-search-trigger { display: none !important; }
  @media (max-width: 1100px) {
    .mobile-search-trigger { display: grid !important; }
  }

  .dsm-mobile-search-overlay {
    position: fixed; inset: 0; background: var(--bg); z-index: 9999;
    display: flex; flex-direction: column;
  }
  .ms-header {
    padding: 16px 20px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
    background: var(--surface);
  }
  .ms-title { display: flex; align-items: center; gap: 12px; font-weight: 800; font-size: 16px; color: var(--text); }
  .ms-title svg { color: var(--primary); }
  .ms-close { width: 40px; height: 40px; border-radius: 12px; background: var(--bg); color: var(--text); display: grid; place-items: center; }
  
  .ms-content { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 24px; }
  .ms-content .dsm-search-palette { max-width: 100%; }
  .ms-content .dsm-search-bar { background: var(--surface); border: 2px solid var(--border); border-radius: 16px; }
  .ms-content .dsm-search-bar.focused { border-color: var(--primary); }
  .ms-content .dsm-search-results { 
    position: relative; top: 0; box-shadow: none; border: none; background: transparent; padding: 0;
  }
  .ms-content .results-scroll { max-height: none; padding: 0; }
  .ms-content .result-item { background: var(--surface); border: 1px solid var(--border); padding: 16px; margin-bottom: 8px; }

  .ms-quick-nav { border-top: 1px dashed var(--border); padding-top: 24px; }
  .ms-nav-label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-bottom: 16px; }
  .ms-pill-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .ms-pill-grid button { 
    padding: 12px; border-radius: 14px; background: var(--surface); border: 1px solid var(--border);
    font-size: 13px; font-weight: 700; color: var(--text); text-align: left; transition: 0.2s;
  }
  .ms-pill-grid button:active { background: var(--primary-soft); border-color: var(--primary); transform: scale(0.98); }

  @media (max-width: 480px) {
    .notif-dropdown-header { padding: 12px 14px; }
    .notif-dropdown-header h3 { font-size: 14px; }
    .notif-card { padding: 12px 14px; }
  }
`;
