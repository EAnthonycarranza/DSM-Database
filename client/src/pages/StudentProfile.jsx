// src/pages/StudentProfile.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useApp } from "../context/AppContext";

/* ---------- utils ---------- */
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : "—");
const fmtDT = (v) =>
  v ? new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
const toISO = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "");
const fullName = (s) => `${s?.firstName ?? ""} ${s?.lastName ?? ""}`.trim();

/* ---------- options ---------- */
const STATUSES = ["Current", "Waitlist", "Future Applicant", "Alumni", "Withdrawn"];
const NOTE_TYPES = [
  { label: "Note", value: "note" },
  { label: "SMS", value: "sms" },
  { label: "Email", value: "email" },
];

/* ---------- file helpers ---------- */
const fmtBytes = (n = 0) => {
  if (!n && n !== 0) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};
const isPDF = (d) => /\.pdf(\?|$)/i.test(d?.name || d?.url || "") || (d?.mime || "").includes("pdf");
const isImage = (d) => {
  const name = (d?.name || d?.url || "").toLowerCase();
  const mime = (d?.mime || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg|tif|tiff|heic|heif|avif)(\?|$)/i.test(name);
};
const isHeicLike = (dOrFile) => {
  const name = (dOrFile?.name || dOrFile?.url || "").toLowerCase();
  const mime = (dOrFile?.type || dOrFile?.mime || "").toLowerCase();
  return mime.includes("heic") || mime.includes("heif") || /\.(heic|heif)(\?|$)/.test(name);
};

// DOCX helpers
const isDocx = (d) => {
  const name = (d?.name || d?.url || "").toLowerCase();
  const mime = (d?.mime || "").toLowerCase();
  return name.endsWith(".docx") || mime.includes("vnd.openxmlformats-officedocument.wordprocessingml.document");
};

function officeViewerURL(url) {
  // Office online viewer renders .docx in-browser
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
}

async function loadDocxPreviewFromCDN() {
  if (typeof window !== "undefined" && window.docx && window.docx.renderAsync) return window.docx;
  return new Promise((resolve, reject) => {
    const id = "docx-preview-cdn";
    if (document.getElementById(id)) {
      const poll = () => (window.docx?.renderAsync ? resolve(window.docx) : setTimeout(poll, 50));
      return poll();
    }
    const s = document.createElement("script");
    s.id = id;
    s.src = "https://unpkg.com/docx-preview/dist/docx-preview.min.js";
    s.async = true;
    s.onload = () => (window.docx?.renderAsync ? resolve(window.docx) : reject(new Error("docx-preview not available")));
    s.onerror = () => reject(new Error("Failed to load docx-preview"));
    document.head.appendChild(s);
  });
}

// NEW: HEIC->JPEG via CDN (no bundler import)
async function loadHeic2AnyFromCDN() {
  if (typeof window !== "undefined" && window.heic2any) return window.heic2any;
  return new Promise((resolve, reject) => {
    const id = "heic2any-cdn";
    if (document.getElementById(id)) {
      const poll = () => (window.heic2any ? resolve(window.heic2any) : setTimeout(poll, 50));
      return poll();
    }
    const s = document.createElement("script");
    s.id = id;
    s.src = "https://unpkg.com/heic2any/dist/heic2any.min.js";
    s.async = true;
    s.onload = () => (window.heic2any ? resolve(window.heic2any) : reject(new Error("heic2any not available")));
    s.onerror = () => reject(new Error("Failed to load heic2any"));
    document.head.appendChild(s);
  });
}

async function convertHeicBlobToJpeg(blob) {
  try {
    const heic2any = await loadHeic2AnyFromCDN();
    const out = await heic2any({ blob, toType: "image/jpeg", quality: 0.9 });
    return Array.isArray(out) ? out[0] : out;
  } catch (e) {
    console.warn("HEIC conversion failed:", e);
    return null;
  }
}

// utils (put with fmtDate/fmtDT/etc.)
function downloadFile(url, name = "download") {
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.download = name || "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ---------- pdf.js helper (for thumbnails) ---------- */
let __pdfWorkerState = { mode: "unset" }; // "unset" | "ok" | "disabled"

async function ensurePdfWorker() {
  // Try normal ESM import first
  const mod = await import("pdfjs-dist/build/pdf");
  const pdfjsLib = mod.default || mod; // <-- handle default export case

  if (__pdfWorkerState.mode === "ok") return { pdfjsLib, workerOk: true };
  if (__pdfWorkerState.mode === "disabled") return { pdfjsLib, workerOk: false };

  // Prefer bundler-provided worker if available
  try {
    // If your bundler supports ?url (Vite/Webpack), this will resolve to a URL
    const workerUrlMod = await import("pdfjs-dist/build/pdf.worker.min.js?url");
    const workerUrl = workerUrlMod.default || workerUrlMod;
    if (typeof workerUrl === "string") {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      __pdfWorkerState = { mode: "ok" };
      return { pdfjsLib, workerOk: true };
    }
  } catch (_) {
    // ignore and try CDN next
  }

  // Fallback: CDN probe
  const v = pdfjsLib.version || "3.11.174";
  const candidates = [
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${v}/build/pdf.worker.min.js`,
    `https://unpkg.com/pdfjs-dist@${v}/build/pdf.worker.min.js`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: "HEAD", mode: "cors" });
      if (res.ok) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = url;
        __pdfWorkerState = { mode: "ok" };
        return { pdfjsLib, workerOk: true };
      }
    } catch {}
  }

  // Final fallback: no worker
  __pdfWorkerState = { mode: "disabled" };
  return { pdfjsLib, workerOk: false };
}

/* ---------- page ---------- */
export default function StudentProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { api, data } = useApp();
  const location = useLocation();

  const [student, setStudent] = useState(null);

  // actions menu + submenu + modal state
  const [menuOpen, setMenuOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // subnav
  const [tab, setTab] = useState("activity"); // activity | documents | photos | forms

  // NEW: honor ?tab=... from URL (e.g., ?tab=documents)
  useEffect(() => {
    const sp = new URLSearchParams(location.search || "");
    const t = sp.get("tab");
    if (t && ["activity", "documents", "photos", "forms"].includes(t)) {
      setTab(t);
    }
  }, [location.search]);

  // activity toolbar state
  const [createdFilter, setCreatedFilter] = useState("user"); // user | all
  const [searchQ, setSearchQ] = useState("");
  const [includeRelated, setIncludeRelated] = useState(true);

  // note modal
  const [noteModal, setNoteModal] = useState(null); // {mode:'create'|'edit', doc}

  // docs: pdf viewer state
  const [pdfDoc, setPdfDoc] = useState(null); // { url, name }

  // refs
  const menuRef = useRef(null);
  const statusHideTimer = useRef(null);

  // load record (with logging + 404 handling)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        console.log("[StudentProfile] fetching student", id);
        const s = await api.get("students", id);
        if (!cancelled) {
          setStudent(s);
          console.log("[StudentProfile] loaded student", s);
        }
      } catch (e) {
        console.error("[StudentProfile] failed to load student", e);
        alert("Student not found.");
        navigate("/admin/students");
      }
    })();
    return () => { cancelled = true; };
  }, [api, id, navigate]);

  // ensure latest documents list when landing directly on a profile
  useEffect(() => {
    api.getAll("documents").catch(() => {});
  }, [api, id]);

  // click-away for the page kebab menu
  useEffect(() => {
    const onDoc = (e) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) {
        setMenuOpen(false);
        setStatusOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // submenu helpers
  const openStatus = () => { if (statusHideTimer.current) clearTimeout(statusHideTimer.current); setStatusOpen(true); };
  const scheduleCloseStatus = () => {
    if (statusHideTimer.current) clearTimeout(statusHideTimer.current);
    statusHideTimer.current = setTimeout(() => setStatusOpen(false), 1000);
  };
  useEffect(() => () => clearTimeout(statusHideTimer.current), []);

  const initials = useMemo(() => {
    if (!student) return "S";
    return `${student.firstName?.[0] ?? ""}${student.lastName?.[0] ?? ""}` || "S";
  }, [student]);

  const dormDisplay = useMemo(() => {
    if (!student) return "";
    if (student.dorm) return student.dorm;
    const dorms = Array.isArray(data?.settings?.dorms) ? data.settings.dorms : [];
    const match = dorms.find((d) => d.id === student.dormId);
    return match?.name || "";
  }, [student, data?.settings?.dorms]);

  // collections scoped to student
  const allDocs = useMemo(() => (Array.isArray(data.documents) ? data.documents : []), [data.documents]);

  const activity = useMemo(
    () => allDocs.filter((d) => d.studentId === id && ["note", "sms", "email"].includes(d.kind))
                 .sort((a, b) => b.at - a.at),
    [allDocs, id]
  );

  const docs = useMemo(
    () => allDocs.filter((d) => d.studentId === id && d.kind === "file").sort((a, b) => b.at - a.at),
    [allDocs, id]
  );

  const photos = useMemo(
    () => allDocs.filter((d) => d.studentId === id && d.kind === "photo").sort((a, b) => b.at - a.at),
    [allDocs, id]
  );

  useEffect(() => {
    console.log("[StudentProfile] counts", { activity: activity.length, docs: docs.length, photos: photos.length });
  }, [activity.length, docs.length, photos.length]);

  const [imgWin, setImgWin] = useState(null); // { url, name }

  const activityFiltered = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return activity.filter((n) => {
      if (createdFilter === "user" && (n.by || "").toLowerCase() === "system") return false;
      if (!q) return true;
      return (`${n.text || ""} ${n.kind || ""} ${n.by || ""}`).toLowerCase().includes(q);
    });
  }, [activity, createdFilter, searchQ]);

  const [programEditOpen, setProgramEditOpen] = useState(false);

  if (!id) {
    return (<section className="page active"><div className="card">No student selected.</div></section>);
  }
  if (!student) {
    return (<section className="page active"><div className="card">Loading…</div></section>);
  }

  async function changeStatus(newStatus) {
    const updated = { ...student, status: newStatus };
    if (newStatus !== "Current") updated.phase = "";
    await api.put("students", updated);
    setStudent(updated);
    setMenuOpen(false);
    setStatusOpen(false);
  }

  // save from modal (create or edit)
  async function saveNoteFromModal(payload, mode, existingId) {
    if (mode === "edit" && existingId) {
      await api.put("documents", { ...payload, id: existingId, updatedAt: Date.now() });
    } else {
      await api.add("documents", { id: undefined, ...payload });
    }
    setNoteModal(null);
  }

  // Upload picked files to the server (streams to GCS) and create document records.
  // We also convert HEIC/HEIF to JPEG client-side for better preview compatibility.
  async function onAddFiles(e) {
    const selected = Array.from(e.target.files || []);
    // allow re-picking the same file next time
    e.target.value = "";
    if (!selected.length) return;

    try {
      // Convert HEIC/HEIF to JPEG before uploading, keep others as-is
      const toUpload = [];
      for (const f of selected) {
        if (isHeicLike(f)) {
          try {
            const jpegBlob = await convertHeicBlobToJpeg(f);
            if (jpegBlob) {
              const fname = (f.name || "photo.heic").replace(/\.(heic|heif)$/i, ".jpg");
              const jpg = new File([jpegBlob], fname, { type: "image/jpeg" });
              toUpload.push(jpg);
              continue;
            }
          } catch (err) {
            console.warn("HEIC conversion failed; uploading original:", f?.name, err);
          }
        }
        toUpload.push(f);
      }

      // Use the dedicated upload endpoint (no JSON headers; multipart form data)
      await api.upload(toUpload, { studentId: id, by: "u-admin" });
      // `api.upload` already refreshes documents/notifications in AppContext
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Upload failed. See console for details.");
    }
  }

  // NEW: delete helper referenced in rows
  async function delDoc(docId) {
    await api.del("documents", docId);
  }

  // NEW: Download all photos as .zip (lazy-loads deps if present)
  async function downloadAllPhotos() {
    if (!photos.length) return;
    let JSZip, saveAs;
    try {
      JSZip = (await import("jszip")).default;
      ({ saveAs } = await import("file-saver"));
    } catch (e) {
      alert('To use "Download All", install:  npm i jszip file-saver');
      return;
    }
    const zip = new JSZip();
    const folderName = `${student.firstName || "Student"}_${student.lastName || ""}`.trim() || "photos";
    const folder = zip.folder(folderName) || zip;
    await Promise.all(
      photos.map(async (p, i) => {
        try {
          const res = await fetch(p.url, { mode: "cors" });
          const blob = await res.blob();
          const ext = (p.name?.split(".").pop() || "jpg").toLowerCase();
          const safe = (p.name || `photo-${i + 1}.${ext}`).replace(/[^\w.\- ]+/g, "_");
          folder.file(safe, blob);
        } catch (e) {
          console.warn("Skipping (fetch failed):", p?.name || p?.url, e);
        }
      })
    );
    const out = await zip.generateAsync({ type: "blob" });
    const zipName = `${folderName || "photos"}.zip`;
    saveAs(out, zipName);
  }

  // Open photo viewer with conversion for HEIC if needed
  const openPhotoViewer = async (item) => {
    let viewUrl = item?.url;
    if (isHeicLike(item) && item?.url) {
      try {
        const res = await fetch(item.url);
        const blob = await res.blob();
        const jpeg = await convertHeicBlobToJpeg(blob);
        if (jpeg) viewUrl = URL.createObjectURL(jpeg);
      } catch (e) {
        console.warn("HEIC view conversion failed:", e);
      }
    }
    setImgWin({ url: viewUrl, name: item?.name || "image" });
  };

  // NEW: cascade delete student and all related docs
  async function deleteStudentCascade() {
    if (!student) return;
    const name = `${student.firstName || ""} ${student.lastName || ""}`.trim() || "this student";
    setMenuOpen(false);
    setStatusOpen(false);
    if (!window.confirm(`Delete ${name}'s profile and ALL related notes, documents and photos? This cannot be undone.`)) return;
    if (!window.confirm("Are you absolutely sure? This action is permanent.")) return;

    try {
      const related = allDocs.filter((d) => d.studentId === id);
      // Best-effort delete of related docs
      await Promise.allSettled(related.map((d) => api.del("documents", d.id)));
      // Delete the student record
      await api.del("students", id);
      navigate("/admin/students");
    } catch (e) {
      console.error(e);
      alert("Failed to delete student. Please try again.");
    }
  }

  return (
    <section className="page active" aria-label="Student Profile">
      <style>{LOCAL_CSS}</style>
      <style>{DOCX_THUMB_CSS}</style>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <button className="btn small" onClick={() => navigate("/admin/students")}>
            <i className="fa-solid fa-arrow-left" /> Back
          </button>

          {/* Kebab menu */}
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              className="icon-btn"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              title="Actions"
            >
              <i className="fa-solid fa-ellipsis-vertical" />
            </button>

            <div className={`dropdown ${menuOpen ? "show" : ""}`} role="menu" style={{ right: 0, left: "auto", minWidth: 200 }}>
              <div className="item" onMouseEnter={openStatus} onMouseLeave={scheduleCloseStatus} style={{ position: "relative" }}>
                <span>Change Status</span>
                <span style={{ marginLeft: "auto", opacity: 0.7, transform: "rotate(180deg)" }}>▸</span>

                <div
                  className="dropdown"
                  onMouseEnter={openStatus}
                  onMouseLeave={scheduleCloseStatus}
                  style={{ position: "absolute", top: -6, right: "calc(100% + 8px)", left: "auto", minWidth: 180, zIndex: 1300, display: statusOpen ? "block" : "none" }}
                  role="menu"
                >
                  {STATUSES.map((st) => (
                    <div key={st} className="item" onClick={() => changeStatus(st)}>{st}</div>
                  ))}
                </div>
              </div>

              <div className="item" onClick={() => { setMenuOpen(false); setEditOpen(true); }}>Edit</div>

              {/* NEW: Delete student (danger) */}
              <div className="item danger" onClick={deleteStudentCascade}>
                <i className="fa-solid fa-trash" /> Delete Student
              </div>
            </div>
          </div>
        </div>

        {/* Header */}
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 10 }}>
          <div className="chip-avatar" style={{ width: 44, height: 44, fontSize: 16 }}>{initials}</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>
              {student.firstName} {student.lastName}
            </div>
            <div style={{ color: "var(--text-dim)" }}>
              {student.status || "—"} {student.phase ? `• Phase ${student.phase}` : ""} {student.squad ? `• Squad ${student.squad}` : ""}
            </div>
          </div>
        </div>

        <div className="summary" style={{ marginTop: 12 }}>
          <span className="pill">Email: {student.email || "—"}</span>
          <span className="pill">Mobile: {student.mobile || "—"}</span>
          <span className="pill">Dorm: {dormDisplay || "—"}</span>
          <span className="pill">Intake: {fmtDate(student.intakeDate)}</span>
          {student.exitDate && <span className="pill red">Exit: {fmtDate(student.exitDate)}</span>}
        </div>
      </div>

      {/* Sub-nav */}
      <div className="subnav">
        {[
          ["activity", "Activity"],
          ["documents", "Documents"],
          ["photos", "Photos"],
          ["forms", "Forms"],
        ].map(([k, label]) => (
          <button key={k} className={`subnav-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {/* Panels */}
      <div className="tabpanel" style={{ marginTop: 12 }}>
        {tab === "activity" && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Activity</h3>

            {/* Toolbar */}
            <div className="act-toolbar">
              <div className="left">
                <select className="btn" value={createdFilter} onChange={(e) => setCreatedFilter(e.target.value)} title="Created filter">
                  <option value="user">User Created</option>
                  <option value="all">All</option>
                </select>

                <div className="search-wrap">
                  <input className="btn" placeholder="Search notes, emails, etc." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
                  <label className="check" title="Toggle related items">
                    <input type="checkbox" checked={includeRelated} onChange={(e) => setIncludeRelated(e.target.checked)} />
                    <span>Related</span>
                  </label>
                </div>
              </div>

              <div className="note-right">
                <button
                  className="btn primary"
                  onClick={() =>
                    setNoteModal({
                      mode: "create",
                      doc: { kind: "note", text: "", private: false, attachments: [], at: Date.now(), by: "u-admin", studentId: id },
                    })
                  }
                >
                  <i className="fa-solid fa-note-sticky" /> + Note
                </button>
              </div>
            </div>

            {/* Activity table */}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 220 }}>Posted on</th>
                    <th style={{ width: 240 }}>Related</th>
                    <th>Text</th>
                    <th style={{ width: 44 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {activityFiltered.map((n) => (
                    <tr key={n.id}>
                      <td>
                        <div>{fmtDT(n.at)}</div>
                        <div className="byline">{n.by || "—"}</div>
                      </td>
                      <td>
                        <a href={`/admin/students/${id}`} className="rel-link" onClick={(e) => e.preventDefault()} title="Student contact">
                          {fullName(student)} <span className="rel-type">(contact)</span>
                        </a>
                      </td>
                      <td style={{ whiteSpace: "pre-wrap" }}>
                        <div className="note-kind">{(n.kind || "note").replace(/^\w/, (c) => c.toUpperCase())}</div>
                        <div className="note-text">{renderMentions(n.text)}</div>
                        {!!(n.attachments || []).length && (
                          <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {(n.attachments || []).map((f, i) => (
                              <a key={i} href={f.url} target="_blank" rel="noreferrer" className="pill" title={f.name}>
                                <i className="fa-solid fa-paperclip" /> {f.name}
                              </a>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="kebab-cell">
                        <RowKebab onEdit={() => setNoteModal({ mode: "edit", doc: n })} onDelete={() => delDoc(n.id)} />
                      </td>
                    </tr>
                  ))}
                  {!activityFiltered.length && (
                    <tr><td colSpan={4} style={{ opacity: 0.7, padding: 12 }}>No matching activity.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "documents" && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Documents</h3>
<div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
  <label className="btn clickable">
    <i className="fa-solid fa-upload" /> Upload
    <input type="file" style={{ display: "none" }} onChange={onAddFiles} multiple />
  </label>
</div>

            <div className="table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th style={{ width: 120 }}>Preview</th>
                    <th style={{ width: 240 }}>Related</th>
                    <th>Posted on</th>
                    <th style={{ width: 44 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <DocumentRow
                      key={d.id}
                      doc={d}
                      student={student}
                      onDelete={() => delDoc(d.id)}
                      onOpenPdf={() => setPdfDoc({ url: d.url, name: d.name })}
                    />
                  ))}
                  {!docs.length && (
                    <tr><td colSpan={4} style={{ opacity: 0.7, padding: 12 }}>No documents yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

{tab === "photos" && (
  <div className="card">
    <h3 style={{ marginTop: 0 }}>Photos</h3>

    <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
      <label className="btn clickable">
        <i className="fa-solid fa-upload" /> Upload
        {/* UPDATED: accept HEIC/HEIF explicitly */}
        <input
          type="file"
          accept="image/*,.heic,.heif,.HEIC,.HEIF"
          multiple
          style={{ display: "none" }}
          onChange={onAddFiles}
        />
      </label>

      {!!photos.length && (
        <button className="btn outline clickable" onClick={downloadAllPhotos} title="Download all photos as .zip">
          <i className="fa-solid fa-download" /> Download All
        </button>
      )}
    </div>

    <div className="table-wrap">
      <table className="photos-table">
        <thead>
          <tr>
            <th style={{ width: 120 }}>Preview</th>
            <th style={{ width: 240 }}>Related</th>
            <th>Posted on</th>
            <th style={{ width: 44 }}></th>
          </tr>
        </thead>
        <tbody>
          {photos.map((p) => (
<PhotoRow
  key={p.id}
  photo={p}
  student={student}
  onView={() => openPhotoViewer(p)}
  onDownload={() => downloadFile(p.url, p.name || "photo")}
  onEdit={() => openPhotoViewer(p)}
  onDelete={() => delDoc(p.id)}
/>
          ))}

          {!photos.length && (
            <tr>
              <td colSpan={4} style={{ opacity: 0.7, padding: 12 }}>
                No photos yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
)}

        {tab === "forms" && (
          <>
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h3 style={{ marginTop: 0 }}>Program Overview</h3>
                <div>
                  <button className="btn small" onClick={() => setProgramEditOpen(true)}>
                    Edit
                  </button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div className="cap">Name</div>
                  <div>{fullName(student) || "—"}</div>
                </div>
                <div>
                  <div className="cap">Intake Date</div>
                  <div>{fmtDate(student.intakeDate)}</div>
                </div>
                <div>
                  <div className="cap">Referral from Pastor</div>
                  <div>{student.mentor ?? "—"}</div>
                </div>
                <div>
                  <div className="cap">Application</div>
                  <div>{student.application || "—"}</div>
                </div>
                <div>
                  <div className="cap">Background</div>
                  <div>{student.background || "—"}</div>
                </div>
                <div>
                  <div className="cap">Graduation Date</div>
                  <div>{fmtDate(student.exitDate)}</div>
                </div>
                <div>
                  <div className="cap">Program Phase</div>
                  <div>{student.programPhase || (student.phase ? `Phase ${student.phase}` : "—")}</div>
                </div>
                <div>
                  <div className="cap">Duration in Program</div>
                  <div>{student.durationInProgram || "—"}</div>
                </div>
                <div>
                  <div className="cap">Employment</div>
                  <div>{student.employment || "—"}</div>
                </div>
                <div>
                  <div className="cap">Readiness</div>
                  <div>{student.readiness || "—"}</div>
                </div>
                <div>
                  <div className="cap">Employment Placement</div>
                  <div>{student.employmentPlacement || "—"}</div>
                </div>
                <div>
                  <div className="cap">Workshops / etc</div>
                  <div>{student.workshops || "—"}</div>
                </div>
                <div className="wide" style={{ gridColumn: "1 / span 2" }}>
                  <div className="cap">Service, Outreach & Volunteer Hours</div>
                  <div>{(student.serviceHours ?? "—").toString()}</div>
                </div>
                <div className="wide" style={{ gridColumn: "1 / span 2" }}>
                  <div className="cap">Things to celebrate</div>
                  <div className="note-text">{student.celebrate || "—"}</div>
                </div>
                <div className="wide" style={{ gridColumn: "1 / span 2" }}>
                  <div className="cap">Health/Recovery Improvements & Spiritual yummies :-)</div>
                  <div className="note-text">{student.healthRecovery || "—"}</div>
                </div>
              </div>
            </div>

            {/* NEW: Record Details card with extra AppContext fields */}
            <div className="card" style={{ marginTop: 12 }}>
              <h3 style={{ marginTop: 0 }}>Record Details</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div className="cap">Email</div>
                  <div>{student.email || "—"}</div>
                </div>
                <div>
                  <div className="cap">Mobile</div>
                  <div>{student.mobile || "—"}</div>
                </div>
                <div>
                  <div className="cap">Status</div>
                  <div>{student.status || "—"}</div>
                </div>
                <div>
                  <div className="cap">Record Type</div>
                  <div>{student.recordType || "—"}</div>
                </div>
                <div>
                  <div className="cap">Referral Source</div>
                  <div>{student.referralSource || "—"}</div>
                </div>
                <div>
                  <div className="cap">Location</div>
                  <div>{student.location || "—"}</div>
                </div>
                <div>
                  <div className="cap">Dorm</div>
                  <div>{dormDisplay || "—"}</div>
                </div>
                <div>
                  <div className="cap">Squad</div>
                  <div>{student.squad || "—"}</div>
                </div>
                <div>
                  <div className="cap">Last Review</div>
                  <div>{fmtDate(student.lastReviewDate)}</div>
                </div>
                <div>
                  <div className="cap">Pipeline</div>
                  <div>{student.pipeline || "—"}</div>
                </div>
                <div>
                  <div className="cap">Created</div>
                  <div>{fmtDate(student.createdAt)}</div>
                </div>
                <div>
                  <div className="cap">Updated</div>
                  <div>{fmtDate(student.updatedAt)}</div>
                </div>
                <div>
                  <div className="cap">Archived</div>
                  <div>{student.archived ? "Yes" : "No"}</div>
                </div>
                <div className="wide" style={{ gridColumn: "1 / span 2" }}>
                  <div className="cap">ID</div>
                  <div style={{ fontFamily: "monospace" }}>{student.id || "—"}</div>
                </div>
                {/* Per-student counts */}
                <div>
                  <div className="cap">Documents</div>
                  <div>{docs.length}</div>
                </div>
                <div>
                  <div className="cap">Photos</div>
                  <div>{photos.length}</div>
                </div>
                <div className="wide" style={{ gridColumn: "1 / span 2" }}>
                  <div className="cap">Notes / Emails / SMS</div>
                  <div>{activity.length}</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Edit Modal */}
      {editOpen && (
        <EditStudentModal
          student={student}
          dorms={(data?.settings?.dorms || []).map((d) => d.name)}
          onClose={() => setEditOpen(false)}
          onSave={async (patch) => {
            const updated = { ...student, ...patch, updatedAt: Date.now() };
            await api.put("students", updated);
            setStudent(updated);
            setEditOpen(false);
          }}
        />
      )}

      {/* Note Modal */}
      {noteModal && (
        <NoteModal
          mode={noteModal.mode}
          initial={noteModal.doc}
          onClose={() => setNoteModal(null)}
          onSave={(payload) => saveNoteFromModal(payload, noteModal.mode, noteModal.doc?.id)}
        />
      )}

      {imgWin && <ImageWindow doc={imgWin} onClose={() => setImgWin(null)} />}

      {/* PDF Viewer Window */}
      {pdfDoc && <PdfWindow doc={pdfDoc} onClose={() => setPdfDoc(null)} />}

      {/* Program Overview Editor */}
      {programEditOpen && (
        <ProgramFormModal
          student={student}
          onClose={() => setProgramEditOpen(false)}
          onSave={async (patch) => {
            const updated = { ...student, ...patch, updatedAt: Date.now() };
            await api.put("students", updated);
            setStudent(updated);
            setProgramEditOpen(false);
          }}
        />
      )}
    </section>
  );
}

/* ---------- mentions renderer ---------- */
function renderMentions(text = "") {
  const parts = text.split(/(@[A-Za-z0-9._-]+)/g);
  return parts.map((p, i) =>
    /^@[A-Za-z0-9._-]+$/.test(p) ? <span key={i} className="mention">{p}</span> : <span key={i}>{p}</span>
  );
}

/* ---------- Row kebab (… menu) ---------- */
function RowKebab({ items, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const defaultItems = [
    { key: "edit", label: "Edit", icon: "fa-regular fa-pen-to-square", onClick: onEdit },
    { key: "delete", label: "Delete", icon: "fa-solid fa-trash", onClick: onDelete, danger: true },
  ];
  const list = Array.isArray(items) && items.length ? items : defaultItems;

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const MENU_W = 200, MENU_H = Math.max(48, list.length * 40);
    const dropUp = window.innerHeight - r.bottom < MENU_H + 12;
    setCoords({ top: Math.round(dropUp ? r.top - MENU_H - 8 : r.bottom + 8), left: Math.round(Math.max(8, r.right - MENU_W)) });
  }, [open, list.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        className="icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="More"
      >
        <i className="fa-solid fa-ellipsis-vertical" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="dropdown show"
            role="menu"
            style={{ position: "fixed", top: coords.top, left: coords.left, minWidth: 200, zIndex: 10000 }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="menu-pointer" />
            {list.map((it) => (
              <div
                key={it.key}
                className={`item ${it.danger ? "danger" : ""}`}
                onClick={() => {
                  setOpen(false);
                  it.onClick?.();
                }}
              >
                {it.icon && <i className={it.icon} style={{ marginRight: 8 }} />}
                {it.label}
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

/* ---------- Create/Edit Note Modal ---------- */
function NoteModal({ mode = "create", initial, onClose, onSave }) {
  const [kind, setKind] = useState(initial?.kind || "note");
  const [text, setText] = useState(initial?.text || "");
  const [priv, setPriv] = useState(!!initial?.private);
  const [files, setFiles] = useState(initial?.attachments || []);
  const fileInput = useRef(null);

  // NEW: mentions
  const taRef = useRef(null);
  const { data } = useApp();
  const users = Array.isArray(data?.users) ? data.users : [];
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);

  const mentionMatches = React.useMemo(() => {
    if (!showMention) return [];
    const q = (mentionQuery || "").toLowerCase();
    return users
      .filter((u) => ((u.name || "").replace(/\s/g, "").toLowerCase().startsWith(q)))
      .slice(0, 5);
  }, [showMention, mentionQuery, users]);

  const handleTextChange = (e) => {
    const val = e.target.value;
    setText(val);
    const caret = e.target.selectionStart || 0;
    const before = val.slice(0, caret);
    const m = before.match(/@(\w*)$/);
    if (m) {
      setShowMention(true);
      setMentionQuery(m[1] || "");
      setMentionIndex(0);
    } else {
      setShowMention(false);
      setMentionQuery("");
    }
  };

  const insertMention = (u) => {
    const first = (u.name || "").split(" ")[0] || "";
    setText((prev) => {
      const el = taRef.current;
      const caret = el ? el.selectionStart : prev.length;
      const before = prev.slice(0, caret).replace(/@(\w*)$/, `@${first} `);
      const after = prev.slice(caret);
      const next = before + after;
      setTimeout(() => {
        if (el) {
          const pos = before.length;
          el.focus();
          el.setSelectionRange(pos, pos);
        }
      }, 0);
      return next;
    });
    setShowMention(false);
    setMentionQuery("");
  };

  const onPickFiles = (e) => {
    const list = Array.from(e.target.files || []);
    const next = [...files, ...list.map((f) => ({ name: f.name, type: f.type, size: f.size, url: URL.createObjectURL(f) }))];
    setFiles(next);
    e.target.value = "";
  };

  const save = () => {
    const payload = { kind, text: text.trim(), private: !!priv, attachments: files, at: initial?.at || Date.now(), by: initial?.by || "u-admin", studentId: initial?.studentId };
    if (!payload.text) return;
    onSave(payload);
  };

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal show" role="dialog" aria-modal="true">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-card" style={{ width: "min(640px, 94vw)" }}>
        <div className="modal-header">
          <strong>{mode === "edit" ? "Edit Note" : "Create Note"}</strong>
          <button className="icon-btn" onClick={onClose} title="Close">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body" style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Type</span>
            <select className="btn" value={kind} onChange={(e) => setKind(e.target.value)} style={{ height: 36, width: 180 }}>
              {NOTE_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
            </select>
          </label>

          {/* CHANGED: wrap textarea to host mention popover */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Note</span>
            <div style={{ position: "relative" }}>
              <textarea
                ref={taRef}
                className="btn"
                rows={8}
                placeholder="Type your note… use @ to mention people"
                value={text}
                onChange={handleTextChange}
                onKeyDown={(e) => {
                  if (showMention && mentionMatches.length) {
                    if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionMatches.length); return; }
                    if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
                    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionMatches[mentionIndex]); return; }
                    if (e.key === "Escape") { e.preventDefault(); setShowMention(false); setMentionQuery(""); return; }
                  }
                }}
                style={{ resize: "vertical" }}
              />
              {showMention && mentionMatches.length > 0 && (
                <div className="mention-pop">
                  {mentionMatches.map((u, idx) => (
                    <div
                      key={u.id || u.name}
                      className={`m-item ${idx === mentionIndex ? "active" : ""}`}
                      onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
                    >
                      <span className="m-avatar">
                        {u.initials || (u.name || "").split(" ").map((p) => p[0]).join("")}
                      </span>
                      <span className="m-name">{u.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </label>

          <div>
            <button className="btn linklike" type="button" onClick={() => fileInput.current?.click()}>
              <i className="fa-solid fa-paperclip" /> Add attachments
            </button>
            <input ref={fileInput} type="file" multiple style={{ display: "none" }} onChange={onPickFiles} />
            {!!files.length && (
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {files.map((f, i) => (<span key={i} className="pill">{f.name}</span>))}
              </div>
            )}
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
            <span>Private note</span>
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 6px" }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}><i className="fa-solid fa-floppy-disk" /> Save note</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Small inline list manager for dropdown options ---------- */
function ManageListEditor({ title, items = [], onAdd, onRemove, placeholder = "New option" }) {
  const [val, setVal] = React.useState("");
  return (
    <div className="manage-box" style={{ marginTop: 6, border: "1px solid #2a3c6a", borderRadius: 10, padding: 8 }}>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input className="btn" value={val} placeholder={placeholder} onChange={(e) => setVal(e.target.value)} />
        <button className="btn" onClick={() => { const v = (val || "").trim(); if (!v) return; onAdd?.(v); setVal(""); }}>Add</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {items.map((it) => (
          <span key={it || "(blank)"} className="pill" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {it || "—"}
            <button className="icon-btn sm" title="Delete" onClick={() => onRemove?.(it)}>
              <i className="fa-solid fa-xmark" />
            </button>
          </span>
        ))}
        {!items.length && <div style={{ fontSize: 12, color: "var(--text-dim)" }}>No options yet.</div>}
      </div>
    </div>
  );
}

/* ---------- Edit Student Modal ---------- */
function EditStudentModal({ student, dorms = [], onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    firstName: student.firstName || "",
    lastName: student.lastName || "",
    email: student.email || "",
    mobile: student.mobile || "",
    status: student.status || "",
    recordType: student.recordType || "",
    phase: student.phase || "",
    squad: student.squad || "",
    dorm: student.dorm || "",
    intakeDate: toISO(student.intakeDate) || "",
    exitDate: toISO(student.exitDate) || "",
    referralSource: student.referralSource || "",
    mentor: student.mentor || "",
    location: student.location || "",
  }));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // --- Editable dropdown lists ---
  const { data, api } = useApp();
  const settings = data?.settings || {};
  const lists = settings.lists || {};
  const statuses = Array.isArray(lists.statuses) ? lists.statuses : ["Current", "Waitlist", "Future Applicant", "Alumni", "Withdrawn"];
  const phases   = Array.isArray(lists.phases)   ? lists.phases   : ["", "1", "2"];
  const squads   = Array.isArray(lists.squads)   ? lists.squads   : ["", "A", "B", "C"];
  const dormList = Array.isArray(settings.dorms) ? settings.dorms : [];
  const dormNames = dormList.map((d) => d?.name).filter(Boolean);

  const [showManage, setShowManage] = useState({ status:false, phase:false, squad:false, dorm:false });

  const addStatus = async (label) => api.updateSettings((cur) => ({
    ...cur,
    lists: { ...cur.lists, statuses: Array.from(new Set([...(cur.lists?.statuses || []), label])) },
  }));
  const removeStatus = async (label) => api.updateSettings((cur) => ({
    ...cur,
    lists: { ...cur.lists, statuses: (cur.lists?.statuses || []).filter((x) => x !== label) },
  }));

  const addPhase = async (label) => api.updateSettings((cur) => ({
    ...cur,
    lists: { ...cur.lists, phases: Array.from(new Set([...(cur.lists?.phases || []), label])) },
  }));
  const removePhase = async (label) => api.updateSettings((cur) => ({
    ...cur,
    lists: { ...cur.lists, phases: (cur.lists?.phases || []).filter((x) => x !== label) },
  }));

  const addSquad = async (label) => api.updateSettings((cur) => ({
    ...cur,
    lists: { ...cur.lists, squads: Array.from(new Set([...(cur.lists?.squads || []), label])) },
  }));
  const removeSquad = async (label) => api.updateSettings((cur) => ({
    ...cur,
    lists: { ...cur.lists, squads: (cur.lists?.squads || []).filter((x) => x !== label) },
  }));

  const addDorm = async (name) => api.updateSettings((cur) => {
    const exists = (cur.dorms || []).some((d) => (d.name || "").toLowerCase() === name.toLowerCase());
    if (exists) return cur;
    const id = `d-${Math.random().toString(36).slice(2,7)}${Date.now().toString().slice(-4)}`;
    return { ...cur, dorms: [ ...(cur.dorms || []), { id, name, slots: 0 } ] };
  });
  const removeDorm = async (name) => api.updateSettings((cur) => ({
    ...cur,
    dorms: (cur.dorms || []).filter((d) => d.name !== name),
  }));

  return (
    <div className="modal show" role="dialog" aria-modal="true">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-card" style={{ width: "min(760px, 94vw)" }}>
        <div className="modal-header">
          <strong>Edit Student</strong>
          <button className="icon-btn" onClick={onClose} title="Close">
  <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="First Name"><input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} /></Field>
          <Field label="Last Name"><input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
          <Field label="Email"><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Mobile"><input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} /></Field>

          {/* --- Managed Status field --- */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Status</span>
            <div style={{ display: "flex", gap: 6 }}>
              <select className="btn" value={form.status} onChange={(e) => set("status", e.target.value)}>
                {statuses.map((s) => (<option key={s || "(blank)"} value={s}>{s || "—"}</option>))}
              </select>
              <button className="btn small" type="button" onClick={() => setShowManage((m)=>({ ...m, status: !m.status }))}>Manage</button>
            </div>
            {showManage.status && (
              <ManageListEditor
                title="Manage Statuses"
                items={statuses}
                onAdd={addStatus}
                onRemove={removeStatus}
                placeholder="e.g., On Hold"
              />
            )}
          </label>

          <Field label="Record Type">
            <select value={form.recordType} onChange={(e) => set("recordType", e.target.value)}>
              <option value="">—</option>
              <option>Resident</option><option>Applicant</option><option>Prospect</option><option>Alumni</option>
            </select>
          </Field>

          {/* --- Managed Phase field --- */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Phase</span>
            <div style={{ display: "flex", gap: 6 }}>
              <select className="btn" value={form.phase} onChange={(e) => set("phase", e.target.value)}>
                {phases.map((p) => (
                  <option key={p || "(blank)"} value={p}>{p || "—"}</option>
                ))}
              </select>
              <button className="btn small" type="button" onClick={() => setShowManage((m)=>({ ...m, phase: !m.phase }))}>Manage</button>
            </div>
            {showManage.phase && (
              <ManageListEditor
                title="Manage Phases"
                items={phases.filter((x) => x !== "")}
                onAdd={addPhase}
                onRemove={removePhase}
                placeholder="e.g., 3"
              />
            )}
          </label>

          {/* --- Managed Squad field --- */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Squad</span>
            <div style={{ display: "flex", gap: 6 }}>
              <select className="btn" value={form.squad} onChange={(e) => set("squad", e.target.value)}>
                {squads.map((sq) => (<option key={sq || "(blank)"} value={sq}>{sq || "—"}</option>))}
              </select>
              <button className="btn small" type="button" onClick={() => setShowManage((m)=>({ ...m, squad: !m.squad }))}>Manage</button>
            </div>
            {showManage.squad && (
              <ManageListEditor
                title="Manage Squads"
                items={squads.filter((x) => x !== "")}
                onAdd={addSquad}
                onRemove={removeSquad}
                placeholder="e.g., D"
              />
            )}
          </label>

          {/* --- Managed Dorm field --- */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Dorm</span>
            <div style={{ display: "flex", gap: 6 }}>
              <select className="btn" value={form.dorm} onChange={(e) => set("dorm", e.target.value)}>
                <option value="">—</option>
                {dormNames.map((d) => (<option key={d} value={d}>{d}</option>))}
              </select>
              <button className="btn small" type="button" onClick={() => setShowManage((m)=>({ ...m, dorm: !m.dorm }))}>Manage</button>
            </div>
            {showManage.dorm && (
              <ManageListEditor
                title="Manage Dorms"
                items={dormNames}
                onAdd={addDorm}
                onRemove={removeDorm}
                placeholder="Dorm name"
              />
            )}
          </label>

          <Field label="Intake Date"><input type="date" value={form.intakeDate} onChange={(e) => set("intakeDate", e.target.value)} /></Field>
          <Field label="Exit Date"><input type="date" value={form.exitDate} onChange={(e) => set("exitDate", e.target.value)} /></Field>
          <Field label="Referral Source" wide><input value={form.referralSource} onChange={(e) => set("referralSource", e.target.value)} /></Field>
          <Field label="Referral from Pastor">
            <select value={form.mentor} onChange={(e) => set("mentor", e.target.value)}>
              <option value="">—</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </Field>
          <Field label="Location"><input value={form.location} onChange={(e) => set("location", e.target.value)} /></Field>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 6px" }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onSave({ ...form, exitDate: form.exitDate || undefined, intakeDate: form.intakeDate || undefined })}>Save</button>
        </div>
      </div>
    </div>
  );
}

/* small field helper */
function Field({ label, children, wide }) {
  return (
    <label style={{ display: "grid", gap: 6, gridColumn: wide ? "1 / span 2" : "auto" }}>
      <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{label}</span>
      {React.cloneElement(children, { className: "btn", style: { height: 36, ...(children.props.style || {}) } })}
    </label>
  );
}

function DocumentRow({ doc, student, onDelete, onOpenPdf }) {
  const isPdf = isPDF(doc);
  const isDoc = isDocx(doc);
  const [pages, setPages] = useState(doc.pages);
useEffect(() => { setPages(doc.pages); }, [doc.pages, doc.id]);

  const handleTitleClick = (e) => {
    if (!doc?.url) return;
    if (isPdf && onOpenPdf) {
      e.preventDefault();
      onOpenPdf();
    } else if (isDoc) {
      e.preventDefault();
      window.open(officeViewerURL(doc.url), "_blank", "noopener,noreferrer");
    }
  };

  const openDefault = () => {
    if (!doc?.url) return;
    if (isPdf && onOpenPdf) return onOpenPdf();
    if (isDoc) return window.open(officeViewerURL(doc.url), "_blank", "noopener,noreferrer");
    window.open(doc.url, "_blank", "noopener,noreferrer");
  };

  return (
    <tr className="doc-row">
      {/* Preview */}
      <td>
        <DocPreview doc={doc} onOpenPdf={onOpenPdf} onPdfPages={setPages} />
      </td>

      {/* Related (contact) */}
      <td>
        <a
          href={`/admin/students/${student?.id || ""}`}
          className="rel-link"
          onClick={(e) => e.preventDefault()}
          title="Student contact"
        >
          {fullName(student)} <span className="rel-type">(contact)</span>
        </a>
      </td>

      {/* Posted on + metadata */}
      <td>
        <div className="doc-title">
          {doc.url ? (
            <a href={doc.url} onClick={handleTitleClick} target="_blank" rel="noreferrer">
              {doc.name || "(unnamed)"}
            </a>
          ) : (
            doc.name || "(unnamed)"
          )}
        </div>

        <div className="doc-meta">
          <div><span className="meta-k">Type:</span> {isPdf ? "PDF" : isDoc ? "DOCX" : "Document"}</div>
          <div><span className="meta-k">Size:</span> {fmtBytes(doc.size)}</div>
          <div><span className="meta-k">Pages:</span> {(isPdf || isDoc) ? (pages ?? "—") : "—"}</div>
          <div>{fmtDT(doc.at)}</div>
          <div><span className="meta-k">Uploaded by</span> {doc.by || "—"}</div>
        </div>
      </td>

      {/* Kebab */}
      <td className="kebab-cell">
        <RowKebab
          items={[
            { label: "View", icon: "fa-regular fa-eye", onClick: openDefault },
            { label: "Download", icon: "fa-solid fa-download", onClick: () => downloadFile(doc.url, doc.name || "document") },
            { label: "Edit", icon: "fa-solid fa-pen-to-square", onClick: openDefault },
            { label: "Delete", icon: "fa-solid fa-trash", danger: true, onClick: onDelete },
          ]}
        />
      </td>
    </tr>
  );
}

function PhotoRow({ photo, student, onView, onDownload, onEdit, onDelete }) {
  return (
    <tr className="photo-row">
      {/* Preview */}
      <td>
        <ImageThumb item={photo} onClick={onView} />
      </td>

      {/* Related (student) */}
      <td>
        <a
          href={`/admin/students/${student?.id || ""}`}
          className="rel-link"
          onClick={(e) => e.preventDefault()}
          title="Student contact"
        >
          {fullName(student)} <span className="rel-type">(contact)</span>
        </a>
      </td>

      {/* Posted on + metadata */}
      <td>
        <div className="doc-title">
          {photo.url ? (
            <a href={photo.url} onClick={(e) => { e.preventDefault(); onView?.(); }}>
              {photo.name || "(unnamed)"}
            </a>
          ) : (
            photo.name || "(unnamed)"
          )}
        </div>

        <div className="doc-meta">
          <div><span className="meta-k">Type:</span> Photo</div>
          <div><span className="meta-k">Size:</span> {fmtBytes(photo.size)}</div>
          <div>{fmtDT(photo.at)}</div>
          <div><span className="meta-k">Uploaded by</span> {photo.by || "—"}</div>
        </div>
      </td>

      {/* Kebob */}
      <td className="kebab-cell">
        <RowKebab
          items={[
            { key: "view", label: "View", icon: "fa-regular fa-eye", onClick: onView },
            { key: "download", label: "Download", icon: "fa-solid fa-download", onClick: onDownload },
            { key: "edit", label: "Edit", icon: "fa-regular fa-pen-to-square", onClick: onEdit },
            { key: "delete", label: "Delete", icon: "fa-solid fa-trash", danger: true, onClick: onDelete },
          ]}
        />
      </td>
    </tr>
  );
}

// Replace previous ImageThumb to auto-convert HEIC previews if needed
function ImageThumb({ item, onClick }) {
  const [src, setSrc] = React.useState(item?.url);

  React.useEffect(() => {
    let cancelled = false;
    async function ensureDisplayable() {
      if (!item?.url) return;
      // Quick load test
      const test = new Image();
      test.onload = () => { if (!cancelled) setSrc(item.url); };
      test.onerror = async () => {
        if (isHeicLike(item)) {
          try {
            const res = await fetch(item.url);
            const blob = await res.blob();
            const jpeg = await convertHeicBlobToJpeg(blob);
            if (jpeg && !cancelled) setSrc(URL.createObjectURL(jpeg));
          } catch {}
        }
      };
      test.src = item.url;
    }
    setSrc(item?.url);
    ensureDisplayable();
    return () => { cancelled = true; };
  }, [item]);

  return (
    <button className="thumb thumb-btn" onClick={onClick} title="View">
      {src ? <img src={src} alt={item?.name || "photo"} /> : <span className="thumb-skel" />}
    </button>
  );
}

function DocPreview({ doc, onOpenPdf, onPdfPages }) {
  const pdf = isPDF(doc);
  const img = isImage(doc);
  const docx = isDocx(doc);

  const [thumb, setThumb] = useState(null);
  const [thumbErr, setThumbErr] = useState(false);
  const [docxReady, setDocxReady] = useState(false);
  const [docxErr, setDocxErr] = useState(false);
  const boxRef = React.useRef(null);
  const docxMountRef = React.useRef(null);

  // PDF -> render first page to canvas
  useEffect(() => {
    let cancelled = false;
    if (!pdf || !doc?.url) return;
    setThumb(null);
    setThumbErr(false);
    // NEW: reset pages while loading
    if (typeof onPdfPages === "function") onPdfPages(undefined);

    (async () => {
      try {
        const { pdfjsLib, workerOk } = await ensurePdfWorker();
        // Show “loading” state upstream if you want:
        if (typeof onPdfPages === "function") onPdfPages(undefined);

        const loadingTask = pdfjsLib.getDocument({
          url: doc.url,
          // These reduce eval/font face warnings in strict CSPs and sometimes help in weird envs
          isEvalSupported: false,
          disableFontFace: true,
          // If your storage blocks Range requests, this avoids them:
          disableRange: true,
          // Respect worker availability
          disableWorker: !workerOk,
          // If you need credentials, set withCredentials: true (only if your CORS allows it)
          // withCredentials: true,
        });

        const pdfDoc = await loadingTask.promise;

        // ✅ Page count
        if (typeof onPdfPages === "function") onPdfPages(pdfDoc.numPages || 1);

        const page = await pdfDoc.getPage(1);
        // CSS target size (keeps existing thumb box 100x120)
        const targetW = 100, targetH = 120;
        const vp0 = page.getViewport({ scale: 1 });

        // Scale the PDF page to fit inside the target box
        const cssScale = Math.min(targetW / vp0.width, targetH / vp0.height);

        // Render at devicePixelRatio for crispness on Retina/HiDPI
        const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
        const viewport = page.getViewport({ scale: cssScale });

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        // Backing store at DPR size; display size remains ~100x120
        canvas.width = Math.ceil(viewport.width * dpr);
        canvas.height = Math.ceil(viewport.height * dpr);
        canvas.style.width = `${Math.ceil(viewport.width)}px`;
        canvas.style.height = `${Math.ceil(viewport.height)}px`;
        // Scale drawing operations by DPR so text/lines are sharp
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        await page.render({ canvasContext: ctx, viewport, intent: "display" }).promise;
        if (!cancelled) setThumb(canvas.toDataURL("image/png"));
      } catch (err) {
        console.warn("[PDF thumb/pagecount] failed:", err, doc?.url);
        if (!cancelled) {
          setThumbErr(true);
          // Keep pages as "—"
          if (typeof onPdfPages === "function") onPdfPages(undefined);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [pdf, doc?.url]);

  // DOCX -> render HTML into the thumb box using docx-preview
  useEffect(() => {
    let cancelled = false;
    setDocxReady(false);
    setDocxErr(false);
    (async () => {
      if (!docx || !doc?.url || !docxMountRef.current || !boxRef.current) return;
      // Reset page count when loading DOCX
      if (typeof onPdfPages === "function") onPdfPages(undefined);
      try {
        const mod = await loadDocxPreviewFromCDN(); // window.docx
        if (cancelled) return;

        // fetch as ArrayBuffer (requires CORS on bucket)
        const res = await fetch(doc.url, { mode: "cors" });
        const buf = await res.arrayBuffer();

        // Try to read page count from docProps/app.xml inside the .docx (ZIP)
        try {
          const JSZipMod = await import("jszip");
          const JSZip = JSZipMod.default || JSZipMod;
          const zip = await JSZip.loadAsync(buf);
          const appXmlFile = zip.file("docProps/app.xml");
          if (appXmlFile) {
            const appXml = await appXmlFile.async("string");
            const m = appXml.match(/<Pages>(\d+)<\/Pages>/i);
            if (m && m[1]) {
              const pages = parseInt(m[1], 10);
              if (!Number.isNaN(pages) && typeof onPdfPages === "function") onPdfPages(pages);
            }
          }
        } catch (_) {
          // ignore if jszip is not present or file missing; page count will stay as "—"
        }

        // clean previous
        docxMountRef.current.innerHTML = "";
        const container = document.createElement("div");
        container.className = "docx-thumb";
        docxMountRef.current.appendChild(container);

        // render
        await mod.renderAsync(
          buf,
          container,
          null,
          { inWrapper: false, ignoreWidth: true, ignoreHeight: true, className: "docx-thumb-inner" }
        );
        if (cancelled) return;

        // fit to 100x120 by scaling the produced content
        requestAnimationFrame(() => {
          try {
            const host = boxRef.current;
            const targetW = host.clientWidth || 100;
            const targetH = host.clientHeight || 120;
            const child = container.firstElementChild || container;
            const rect = child.getBoundingClientRect();
            const w = rect.width || 1;
            const h = rect.height || 1;
            const scale = Math.min(targetW / w, targetH / h);
            child.style.transformOrigin = "top left";
            child.style.transform = `scale(${scale})`;
            setDocxReady(true);
          } catch {
            setDocxReady(true);
          }
        });
      } catch (e) {
        if (!cancelled) {
          setDocxReady(false);
          setDocxErr(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [docx, doc?.url]);

  const open = () => {
    if (pdf && onOpenPdf) onOpenPdf();
    else if (docx && doc?.url) window.open(officeViewerURL(doc.url), "_blank", "noopener,noreferrer");
    else if (doc?.url) window.open(doc.url, "_blank", "noopener,noreferrer");
  };

  if (img && !pdf) return <ImageThumb item={doc} onClick={open} />;
  if (pdf) {
    return (
      <button className="thumb thumb-btn" onClick={open} title="View PDF">
        {thumb ? (
          <img src={thumb} alt={doc.name || "PDF preview"} />
        ) : thumbErr ? (
          <div className="thumb icon"><i className="fa-regular fa-file-pdf" /></div>
        ) : (
          <span className="thumb-skel" />
        )}
      </button>
    );
  }
  if (docx) {
    return (
      <button className="thumb thumb-btn" onClick={open} title="View DOCX">
        <div ref={boxRef} className="docx-thumb-host">
          <div ref={docxMountRef} className="docx-thumb-mount" />
          {docxReady ? null : docxErr ? (
            <div className="thumb icon"><i className="fa-regular fa-file-word" /></div>
          ) : (
            <span className="thumb-skel" />
          )}
        </div>
      </button>
    );
  }
  return (
    <div className="thumb icon">
      <i className="fa-regular fa-file" />
    </div>
  );
}

// Simple draggable + resizable Image window (matches PdfWindow UX)
function ImageWindow({ doc, onClose }) {
  const wrapRef = React.useRef(null);
  const bodyRef = React.useRef(null);

  const [isMax, setIsMax] = React.useState(false);
  const [isMin, setIsMin] = React.useState(false);
  const [topOffset, setTopOffset] = React.useState(0);

  // --- NEW: Image fit/zoom state and refs ---
  const [fit, setFit] = React.useState(true);
  const [scale, setScale] = React.useState(1);
  const [imgDims, setImgDims] = React.useState({ w: 0, h: 0 });
  const imgRef = React.useRef(null);
  const clamp = (n, min = 0.25, max = 6) => Math.max(min, Math.min(max, n));
  const zoomIn = () => { setFit(false); setScale((s) => clamp(s * 1.2)); };
  const zoomOut = () => { setFit(false); setScale((s) => clamp(s / 1.2)); };
  const zoomReset = () => { setFit(false); setScale(1); };
  const setFitMode = () => setFit(true);

  // --- Measure fixed header so maximized window never covers it ---
  const measureHeader = React.useCallback(() => {
    let h = 0;

    // Optional CSS var override: :root { --app-header-h: 64px; }
    const varVal = getComputedStyle(document.documentElement)
      .getPropertyValue("--app-header-h")
      .trim();
    if (varVal) {
      const n = parseInt(varVal, 10);
      if (!Number.isNaN(n)) h = Math.max(h, n);
    }

    // Try some common selectors (add data-app-header to yours for reliability)
    const candidates = ["[data-app-header]", ".topbar", ".app-header", "header", "nav"];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const cs = getComputedStyle(el);
      const fixedish = cs.position === "fixed" || cs.position === "sticky";
      if (!fixedish) continue;
      const rect = el.getBoundingClientRect();
      h = Math.max(h, Math.ceil(rect.bottom));
      break;
    }
    setTopOffset(h);
  }, []);

  React.useLayoutEffect(() => {
    measureHeader();
    window.addEventListener("resize", measureHeader);
    return () => window.removeEventListener("resize", measureHeader);
  }, [measureHeader]);

  // ---------- positions & sizes ----------
  const baseStyle = {
    width: 820,
    height: 560,
    left: "calc(50% - 410px)",
    top: Math.max(10, topOffset + 10),
  };

  const maxStyle = {
    width: "calc(100vw - 40px)",
    height: `calc(100vh - ${topOffset}px - 20px)`,
    left: 20,
    top: Math.max(0, topOffset + 10),
  };

  const minStyle = {
    width: 420,
    height: 52,
    right: 20,
    bottom: 20,
    left: "auto",
    top: "auto",
  };

  const style = isMax ? maxStyle : isMin ? minStyle : baseStyle;

  // ---------- drag (by header) ----------
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const head = el.querySelector(".pdf-win-head"); // reuse same class styling
    if (!head) return;

    let dragging = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;

    const onDown = (e) => {
      // ignore drags when clicking action buttons
      if (e.button !== 0) return;
      if (e.target.closest(".icon-btn")) return;
      if (isMax || isMin) return;

      dragging = true;
      const r = el.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = r.left;
      startTop = r.top;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };

    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const nextLeft = Math.max(4, Math.min(window.innerWidth - 60, startLeft + dx));
      const nextTop  = Math.max(topOffset + 4, Math.min(window.innerHeight - 60, startTop + dy));
      Object.assign(el.style, { left: `${nextLeft}px`, top: `${nextTop}px` });
    };

    const onUp = () => {
      dragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    head.addEventListener("mousedown", onDown);
    return () => head.removeEventListener("mousedown", onDown);
  }, [isMax, isMin, topOffset]);

  // ---------- resize (bottom-right handle) ----------
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const grip = el.querySelector(".pdf-win-resizer");
    if (!grip) return;

    let resizing = false;
    let startX = 0, startY = 0;
    let startW = 0, startH = 0;

    const onDown = (e) => {
      if (e.button !== 0) return;
      if (isMax || isMin) return;

      resizing = true;
      const r = el.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startW = r.width;
      startH = r.height;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };

    const onMove = (e) => {
      if (!resizing) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const nextW = Math.max(420, Math.min(window.innerWidth - 40, startW + dx));
      const nextH = Math.max(280, Math.min(window.innerHeight - topOffset - 40, startH + dy));
      Object.assign(el.style, { width: `${nextW}px`, height: `${nextH}px` });
    };

    const onUp = () => {
      resizing = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    grip.addEventListener("mousedown", onDown);
    return () => grip.removeEventListener("mousedown", onDown);
  }, [isMax, isMin, topOffset]);

  // ---------- header (shared with PdfWindow look) ----------
  const Head = (
    <div className="pdf-win-head">
      <div className="title" title={doc?.name || "Image"}>
        <i className="fa-regular fa-image" /> {doc?.name || "Image"}
      </div>
      <div className="actions">
        {/* Minimize / restore */}
        <button
          className="icon-btn"
          onClick={() => { setIsMax(false); setIsMin(v => !v); }}
          title={isMin ? "Restore" : "Minimize"}
        >
          <i className="fa-solid fa-window-minimize" />
        </button>

        {/* Maximize / restore */}
        <button
          className="icon-btn"
          onClick={() => { setIsMin(false); setIsMax(v => !v); }}
          title={isMax ? "Restore" : "Maximize"}
        >
          <i className="fa-regular fa-window-maximize" />
        </button>

        {/* Fit to window */}
        <button className="icon-btn" onClick={setFitMode} title="Fit to window">
          <i className="fa-solid fa-expand" />
        </button>

        {/* Actual size (100%) */}
        <button className="icon-btn" onClick={zoomReset} title="Actual size (100%)">
          <i className="fa-regular fa-square" />
        </button>

        {/* Zoom out / Zoom in */}
        <button className="icon-btn" onClick={zoomOut} title="Zoom out">
          <i className="fa-solid fa-magnifying-glass-minus" />
        </button>
        <button className="icon-btn" onClick={zoomIn} title="Zoom in">
          <i className="fa-solid fa-magnifying-glass-plus" />
        </button>

        {/* Close */}
        <button className="icon-btn" onClick={onClose} title="Close">
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  // Minimized: no overlay so the rest of the page is fully interactive
  if (isMin) {
    return createPortal(
      <div className="pdf-win min" ref={wrapRef} style={style}>
        {Head}
        <div className="pdf-win-body" />
        <div className="pdf-win-resizer" />
      </div>,
      document.body
    );
  }

  // Normal/Max: overlay starts *below* the fixed header
  return createPortal(
    <div className="pdf-win-overlay" style={{ top: topOffset, left: 0, right: 0, bottom: 0 }}>
      <div className={`pdf-win ${isMax ? "max" : ""}`} ref={wrapRef} style={style}>
        {Head}
        <div
          ref={bodyRef}
          className="pdf-win-body"
          style={{ overflow: "auto", background: "#0e152b" }}
        >
          {fit ? (
            // Fit-to-window mode: image scales down to fit; no cropping
            <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
              <img
                ref={imgRef}
                src={doc?.url}
                alt={doc?.name || "image"}
                onLoad={(e) => setImgDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", imageRendering: "auto", userSelect: "none", display: "block" }}
              />
            </div>
          ) : (
            // Actual-size/zoomed mode: scroll to pan when larger than window
            <div
              style={{
                width: `${Math.max(1, imgDims.w * scale)}px`,
                height: `${Math.max(1, imgDims.h * scale)}px`,
                position: "relative",
              }}
            >
              <img
                ref={imgRef}
                src={doc?.url}
                alt={doc?.name || "image"}
                onLoad={(e) => setImgDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
                style={{ width: "100%", height: "100%", display: "block", userSelect: "none" }}
              />
            </div>
          )}
        </div>
        <div className="pdf-win-resizer" />
      </div>
    </div>,
    document.body
  );
}

/* ---------- Simple draggable + resizable PDF window ---------- */
function PdfWindow({ doc, onClose }) {
  const wrapRef = React.useRef(null);
  const frameRef = React.useRef(null);

  const [isMax, setIsMax] = React.useState(false);
  const [isMin, setIsMin] = React.useState(false);

  // === NEW: compute top offset for fixed nav/header so we don't cover it ===
  const [topOffset, setTopOffset] = React.useState(0);

  const measureHeader = React.useCallback(() => {
    let h = 0;

    // 1) Allow a CSS variable override (optional)
    const varVal = getComputedStyle(document.documentElement)
      .getPropertyValue("--app-header-h")
      .trim();
    if (varVal) {
      const n = parseInt(varVal, 10);
      if (!Number.isNaN(n)) h = Math.max(h, n);
    }

    // 2) Try to find a fixed/sticky header element
    const candidates = [
     
      "[data-app-header]", // <- add this attribute to your header for reliable detection
      ".topbar",
      ".app-header",
      "header",
      "nav",
    ];

    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const cs = getComputedStyle(el);
      const fixedish = cs.position === "fixed" || cs.position === "sticky";
      if (!fixedish) continue;
      const rect = el.getBoundingClientRect();
      h = Math.max(h, Math.ceil(rect.bottom));
      // first match is fine
      break;
    }

    setTopOffset(h);
  }, []);

  React.useLayoutEffect(() => {
    measureHeader();
    window.addEventListener("resize", measureHeader);
    return () => window.removeEventListener("resize", measureHeader);
  }, [measureHeader]);

  // ----------------- sizes/positions -----------------
  const baseStyle = {
    width: 800,
    height: 520,
    left: "calc(50% - 400px)",
    top: Math.max(10, topOffset + 10), // keep a little gap under the header
  };

  const maxStyle = {
    width: "calc(100vw - 40px)",
    // subtract header + margins from viewport height
    height: `calc(100vh - ${topOffset}px - 20px)`,
    left: 20,
    top: Math.max(0, topOffset + 10),
  };

  const minStyle = {
    width: 420,
    height: 52,
    right: 20,
    bottom: 20,
    left: "auto",
    top: "auto",
  };

  const style = isMax ? maxStyle : isMin ? minStyle : baseStyle;

  const Head = (
    <div className="pdf-win-head">
      <div className="title" title={doc?.name || "PDF"}>
        <i className="fa-regular fa-file-pdf" /> {doc?.name || "PDF"}
      </div>
      <div className="actions">

                {/* Minimize / restore */}
        <button
          className="icon-btn"
          onClick={() => {
            setIsMax(false);
            setIsMin((v) => !v);
          }}
          title={isMin ? "Restore" : "Minimize"}
        >
          <i className="fa-solid fa-window-minimize" />
        </button>

        {/* Maximize / restore */}
        <button
          className="icon-btn"
          onClick={() => {
            setIsMin(false);
            setIsMax((v) => !v);
          }}
          title={isMax ? "Restore" : "Maximize"}
        >
          <i className="fa-regular fa-window-maximize" />
        </button>

        {/* Close */}
        <button className="icon-btn" onClick={onClose} title="Close">
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  // When minimized, render without overlay so the page is fully interactive.
  if (isMin) {
    return createPortal(
      <div className="pdf-win min" ref={wrapRef} style={style}>
        {Head}
        <div className="pdf-win-body" />
        <div className="pdf-win-resizer" />
      </div>,
      document.body
    );
  }

  // Normal / maximized: overlay starts BELOW the fixed header via inline top offset.
   return createPortal(
    <div className="pdf-win-overlay" style={{ top: topOffset, left: 0, right: 0, bottom: 0 }}>
      <div className={`pdf-win ${isMax ? "max" : ""}`} ref={wrapRef} style={style}>
        {Head}
        <div className="pdf-win-body">
          <iframe
            ref={frameRef}
            title="PDF"
            src={`${doc?.url}#toolbar=1&view=FitH`}
            style={{ width: "100%", height: "100%", border: 0, background: "#0e152b" }}
          />
        </div>
        <div className="pdf-win-resizer" />
      </div>
    </div>,
    document.body
  );
}

/* ---------- 0–999 Service Hours Picker (creative triple-dial + slider) ---------- */
function ServiceHoursPicker({ value = 0, onChange }) {
  const clamp = (n) => Math.max(0, Math.min(999, n|0));
  const val = clamp(Number.isFinite(value) ? value : parseInt(value, 10) || 0);
  const h = Math.floor(val / 100), t = Math.floor((val % 100) / 10), o = val % 10;

  const make = (hund, ten, one) => clamp(hund * 100 + ten * 10 + one);

  const setHund = (e) => onChange?.(make(parseInt(e.target.value,10)||0, t, o));
  const setTen  = (e) => onChange?.(make(h, parseInt(e.target.value,10)||0, o));
  const setOne  = (e) => onChange?.(make(h, t, parseInt(e.target.value,10)||0));

  const bump = (d) => onChange?.(clamp(val + d));
  const setRange = (e) => onChange?.(clamp(parseInt(e.target.value, 10) || 0));

  return (
    <div className="svc-picker">
      {/* Triple dials */}
      <div className="svc-dials">
        <select aria-label="hundreds" value={h} onChange={setHund}>
          {Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <select aria-label="tens" value={t} onChange={setTen}>
          {Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <select aria-label="ones" value={o} onChange={setOne}>
          {Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <div className="svc-value" aria-live="polite">{val} hrs</div>
      </div>

      {/* Slider */}
      <input className="svc-range" type="range" min={0} max={999} value={val} onChange={setRange} />

      {/* Quick actions + numeric input */}
      <div className="svc-quick">
        <div className="svc-chips">
          <button type="button" className="chip" onClick={() => bump(-10)}>-10</button>
          <button type="button" className="chip" onClick={() => bump(-1)}>-1</button>
          <button type="button" className="chip" onClick={() => bump(+1)}>+1</button>
          <button type="button" className="chip" onClick={() => bump(+10)}>+10</button>
          <button type="button" className="chip" onClick={() => onChange?.(0)}>Reset</button>
        </div>
        <input
          className="btn svc-num"
          type="number"
          min={0}
          max={999}
          value={val}
          onChange={(e) => setRange(e)}
        />
      </div>
    </div>
  );
}

/* ---------- Program Overview Editor Modal ---------- */
function ProgramFormModal({ student, onClose, onSave }) {
  const [form, setForm] = React.useState(() => ({
    firstName: student.firstName || "",
    lastName: student.lastName || "",
    intakeDate: toISO(student.intakeDate) || "",
    exitDate: toISO(student.exitDate) || "",
    mentor: student.mentor || "",
    application: student.application || "",
    background: student.background || "",
    programPhase: student.programPhase || (student.phase ? `Phase ${student.phase}` : ""),
    durationInProgram: student.durationInProgram || "",
    employment: student.employment || "",
    readiness: student.readiness || "",
    employmentPlacement: student.employmentPlacement || "",
    workshops: student.workshops || "",
    // Normalize to a number 0-999 for the picker; we still display fine if stored as number or string elsewhere
    serviceHours: Math.max(0, Math.min(999, parseInt(String(student.serviceHours ?? 0).match(/\d+/)?.[0] ?? 0, 10))),
    celebrate: student.celebrate || "",
    healthRecovery: student.healthRecovery || "",
  }));

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  React.useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    const payload = {
      ...form,
      intakeDate: form.intakeDate || undefined,
      exitDate: form.exitDate || undefined,
    };
    onSave?.(payload);
  };

  return (
    <div className="modal show" role="dialog" aria-modal="true">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-card" style={{ width: "min(860px, 96vw)" }}>
        <div className="modal-header">
          <strong>Edit Program Overview</strong>
          <button className="icon-btn" onClick={onClose} title="Close">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {/* Name (first/last) */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>First Name</span>
            <input className="btn" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Last Name</span>
            <input className="btn" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
          </label>

          {/* Intake / Graduation dates */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Intake Date</span>
            <input className="btn" type="date" value={form.intakeDate} onChange={(e) => set("intakeDate", e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Graduation Date</span>
            <input className="btn" type="date" value={form.exitDate} onChange={(e) => set("exitDate", e.target.value)} />
          </label>

          {/* Referral from Pastor (free text: name or Yes/No) */}
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Referral from Pastor</span>
            <input className="btn" value={form.mentor} onChange={(e) => set("mentor", e.target.value)} placeholder="e.g., Pr. Lopez or Yes/No" />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Application</span>
            <input className="btn" value={form.application} onChange={(e) => set("application", e.target.value)} placeholder="Status (e.g., In progress)" />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Background</span>
            <input className="btn" value={form.background} onChange={(e) => set("background", e.target.value)} placeholder="Status" />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Program Phase</span>
            <input className="btn" value={form.programPhase} onChange={(e) => set("programPhase", e.target.value)} placeholder="Phase 1, Active" />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Duration in Program</span>
            <input className="btn" value={form.durationInProgram} onChange={(e) => set("durationInProgram", e.target.value)} placeholder="e.g., 3 days" />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Employment</span>
            <input className="btn" value={form.employment} onChange={(e) => set("employment", e.target.value)} placeholder="Yes / No / Details" />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Readiness</span>
            <select className="btn" value={form.readiness} onChange={(e) => set("readiness", e.target.value)}>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Employment Placement</span>
            <select className="btn" value={form.employmentPlacement} onChange={(e) => set("employmentPlacement", e.target.value)}>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Workshops / etc</span>
            <input className="btn" value={form.workshops} onChange={(e) => set("workshops", e.target.value)} placeholder="Notes" />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Service / Outreach Hours</span>
            <ServiceHoursPicker value={Number.isFinite(form.serviceHours) ? form.serviceHours : 0} onChange={(n) => set("serviceHours", n)} />
          </label>

          <label style={{ display: "grid", gap: 6, gridColumn: "1 / span 2" }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Things to celebrate</span>
            <textarea className="btn" rows={3} value={form.celebrate} onChange={(e) => set("celebrate", e.target.value)} placeholder="Notes" style={{ resize: "vertical" }} />
          </label>

          <label style={{ display: "grid", gap: 6, gridColumn: "1 / span 2" }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Health/Recovery Improvements & Spiritual yummies :-)</span>
            <textarea className="btn" rows={3} value={form.healthRecovery} onChange={(e) => set("healthRecovery", e.target.value)} placeholder="Notes" style={{ resize: "vertical" }} />
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 6px" }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}><i className="fa-solid fa-floppy-disk" /> Save</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- local scoped CSS ---------- */
const LOCAL_CSS = `
.btn.clickable { cursor: pointer; }
.btn.clickable:hover { cursor: pointer; filter: brightness(1.05); } /* optional hover effect */
.subnav{
  display:flex; align-items:center; gap:8px;
  padding:10px 12px; border-bottom:1px solid #1f294a;
  background: rgba(10,14,27,.35); backdrop-filter: blur(6px);
  margin-top:12px; border-radius:12px;
}
.subnav-tab{
  padding:8px 12px; border-radius:8px;
  border:1px solid #26355f; background:#0f162b; color:var(--text);
}
.subnav-tab.active{ background:#142043; border-color:#2a3c6a; font-weight:700; }

.act-toolbar{
  display:flex; align-items:center; justify-content:space-between;
  gap:12px; padding:10px 0 14px 0; border-bottom:1px solid #1f294a; margin-bottom:10px;
}
.act-toolbar .left{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.search-wrap{ display:flex; align-items:center; gap:10px; }
.search-wrap .btn{ min-width:260px; }
.check{ display:flex; align-items:center; gap:6px; color:var(--text-dim); font-size:12px; }

.mention{ color:#7db2ff; }
.byline{ font-size:12px; color:var(--text-dim); }
.rel-link{ color:#8bb4ff; text-decoration:none; }
.rel-link:hover{ text-decoration:underline; }
.rel-type{ color:var(--text-dim); font-size:12px; }
.note-kind{ font-weight:700; color:#e4ecff; margin-bottom:2px; }
.kebab-cell{ text-align:right; }
.btn.linklike{ background:transparent; border:1px solid #2a3c6a; }

.table-wrap, .table-wrap table, .kebab-cell, .kebab {
  overflow: visible !important;
  position: relative;
}
.dropdown.show {
  z-index: 10000;
  background: #0f162b;
  border: 1px solid #2a3c6a;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0,0,0,.45);
  padding: 6px;
}
.dropdown.show .item{ cursor:pointer; padding:8px 10px; border-radius:8px; display:flex; align-items:center; gap:8px; }
.dropdown.show .item:hover{ background:#142043; }
.dropdown.show .item.danger:hover{ background:#361b1b; color:#ffb4b4; }
.menu-icn{ width:16px; text-align:center; }

/* ----- Documents table layout ----- */
.docs-table thead th { background:#0f162b; }
.doc-row td { vertical-align: top; padding-top: 10px; padding-bottom: 10px; }

.thumb {
  width: 100px; height: 120px;
  border-radius: 8px; overflow: hidden;
  background: #0b1328; border:1px solid #233258;
  display:flex; align-items:center; justify-content:center;
}
.thumb img { width:100%; height:100%; object-fit: cover; }
.thumb.icon i { font-size: 28px; color:#8bb4ff; }
.thumb-btn{ padding:0; border:0; background:transparent; cursor:pointer; }
.thumb-skel{ width:100%; height:100%; background:linear-gradient(90deg,#0e1730,#0f1a36,#0e1730); animation:sh 1.1s infinite; }
@keyframes sh{ 0%{opacity:.7} 50%{opacity:1} 100%{opacity:.7} }

.doc-title a { color:#e4ecff; text-decoration:none; font-weight:700; }
.doc-title a:hover { text-decoration:underline; }
.doc-meta { margin-top: 4px; color: var(--text-dim); font-size: 12px; display:grid; gap:2px; }
.doc-meta .meta-k { color:#9fb4de; margin-right:.25rem; }

/* small icon button */
.icon-btn.sm, .pdf-win-head .icon-btn{
  width:30px; height:30px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center;
  border:1px solid #2a3c6a; background:#0f162b; color:var(--text);
}

/* pointer finger on hover */
.clickable       { cursor: pointer; }
.clickable:hover { cursor: pointer; }

/* optional hover styling */
.clickable:hover {
  filter: brightness(1.05);
  /* or background/border tweaks if you like */
}

/* NEW: mention popover for NoteModal */
.mention-pop{
  position:absolute;
  left:6px;
  bottom:8px;
  transform: translateY(100%);
  width:min(360px, 80%);
  background: #0f162b;
  border: 1px solid #2a3c6a;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0,0,0,.45);
  padding: 6px;
  z-index: 50;
}
.m-item{
  display:flex; align-items:center; gap:8px;
  padding:6px 8px; border-radius:8px; cursor:pointer;
}
.m-item:hover, .m-item.active{ background:#142043; }
.m-avatar{
  width:24px; height:24px; border-radius:50%;
  display:grid; place-items:center;
  background:#13254a; border:1px solid #2a3c6a;
  color:#cfe0ff; font-weight:800; font-size:12px;
}
.m-name{ color:var(--text); }

/* ---- Floating Document/Image Viewer (overlay + window) ---- */
.pdf-win-overlay{
  position: fixed;
  /* top is set inline from React to avoid covering the fixed header */
  left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,.45);
  backdrop-filter: blur(2px);
  z-index: 5000;
}

/* Main window container (absolute so we can drag it around) */
.pdf-win{
  position: absolute;
  background: #0f162b;
  border: 1px solid #2a3c6a;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,.45);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Minimized window bar (no overlay) */
.pdf-win.min{
  position: fixed;
  background: #0f162b;
  border: 1px solid #2a3c6a;
  border-radius: 10px;
  box-shadow: 0 14px 40px rgba(0,0,0,.35);
  overflow: hidden;
  z-index: 5000;
}

/* Header (drag zone) */
.pdf-win-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap: 8px;
  padding: 8px 10px;
  background: linear-gradient(0deg,#0d1225,#0f152b);
  border-bottom: 1px solid #1f294a;
  cursor: move;
}
.pdf-win-head .title{
  display:flex; align-items:center; gap:8px;
  font-weight: 800; color: #e8ecff;
}
.pdf-win-head .actions{
  display:flex; align-items:center; gap:6px;
}

/* Body (iframe/img) */
.pdf-win-body{
  position: relative;
  flex: 1;
  background: #0e152b;
  overflow: hidden;
}

/* Resizer handle (bottom-right) */
.pdf-win-resizer{
  position:absolute;
  right: 8px; bottom: 8px;
  width: 14px; height: 14px;
  border-radius: 3px;
  background: linear-gradient(135deg,#2a3c6a 0%, #3b4e86 100%);
  border: 1px solid #2a3c6a;
  box-shadow: 0 2px 6px rgba(0,0,0,.25);
  cursor: nwse-resize;
}

/* Optional: icon color */
.pdf-win-head i{ color:#9fb4de; }

/* Keep dropdowns above the viewer too */
.dropdown.show{ z-index: 10000; }

/* Light mode overrides: align component-scoped colors to theme variables */
:root[data-theme="light"] .dropdown.show{
  background: var(--panel);
  border-color: var(--stroke);
}
:root[data-theme="light"] .docs-table thead th{
  background: var(--panel);
}
:root[data-theme="light"] .thumb{
  background: var(--panel-2);
  border-color: var(--stroke);
}
:root[data-theme="light"] .icon-btn.sm,
:root[data-theme="light"] .pdf-win-head .icon-btn{
  background: var(--panel);
  border-color: var(--stroke);
}
:root[data-theme="light"] .mention-pop{
  background: var(--panel);
  border-color: var(--stroke);
}
:root[data-theme="light"] .pdf-win,
:root[data-theme="light"] .pdf-win.min{
  background: var(--panel);
  border-color: var(--stroke);
}
:root[data-theme="light"] .pdf-win-head{
  background: var(--panel-2);
  border-bottom-color: var(--stroke);
}
:root[data-theme="light"] .pdf-win-body{
  background: var(--panel-2);
}
:root[data-theme="light"] .btn.linklike{
  border-color: var(--stroke);
}
:root[data-theme="light"] .dropdown.show .item:hover{
  background: color-mix(in oklab, var(--panel-2), white 8%);
}
`;
// DOCX thumbnail CSS
const DOCX_THUMB_CSS = `
.docx-thumb-host{width:100px;height:120px;overflow:hidden;background:var(--panel,#0f162b);border-radius:8px;display:grid;place-items:center;position:relative}
.docx-thumb-host .docx-thumb{transform-origin:top left}
.docx-thumb-host .thumb-skel{width:80px;height:100px;background:#1a2546;border-radius:6px;display:block}
`;