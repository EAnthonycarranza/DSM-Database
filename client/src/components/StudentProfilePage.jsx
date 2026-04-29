import React, { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";

const uuid = () => (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());

export default function StudentProfilePage({ id }) {
  const { api, user } = useApp();
  const [s, setS] = useState(null);

  useEffect(() => { (async () => setS(await api.get("students", id)))(); }, [api, id]);

  if (!s) return <section className="page active"><div className="card">Loading…</div></section>;

  async function addNote(text) {
    const v = text?.trim();
    if (!v) return;
    const cur = await api.get("students", s.id);
    cur.notes = cur.notes || [];
    cur.notes.push({ id: uuid(), by: user?.name || "Admin", at: Date.now(), text: v });
    await api.put("students", cur);
    setS(cur);
  }

  function onUpload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const cur = { ...s, documents: s.documents || [] };
    files.forEach(f => cur.documents.push({ id: uuid(), name: f.name, size: f.size, at: Date.now() }));
    api.put("students", cur).then(setS);
  }

  return (
    <section className="page active" aria-label="Student Profile">
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>{s.firstName} {s.lastName}</h2>
          <div className="summary" style={{ marginTop: 6 }}>
            <span className={`pill ${s.status==='Current'?'green': s.status==='Waitlist'?'amber': s.status==='Alumni'?'blue':''}`}>{s.status || "—"}</span>
            {s.phase && <span className="pill blue">Phase {s.phase}</span>}
            {s.squad && <span className="pill">Squad {s.squad}</span>}
            {s.dorm && <span className="pill">Dorm {s.dorm}</span>}
          </div>
        </div>
        <div>
          <button className="btn" onClick={()=> (window.location.hash = "#/students")}>← Back to Students</button>
        </div>
      </div>

      <div className="grid" style={{ marginTop: 12 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Notes</h3>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input id="noteInp" className="btn" style={{ flex: 1 }} placeholder="Add a note…" />
            <button
              className="btn primary"
              onClick={()=>{
                const el = document.getElementById("noteInp"); 
                addNote(el?.value); 
                if (el) el.value = "";
              }}
            >
              Add
            </button>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {(s.notes || []).slice().reverse().map(n => (
              <li key={n.id} style={{ padding: "8px 0", borderBottom: "1px solid #1f294a" }}>
                <div style={{ fontSize: 13 }}>{n.text}</div>
                <div style={{ fontSize: 11, opacity: .7 }}>{new Date(n.at).toLocaleString()} — {n.by}</div>
              </li>
            ))}
            {!(s.notes || []).length && <li style={{ opacity: .7 }}>No notes yet.</li>}
          </ul>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Documents</h3>
          <input type="file" multiple onChange={onUpload} />
          <ul style={{ listStyle: "none", padding: 0, marginTop: 10 }}>
            {(s.documents || []).map(d => (
              <li key={d.id} style={{ padding: "6px 0", borderBottom: "1px solid #1f294a" }}>
                📄 {d.name} <span style={{ opacity:.7, fontSize:12 }}>({Math.round(d.size/1024)} KB) — {new Date(d.at).toLocaleDateString()}</span>
              </li>
            ))}
            {!(s.documents || []).length && <li style={{ opacity:.7 }}>No documents uploaded.</li>}
          </ul>
        </div>

        <div className="card" style={{ gridColumn: "1 / span 2" }}>
          <h3 style={{ marginTop: 0 }}>Photos</h3>
          <div style={{ opacity:.7 }}>Hook up your photo uploader here later. For now this is a placeholder section.</div>
        </div>
      </div>
    </section>
  );
}
