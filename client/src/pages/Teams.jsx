import React from "react";
import { useApp } from "../context/AppContext";
import { FaUserShield, FaCircle, FaSync, FaShieldAlt, FaUserTie } from "react-icons/fa";

export default function Teams() {
  const { data, user, presenceFor } = useApp();
  const allUsers = Array.isArray(data?.users) ? data.users : [];
  // Only show admins on Teams
  const users = allUsers.filter((u) => String(u?.role || "").toLowerCase() === "admin");

  // Local tick to age presence labels
  const [tick, forceTick] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => forceTick(v => v + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const getStatusMeta = (u) => {
    const status = presenceFor(u);
    if (status === "online") return { color: "#10b981", label: "Available" };
    if (status === "away") return { color: "#f59e0b", label: "Away" };
    return { color: "#94a3b8", label: "Offline" };
  };

  const initials = (u) =>
    (u.initials ||
      (u.name || "")
        .split(" ")
        .map((n) => n[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
    ).toUpperCase();

  return (
    <section className="team-page fade-in">
      <style>{TEAM_CSS}</style>
      
      <header className="team-header">
        <div>
          <h1 className="team-title">Staff Directory</h1>
          <p className="team-subtitle">Administrator presence and active session tracking.</p>
        </div>
        <div className="team-actions">
          <button className="team-btn" onClick={() => window.location.reload()}><FaSync /> Sync</button>
        </div>
      </header>

      {!users.length ? (
        <div className="team-empty">No administrator records found.</div>
      ) : (
        <div className="team-grid">
          {users.map((u) => {
            const meta = getStatusMeta(u);
            const isMe = u.id === user?.id;
            return (
              <div key={u.id} className={`team-card ${isMe ? 'is-me' : ''}`}>
                <div className="team-card-top">
                  <div className="team-avatar-wrap">
                    <div className="team-avatar" style={{ background: `linear-gradient(135deg, #6366f1, #a855f7)` }}>
                      {initials(u)}
                    </div>
                    <span className="team-presence-dot" style={{ background: meta.color }} />
                  </div>
                  <div className="team-card-info">
                    <div className="name-row">
                      <span className="name">{u.name}</span>
                      {isMe && <span className="me-badge">You</span>}
                    </div>
                    <div className="role-tag"><FaShieldAlt /> {u.role || "Admin"}</div>
                  </div>
                </div>
                
                <div className="team-card-footer">
                  <div className="status-row">
                    <FaCircle size={8} style={{ color: meta.color }} />
                    <span>{meta.label}</span>
                  </div>
                  {u.lastSeen && (
                    <div className="last-seen">
                      Active {new Date(u.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const TEAM_CSS = `
  .team-page { padding: 8px 0; max-width: 1200px; margin: 0 auto; }
  .team-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; padding: 0 4px; }
  .team-title { font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -0.5px; }
  .team-subtitle { color: var(--text-muted); margin: 4px 0 0; font-size: 15px; font-weight: 500; }

  .team-actions { display: flex; gap: 12px; }
  .team-btn { height: 40px; padding: 0 16px; border-radius: 10px; font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 8px; transition: all 0.2s; cursor: pointer; background: var(--surface); border: 1px solid var(--border); color: var(--text); }
  .team-btn:hover { background: var(--bg); border-color: #cbd5e1; }

  .team-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 24px; }
  
  .team-card { background: var(--surface); border-radius: 24px; border: 1px solid var(--border); padding: 24px; box-shadow: var(--shadow); transition: all 0.2s; position: relative; overflow: hidden; }
  .team-card:hover { transform: translateY(-2px); border-color: var(--primary); box-shadow: var(--shadow-lg); }
  .team-card.is-me { border-left: 4px solid var(--primary); }

  .team-card-top { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
  
  .team-avatar-wrap { position: relative; }
  .team-avatar { width: 56px; height: 56px; border-radius: 16px; display: grid; place-items: center; color: white; font-weight: 800; font-size: 18px; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2); }
  .team-presence-dot { position: absolute; bottom: -4px; right: -4px; width: 16px; height: 16px; border-radius: 50%; border: 3px solid var(--surface); }

  .team-card-info { flex: 1; min-width: 0; }
  .name-row { display: flex; align-items: center; gap: 8px; }
  .name { font-size: 17px; font-weight: 800; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  
  .me-badge { background: #eef2ff; color: var(--primary); font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 20px; text-transform: uppercase; }
  .role-tag { font-size: 12px; font-weight: 700; color: var(--text-muted); display: flex; align-items: center; gap: 6px; margin-top: 4px; }

  .team-card-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 16px; border-top: 1px solid var(--border); }
  .status-row { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: var(--text); }
  .last-seen { font-size: 11px; font-weight: 600; color: var(--text-muted); }

  .team-empty { padding: 64px; text-align: center; color: var(--text-muted); font-weight: 600; font-size: 15px; background: var(--surface); border-radius: 24px; border: 1px dashed var(--border); }

  @media (max-width: 768px) {
    .team-page { padding: 0; }
    .team-header { flex-direction: column; align-items: stretch; gap: 14px; margin-bottom: 18px; }
    .team-title { font-size: 22px; }
    .team-subtitle { font-size: 13px; }
    .team-actions { gap: 10px; }
    .team-actions .team-btn { flex: 1; justify-content: center; height: 44px; }

    .team-grid { grid-template-columns: 1fr; gap: 14px; }
    .team-card { padding: 18px; border-radius: 18px; }
    .team-card:hover { transform: none; }
    .team-card-top { gap: 14px; margin-bottom: 14px; }
    .team-avatar { width: 48px; height: 48px; font-size: 16px; }
    .name { font-size: 15px; }
    .role-tag { font-size: 11px; }
    .team-empty { padding: 40px 18px; }
  }

  @media (min-width: 480px) and (max-width: 768px) {
    .team-grid { grid-template-columns: repeat(2, 1fr); }
  }
`;
