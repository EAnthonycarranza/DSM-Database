import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { 
  FaUser, FaEnvelope, FaPhone, FaBuilding, FaIdBadge, 
  FaCalendarAlt, FaQuoteLeft, FaSave, FaSync, FaCamera, 
  FaTrash, FaKey, FaChevronRight, FaShieldAlt
} from "react-icons/fa";

export default function AdminProfilePage({
  initialProfile = {},
  onSave,
  enableLocalPersistence = true,
  storageKey = "admin_profile_page.v1",
}) {
  const { user: me, api, refreshProfile, setToast } = useApp();

  const defaults = useMemo(() => ({
    fullName: "", username: "", email: "", role: "Administrator",
    department: "", phone: "", dob: "", bio: "", avatarDataUrl: "",
    preferences: {
      theme: "system", language: "en", timezone: "UTC", dateFormat: "YYYY-MM-DD",
      privacy: { showEmail: true, showSocials: true, searchable: false },
      notifications: { product: true, security: true, marketing: false },
    },
  }), []);

  const fromUser = useMemo(() => {
    if (!me) return null;
    return {
      fullName: me.fullName || me.name || "",
      username: me.username || "",
      email: me.email || "",
      role: me.role || "",
      department: me.department || "",
      phone: me.phone || "",
      dob: me.dob || "",
      bio: me.bio || "",
      avatarDataUrl: me.avatarDataUrl || me.avatarUrl || "",
      preferences: { ...defaults.preferences, ...(me.preferences || {}) },
    };
  }, [me, defaults.preferences]);

  const [profile, setProfile] = useState(() => {
    if (enableLocalPersistence) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) return { ...defaults, ...JSON.parse(raw) };
      } catch {}
    }
    return { ...defaults, ...fromUser };
  });

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (fromUser && !dirty) setProfile(p => ({ ...p, ...fromUser }));
  }, [fromUser, dirty]);

  useEffect(() => {
    if (enableLocalPersistence) localStorage.setItem(storageKey, JSON.stringify(profile));
  }, [profile, enableLocalPersistence, storageKey]);

  const setField = (path, value) => {
    setProfile(p => {
      const next = { ...p };
      const parts = path.split(".");
      let cur = next;
      for (let i = 0; i < parts.length - 1; i++) {
        cur[parts[i]] = { ...cur[parts[i]] };
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
      return next;
    });
    setDirty(true);
  };

  const handleImage = async (file) => {
    if (!file?.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setField("avatarDataUrl", e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const doSave = async () => {
    setSaving(true);
    try {
      if (onSave) {
        await onSave(profile);
      } else {
        const id = me?.id || me?._id;
        const patch = {
          name: profile.fullName, fullName: profile.fullName,
          username: profile.username, email: profile.email,
          department: profile.department, phone: profile.phone,
          dob: profile.dob, bio: profile.bio, avatarDataUrl: profile.avatarDataUrl,
          preferences: profile.preferences
        };
        await api.put("users", { ...(me || {}), id, ...patch });
        await refreshProfile?.();
        setToast({ type: "success", text: "Profile synchronized" });
      }
      setDirty(false);
    } finally { setSaving(false); }
  };

  return (
    <section className="pro-page fade-in">
      <style>{PRO_CSS}</style>

      <header className="pro-header">
        <div>
          <h1 className="pro-title">Account Settings</h1>
          <p className="pro-subtitle">Manage your personal information and preferences.</p>
        </div>
        <div className="pro-actions">
          <button className="pro-btn" onClick={() => setProfile(fromUser)} disabled={!dirty}><FaSync /> Reset</button>
          <button className="pro-btn primary" onClick={doSave} disabled={!dirty || saving}>
            <FaSave /> {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </header>

      <div className="pro-grid">
        <aside className="pro-aside">
          <div className={`pro-avatar-card ${dragOver ? 'drag' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleImage(e.dataTransfer.files[0]); }}>
            
            <div className="avatar-wrapper">
              {profile.avatarDataUrl ? (
                <img src={profile.avatarDataUrl} alt="Profile" />
              ) : (
                <div className="avatar-placeholder"><FaUser size={40} /></div>
              )}
              <button className="camera-btn" onClick={() => fileRef.current?.click()}><FaCamera /></button>
            </div>
            
            <input type="file" ref={fileRef} hidden accept="image/*" onChange={e => handleImage(e.target.files[0])} />
            
            <div className="profile-identity">
              <h3>{profile.fullName || "Your Name"}</h3>
              <span>{profile.role || "Administrator"}</span>
            </div>

            <div className="avatar-meta">
              <p>Drag and drop a new photo to update your avatar.</p>
              {profile.avatarDataUrl && (
                <button className="remove-link" onClick={() => setField("avatarDataUrl", "")}><FaTrash /> Remove Photo</button>
              )}
            </div>
          </div>

          <div className="pro-nav-card">
            <div className="nav-item active"><FaUser /> Personal Details <FaChevronRight /></div>
            <div className="nav-item"><FaShieldAlt /> Security <FaChevronRight /></div>
            <div className="nav-item" onClick={() => window.location.href='/admin/password-reset'}><FaKey /> Password <FaChevronRight /></div>
          </div>
        </aside>

        <main className="pro-main">
          <div className="pro-card">
            <div className="card-head"><h3><FaUser /> Public Profile</h3></div>
            <div className="card-body">
              <div className="form-grid">
                <div className="form-group">
                  <label><FaIdBadge /> Full Name</label>
                  <input value={profile.fullName} onChange={e => setField("fullName", e.target.value)} placeholder="e.g. John Smith" />
                </div>
                <div className="form-group">
                  <label><FaIdBadge /> Username</label>
                  <input value={profile.username} onChange={e => setField("username", e.target.value)} placeholder="johnsmith" />
                </div>
                <div className="form-group">
                  <label><FaEnvelope /> Email Address</label>
                  <input value={profile.email} onChange={e => setField("email", e.target.value)} placeholder="john@example.com" />
                </div>
                <div className="form-group">
                  <label><FaPhone /> Phone Number</label>
                  <input value={profile.phone} onChange={e => setField("phone", e.target.value)} placeholder="+1 (555) 000-0000" />
                </div>
                <div className="form-group">
                  <label><FaBuilding /> Department</label>
                  <input value={profile.department} onChange={e => setField("department", e.target.value)} placeholder="Administration" />
                </div>
                <div className="form-group">
                  <label><FaCalendarAlt /> Date of Birth</label>
                  <input type="date" value={profile.dob} onChange={e => setField("dob", e.target.value)} />
                </div>
              </div>
              <div className="form-group wide">
                <label><FaQuoteLeft /> Biography</label>
                <textarea rows={4} value={profile.bio} onChange={e => setField("bio", e.target.value)} placeholder="Tell us about yourself..." />
              </div>
            </div>
          </div>

          <div className="pro-card danger">
            <div className="card-head"><h3><FaShieldAlt /> Critical Access</h3></div>
            <div className="card-body">
              <p>For your security, roles and permissions can only be updated by a system supervisor.</p>
              <div className="role-display">
                <div className="label">Current Assigned Role</div>
                <div className="val">{profile.role}</div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </section>
  );
}

const PRO_CSS = `
  .pro-page { padding: 8px 0; max-width: 1200px; margin: 0 auto; }
  .pro-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; padding: 0 4px; }
  .pro-title { font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -0.5px; }
  .pro-subtitle { color: var(--text-muted); margin: 4px 0 0; font-size: 15px; font-weight: 500; }

  .pro-actions { display: flex; gap: 12px; }
  .pro-btn { height: 44px; padding: 0 20px; border-radius: 12px; font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px; transition: all 0.2s; cursor: pointer; background: var(--surface); border: 1px solid var(--border); color: var(--text); }
  .pro-btn:hover:not(:disabled) { background: var(--bg); border-color: #cbd5e1; }
  .pro-btn.primary { background: var(--primary); border: none; color: white; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2); }
  .pro-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .pro-grid { display: grid; grid-template-columns: 320px 1fr; gap: 32px; }
  
  .pro-aside { display: flex; flex-direction: column; gap: 24px; }
  .pro-avatar-card { background: var(--surface); border-radius: 24px; border: 1px solid var(--border); padding: 32px; text-align: center; box-shadow: var(--shadow); position: relative; }
  .pro-avatar-card.drag { border-color: var(--primary); background: rgba(99, 102, 241, 0.05); border-style: dashed; }
  
  .avatar-wrapper { position: relative; width: 140px; height: 140px; margin: 0 auto 20px; }
  .avatar-wrapper img { width: 100%; height: 100%; border-radius: 40px; object-fit: cover; border: 4px solid var(--surface); box-shadow: var(--shadow-lg); }
  .avatar-placeholder { width: 100%; height: 100%; border-radius: 40px; background: var(--bg); display: grid; place-items: center; color: var(--text-muted); border: 2px dashed var(--border); }
  
  .camera-btn { position: absolute; bottom: -10px; right: -10px; width: 40px; height: 40px; border-radius: 12px; background: var(--primary); color: white; display: grid; place-items: center; box-shadow: 0 4px 12px rgba(0,0,0,0.2); transition: 0.2s; border: 3px solid var(--surface); }
  .camera-btn:hover { background: var(--primary-hover); transform: scale(1.1); }

  .profile-identity h3 { font-size: 20px; font-weight: 800; margin: 0; color: var(--text); }
  .profile-identity span { font-size: 13px; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 1px; }

  .avatar-meta { margin-top: 20px; font-size: 12px; color: var(--text-muted); line-height: 1.5; }
  .remove-link { margin-top: 12px; display: inline-flex; align-items: center; gap: 6px; color: #ef4444; font-weight: 700; background: none; border: none; cursor: pointer; }

  .pro-nav-card { background: var(--surface); border-radius: 20px; border: 1px solid var(--border); overflow: hidden; }
  .nav-item { padding: 16px 20px; display: flex; align-items: center; gap: 12px; font-size: 14px; font-weight: 700; color: var(--text-muted); cursor: pointer; border-bottom: 1px solid var(--border); transition: 0.2s; }
  .nav-item:last-child { border-bottom: none; }
  .nav-item:hover { background: var(--bg); color: var(--text); }
  .nav-item.active { background: rgba(99, 102, 241, 0.05); color: var(--primary); }
  .nav-item svg:last-child { margin-left: auto; opacity: 0.3; font-size: 12px; }

  .pro-main { display: flex; flex-direction: column; gap: 32px; }
  .pro-card { background: var(--surface); border-radius: 24px; border: 1px solid var(--border); box-shadow: var(--shadow); overflow: hidden; }
  .pro-card.danger { border-left: 4px solid #ef4444; }
  .card-head { padding: 24px 32px; border-bottom: 1px solid var(--border); }
  .card-head h3 { font-size: 16px; font-weight: 800; margin: 0; display: flex; align-items: center; gap: 10px; }
  
  .card-body { padding: 32px; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .form-group { display: flex; flex-direction: column; gap: 8px; }
  .form-group.wide { grid-column: 1 / -1; margin-top: 12px; }
  .form-group label { font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px; }
  .form-group input, .form-group textarea { padding: 12px 16px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg); font-weight: 600; font-size: 14px; outline: none; transition: 0.2s; color: var(--text); }
  .form-group input:focus, .form-group textarea:focus { border-color: var(--primary); background: var(--surface); box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }

  .role-display { margin-top: 20px; padding: 16px; background: var(--bg); border-radius: 12px; border: 1px solid var(--border); }
  .role-display .label { font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; }
  .role-display .val { font-size: 15px; font-weight: 700; color: var(--text); margin-top: 4px; }

  @media (max-width: 980px) {
    .pro-grid { grid-template-columns: 1fr; gap: 18px; }
    .pro-aside { order: 1; gap: 14px; }
    .pro-main { order: 2; gap: 18px; }
  }

  @media (max-width: 768px) {
    .pro-page { padding: 4px 0; }
    .pro-header { flex-direction: column; align-items: stretch; gap: 14px; margin-bottom: 18px; }
    .pro-title { font-size: 22px; }
    .pro-subtitle { font-size: 13px; }
    .pro-actions { gap: 10px; }
    .pro-actions .pro-btn { flex: 1; justify-content: center; height: 46px; }

    .pro-avatar-card { padding: 22px 18px; border-radius: 18px; }
    .avatar-wrapper { width: 110px; height: 110px; margin-bottom: 16px; }
    .profile-identity h3 { font-size: 18px; }

    /* Convert nav card to horizontal-scrolling pill bar */
    .pro-nav-card {
      display: flex;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      border-radius: 14px;
      gap: 4px;
      padding: 6px;
    }
    .pro-nav-card::-webkit-scrollbar { display: none; }
    .nav-item {
      flex: 0 0 auto;
      padding: 10px 14px;
      font-size: 13px;
      border-bottom: none;
      border-radius: 10px;
      min-height: 44px;
      white-space: nowrap;
    }
    .nav-item svg:last-child { display: none; }

    .pro-card { border-radius: 18px; }
    .card-head { padding: 18px 18px; }
    .card-head h3 { font-size: 15px; }
    .card-body { padding: 18px; }

    .form-grid { grid-template-columns: 1fr; gap: 14px; }
    .form-group input, .form-group textarea { padding: 14px; font-size: 16px; min-height: 48px; }
  }
`;
