import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import StudentForm from "../pages/StudentForm";

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
  const { api, data, params, setPage, goToStudent } = useApp();
  const id = params?.studentId;

  const student = useMemo(
    () => (Array.isArray(data.students) ? data.students.find((x) => x.id === id) : null),
    [data.students, id]
  );

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

        {/* Quick facts */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8, padding: 12 }}>
          <Fact label="Email" value={student.email || "—"} />
          <Fact label="Mobile" value={student.mobile || "—"} />
          <Fact label="Mentor" value={student.mentor || "—"} />
          <Fact label="Referral Source" value={student.referralSource || "—"} />
          <Fact label="Location" value={student.location || "—"} />
          <Fact label="Last Review" value={fmtDate(student.lastReviewDate) || "—"} />
          <Fact label="Record Type" value={student.recordType || "—"} />
          <Fact label="Graduation" value={fmtDate(student.graduationDate || student.exitDate) || "—"} />
        </div>

        {/* Tabs */}
        <div className="tabs">
          {[
            ["activity", "Activity"],
            ["tasks", "Tasks"],
            ["documents", "Documents"],
            ["photos", "Photos"],
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

function Fact({ label, value }) {
  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid #1f294a",
        borderRadius: 10,
        padding: "8px 10px",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 2 }}>{label}</div>
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
