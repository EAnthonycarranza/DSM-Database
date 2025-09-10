import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import StudentForm from "./StudentForm";


/* helpers */
const STATUS_COLOR = { Current: "green", Alumni: "blue", Waitlist: "amber", "Future Applicant": "amber", Withdrawn: "red" };
const fmtDate = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "");
const durationInProgram = (intake, exit) => {
  if (!intake) return "";
  const end = exit ? new Date(exit) : new Date();
  const start = new Date(intake);
  const days = Math.max(0, Math.floor((end - start) / 86400000));
  if (days < 31) return `${days} days`;
  const months = Math.floor(days / 30);
  const rem = days % 30;
  return `${months} mo${months !== 1 ? "s" : ""}${rem ? ` ${rem} d` : ""}`;
};

function StudentChip({ student, onClick }) {
  const s = student;
  const initials = `${s.firstName?.[0] ?? ""}${s.lastName?.[0] ?? ""}` || "S";
  const pill = (txt, cls = "") => <span className={`pill ${cls}`}>{txt}</span>;
  return (
    <button className="student-chip" onClick={onClick} title={`${s.firstName} ${s.lastName}`}>
      <div className="chip-avatar">{initials}</div>
      <div className="chip-info">
        <div className="chip-name">{s.firstName} {s.lastName}</div>
        <div className="chip-meta">
          {pill(s.status || "—", STATUS_COLOR[s.status] ?? "")}
          {s.status === "Current" && pill(`P${s.phase || "1"}`, "blue")}
          {s.squad && pill(`Squad ${s.squad}`)}
        </div>
      </div>
    </button>
  );
}

export default function Students() {
  const { api, data } = useApp();
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState(null);

  // NEW: hidden file input for import
  const importRef = React.useRef(null);

useEffect(() => {
  const list = Array.isArray(data?.students) ? data.students : [];
  console.log("[Students] Context students updated", {
    count: list.length,
    first: list[0],
    fetchedAt: new Date().toISOString(),
  });
  setRows(list);
}, [data?.students]);

  useEffect(() => {
    const openAdd = () => { setEdit(null); setShowForm(true); };
    const openFuture = () => { setEdit({ status: "Future Applicant", recordType: "Prospect" }); setShowForm(true); };
    const openAlumni = () => {
      const today = new Date().toISOString().slice(0, 10);
      setEdit({ status: "Alumni", recordType: "Alumni", exitDate: today });
      setShowForm(true);
    };
    const openTask = () => alert("Task form (placeholder)");
    window.addEventListener("open:add-student", openAdd);
    window.addEventListener("open:add-future", openFuture);
    window.addEventListener("open:add-alumni", openAlumni);
    window.addEventListener("open:add-task", openTask);
    return () => {
      window.removeEventListener("open:add-student", openAdd);
      window.removeEventListener("open:add-future", openFuture);
      window.removeEventListener("open:add-alumni", openAlumni);
      window.removeEventListener("open:add-task", openTask);
    };
  }, []);

  const filtered = useMemo(() => {
    const txt = q.trim().toLowerCase();
    if (!txt) return rows;
    return rows.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(txt)));
  }, [rows, q]);

const onSaved = async () => {
  const list = await api.getAll("students");
  console.log("[Students] After save, refetched /students", {
    count: Array.isArray(list) ? list.length : 0,
    first: Array.isArray(list) ? list[0] : null,
  });
  setRows(Array.isArray(list) ? list : []);
};

  // NEW: parse JSON with tolerance for trailing commas
  function safeParseJson(str) {
    try {
      return JSON.parse(str);
    } catch {
      const noTrailing = str.replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(noTrailing);
    }
  }

  async function handleImportChange(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.json$/i.test(file.name)) {
      alert("Please select a .json file.");
      return;
    }
    try {
      const text = await file.text();
      const pack = safeParseJson(text);
      if (!window.confirm("Import will replace ALL current students and their documents. Continue?")) return;
      const res = await api.importStudentsPack(pack, { replace: true, clearDocuments: true });
      await onSaved();
      alert(`Imported ${res.students} students${res.documents ? ` and ${res.documents} documents` : ""}.`);
    } catch (err) {
      console.error(err);
      alert("Failed to import JSON. Please verify the file format.");
    }
  }

  // Per-student document counts (files/photos) from AppContext
  const docCounts = useMemo(() => {
    const map = {};
    const list = Array.isArray(data?.documents) ? data.documents : [];
    for (const d of list) {
      const sid = d?.studentId;
      if (!sid) continue;
      if (!map[sid]) map[sid] = { files: 0, photos: 0 };
      if (String(d.kind).toLowerCase() === "photo") map[sid].photos += 1;
      else map[sid].files += 1;
    }
    return map;
  }, [data?.documents]);

  const COLUMNS = [
    { key: "__name", label: "Name", width: 220, render: (s) => `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() },
    { key: "email", label: "Email", width: 220 },
    { key: "mobile", label: "Mobile", width: 140 },
    { key: "status", label: "Status", width: 120 },
    { key: "recordType", label: "Record Type", width: 140 },
    { key: "phase", label: "Phase", width: 90, render: (s) => s.phase || "" },
    { key: "intakeDate", label: "Intake Date", width: 110, render: (s) => fmtDate(s.intakeDate) },
    { key: "exitDate", label: "Graduation Date", width: 140, render: (s) => fmtDate(s.exitDate) },
    { key: "dorm", label: "Dorm", width: 120 },
    { key: "squad", label: "Squad", width: 100, render: (s) => (s.squad ? `Squad ${s.squad}` : "") },
    {
      key: "programPhase",
      label: "Program Phase",
      width: 200,
      render: (s) => s.programPhase || (s.status === "Current" ? `Phase ${s.phase || "1"}, Active` : (s.status ?? "")),
    },
    { key: "__duration", label: "Duration in Program", width: 170, render: (s) => durationInProgram(s.intakeDate, s.exitDate) },
    {
      key: "mentor",
      label: "Referral from Pastor",
      width: 180,
      render: (s) => {
        const v = (s.mentor ?? "").toString();
        if (v) return v;
        return /pastor|pr\.|rev\.|church/i.test(s.referralSource ?? "") ? "Yes" : "";
      },
    },
    { key: "referralSource", label: "Referral Source", width: 160 },
    { key: "application", label: "Application", width: 180 },
    { key: "background", label: "Background", width: 160 },
    { key: "employment", label: "Employment", width: 220 },
    { key: "readiness", label: "Employment Readiness", width: 170 },
    { key: "employmentPlacement", label: "Employment Placement", width: 190 },
    { key: "workshops", label: "Workshops / etc", width: 220 },
    { key: "serviceHours", label: "Service, Outreach & Volunteer Hours", width: 260, render: (s) => `${s.serviceHours ?? 0} hrs` },
    { key: "celebrate", label: "Things to celebrate", width: 260 },
    { key: "healthRecovery", label: "Health/Recovery Improvements & Spiritual yummies :-)", width: 320 },
    { key: "lastReviewDate", label: "Last Review", width: 140, render: (s) => fmtDate(s.lastReviewDate) },
    { key: "location", label: "Location", width: 180 },
    { key: "pipeline", label: "Pipeline", width: 140 },
    { key: "__docs", label: "Docs", width: 90, render: (s) => String(docCounts[s.id]?.files ?? 0) },
    { key: "__photos", label: "Photos", width: 90, render: (s) => String(docCounts[s.id]?.photos ?? 0) },
    { key: "createdAt", label: "Created", width: 120, render: (s) => fmtDate(s.createdAt) },
    { key: "updatedAt", label: "Updated", width: 120, render: (s) => fmtDate(s.updatedAt) },
    { key: "archived", label: "Archived", width: 110, render: (s) => (s.archived ? "Yes" : "") },
    { key: "id", label: "ID", width: 260 },
  ];

  return (
    <section className="page active" aria-label="Students">
      {/* Roster */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h3 style={{ margin: 0 }}>Roster</h3>
          <button className="btn small" onClick={() => { setEdit(null); setShowForm(true); }}>+ Add Student</button>
        </div>
        <div className="roster-scroll">
          {rows.map((s) => (
            <StudentChip key={s.id} student={s} onClick={() => navigate(`/admin/students/${s.id}`)} />
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar" style={{ marginTop: 10 }}>
        <input className="btn" style={{ width: 280 }} placeholder="Search table" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="spacer" />
        {/* NEW: Import JSON */}
        <button
          className="btn small"
          onClick={() => importRef.current?.click()}
          title="Import JSON (replaces all students)"
        >
          Import JSON
        </button>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImportChange}
          style={{ display: "none" }}
        />
        {/* Existing Export */}
        <button
          className="btn small"
          onClick={async () => {
            try {
              const list = rows && rows.length ? rows : await api.getAll("students");
              const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `dsm-students-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            } catch (e) {
              console.error(e);
              alert("Failed to export students.");
            }
          }}
        >
          Export JSON
        </button>
      </div>

      {/* Table (click a row to navigate) */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} style={c.width ? { width: c.width } : undefined}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} onClick={() => navigate(`/admin/students/${r.id}`)} style={{ cursor: "pointer" }}>
                {COLUMNS.map((c) => {
                  const content = c.render ? c.render(r) : r[c.key];
                  return <td key={c.key} title={String(content ?? "")}>{String(content ?? "")}</td>;
                })}
              </tr>
            ))}
            {!filtered.length && (
              <tr><td colSpan={COLUMNS.length} style={{ padding: 16, opacity: 0.7 }}>No records</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <StudentForm
          existing={edit}
          onClose={() => setShowForm(false)}
          onSaved={onSaved}
        />
      )}
    </section>
  );
}
