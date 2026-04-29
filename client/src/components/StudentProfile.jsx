import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import StudentForm from "../pages/StudentForm";
import { 
  FaEnvelope, FaPhone, FaUserTie, FaMapMarkerAlt, 
  FaBriefcase, FaCalendarAlt, FaStickyNote, FaHistory, 
  FaIdCard, FaGraduationCap, FaCheckCircle, FaKey, FaUser, 
  FaLock, FaEye, FaEyeSlash, FaCopy, FaRandom
} from "react-icons/fa";

const PILL_COLOR = {
  Current: "green",
  Alumni: "blue",
  Waitlist: "amber",
  "Future Applicant": "amber",
  Withdrawn: "red",
};

const Pill = ({ children, tone }) => (
  <span className={`pill ${tone ? PILL_COLOR[tone] : ""}`}>{children}</span>
);

const fmt = (v, f = {}) => (v ? new Date(v).toLocaleString(undefined, f) : "");
const fmtDate = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "");
const initialsOf = (s) =>
  `${(s?.firstName || "").slice(0, 1)}${(s?.lastName || "").slice(0, 1)}` || "S";

export default function StudentProfile() {
  const { api, data, params, setPage, goToStudent, setToast } = useApp();
  const id = params?.studentId;

  const student = useMemo(
    () => (Array.isArray(data.students) ? data.students.find((x) => x.id === id) : null),
    [data.students, id]
  );

  // Find linked user record for credentials
  const studentUser = useMemo(() => {
    return Array.isArray(data.users) ? data.users.find(u => String(u.studentId || "") === String(id)) : null;
  }, [data.users, id]);

  // Collections scoped to student
  const allDocs = Array.isArray(data.documents) ? data.documents : [];
  const allTasks = Array.isArray(data.tasks) ? data.tasks : [];

  const notes = useMemo(
    () =>
      allDocs
        .filter((d) => d.studentId === id && ["note", "sms", "email"].includes(d.kind))
        .sort((a, b) => b.at - a.at),
    [allDocs, id]
  );

  const photos = useMemo(
    () =>
      allDocs
        .filter((d) => d.studentId === id && d.kind === "photo")
        .sort((a, b) => b.at - a.at),
    [allDocs, id]
  );

  const files = useMemo(
    () =>
      allDocs
        .filter((d) => d.studentId === id && d.kind === "file")
        .sort((a, b) => b.at - a.at),
    [allDocs, id]
  );

  const tasks = useMemo(
    () => allTasks.filter((t) => t.studentId === id).sort((a, b) => a.done - b.done),
    [allTasks, id]
  );

  const [tab, setTab] = useState("activity");
  const [showForm, setShowForm] = useState(false);
  const [noteText, setNoteText] = useState("");

  // Credentials state
  const [credForm, setCredForm] = useState({ username: "", password: "" });
  const [credSaving, setCredSaving] = useState(false);
  const [showPass, setShowPass] = useState(false);

  // Envelope stats for dashboard preview
  const envStats = useMemo(() => {
    const list = Array.isArray(data.envelopes) ? data.envelopes : [];
    const studentEnvs = list.filter(env => 
      (env.recipients || []).some(r => String(r.studentId || r.id) === String(id))
    );
    
    const pending = studentEnvs.filter(env => {
      const r = env.recipients.find(rp => String(rp.studentId || rp.id) === String(id));
      const status = String(r?.status || "").toLowerCase();
      return ["pending", "viewed", "in-progress"].includes(status);
    }).length;
    
    const completed = studentEnvs.filter(env => {
      const r = env.recipients.find(rp => String(rp.studentId || rp.id) === String(id));
      return String(r?.status || "").toLowerCase() === "completed";
    }).length;

    return { total: studentEnvs.length, pending, completed };
  }, [data.envelopes, id]);

  useEffect(() => {
    if (studentUser) {
      setCredForm(f => ({ ...f, username: studentUser.username || "", password: "" }));
    } else if (student) {
      const suggest = `${student.firstName || ""}${student.lastName || ""}`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      setCredForm(f => ({ ...f, username: suggest || `student${String(id).slice(0, 6)}`, password: "" }));
    }
  }, [studentUser, student, id]);

  useEffect(() => {
    if (!id) setPage("students");
  }, [id, setPage]);

  // Debug: log when a student's profile is viewed to confirm data is loaded from API
  useEffect(() => {
    if (!student) return;
    try {
      console.log("[DSM] Viewing student", {
        id: student.id,
        name: `${student.firstName || ""} ${student.lastName || ""}`.trim(),
        notes: notes.length,
        photos: photos.length,
        files: files.length,
        tasks: tasks.length,
      });
    } catch {}
  }, [student, notes.length, photos.length, files.length, tasks.length]);

  if (!student) {
    return (
      <section className="page active" aria-label="Student">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>No student selected</h3>
          <button className="btn" onClick={() => setPage("students")}>
            ← Back to Students
          </button>
        </div>
      </section>
    );
  }

  async function addActivity(kind = "note", text) {
    const body = (text ?? noteText).trim();
    if (!body) return;
    await api.add("documents", {
      id: undefined,
      kind, // "note" | "sms" | "email"
      studentId: id,
      text: body,
      at: Date.now(),
      by: "u-admin",
    });
    setNoteText("");
  }

  async function toggleTask(t) {
    await api.put("tasks", { ...t, done: !t.done, updatedAt: Date.now() });
  }

  async function addTask() {
    const title = window.prompt("Task title:");
    if (!title) return;
    await api.add("tasks", {
      title,
      done: false,
      studentId: id,
      at: Date.now(),
      updatedAt: Date.now(),
    });
  }

  async function onAddFiles(e) {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      if (f.type.startsWith("image/")) {
        const url = URL.createObjectURL(f);
        await api.add("documents", {
          kind: "photo",
          studentId: id,
          name: f.name,
          url,
          at: Date.now(),
          by: "u-admin",
        });
      } else {
        const url = URL.createObjectURL(f);
        await api.add("documents", {
          kind: "file",
          studentId: id,
          name: f.name,
          url,
          at: Date.now(),
          by: "u-admin",
        });
      }
    }
    e.target.value = "";
  }

  async function delDoc(docId) {
    await api.del("documents", docId);
  }

  const saveCredentials = async () => {
    if (!credForm.username.trim()) return alert("Username is required");
    setCredSaving(true);
    try {
      await api.provisionStudentLogin(id, {
        username: credForm.username.trim(),
        password: credForm.password.trim() || undefined,
        generate: !credForm.password.trim() && !studentUser
      });
      setToast?.("Credentials updated successfully");
      setCredForm(f => ({ ...f, password: "" }));
    } catch (err) {
      alert(err.message || "Failed to save credentials");
    } finally {
      setCredSaving(false);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setToast?.(`${label} copied to clipboard`);
  };

  const generatePass = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    let p = "";
    for (let i = 0; i < 12; i++) p += chars[Math.floor(Math.random() * chars.length)];
    setCredForm(f => ({ ...f, password: p }));
    setShowPass(true);
  };

  return (
    <section className="page active" aria-label="Student Profile">
      {/* Header */}
      <div className="detail">
        <div className="detail-header">
          <div style={{ display: "flex", gap: 12 }}>
            <div
              className="avatar"
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
                background: "linear-gradient(135deg, #6366f1, #a855f7)",
                color: "white"
              }}
              aria-hidden
              title="Avatar"
            >
              {initialsOf(student)}
            </div>
            <div>
              <div className="detail-name">
                {student.firstName} {student.lastName}
              </div>
              <div className="summary">
                <Pill tone={student.status}>{student.status || "—"}</Pill>
                {student.status === "Current" && <span className="pill blue">Phase {student.phase || "1"}</span>}
                {student.squad && <span className="pill">Squad {student.squad}</span>}
                {student.dorm && <span className="pill">Dorm {student.dorm}</span>}
                {student.intakeDate && <span className="pill">Intake {fmtDate(student.intakeDate)}</span>}
              </div>
            </div>
          </div>

          <div className="actions">
            <button className="btn" onClick={() => setPage("students")}>
              ← Back
            </button>
            <button className="btn" onClick={() => setShowForm(true)} style={{ marginLeft: 8 }}>
              Edit
            </button>
          </div>
        </div>

        {/* Quick facts - Reflected from Dashboard.jsx */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8, padding: 12 }}>
          <Fact icon={<FaEnvelope />} label="Email" value={student.email || "—"} />
          <Fact icon={<FaPhone />} label="Mobile" value={student.mobile || "—"} />
          <Fact icon={<FaUserTie />} label="Mentor" value={student.mentor || "—"} />
          <Fact icon={<FaMapMarkerAlt />} label="Location" value={student.location || "—"} />
          <Fact icon={<FaBriefcase />} label="Employment" value={student.employment || "—"} />
          <Fact icon={<FaCalendarAlt />} label="Intake" value={fmtDate(student.intakeDate) || "—"} />
          <Fact icon={<FaStickyNote />} label="Referral" value={student.referralSource || "—"} />
          <Fact icon={<FaHistory />} label="Last Review" value={fmtDate(student.lastReviewDate) || "—"} />
          <Fact icon={<FaIdCard />} label="Record Type" value={student.recordType || "—"} />
          <Fact icon={<FaGraduationCap />} label="Graduation" value={fmtDate(student.graduationDate || student.exitDate) || "—"} />
        </div>

        {/* Tabs */}
        <div className="tabs">
          {[
            ["activity", "Activity"],
            ["tasks", "Tasks"],
            ["documents", "Documents"],
            ["photos", "Photos"],
            ["credentials", "Credentials"],
            ["financials", "Financials"],
            ["work", "Work Orders"],
            ["forms", "Forms"],
          ].map(([k, label]) => (
            <button key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>

        {/* Panels */}
        <div className="tabpanel">
          {tab === "activity" && (
            <div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <select
                  className="btn"
                  style={{ width: 140 }}
                  onChange={(e) => e.currentTarget.blur()}
                  value="note"
                  disabled
                  title="Entry type (note)"
                >
                  <option value="note">Note</option>
                </select>
                <input
                  className="btn"
                  style={{ flex: 1 }}
                  placeholder="Add a note… use @ to mention"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      addActivity("note");
                    }
                  }}
                />
                <button className="btn primary" onClick={() => addActivity("note")}>
                  + Add note
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    const t = window.prompt("Text message:");
                    if (t) addActivity("sms", t);
                  }}
                >
                  + Send text message
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    const t = window.prompt("Email body:");
                    if (t) addActivity("email", t);
                  }}
                >
                  + Send email
                </button>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 180 }}>Posted on</th>
                      <th style={{ width: 180 }}>Type</th>
                      <th>Text</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notes.map((n) => (
                      <tr key={n.id}>
                        <td>{fmt(n.at, { dateStyle: "medium", timeStyle: "short" })}</td>
                        <td style={{ textTransform: "uppercase", fontSize: 12 }}>{n.kind}</td>
                        <td>{n.text}</td>
                      </tr>
                    ))}
                    {!notes.length && (
                      <tr>
                        <td colSpan={3} style={{ opacity: 0.7, padding: 12 }}>
                          No activity yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "tasks" && (
            <div>
              <div style={{ marginBottom: 10 }}>
                <button className="btn primary" onClick={addTask}>
                  + Add Task
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}></th>
                      <th>Title</th>
                      <th style={{ width: 200 }}>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <input
                            type="checkbox"
                            className="checkbox"
                            checked={!!t.done}
                            onChange={() => toggleTask(t)}
                          />
                        </td>
                        <td>{t.title}</td>
                        <td>{fmt(t.updatedAt, { dateStyle: "medium", timeStyle: "short" })}</td>
                      </tr>
                    ))}
                    {!tasks.length && (
                      <tr>
                        <td colSpan={3} style={{ opacity: 0.7, padding: 12 }}>
                          No tasks yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "documents" && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                <label className="btn">
                  + Upload
                  <input type="file" style={{ display: "none" }} onChange={onAddFiles} />
                </label>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th style={{ width: 140 }}>Type</th>
                      <th style={{ width: 220 }}>Added</th>
                      <th style={{ width: 100 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...files, ...photos].map((d) => (
                      <tr key={d.id}>
                        <td>
                          {d.url ? (
                            <a href={d.url} target="_blank" rel="noreferrer">
                              {d.name || "(unnamed)"}
                            </a>
                          ) : (
                            d.name || "(unnamed)"
                          )}
                        </td>
                        <td>{d.kind}</td>
                        <td>{fmt(d.at, { dateStyle: "medium", timeStyle: "short" })}</td>
                        <td>
                          <button className="btn small" onClick={() => delDoc(d.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!files.length && !photos.length && (
                      <tr>
                        <td colSpan={4} style={{ opacity: 0.7, padding: 12 }}>
                          No documents yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "photos" && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                <label className="btn">
                  + Add photos
                  <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onAddFiles} />
                </label>
              </div>
              {!photos.length && <div style={{ opacity: 0.7 }}>No photos yet.</div>}
              {!!photos.length && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                    gap: 10,
                  }}
                >
                  {photos.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        background: "#0f162b",
                        border: "1px solid #1f294a",
                        borderRadius: 12,
                        overflow: "hidden",
                      }}
                    >
                      <div style={{ aspectRatio: "4/3", overflow: "hidden" }}>
                        <img src={p.url} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                      <div style={{ padding: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ fontSize: 12, opacity: 0.9 }}>{p.name || "photo"}</div>
                        <button className="btn small" onClick={() => delDoc(p.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "credentials" && (
            <div className="card" style={{ maxWidth: 520, padding: 32, borderRadius: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(99, 102, 241, 0.1)", display: "grid", placeItems: "center", color: "#6366f1", fontSize: 18 }}>
                  <FaShieldAlt />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Manage Access</h3>
                  <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--text-dim)" }}>Resident Portal Security & Credentials</p>
                </div>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {/* Status Box */}
                <div style={{ 
                  display: "flex", 
                  gap: 16, 
                  padding: 16, 
                  borderRadius: 16, 
                  background: studentUser ? "linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(16, 185, 129, 0.1))" : "rgba(245, 158, 11, 0.05)",
                  border: `1px solid ${studentUser ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.1)"}`,
                  alignItems: "center"
                }}>
                  <div style={{ fontSize: 24, color: studentUser ? "#10b981" : "#f59e0b", display: "grid", placeItems: "center" }}>
                    {studentUser ? <FaCheckCircle /> : <FaExclamationTriangle />}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: studentUser ? "#065f46" : "#92400e" }}>
                      {studentUser ? "Student portal login is active" : "Access not yet provisioned"}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2, fontWeight: 600 }}>
                      {studentUser 
                        ? <>Currently signs in as <code style={{ background: "rgba(0,0,0,0.05)", padding: "2px 4px", borderRadius: 4 }}>{studentUser.username}</code></> 
                        : `No active credentials for ${student.firstName}.`}
                    </div>
                  </div>
                </div>

                {/* Dashboard Stats Preview */}
                {studentUser && (
                  <div style={{ padding: "16px 20px", borderRadius: 16, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                      <FaIdCard style={{ color: "#6366f1" }} /> What {student.firstName} sees on their dashboard
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: envStats.pending > 0 ? "#ef4444" : "#0f172a" }}>{envStats.pending}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Action required</div>
                      </div>
                      <div style={{ textAlign: "center", borderLeft: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0" }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{envStats.completed}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Completed</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{envStats.total}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Total envelopes</div>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <p style={{ margin: 0, fontSize: 13, color: "#64748b", fontWeight: 600, lineHeight: 1.5 }}>
                    {studentUser 
                      ? `Update the username or password used by ${student.firstName} ${student.lastName} on the Student Portal.`
                      : `Set up a secure login for ${student.firstName} to allow them to access their dashboard.`}
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* Username Field */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 1 }}>
                        Username
                      </label>
                      <div style={{ position: "relative" }}>
                        <input 
                          className="btn" 
                          style={{ width: "100%", textAlign: "left", padding: "12px 40px 12px 14px", borderRadius: 12, background: "var(--bg)", border: "1px solid var(--border)", fontSize: 14, fontWeight: 600 }} 
                          value={credForm.username} 
                          onChange={e => setCredForm(f => ({ ...f, username: e.target.value.replace(/\s+/g, "") }))}
                          placeholder="e.g. jsmith24"
                        />
                        <button 
                          onClick={() => copyToClipboard(credForm.username, "Username")}
                          style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", color: "var(--text-dim)", cursor: "pointer", padding: 8, borderRadius: 8 }}
                          title="Copy Username"
                        >
                          <FaCopy size={14} />
                        </button>
                      </div>
                    </div>
                    
                    {/* Password Field */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 1 }}>
                        {studentUser ? "Change Password" : "Set Password"}
                      </label>
                      <div style={{ position: "relative" }}>
                        <input 
                          className="btn" 
                          type={showPass ? "text" : "password"}
                          style={{ width: "100%", textAlign: "left", padding: "12px 100px 12px 14px", borderRadius: 12, background: "var(--bg)", border: "1px solid var(--border)", fontSize: 14, fontWeight: 600 }} 
                          value={credForm.password} 
                          onChange={e => setCredForm(f => ({ ...f, password: e.target.value }))}
                          placeholder={studentUser ? "Leave blank to keep current" : "Choose password"}
                        />
                        <div style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", display: "flex", gap: 4 }}>
                          <button 
                            onClick={() => setShowPass(!showPass)}
                            style={{ border: "none", background: "none", color: "var(--text-dim)", cursor: "pointer", padding: 8, borderRadius: 8 }}
                            title={showPass ? "Hide" : "Show"}
                          >
                            {showPass ? <FaEyeSlash size={14} /> : <FaEye size={14} />}
                          </button>
                          <button 
                            onClick={generatePass}
                            style={{ border: "none", background: "none", color: "var(--text-dim)", cursor: "pointer", padding: 8, borderRadius: 8 }}
                            title="Generate Password"
                          >
                            <FaRandom size={14} />
                          </button>
                          <button 
                            onClick={() => copyToClipboard(credForm.password, "Password")}
                            style={{ border: "none", background: "none", color: "var(--text-dim)", cursor: "pointer", padding: 8, borderRadius: 8 }}
                            title="Copy Password"
                            disabled={!credForm.password}
                          >
                            <FaCopy size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                    <button 
                      className="btn primary" 
                      disabled={credSaving} 
                      onClick={saveCredentials}
                      style={{ flex: 1, height: 48, borderRadius: 14, fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, border: "none", background: "#6366f1", color: "white", cursor: "pointer", boxShadow: "0 4px 12px rgba(99, 102, 241, 0.2)" }}
                    >
                      {credSaving ? "Synchronizing..." : <><FaKey /> {studentUser ? "Update Access" : "Provision Access"}</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "financials" && <Placeholder label="Financials" />}
          {tab === "work" && <Placeholder label="Work Orders" />}
          {tab === "forms" && <Placeholder label="Forms" />}
        </div>
      </div>


      {showForm && (
        <StudentForm
          existing={student}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            goToStudent(id); // refresh same page
          }}
        />
      )}
    </section>
  );
}

function Fact({ icon, label, value }) {
  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid #1f294a",
        borderRadius: 10,
        padding: "8px 10px",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
        {icon} {label}
      </div>
      <div style={{ fontWeight: 600 }}>{value || "—"}</div>
    </div>
  );
}

function Placeholder({ label }) {
  return (
    <div className="card" style={{ border: "1px dashed #25335d" }}>
      <h3 style={{ marginTop: 0 }}>{label}</h3>
      <div style={{ opacity: 0.75 }}>
        This section is a placeholder. Hook it to your backend when ready.
      </div>
    </div>
  );
}
