import React, { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import UserForms from "./UserForms";
import { useApp } from "../../context/AppContext";
// PDF.js removed

/* ============================================================================
   Load Font Awesome (once)
   ============================================================================ */
const ensureFontAwesome = () => {
  if (typeof document === "undefined") return;
  if (document.querySelector('link[data-fontawesome="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css";
  link.setAttribute("data-fontawesome", "true");
  document.head.appendChild(link);
};

/* ============================================================================
   Global keyframes for spinner
   ============================================================================ */
const ensureGlobalStyles = () => {
  if (typeof document === "undefined") return;
  if (document.getElementById("dashboard-global-styles")) return;
  const style = document.createElement("style");
  style.id = "dashboard-global-styles";
  style.textContent = `
    @keyframes spin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }
  `;
  document.head.appendChild(style);
};

// use real app context

// Enhanced styling constants
const styles = {
  page: {
    minHeight: "100dvh",
    backgroundColor: "#f8fafc", // full-bleed neutral background
  },
  container: {
    padding: "24px",
    maxWidth: "1200px",
    width: "100%",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "20px",
    marginBottom: "16px",
    padding: "16px 20px",
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
    border: "1px solid #e2e8f0",
    position: "sticky",
    top: 0,
    zIndex: 2,
  },
  avatar: {
    width: "80px",
    height: "80px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, rgb(234 102 102) 0%, rgb(85 162 75) 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "800",
    fontSize: "24px",
    color: "#ffffff",
    boxShadow: "0 4px 12px rgba(102, 126, 234, 0.4)",
  },
  headerInfo: {
    flex: 1,
    minWidth: "240px",
  },
  name: {
    fontSize: "28px",
    fontWeight: "800",
    color: "#1a202c",
    marginBottom: "12px",
  },
  pillContainer: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  backButton: {
    padding: "12px 20px",
    borderRadius: "12px",
    border: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
    color: "#4a5568",
    transition: "all 0.2s ease",
  },
  gridContainer: {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "16px",
  marginBottom: "16px",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
  padding: "16px",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
    border: "1px solid #e2e8f0",
  },
  cardTitle: {
    fontSize: "20px",
    fontWeight: "700",
    color: "#2d3748",
  marginBottom: "12px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  tabContainer: {
    display: "flex",
    gap: "4px",
  marginTop: "16px",
  marginBottom: "16px",
    backgroundColor: "#f1f5f9",
    padding: "4px",
    borderRadius: "12px",
    border: "1px solid #e2e8f0",
  },
  tab: {
    padding: "12px 20px",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "transparent",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
    transition: "all 0.2s ease",
    flex: 1,
    textAlign: "center",
  },
  tabActive: {
    backgroundColor: "#ffffff",
    color: "#4c51bf",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
  },
  tabInactive: {
    color: "#64748b",
  },
  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
  },
  tableHeader: {
    backgroundColor: "#f8fafc",
    borderRadius: "8px 8px 0 0",
  },
  tableHeaderCell: {
    padding: "16px",
    fontSize: "14px",
    fontWeight: "600",
    color: "#374151",
    textAlign: "left",
    borderBottom: "2px solid #e5e7eb",
  },
  tableCell: {
    padding: "16px",
    fontSize: "14px",
    color: "#4a5568",
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "top",
  },
  tableRow: {
    transition: "background-color 0.2s ease",
    cursor: "pointer",
  },
  docRow: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderBottom: "1px solid #f1f5f9",
  },
  docThumb: {
    width: 48,
    height: 60,
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    background: "#0b1328",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
  },
  actionBtn: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    color: "#374151",
  },
  emptyState: {
    textAlign: "center",
  padding: "32px 24px",
    color: "#9ca3af",
  },
  emptyIcon: {
    fontSize: "48px",
    marginBottom: "16px",
  },
  loadingSpinner: {
    display: "inline-block",
    width: "20px",
    height: "20px",
    border: "3px solid #f3f3f3",
    borderTop: "3px solid #3498db",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
};

// Enhanced Font Awesome Icon helper
function FAIcon({ icon, className = "", style, ...props }) {
  return (
    <i
      className={`fas fa-${icon} ${className}`}
      style={{ lineHeight: 1, ...style }}
      aria-hidden="true"
      {...props}
    />
  );
}

// Enhanced Pill component
function StatusPill({ children, type = "default" }) {
  const colors = {
    status: { bg: "#dcfce7", border: "#16a34a", text: "#166534" },
    phase: { bg: "#ddd6fe", border: "#7c3aed", text: "#5b21b6" },
    record: { bg: "#dbeafe", border: "#2563eb", text: "#1d4ed8" },
    squad: { bg: "#fed7aa", border: "#ea580c", text: "#c2410c" },
    dorm: { bg: "#e2e8f0", border: "#64748b", text: "#475569" },
    default: { bg: "#f1f5f9", border: "#64748b", text: "#475569" },
  };
  const color = colors[type] || colors.default;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "6px 12px",
        borderRadius: "20px",
        fontSize: "12px",
        fontWeight: "600",
        color: color.text,
        backgroundColor: color.bg,
        border: `1px solid ${color.border}33`,
        marginRight: "8px",
        marginBottom: "4px",
      }}
    >
      {children}
    </span>
  );
}

// Enhanced Field component
function InfoField({ label, value, icon }) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <div 
        style={{ 
          fontSize: "12px", 
          color: "#6b7280", 
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "6px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        {icon && <span>{icon}</span>}
        {label}
      </div>
      <div 
        style={{ 
          fontSize: "15px", 
          fontWeight: "600",
          color: value ? "#1a202c" : "#9ca3af",
          wordBreak: "break-word",
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

// File helpers (align with StudentProfile classification)
const fmtBytes = (n = 0) => {
  if (typeof n !== "number" || isNaN(n)) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};
const isPDF = (d) => /\.pdf(\?|$)/i.test(d?.name || d?.url || "") || (String(d?.mime || "").toLowerCase().includes("pdf"));
const isImage = (d) => {
  const name = (d?.name || d?.url || "").toLowerCase();
  const mime = String(d?.mime || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg|tif|tiff|heic|heif|avif)(\?|$)/i.test(name);
};
const isDocx = (d) => {
  const name = (d?.name || d?.url || "").toLowerCase();
  const mime = String(d?.mime || "").toLowerCase();
  return name.endsWith(".docx") || mime.includes("officedocument.wordprocessingml");
};
const toOfficeViewer = (url) => `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
const toHttpFromGs = (s) => {
  if (!s || typeof s !== "string") return s;
  if (!s.startsWith("gs://")) return s;
  try {
    const rest = s.replace(/^gs:\/\//, "");
    const slash = rest.indexOf("/");
    if (slash < 0) return s;
    const bucket = rest.slice(0, slash);
    const key = rest.slice(slash + 1);
    return `https://storage.googleapis.com/${bucket}/${key}`;
  } catch { return s; }
};
const docPublicUrl = (d) => toHttpFromGs(d?.publicUrl || d?.url || d?.path || "");

// Main Dashboard Component
export default function Dashboard() {
  const { ready, data, params, setPage, api, user, logout } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState("forms");
  const [imgWin, setImgWin] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [inbox, setInbox] = useState([]);
  const handleReturnToLogin = React.useCallback(() => {
    // Clear any stale session so we don't bounce back into the not-found screen
    try {
      logout("/login");
    } catch {
      navigate("/login", { replace: true });
    }
  }, [logout, navigate]);

  useEffect(() => {
    ensureFontAwesome();
    ensureGlobalStyles();
  }, []);

  // Immediately redirect to login if the user is not authenticated
  useEffect(() => {
    if (ready && !user) {
      navigate("/login", { replace: true });
    }
  }, [ready, user, navigate]);

  const student = useMemo(() => {
    if (!ready) return null;
    const students = Array.isArray(data?.students) ? data.students : [];

    // 1) Prefer an explicit link from the logged-in user to a student record
    const sid = String(user?.studentId || "").trim();
    if (sid) {
      const byId = students.find((s) => String(s.id) === sid);
      if (byId) return byId;
    }

    // 2) Fallback by email match (common mapping)
    const uemail = String(user?.email || "").trim().toLowerCase();
    if (uemail) {
      const byEmail = students.find(
        (s) => String(s.email || "").trim().toLowerCase() === uemail
      );
      if (byEmail) return byEmail;
    }

    // 3) Fallback to route/context param if provided
    if (params?.studentId) {
      return students.find((s) => String(s.id) === String(params.studentId)) || null;
    }

    return null;
  }, [ready, data?.students, user?.studentId, user?.email, params?.studentId]);

  const allDocs = useMemo(
    () => (Array.isArray(data?.documents) ? data.documents : []),
    [data?.documents]
  );

  const docs = useMemo(() => {
    if (!student) return [];
    const mine = allDocs.filter((d) => String(d.studentId) === String(student.id));
    return mine
      .filter((d) => (d.kind ? d.kind === "file" : !isImage(d)))
      .map((d) => ({ ...d, url: docPublicUrl(d) }))
      .sort((a, b) => (b.at || b.updatedAt || 0) - (a.at || a.updatedAt || 0));
  }, [allDocs, student]);

  const photos = useMemo(() => {
    if (!student) return [];
    const mine = allDocs.filter((d) => String(d.studentId) === String(student.id));
    return mine
      .filter((d) => (d.kind ? d.kind === "photo" : isImage(d)))
      .map((d) => ({ ...d, url: docPublicUrl(d) }))
      .sort((a, b) => (b.at || b.updatedAt || 0) - (a.at || a.updatedAt || 0));
  }, [allDocs, student]);

  // Load envelopes for this student (inbox)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!ready || !student) return;
        const list = await api.getAll?.("envelopes", { studentId: student.id }).catch(() => []);
        if (!alive) return;
        setInbox(Array.isArray(list) ? list : []);
      } catch {}
    })();
    return () => { alive = false; };
  }, [ready, student?.id]);

  // Compute unviewed count for Inbox tab (recipient status not viewed/completed)
  const inboxUnviewed = React.useMemo(() => {
    const sid = String(student?.id || "");
    if (!sid || !Array.isArray(inbox)) return 0;
    let c = 0;
    for (const env of inbox) {
      const recips = Array.isArray(env?.recipients) ? env.recipients : [];
      const me = recips.find((r) => String(r.studentId || r.id || r.userId || "") === sid);
      const st = String(me?.status || "").toLowerCase();
      if (!st || st === "pending") c += 1;
    }
    return c;
  }, [inbox, student?.id]);

  if (!ready) {
    return (
      <div style={styles.container}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "400px",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div style={styles.loadingSpinner}></div>
          <div style={{ fontSize: "16px", color: "#6b7280" }}>Loading student profile...</div>
        </div>
      </div>
    );
  }

  if (!student) {
    // If the user is not logged in (e.g., mid-logout), avoid showing the not-found state
    if (!user) return null;
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>
              <FAIcon icon="search" />
            </div>
            <div style={{ fontSize: "20px", fontWeight: "600", marginBottom: "8px", color: "#374151" }}>
              Student Not Found
            </div>
            <div style={{ fontSize: "16px", marginBottom: "24px", color: "#6b7280" }}>
              We couldn't locate the requested student profile.
            </div>
            <button
              onClick={handleReturnToLogin}
              style={{
                ...styles.backButton,
                backgroundColor: "#4f46e5",
                color: "#ffffff",
                border: "1px solid #4f46e5",
              }}
            >
              Return to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  const fullNameStr = `${student.firstName || ""} ${student.lastName || ""}`.trim() || "Student";
  const initials =
    (student.firstName?.[0] || "?") + (student.lastName?.[0] || student.firstName?.[1] || "");

  const formatDateTime = (timestamp) => {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  // No text extraction hooks

  return (
    <div style={styles.page}>
      <div style={styles.container}>
      {/* Enhanced Header */}
      <div style={styles.header}>
        <div style={styles.avatar}>{initials.toUpperCase()}</div>
        <div style={styles.headerInfo}>
          <div style={styles.name}>{fullNameStr}</div>
          <div style={styles.pillContainer}>
            <StatusPill type="status">{student.status || "Status"}</StatusPill>
            <StatusPill type="record">{student.recordType || "Record"}</StatusPill>
            {student.phase && <StatusPill type="phase">Phase {student.phase}</StatusPill>}
            {student.squad && <StatusPill type="squad">Squad {student.squad}</StatusPill>}
            {student.dorm && <StatusPill type="dorm">{student.dorm}</StatusPill>}
          </div>
        </div>
        <button
          onClick={() => {
            // Navigate first to avoid flashing the dashboard in a logged-out state
            navigate("/login", { replace: true });
            logout("/login");
          }}
          style={styles.backButton}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "#f7fafc";
            e.currentTarget.style.borderColor = "#cbd5e0";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "#ffffff";
            e.currentTarget.style.borderColor = "#e2e8f0";
          }}
        >
          <FAIcon icon="sign-out-alt" style={{ marginRight: 8 }} />
          Sign out
        </button>
      </div>

      {/* Enhanced Info Grid */}
      <div style={styles.gridContainer}>
        {/* Contact Information */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>
            <FAIcon icon="address-card" style={{ marginRight: 8 }} />
            Contact & Personal
          </div>
          <InfoField label="Email Address" value={student.email} icon={<FAIcon icon="envelope" />} />
          <InfoField label="Mobile Phone" value={student.mobile} icon={<FAIcon icon="mobile-alt" />} />
          <InfoField label="Location" value={student.location} icon={<FAIcon icon="map-marker-alt" />} />
          <InfoField label="Mentor/Pastor" value={student.mentor} icon={<FAIcon icon="user-tie" />} />
          <InfoField label="Referral Source" value={student.referralSource} icon={<FAIcon icon="handshake" />} />
        </div>

        {/* Program Information */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>
            <FAIcon icon="graduation-cap" style={{ marginRight: 8 }} />
            Program Details
          </div>
          <InfoField label="Application Status" value={student.application} icon={<FAIcon icon="clipboard-list" />} />
          <InfoField label="Background Check" value={student.background} icon={<FAIcon icon="search" />} />
          <InfoField label="Program Phase" value={student.programPhase} icon={<FAIcon icon="chart-line" />} />
          <InfoField label="Duration in Program" value={student.durationInProgram} icon={<FAIcon icon="stopwatch" />} />
          <InfoField label="Employment Status" value={student.employment} icon={<FAIcon icon="briefcase" />} />
          <InfoField label="Work Readiness" value={student.readiness} icon={<FAIcon icon="check-circle" />} />
        </div>
      </div>

      {/* Enhanced Tabs */}
      <div style={styles.tabContainer}>
        {[
          [
            "documents",
            <span key="d">
              <FAIcon icon="file-alt" style={{ marginRight: 8 }} />Documents
            </span>,
          ],
          [
            "photos",
            <span key="p">
              <FAIcon icon="image" style={{ marginRight: 8 }} />Photos
            </span>,
          ],
          [
            "forms",
            <span key="f">
              <FAIcon icon="edit" style={{ marginRight: 8 }} />Forms
            </span>,
          ],
          [
            "inbox",
            <span key="i" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <FAIcon icon="inbox" style={{ marginRight: 8 }} />Inbox
              {inboxUnviewed > 0 && (
                <span
                  aria-label={`${inboxUnviewed} unviewed`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 18,
                    height: 18,
                    borderRadius: 999,
                    background: "#ef4444",
                    color: "white",
                    fontSize: 11,
                    fontWeight: 800,
                    padding: "0 6px",
                  }}
                >
                  {inboxUnviewed}
                </span>
              )}
            </span>,
          ],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              ...styles.tab,
              ...(tab === key ? styles.tabActive : styles.tabInactive),
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Enhanced Tab Content */}
      <div style={styles.card}>
        {tab === "documents" && (
          <DocumentsTab docs={docs} setPdfDoc={setPdfDoc} setImgWin={setImgWin} formatDateTime={formatDateTime} />
        )}
        {tab === "photos" && (
          <PhotosTab photos={photos} setImgWin={setImgWin} formatDateTime={formatDateTime} />
        )}
        {tab === "forms" && (
          <UserForms />
        )}
        {tab === "inbox" && (
          <InboxTab
            inbox={inbox}
            onOpen={(env) => {
              if (env?.formId) {
                navigate(`/form/${env.formId}`);
              } else {
                navigate(`/document?envelopeId=${encodeURIComponent(env.id)}`);
              }
            }}
          />
        )}
      </div>

      {/* Viewers */}
      {imgWin && <ImageViewer doc={imgWin} onClose={() => setImgWin(null)} />}
      {pdfDoc && <PdfViewer doc={pdfDoc} onClose={() => setPdfDoc(null)} />}
      </div>
    </div>
  );
}

// Enhanced Tab Components
function DocumentsTab({ docs, setPdfDoc, setImgWin, formatDateTime }) {
  if (!docs.length) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}>
          <FAIcon icon="file-alt" />
        </div>
  <div style={{ fontSize: "18px", fontWeight: "600", marginBottom: "6px", color: "#374151" }}>
          No Documents Yet
        </div>
        <div style={{ color: "#6b7280" }}>Documents will appear here when uploaded.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={styles.cardTitle}>
        <FAIcon icon="file-alt" style={{ marginRight: 8 }} />
        Documents ({docs.length})
      </div>
      <div>
        {docs.map((d) => {
          const url = d.url;
          const name = d.name || d.fileName || "Document";
          const when = formatDateTime(d.at || d.updatedAt || d.createdAt);
          const bytes = d.bytes || d.size || 0;
          const pdf = isPDF(d);
          const img = isImage(d);
          return (
            <div key={d.id || d.url} style={styles.docRow}>
              <div style={styles.docThumb}>
                {img ? (
                  <img src={url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <FAIcon icon={pdf ? "file-pdf" : (isDocx(d) ? "file-word" : "file")} style={{ color: pdf ? "#ef4444" : "#6b7280" }} />
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "#111827" }}>{name}</div>
                <div style={{ color: "#6b7280", fontSize: 12 }}>
                  {when} • {fmtBytes(bytes)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={styles.actionBtn}
                  onClick={() => {
                    if (pdf) return setPdfDoc({ url, name });
                    if (img) return setImgWin({ url, name });
                    if (isDocx(d)) return window.open(toOfficeViewer(url), "_blank", "noopener,noreferrer");
                    window.open(url, "_blank", "noopener,noreferrer");
                  }}
                >
                  <FAIcon icon="external-link-alt" style={{ marginRight: 6 }} />
                  Open
                </button>
                <a href={url} download={name} style={{ ...styles.actionBtn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                  <FAIcon icon="download" style={{ marginRight: 6 }} />
                  Download
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PhotosTab({ photos, setImgWin, formatDateTime }) {
  if (!photos.length) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}>
          <FAIcon icon="image" />
        </div>
  <div style={{ fontSize: "18px", fontWeight: "600", marginBottom: "6px", color: "#374151" }}>
          No Photos Yet
        </div>
        <div style={{ color: "#6b7280" }}>Photos will appear here when uploaded.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={styles.cardTitle}>
        <FAIcon icon="image" style={{ marginRight: 8 }} />
        Photos ({photos.length})
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
        {photos.map((p) => {
          const url = p.url;
          const name = p.name || p.fileName || "Photo";
          const when = formatDateTime(p.at || p.updatedAt || p.createdAt);
          return (
            <div key={p.id || p.url} style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#ffffff" }}>
              <button
                onClick={() => setImgWin({ url, name })}
                style={{ border: 0, padding: 0, margin: 0, display: "block", width: "100%", background: "transparent", cursor: "pointer" }}
                aria-label={`Open ${name}`}
              >
                <div style={{ width: "100%", aspectRatio: "4/3", background: "#0b1328", display: "grid", placeItems: "center" }}>
                  <img src={url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              </button>
              <div style={{ padding: 8 }}>
                <div style={{ fontWeight: 600, color: "#111827", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                <div style={{ color: "#6b7280", fontSize: 11 }}>{when}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InboxTab({ inbox, onOpen }) {
  const statusColor = (s) => {
    const x = String(s || "").toLowerCase();
    if (x === "completed") return { bg: "#dcfce7", text: "#166534", border: "#16a34a" };
    if (x === "queued" || x === "pending" || x === "in-progress") return { bg: "#dbeafe", text: "#1d4ed8", border: "#2563eb" };
    return { bg: "#f1f5f9", text: "#334155", border: "#94a3b8" };
  };
  if (!Array.isArray(inbox) || inbox.length === 0) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}>
          <FAIcon icon="inbox" />
        </div>
        <div style={{ fontSize: "18px", fontWeight: 600, marginBottom: 6, color: "#374151" }}>No Documents Assigned</div>
        <div style={{ color: "#6b7280" }}>When an administrator sends you a form, it will appear here.</div>
      </div>
    );
  }
  return (
    <div>
      <div style={styles.cardTitle}>
        <FAIcon icon="inbox" style={{ marginRight: 8 }} />
        Inbox ({inbox.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {inbox.map((env) => {
          const s = statusColor(env.status);
          const recips = Array.isArray(env.recipients) ? env.recipients : [];
          const my = recips[0] || {};
          return (
            <div key={env.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12, display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, color: "#0f172a" }}>{env.subject || "Document"}</div>
                <div style={{ color: "#475569", fontSize: 13, marginTop: 2 }}>{env.message || ""}</div>
                <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}55`, padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                    {env.status}
                  </span>
                  {my.status && (
                    <span style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #94a3b855", padding: "4px 10px", borderRadius: 999, fontSize: 12 }}>
                      Yours: {my.status}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button style={styles.actionBtn} onClick={() => onOpen(env)}>
                  <FAIcon icon="external-link-alt" style={{ marginRight: 6 }} />
                  Open
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Removed legacy FormsTab (assigned forms UI)
 function FormsTab({ student, api, user }) {
  const [assignedForms, setAssignedForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const fullName = (s) => `${s?.firstName ?? ""} ${s?.lastName ?? ""}`.trim();
  const formatDate = (v) => (v ? new Date(v).toLocaleDateString() : "—");

  useEffect(() => {
    loadAssignedForms();
  }, []);

  const loadAssignedForms = async () => {
    try {
      setLoading(true);
      // Get all active forms for now - in the future this would filter by user assignments
      const forms = await api.getAll('forms', { status: 'active' });
      setAssignedForms(Array.isArray(forms) ? forms : []);
    } catch (error) {
      console.error('Error loading forms:', error);
      setAssignedForms([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFormClick = (form) => {
    navigate(`/form/${form.id}`);
  };

  return (
    <div>
      {/* Assigned Forms Section */}
      <div style={{ marginBottom: "32px" }}>
        <div style={styles.cardTitle}>
          <FAIcon icon="edit" style={{ marginRight: 8 }} />
          Assigned Forms
        </div>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
            <FAIcon icon="spinner" style={{ marginRight: 8, animation: 'spin 1s linear infinite' }} />
            Loading forms...
          </div>
        ) : assignedForms.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>
              <FAIcon icon="file-alt" />
            </div>
            <div style={styles.emptyTitle}>No Forms Assigned</div>
            <div style={styles.emptyText}>
              You don't have any forms assigned at this time. Check back later or contact your administrator.
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            {assignedForms.map((form) => (
              <div
                key={form.id}
                style={{
                  ...styles.documentCard,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onClick={() => handleFormClick(form)}
                onMouseEnter={(e) => {
                  const el = e.currentTarget;
                  if (!el || !el.style) return;
                  el.style.transform = 'translateY(-2px)';
                  el.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget;
                  if (!el || !el.style) return;
                  el.style.transform = 'translateY(0)';
                  el.style.boxShadow = (styles.documentCard && styles.documentCard.boxShadow) || '';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '18px',
                      flexShrink: 0,
                    }}
                  >
                    <FAIcon icon="file-alt" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ 
                      fontSize: '16px', 
                      fontWeight: '700', 
                      color: '#1a202c', 
                      marginBottom: '4px',
                      lineHeight: '1.4'
                    }}>
                      {form.title}
                    </div>
                    {form.description && (
                      <div style={{ 
                        fontSize: '14px', 
                        color: '#6b7280', 
                        marginBottom: '8px',
                        lineHeight: '1.4'
                      }}>
                        {form.description}
                      </div>
                    )}
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '16px', 
                      fontSize: '12px', 
                      color: '#9ca3af' 
                    }}>
                      <span>
                        <FAIcon icon="list" style={{ marginRight: 4 }} />
                        {form.fields?.length || 0} fields
                      </span>
                      {form.submissions > 0 && (
                        <span>
                          <FAIcon icon="users" style={{ marginRight: 4 }} />
                          {form.submissions} submission{form.submissions !== 1 ? 's' : ''}
                        </span>
                      )}
                      <span>
                        <FAIcon icon="clock" style={{ marginRight: 4 }} />
                        Created {formatDate(form.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    color: '#6b7280',
                    fontSize: '14px',
                    flexShrink: 0,
                  }}>
                    <FAIcon icon="arrow-right" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      

      {/* Program Overview */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ ...styles.cardTitle, marginBottom: "20px" }}>
          <FAIcon icon="user" style={{ marginRight: 8 }} />
          Program Overview
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          <InfoField label="Full Name" value={fullName(student)} />
          <InfoField label="Intake Date" value={formatDate(student.intakeDate)} />
          <InfoField label="Referral Pastor" value={student.mentor} />
          <InfoField label="Application Status" value={student.application} />
          <InfoField label="Background Check" value={student.background} />
          <InfoField label="Graduation Date" value={formatDate(student.exitDate)} />
          <InfoField
            label="Program Phase"
            value={student.programPhase || (student.phase ? `Phase ${student.phase}` : "—")}
          />
          <InfoField label="Duration in Program" value={student.durationInProgram} />
          <InfoField label="Employment Status" value={student.employment} />
          <InfoField label="Work Readiness" value={student.readiness} />
          <InfoField label="Employment Placement" value={student.employmentPlacement} />
          <InfoField label="Workshops Completed" value={student.workshops} />
          <InfoField label="Service Hours" value={String(student.serviceHours ?? "—")} />
          <InfoField label="Achievements" value={student.celebrate} />
          <InfoField label="Health & Recovery" value={student.healthRecovery} />
        </div>
      </div>
    </div>
  );
}

// Enhanced Modal Components
function ImageViewer({ doc, onClose }) {
  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        zIndex: 5000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          maxWidth: "90vw",
          maxHeight: "90vh",
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid #e5e7eb",
            backgroundColor: "#f8fafc",
          }}
        >
          <div style={{ fontWeight: "700", fontSize: "16px", color: "#1a202c" }}>{doc?.name || "Image"}</div>
          <button
            onClick={onClose}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              backgroundColor: "#ffffff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              color: "#6b7280",
            }}
          >
            <FAIcon icon="times" />
          </button>
        </div>
        <div
          style={{
            padding: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#000000",
          }}
        >
          <img
            src={doc?.url}
            alt={doc?.name || "image"}
            style={{
              maxWidth: "100%",
              maxHeight: "70vh",
              objectFit: "contain",
            }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

function PdfViewer({ doc, onClose }) {
  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        zIndex: 5000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(920px, 90vw)",
          height: "min(720px, 90vh)",
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid #e5e7eb",
            backgroundColor: "#f8fafc",
          }}
        >
          <div style={{ fontWeight: "700", fontSize: "16px", color: "#1a202c" }}>{doc?.name || "PDF Document"}</div>
          <button
            onClick={onClose}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              backgroundColor: "#ffffff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              color: "#6b7280",
            }}
          >
            <FAIcon icon="times" />
          </button>
        </div>
        <div style={{ flex: 1 }}>
          <iframe
            src={`${doc?.url}#toolbar=1&view=FitH`}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
            }}
            title="PDF Viewer"
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
