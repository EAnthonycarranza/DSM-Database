import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import UserForms from "./UserForms";
import { useApp } from "../../context/AppContext";
import dsmLogo from "../../assets/images/DSM LOGO.png";

/* ============================================================================
   DSM Modern Design System (Pure CSS)
   ============================================================================ */
const ensureDesignSystem = () => {
  if (typeof document === "undefined") return;

  // Font Awesome 6
  if (!document.querySelector('link[data-fontawesome="true"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css";
    link.setAttribute("data-fontawesome", "true");
    document.head.appendChild(link);
  }

  // Design System Injection
  if (!document.getElementById("dsm-design-system")) {
    const style = document.createElement("style");
    style.id = "dsm-design-system";
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');

      :root {
        --bg: #FAF6EE;
        --surface: #FFFCF7;
        --surface-2: #F4ECDC;
        --primary: #7B1F2C;
        --primary-hover: #5A1620;
        --primary-soft: rgba(123, 31, 44, 0.08);
        --accent: #C9A961;
        --accent-soft: rgba(201, 169, 97, 0.16);
        --forest: #2D5F3F;
        --text: #2A1A1F;
        --text-muted: #6F5E5E;
        --border: #E8DDC8;
        --radius: 18px;
        --shadow: 0 1px 3px 0 rgba(91, 38, 31, 0.08), 0 2px 4px -2px rgba(91, 38, 31, 0.06);
        --shadow-lg: 0 14px 28px -6px rgba(91, 38, 31, 0.18), 0 6px 10px -6px rgba(91, 38, 31, 0.12);
      }

      * {
        font-family: 'Inter', -apple-system, sans-serif;
        box-sizing: border-box;
        -webkit-font-smoothing: antialiased;
      }

      body {
        background-color: var(--bg);
        color: var(--text);
        margin: 0;
        background-image:
          radial-gradient(circle at 0% 0%, rgba(201, 169, 97, 0.08), transparent 40%),
          radial-gradient(circle at 100% 100%, rgba(123, 31, 44, 0.06), transparent 40%);
        background-attachment: fixed;
      }

      .dsm-container {
        max-width: 1000px;
        margin: 0 auto;
        padding: 40px 20px;
      }

      /* Header Brand Bar */
      .dsm-brand-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 32px;
        padding: 16px 20px;
        background: var(--surface);
        border-radius: var(--radius);
        border: 1px solid var(--border);
        box-shadow: var(--shadow);
        position: relative;
        overflow: hidden;
      }
      .dsm-brand-header::before {
        content: "";
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 3px;
        background: linear-gradient(90deg, var(--primary), var(--accent), var(--primary));
      }
      .dsm-brand-id { display: flex; align-items: center; gap: 14px; }
      .dsm-brand-logo {
        width: 52px; height: 52px;
        border-radius: 50%;
        background: var(--surface);
        border: 2px solid var(--accent);
        box-shadow: 0 4px 14px rgba(123, 31, 44, 0.18);
        overflow: hidden;
        display: grid; place-items: center;
        flex-shrink: 0;
      }
      .dsm-brand-logo img { width: 100%; height: 100%; object-fit: contain; }
      .dsm-brand-name {
        font-family: 'Playfair Display', Georgia, serif;
        font-size: 22px;
        font-weight: 800;
        color: var(--primary);
        line-height: 1;
        letter-spacing: 0.3px;
      }
      .dsm-brand-tag {
        font-size: 10px;
        font-weight: 700;
        color: var(--text-muted);
        letter-spacing: 1.6px;
        text-transform: uppercase;
        margin-top: 5px;
      }

      /* Navigation Control (The "Tabs") */
      .dsm-nav-strip {
        display: flex;
        background: var(--surface-2);
        padding: 6px;
        border-radius: 16px;
        gap: 4px;
        margin-bottom: 32px;
        position: sticky;
        top: 20px;
        z-index: 100;
        box-shadow: 0 4px 12px rgba(91, 38, 31, 0.06);
        border: 1px solid var(--border);
      }

      .dsm-nav-btn {
        flex: 1;
        padding: 12px 16px;
        border: none;
        background: transparent;
        border-radius: 12px;
        font-weight: 700;
        font-size: 14px;
        color: var(--text-muted);
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        white-space: nowrap;
      }

      .dsm-nav-btn:hover {
        color: var(--primary);
        background: rgba(255,255,255,0.7);
      }

      .dsm-nav-btn.active {
        background: var(--surface);
        color: var(--primary);
        box-shadow: 0 2px 6px rgba(123, 31, 44, 0.18);
        border: 1px solid var(--accent-soft);
      }

      /* Content Cards */
      .dsm-card {
        background: var(--surface);
        border-radius: var(--radius);
        padding: 40px;
        border: 1px solid var(--border);
        box-shadow: var(--shadow);
        animation: fadeIn 0.4s ease-out;
      }

      .dsm-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 32px;
      }

      .dsm-badge {
        padding: 6px 12px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        background: var(--accent-soft);
        color: var(--primary);
        border: 1px solid var(--accent-soft);
      }

      /* Animations */
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes spin { 
        to { transform: rotate(360deg); } 
      }

      .dsm-loader {
        width: 32px;
        height: 32px;
        border: 3px solid var(--border);
        border-top-color: var(--primary);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      /* Custom Components */
      .file-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: var(--surface);
        margin-bottom: 12px;
        transition: all 0.2s;
      }

      .file-row:hover {
        border-color: var(--accent);
        box-shadow: 0 4px 12px rgba(123, 31, 44, 0.08);
        transform: translateY(-1px);
      }

      .action-btn {
        padding: 8px 16px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .action-btn:hover {
        background: var(--primary-soft);
        border-color: var(--primary);
        color: var(--primary);
      }

      .primary-btn {
        background: var(--primary);
        color: white;
        border: 1px solid var(--primary);
        box-shadow: 0 4px 12px rgba(123, 31, 44, 0.22);
      }

      .primary-btn:hover {
        background: var(--primary-hover);
        color: white;
        border-color: var(--primary-hover);
      }

      /* ============================================================================
         Mobile breakpoints (improved for student phone usage)
         ============================================================================ */
      @media (max-width: 900px) {
        .dsm-container { padding: 20px 14px; }
        .dsm-card { padding: 24px 20px; }
      }

      @media (max-width: 640px) {
        .dsm-container { padding: 14px 12px; }

        /* Header stacks vertically; logout becomes icon */
        .dsm-brand-header {
          padding: 12px 14px;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }
        .dsm-brand-id { gap: 10px; min-width: 0; flex: 1; }
        .dsm-brand-logo { width: 44px; height: 44px; }
        .dsm-brand-name { font-size: 17px; }
        .dsm-brand-tag { font-size: 9px; letter-spacing: 1.2px; margin-top: 3px; }

        /* Nav strip becomes horizontally scrollable; remove flex:1 to let buttons size to content */
        .dsm-nav-strip {
          overflow-x: auto;
          overflow-y: hidden;
          padding: 4px;
          margin-bottom: 18px;
          top: 8px;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .dsm-nav-strip::-webkit-scrollbar { display: none; }
        .dsm-nav-btn {
          flex: 0 0 auto;
          padding: 10px 14px;
          font-size: 13px;
          min-height: 44px; /* iOS touch target */
        }

        .dsm-card {
          padding: 18px 16px;
          border-radius: 16px;
        }

        /* Stack file rows on small screens */
        .file-row {
          flex-direction: column;
          align-items: stretch;
          gap: 12px;
          padding: 14px;
        }
        .file-row > div:first-child { width: 100%; }
        .file-row .action-btn,
        .file-row .primary-btn {
          width: 100%;
          justify-content: center;
          min-height: 44px;
          font-size: 14px;
        }

        .action-btn {
          padding: 10px 14px;
          min-height: 40px;
          font-size: 13px;
        }
      }

      @media (max-width: 420px) {
        .dsm-container { padding: 10px 10px; }
        .dsm-card { padding: 14px 12px; }
        .dsm-brand-name { font-size: 15px; }
        .dsm-brand-tag { display: none; }
        .dsm-nav-btn { padding: 10px 12px; font-size: 12px; }
        .dsm-nav-btn i { font-size: 14px; }
      }
    `;
    document.head.appendChild(style);
  }
};

/* ============================================================================
   Main Dashboard
   ============================================================================ */
export default function Dashboard() {
  const { ready, data, params, api, user, logout } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState("forms");
  const [imgWin, setImgWin] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [inbox, setInbox] = useState([]);

  useEffect(() => {
    ensureDesignSystem();
  }, []);

  useEffect(() => {
    if (ready && !user) navigate("/login", { replace: true });
  }, [ready, user, navigate]);

  const student = useMemo(() => {
    if (!ready) return null;
    const students = Array.isArray(data?.students) ? data.students : [];
    const sid = String(user?.studentId || "").trim();
    if (sid) return students.find(s => String(s.id) === sid);
    const uemail = String(user?.email || "").trim().toLowerCase();
    if (uemail) return students.find(s => String(s.email || "").trim().toLowerCase() === uemail);
    return null;
  }, [ready, data?.students, user?.studentId, user?.email]);

  useEffect(() => {
    if (!ready || !student) return;
    let alive = true;
    const loadInbox = () => {
      api.getAll?.("envelopes", { studentId: student.id }).then(list => {
        if (alive) setInbox(Array.isArray(list) ? list : []);
      }).catch(() => {});
    };
    loadInbox();
    // Refresh inbox when window regains focus (e.g. after returning from a form/PDF submit)
    const onFocus = () => loadInbox();
    window.addEventListener("focus", onFocus);
    return () => { alive = false; window.removeEventListener("focus", onFocus); };
  }, [ready, student?.id, api]);

  const myRecipientStatus = (env) => {
    const me = env.recipients?.find(r =>
      String(r.studentId || r.id) === String(student?.id) ||
      String(r.userId) === String(user?.id)
    );
    return String(me?.status || "pending").toLowerCase();
  };

  const docs = useMemo(() => {
    if (!student || !data?.documents) return [];
    return data.documents
      .filter(d => String(d.studentId) === String(student.id))
      .filter(d => (d.kind === "file" || !/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(d.url || d.name || "")))
      .sort((a, b) => (b.at || 0) - (a.at || 0));
  }, [data?.documents, student]);

  const photos = useMemo(() => {
    if (!student || !data?.documents) return [];
    return data.documents
      .filter(d => String(d.studentId) === String(student.id))
      .filter(d => (d.kind === "photo" || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(d.url || d.name || "")))
      .sort((a, b) => (b.at || 0) - (a.at || 0));
  }, [data?.documents, student]);

  const unviewed = useMemo(() => {
    return inbox.filter(env => {
      const status = myRecipientStatus(env);
      return status === "pending" || !status;
    }).length;
  }, [inbox, student?.id]);

  // Inbox: show pending + viewed (in-progress); push completed to a separate section
  const pendingInbox = useMemo(
    () => inbox.filter(env => ["pending", "viewed", "in-progress"].includes(myRecipientStatus(env))),
    [inbox, student?.id]
  );
  const completedInbox = useMemo(
    () => inbox.filter(env => myRecipientStatus(env) === "completed"),
    [inbox, student?.id]
  );

  if (!ready) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="dsm-loader"></div>
      </div>
    );
  }

  if (!student && user) {
    return (
      <div className="dsm-container" style={{ textAlign: "center" }}>
        <div className="dsm-card">
          <h1 style={{ fontSize: "48px", margin: "0 0 24px" }}>👋</h1>
          <h2 style={{ fontWeight: 800 }}>Profile Setup Required</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: "32px" }}>We're connecting your account to your student record. Please check back shortly.</p>
          <button onClick={() => logout("/login")} className="action-btn primary-btn" style={{ padding: "14px 28px" }}>Sign Out</button>
        </div>
      </div>
    );
  }

  const initials = (student?.firstName?.[0] || "") + (student?.lastName?.[0] || "");

  return (
    <div className="dsm-container">
      {/* Brand Header with Logo */}
      <div className="dsm-brand-header">
        <div className="dsm-brand-id">
          <div className="dsm-brand-logo">
            <img src={dsmLogo} alt="Discipleship School of Ministry" />
          </div>
          <div>
            <div className="dsm-brand-name">DSM Workspace</div>
            <div className="dsm-brand-tag">Discipleship School of Ministry</div>
          </div>
        </div>
        <button onClick={() => logout("/login")} className="action-btn" style={{ color: "#B0263C", borderColor: "transparent" }}>
          <i className="fas fa-right-from-bracket" style={{ marginRight: "8px" }}></i> Logout
        </button>
      </div>

      {/* Tabs First - Navigation Strip */}
      <nav className="dsm-nav-strip">
        <button className={`dsm-nav-btn ${tab === "forms" ? "active" : ""}`} onClick={() => setTab("forms")}>
          <i className="fas fa-pen-nib"></i> Forms
        </button>
        <button className={`dsm-nav-btn ${tab === "inbox" ? "active" : ""}`} onClick={() => setTab("inbox")}>
          <i className="fas fa-inbox"></i> Inbox
          {unviewed > 0 && <span style={{ background: "#ef4444", color: "white", borderRadius: "6px", padding: "2px 6px", fontSize: "10px" }}>{unviewed}</span>}
        </button>
        <button className={`dsm-nav-btn ${tab === "docs" ? "active" : ""}`} onClick={() => setTab("docs")}>
          <i className="fas fa-file-alt"></i> Files
        </button>
        <button className={`dsm-nav-btn ${tab === "media" ? "active" : ""}`} onClick={() => setTab("media")}>
          <i className="fas fa-photo-video"></i> Media
        </button>
        <button className={`dsm-nav-btn ${tab === "profile" ? "active" : ""}`} onClick={() => setTab("profile")}>
          <i className="fas fa-id-card"></i> Profile
        </button>
      </nav>

      {/* Active Workspace */}
      <main className="dsm-card">
        {tab === "forms" && (
          <div>
            <div style={{ marginBottom: "24px" }}>
              <h2 style={{ margin: 0, fontSize: "24px", fontWeight: 800 }}>Available Forms</h2>
              <p style={{ color: "var(--text-muted)", marginTop: "4px" }}>Complete your required documentation below.</p>
            </div>
            <UserForms />
          </div>
        )}

        {tab === "inbox" && (
          <div style={{ display: "grid", gap: "16px" }}>
            {inbox.length === 0 && (
              <EmptyState icon="inbox" title="Clean Inbox" text="No pending documents for review." />
            )}

            {pendingInbox.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
                  Action Required ({pendingInbox.length})
                </div>
                <div style={{ display: "grid", gap: "12px" }}>
                  {pendingInbox.map(env => {
                    const status = myRecipientStatus(env);
                    const isForm = env.kind === "form" || !!env.formId;
                    const target = isForm
                      ? `/form/${env.formId}?envelopeId=${env.id}`
                      : `/document?envelopeId=${env.id}`;
                    return (
                      <div key={env.id} className="file-row">
                        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                          <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: isForm ? "#eef2ff" : "#fef3c7", display: "grid", placeItems: "center", color: isForm ? "var(--primary)" : "#d97706" }}>
                            <i className={isForm ? "fas fa-clipboard-list" : "fas fa-signature"}></i>
                          </div>
                          <div>
                            <div style={{ fontWeight: 700 }}>{env.subject || (isForm ? "Form" : "Document")}</div>
                            <div style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ padding: "2px 8px", borderRadius: 6, background: status === "viewed" ? "#fef3c7" : "#fee2e2", color: status === "viewed" ? "#92400e" : "#991b1b", fontWeight: 800, textTransform: "uppercase", fontSize: 10 }}>
                                {status === "viewed" ? "In Progress" : "Pending"}
                              </span>
                              {env.message && <span>· {env.message.slice(0, 60)}{env.message.length > 60 ? "…" : ""}</span>}
                            </div>
                          </div>
                        </div>
                        <button className="action-btn primary-btn" onClick={() => navigate(target)}>
                          {status === "viewed" ? "Resume" : "Open"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {completedInbox.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
                  Completed ({completedInbox.length})
                </div>
                <div style={{ display: "grid", gap: "12px" }}>
                  {completedInbox.map(env => {
                    const isForm = env.kind === "form" || !!env.formId;
                    return (
                      <div key={env.id} className="file-row" style={{ opacity: 0.7 }}>
                        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                          <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#dcfce7", display: "grid", placeItems: "center", color: "#16a34a" }}>
                            <i className="fas fa-circle-check"></i>
                          </div>
                          <div>
                            <div style={{ fontWeight: 700 }}>{env.subject || "Envelope"}</div>
                            <div style={{ fontSize: "12px", color: "#16a34a", fontWeight: 700 }}>Completed</div>
                          </div>
                        </div>
                        {isForm ? (
                          <button className="action-btn" onClick={() => navigate(`/form/${env.formId}?envelopeId=${env.id}`)}>View</button>
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Submitted</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "docs" && (
          <div style={{ display: "grid", gap: "12px" }}>
            {docs.length === 0 ? <EmptyState icon="file-circle-xmark" title="No Files" text="You haven't uploaded any documents yet." /> :
              docs.map(f => (
                <div key={f.id || f.url} className="file-row">
                  <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <i className="fas fa-file-pdf" style={{ fontSize: "20px", color: "#ef4444" }}></i>
                    <div style={{ fontWeight: 600 }}>{f.name || "Document"}</div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button className="action-btn" onClick={() => setPdfDoc(f)}>View</button>
                    <a href={f.url} download className="action-btn" style={{ textDecoration: "none" }}><i className="fas fa-download"></i></a>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {tab === "media" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "20px" }}>
            {photos.length === 0 ? <EmptyState icon="images" title="No Media" text="Upload photos to see them here." /> :
              photos.map(p => (
                <div key={p.id || p.url} onClick={() => setImgWin(p)} style={{ borderRadius: "12px", overflow: "hidden", cursor: "pointer", border: "1px solid var(--border)", aspectRatio: "1" }}>
                  <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              ))
            }
          </div>
        )}

        {tab === "profile" && (
          <div>
            <div style={{ display: "flex", gap: "24px", alignItems: "center", marginBottom: "32px", paddingBottom: "32px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ width: "80px", height: "80px", borderRadius: "24px", background: "linear-gradient(135deg, #6366f1, #a855f7)", color: "white", display: "grid", placeItems: "center", fontSize: "28px", fontWeight: 800 }}>
                {initials.toUpperCase()}
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: "24px", fontWeight: 800 }}>{student.firstName} {student.lastName}</h2>
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <span className="dsm-badge">Phase {student.phase || 1}</span>
                  <span className="dsm-badge">{student.status || "Active"}</span>
                </div>
              </div>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
              <ProfileItem icon="envelope" label="Email" value={student.email} />
              <ProfileItem icon="phone" label="Mobile" value={student.mobile} />
              <ProfileItem icon="map-pin" label="Location" value={student.location} />
              <ProfileItem icon="user-tie" label="Mentor" value={student.mentor} />
              <ProfileItem icon="briefcase" label="Employment" value={student.employment} />
              <ProfileItem icon="calendar" label="Intake" value={student.intakeDate ? new Date(student.intakeDate).toLocaleDateString() : null} />
            </div>
          </div>
        )}
      </main>

      {/* Footer Summary */}
      <footer style={{ marginTop: "40px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
        DSM Portal &bull; April 2026 Release
      </footer>

      {/* Overlays */}
      {imgWin && <ImageViewer doc={imgWin} onClose={() => setImgWin(null)} />}
      {pdfDoc && <PdfViewer doc={pdfDoc} onClose={() => setPdfDoc(null)} />}
    </div>
  );
}

/* ============================================================================
   Helper Components
   ============================================================================ */

function ProfileItem({ icon, label, value }) {
  return (
    <div>
      <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>
        <i className={`fas fa-${icon}`} style={{ marginRight: "6px" }}></i> {label}
      </div>
      <div style={{ fontWeight: 600 }}>{value || "—"}</div>
    </div>
  );
}

function EmptyState({ icon, title, text }) {
  return (
    <div style={{ padding: "40px", textAlign: "center" }}>
      <i className={`fas fa-${icon}`} style={{ fontSize: "40px", color: "#e2e8f0", marginBottom: "16px" }}></i>
      <div style={{ fontWeight: 800, fontSize: "18px" }}>{title}</div>
      <p style={{ color: "var(--text-muted)", margin: "8px 0 0" }}>{text}</p>
    </div>
  );
}

function ImageViewer({ doc, onClose }) {
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.95)", zIndex: 1000, display: "grid", placeItems: "center", padding: "20px" }} onClick={onClose}>
      <img src={doc.url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: "16px", boxShadow: "var(--shadow-lg)" }} />
    </div>,
    document.body
  );
}

function PdfViewer({ doc, onClose }) {
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.9)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }} onClick={onClose}>
      <div style={{ width: "100%", maxWidth: "900px", height: "100%", background: "white", borderRadius: "24px", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        <iframe src={doc.url} style={{ width: "100%", height: "100%", border: "none" }} />
      </div>
    </div>,
    document.body
  );
}
