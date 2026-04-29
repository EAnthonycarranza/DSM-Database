// src/pages/StudentProfile.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import {
  FaArrowLeft, FaEllipsisV, FaUser, FaEnvelope, FaPhone,
  FaCalendarAlt, FaHistory, FaFileAlt, FaImages, FaClipboardList,
  FaPlus, FaEdit, FaTrash, FaCheckCircle, FaClock, FaUserClock,
  FaShieldAlt, FaKey, FaSync, FaSignOutAlt, FaChevronRight, FaPenNib,
  FaGraduationCap, FaBed, FaUsers, FaUpload, FaDownload, FaStickyNote,
  FaFilePdf, FaFileImage, FaFileWord, FaFile, FaEye, FaTimes,
  FaMapMarkerAlt, FaCopy, FaRandom, FaEyeSlash, FaInbox, FaExclamationTriangle
} from "react-icons/fa";

import * as pdfjsLib from "pdfjs-dist";

// Set worker for pdfjs
const PDFJS_VERSION = pdfjsLib.version || "5.4.54";
const PDFJS_MAJOR = parseInt(PDFJS_VERSION.split(".")[0], 10) || 5;
const WORKER_EXT = PDFJS_MAJOR >= 4 ? "mjs" : "js";
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.${WORKER_EXT}`;

// Escape HTML and highlight @mentions with a styled span.
function escHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function highlightMentions(text, users) {
  if (!text) return "";
  const safe = escHtml(text);
  return safe.replace(/@(\w+)/g, (match, username) => {
    const u = users.find(
      (x) => (x.name || "").replace(/\s/g, "").toLowerCase().startsWith(String(username).toLowerCase())
    );
    // STRICT ADMIN MENTION ONLY
    if (u && String(u.role || "").toLowerCase() === "admin") {
      const first = (u.name || "").split(" ")[0];
      return `<span class="eng-mention">@${first}</span>`;
    }
    return match;
  });
}

const AVATAR_COLORS = [
  "#6366f1", "#8b5cf6", "#3b82f6", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#a855f7", "#14b8a6",
];

function avatarColor(str) {
  let h = 0;
  for (let i = 0; i < (str || "").length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function PdfThumbnail({ url }) {
  const [thumb, setThumb] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const generate = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: 0.3 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport }).promise;
        if (cancelled) return;
        setThumb(canvas.toDataURL());
      } catch (err) {
        console.error("Thumbnail error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    generate();
    return () => { cancelled = true; };
  }, [url]);

  if (loading) return <div className="thumb-loader"><FaSync className="spin" /></div>;
  if (!thumb) return <FaFilePdf className="pdf" />;
  return <img src={thumb} alt="PDF Preview" className="pdf-thumb-img" />;
}

function EnvelopeSection({ title, icon, envelopes, type, studentId, navigate }) {
  if (envelopes.length === 0) return null;
  return (
    <div className={`env-section ${type}`}>
      <div className="env-section-head">
        <span className="icon">{icon}</span>
        <h4>{title}</h4>
        <span className="env-count">{envelopes.length}</span>
      </div>
      <div className="env-section-list">
        {envelopes.map(env => (
          <div key={env.id} className="env-row" onClick={() => {
            const basePath = env.kind === 'form' ? '/admin/form' : '/admin/document';
            navigate(`${basePath}/${env.kind === 'form' ? env.formId : ''}?envelopeId=${env.id}`);
          }}>
            <div className="env-row-icon">
              {env.kind === 'form' ? <FaClipboardList /> : <FaFilePdf />}
            </div>
            <div className="env-row-info">
              <div className="env-row-subject">{env.subject}</div>
              <div className="env-row-meta">
                {new Date(env.createdAt).toLocaleDateString()} • {env.kind === 'form' ? 'Web Form' : 'PDF Document'}
              </div>
            </div>
            <div className="env-row-status">
               {type === 'completed' ? (
                 <span className="env-badge completed">Completed</span>
               ) : (
                 <span className="env-badge pending">Pending</span>
               )}
            </div>
            <FaChevronRight className="chevron" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StudentProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { api, data, setToast, user, setModal } = useApp();

  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("activity"); // activity | documents | photos | forms | envelopes
  const [envelopes, setEnvelopes] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [credModalOpen, setCredModalOpen] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Multi-select delete state
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const fileInputRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    setSelectedIds(new Set());
    setDeleteMode(false);
  }, [tab]);

  const toggleSelect = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleDeleteSelected = async () => {
    if (!selectedIds.size) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} item(s)?`)) return;
    
    setLoading(true);
    try {
      await Promise.all(Array.from(selectedIds).map(id => api.del("documents", id)));
      setToast({ title: "Deleted", message: `${selectedIds.size} item(s) removed.`, type: "success" });
      setSelectedIds(new Set());
      setDeleteMode(false);
    } catch (err) {
      setToast({ title: "Error", message: "Failed to delete some items.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const loadStudentData = async () => {
    if (!student) setLoading(true);
    try {
      const [s, envs] = await Promise.all([
        api.get("students", id),
        api.getAll("envelopes", { studentId: id })
      ]);
      setStudent(s);
      setEnvelopes(Array.isArray(envs) ? envs : []);
    } catch {
      if (!student) navigate("/admin/students");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudentData();
  }, [id, api, navigate]);

  const initials = useMemo(() => {
    if (!student) return "S";
    return `${student.firstName?.[0] ?? ""}${student.lastName?.[0] ?? ""}`.toUpperCase();
  }, [student]);

  const studentDocs = useMemo(() => {
    return (data.documents || []).filter(d => d.studentId === id && d.kind === 'file');
  }, [data.documents, id]);

  const studentPhotos = useMemo(() => {
    return (data.documents || []).filter(d => d.studentId === id && d.kind === 'photo');
  }, [data.documents, id]);

  const studentNotes = useMemo(() => {
    return (data.notes || []).filter(n => n.studentId === id).sort((a,b) => b.at - a.at);
  }, [data.notes, id]);

  const openPdf = (doc) => {
    setModal({
      open: true,
      type: "pdf",
      title: doc.name,
      props: { url: doc.url }
    });
  };

  const openImage = (photo) => {
    setModal({
      open: true,
      type: "image",
      title: photo.name,
      props: { url: photo.url }
    });
  };

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || !files.length) return;

    setUploading(true);
    try {
      await api.upload(files, { studentId: id, by: user?.name || user?.id || 'admin' });
      setToast({ title: "Upload Success", message: `${files.length} file(s) uploaded successfully.`, type: "success" });
    } catch (err) {
      setToast({ title: "Upload Failed", message: err.message, type: "error" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteDoc = async (docId) => {
    if (!window.confirm("Are you sure you want to delete this document?")) return;
    try {
      await api.del("documents", docId);
      setToast({ title: "Deleted", message: "Document removed successfully.", type: "success" });
    } catch (err) {
      setToast({ title: "Error", message: "Failed to delete document.", type: "error" });
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm("Delete this note?")) return;
    try {
      await api.del("notes", noteId);
      setToast({ title: "Deleted", message: "Note removed.", type: "success" });
    } catch (err) {
      setToast({ title: "Error", message: "Failed to delete note.", type: "error" });
    }
  };

  const getFileIcon = (doc) => {
    if (doc.mime?.includes('pdf')) return <PdfThumbnail url={doc.url} />;
    if (doc.mime?.includes('image')) return <FaFileImage className="img" />;
    if (doc.mime?.includes('word') || doc.mime?.includes('officedocument')) return <FaFileWord className="doc" />;
    return <FaFile />;
  };

  if (loading) return <div className="sp-loading">Analyzing profile data...</div>;
  if (!student) return null;

  return (
    <section className="sp-page fade-in">
      <style>{SP_CSS}</style>
      
      <header className="sp-header">
        <div className="sp-header-left">
          <button className="back-btn" onClick={() => navigate(-1)}><FaArrowLeft /></button>
          <div className="sp-avatar-wrap">
            <div className="sp-avatar">{initials}</div>
            <span className={`presence-indicator online`} />
          </div>
          <div className="sp-identity">
            <h1>{student.firstName} {student.lastName}</h1>
            <div className="sp-badges">
              <span className="sp-badge status">{student.status}</span>
              <span className="sp-badge phase">Phase {student.phase || 1}</span>
              {student.squad && <span className="sp-badge squad">Squad {student.squad}</span>}
            </div>
          </div>
        </div>
        <div className="sp-header-actions">
          <button className="sp-btn secondary" onClick={() => {
            setModal({
              open: true,
              type: "student",
              props: {
                existing: student,
                cardStyle: { maxWidth: "min(1100px, 95vw)" },
                onSaved: async (updated) => {
                  setStudent(updated);
                  setToast("Profile updated successfully");
                }
              }
            });
          }}><FaEdit /> Edit Profile</button>
          <div className="kebab-wrap" ref={menuRef}>
            <button className={`sp-btn-circle ${menuOpen ? 'active' : ''}`} onClick={() => setMenuOpen(!menuOpen)}>
              <FaEllipsisV />
            </button>
            {menuOpen && (
              <div className="sp-dropdown">
                <button className="item" onClick={() => { setMenuOpen(false); setCredModalOpen(true); }}>
                  <FaKey /> Manage Access
                </button>
                <button className="item" onClick={() => setMenuOpen(false)}>
                  <FaHistory /> Archive Student
                </button>
                <div className="sep" />
                <button className="item danger" onClick={() => {
                  if (window.confirm("Are you sure you want to delete this student record? This cannot be undone and will remove all associated documents and data.")) {
                    api.del("students", id).then(() => {
                      setToast({ title: "Deleted", message: "Student record removed.", type: "success" });
                      navigate("/admin/students");
                    }).catch(() => {
                      setToast({ title: "Error", message: "Failed to delete student record.", type: "error" });
                    });
                  }
                }}>
                  <FaTrash /> Delete Student
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {credModalOpen && (
        <CredentialsModal 
          student={student} 
          api={api} 
          onClose={() => setCredModalOpen(false)} 
          onSaved={async () => {
            const s = await api.get("students", id);
            setStudent(s);
            setToast("Credentials updated successfully");
          }} 
        />
      )}

      {noteModalOpen && (
        <NoteModal 
          studentId={id} 
          api={api} 
          user={user}
          onClose={() => setNoteModalOpen(false)} 
          onSaved={() => setToast("Note added successfully")} 
        />
      )}

      <div className="sp-layout">
        <aside className="sp-sidebar">
          <div className="sp-sidebar-card">
            <div className="card-head">Quick Info</div>
            <div className="info-list">
              <div className="info-item"><FaEnvelope /> <span>{student.email || 'No email'}</span></div>
              <div className="info-item"><FaPhone /> <span>{student.mobile || 'No phone'}</span></div>
              <div className="info-item"><FaBed /> <span>{student.dorm || 'Unassigned'}</span></div>
              <div className="info-item"><FaUsers /> <span>Squad {student.squad || 'None'}</span></div>
              <div className="info-item"><FaMapMarkerAlt /> <span>{student.location || 'No location'}</span></div>
              <div className="info-item"><FaStickyNote /> <span>From: {student.referralSource || 'Unknown'}</span></div>
              <div className="info-item"><FaCalendarAlt /> <span>Intake: {student.intakeDate ? new Date(student.intakeDate).toLocaleDateString() : 'N/A'}</span></div>
            </div>
          </div>

          <div className="sp-nav-wrap">
            <nav className="sp-nav">
              <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}><FaHistory /> Timeline</button>
              <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}><FaStickyNote /> Notes</button>
              <button className={tab === 'documents' ? 'active' : ''} onClick={() => setTab('documents')}><FaFileAlt /> Documents</button>
              <button className={tab === 'envelopes' ? 'active' : ''} onClick={() => setTab('envelopes')}><FaPenNib /> E-Sign</button>
              <button className={tab === 'photos' ? 'active' : ''} onClick={() => setTab('photos')}><FaImages /> Media</button>
              <button className={tab === 'forms' ? 'active' : ''} onClick={() => setTab('forms')}><FaClipboardList /> Program Data</button>
            </nav>
          </div>
        </aside>

        <main className="sp-content">
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} multiple onChange={handleFileUpload} />

          {tab === 'activity' && (
            <div className="sp-tab-card">
              <div className="card-head">
                <h3>Student Timeline</h3>
              </div>
              <div className="timeline-list">
                {studentNotes.length > 0 ? (
                  studentNotes.map(n => (
                    <div key={n.id} className="timeline-item">
                      <div className="item-icon note"><FaStickyNote /></div>
                      <div className="item-content">
                        <div className="item-head">
                          <strong>{n.by || 'Admin'}</strong>
                          <span>{new Date(n.at).toLocaleString()}</span>
                        </div>
                        <div className="text" dangerouslySetInnerHTML={{ __html: highlightMentions(n.text, data.users || []) }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="timeline-item">
                    <div className="item-icon status"><FaSync /></div>
                    <div className="item-content">
                      <div className="item-head">
                        <strong>System</strong>
                        <span>Auto-generated</span>
                      </div>
                      <p>No activity recorded yet.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'notes' && (
            <div className="sp-tab-card">
              <div className="card-head">
                <h3>Admin Notes</h3>
                <button className="sp-btn primary small" onClick={() => setNoteModalOpen(true)}><FaPlus /> Add Note</button>
              </div>
              <div className="note-list">
                {studentNotes.length > 0 ? (
                  studentNotes.map(n => (
                    <div key={n.id} className="note-entry">
                      <div className="note-header">
                        <div className="note-by"><FaUser size={10} /> {n.by}</div>
                        <div className="note-at">{new Date(n.at).toLocaleString()}</div>
                        <button className="note-del" onClick={() => handleDeleteNote(n.id)}><FaTrash /></button>
                      </div>
                      <div className="note-body" dangerouslySetInnerHTML={{ __html: highlightMentions(n.text, data.users || []) }} />
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <FaStickyNote size={48} />
                    <p>No notes for this student.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'documents' && (
            <div className="sp-tab-card">
              <div className="card-head">
                <h3>Student Documents</h3>
                <div className="card-actions">
                  {studentDocs.length > 0 && (
                    <button className={`sp-btn ${deleteMode ? 'primary' : 'secondary'} small`} onClick={() => setDeleteMode(!deleteMode)}>
                      {deleteMode ? 'Cancel' : 'Manage'}
                    </button>
                  )}
                  {deleteMode && selectedIds.size > 0 && (
                    <button className="sp-btn danger small" onClick={handleDeleteSelected}>
                      <FaTrash /> Delete ({selectedIds.size})
                    </button>
                  )}
                  {!deleteMode && (
                    <button className="sp-btn primary small" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      <FaUpload /> {uploading ? 'Uploading...' : 'Upload Doc'}
                    </button>
                  )}
                </div>
              </div>
              <div className="doc-list">
                {studentDocs.length > 0 ? (
                  studentDocs.map(doc => (
                    <div key={doc.id} className={`doc-item ${deleteMode ? 'manageable' : ''} ${selectedIds.has(doc.id) ? 'selected' : ''}`} onClick={() => deleteMode && toggleSelect(doc.id)}>
                      {deleteMode && (
                        <div className="doc-checkbox">
                          <div className={`check ${selectedIds.has(doc.id) ? 'checked' : ''}`}>
                            {selectedIds.has(doc.id) && <FaCheckCircle />}
                          </div>
                        </div>
                      )}
                      <div className="doc-icon">{getFileIcon(doc)}</div>
                      <div className="doc-info">
                        <div className="doc-name">{doc.name}</div>
                        <div className="doc-meta">
                          {new Date(doc.at).toLocaleDateString()} • {(doc.size / 1024).toFixed(1)} KB • By {doc.by}
                        </div>
                      </div>
                      {!deleteMode && (
                        <div className="doc-actions">
                          {doc.mime?.includes('pdf') && (
                            <button className="sp-btn-circle small" onClick={(e) => { e.stopPropagation(); openPdf(doc); }} title="View PDF">
                              <FaEye />
                            </button>
                          )}
                          <a href={doc.url} target="_blank" rel="noreferrer" className="sp-btn-circle small" title="Download" onClick={e => e.stopPropagation()}>
                            <FaDownload />
                          </a>
                          <button className="sp-btn-circle small danger" onClick={(e) => { e.stopPropagation(); handleDeleteDoc(doc.id); }} title="Delete">
                            <FaTrash />
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <FaFileAlt size={48} />
                    <p>No documents uploaded yet.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'photos' && (
            <div className="sp-tab-card">
              <div className="card-head">
                <h3>Media Gallery</h3>
                <div className="card-actions">
                  {studentPhotos.length > 0 && (
                    <button className={`sp-btn ${deleteMode ? 'primary' : 'secondary'} small`} onClick={() => setDeleteMode(!deleteMode)}>
                      {deleteMode ? 'Cancel' : 'Manage'}
                    </button>
                  )}
                  {deleteMode && selectedIds.size > 0 && (
                    <button className="sp-btn danger small" onClick={handleDeleteSelected}>
                      <FaTrash /> Delete ({selectedIds.size})
                    </button>
                  )}
                  {!deleteMode && (
                    <button className="sp-btn primary small" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      <FaUpload /> {uploading ? 'Uploading...' : 'Upload Photo'}
                    </button>
                  )}
                </div>
              </div>
              <div className="photo-grid">
                {studentPhotos.length > 0 ? (
                  studentPhotos.map(photo => (
                    <div key={photo.id} className={`photo-item ${deleteMode ? 'manageable' : ''} ${selectedIds.has(photo.id) ? 'selected' : ''}`} onClick={() => deleteMode && toggleSelect(photo.id)}>
                      <img src={photo.url} alt={photo.name} onClick={() => !deleteMode && openImage(photo)} style={{ cursor: deleteMode ? 'default' : 'pointer' }} />
                      
                      {deleteMode && (
                        <div className="photo-selection-overlay">
                          <div className={`check ${selectedIds.has(photo.id) ? 'checked' : ''}`}>
                            {selectedIds.has(photo.id) && <FaCheckCircle />}
                          </div>
                        </div>
                      )}

                      {!deleteMode && (
                        <div className="photo-overlay">
                          <button className="action-btn" onClick={() => openImage(photo)} title="View"><FaEye /></button>
                          <button className="action-btn danger" onClick={() => handleDeleteDoc(photo.id)} title="Delete"><FaTrash /></button>
                          <a href={photo.url} target="_blank" rel="noreferrer" className="action-btn" title="Download"><FaDownload /></a>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="empty-state grid-span">
                    <FaImages size={48} />
                    <p>No media files uploaded yet.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'envelopes' && (
            <div className="sp-tab-card">
              <div className="card-head">
                <h3><FaPenNib /> E-Sign Tracking</h3>
                <button className="sp-btn ghost small" onClick={loadStudentData}><FaSync /> Refresh</button>
              </div>
              
              <div className="envelope-sections">
                <EnvelopeSection 
                  title="Action Required by Student"
                  icon={<FaUserClock />}
                  envelopes={envelopes.filter(env => 
                    env.status !== 'completed' && 
                    (env.recipients || []).some(r => 
                      (String(r.studentId) === String(id) || String(r.id) === String(id)) && 
                      String(r.status || '').toLowerCase() !== 'completed'
                    )
                  )}
                  type="student"
                  studentId={id}
                  navigate={navigate}
                />

                <EnvelopeSection 
                  title="Action Required by Admin"
                  icon={<FaShieldAlt />}
                  envelopes={envelopes.filter(env => 
                    env.status !== 'completed' && 
                    (env.recipients || []).some(r => 
                      (String(r.role).toLowerCase() === 'admin' || !r.studentId) && 
                      String(r.status || '').toLowerCase() !== 'completed'
                    )
                  )}
                  type="admin"
                  studentId={id}
                  navigate={navigate}
                />

                <EnvelopeSection 
                  title="Completed Documents"
                  icon={<FaCheckCircle />}
                  envelopes={envelopes.filter(env => env.status === 'completed')}
                  type="completed"
                  studentId={id}
                  navigate={navigate}
                />
              </div>
            </div>
          )}

          {tab === 'forms' && (
            <div className="sp-tab-card">
              <div className="card-head"><h3><FaGraduationCap /> Program Overview</h3></div>

              <h4 style={{ margin: '8px 0 12px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)' }}>Demographics & Status</h4>
              <div className="details-grid">
                <div className="group"><label>Gender</label><div>{student.gender || 'N/A'}</div></div>
                <div className="group"><label>Record Type</label><div>{student.recordType || 'Resident'}</div></div>
                <div className="group"><label>Phase</label><div>{student.phase || '1'}</div></div>
                <div className="group"><label>Squad</label><div>{student.squad || 'None'}</div></div>
                <div className="group"><label>Dorm / Housing</label><div>{student.dorm || 'Unassigned'}</div></div>
                <div className="group"><label>Current Location</label><div>{student.location || 'N/A'}</div></div>
              </div>

              <h4 style={{ margin: '24px 0 12px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)' }}>Intake & Referral</h4>
              <div className="details-grid">
                <div className="group"><label>Intake Date</label><div>{student.intakeDate ? new Date(student.intakeDate).toLocaleDateString() : 'N/A'}</div></div>
                <div className="group"><label>Graduation Date</label><div>{student.graduationDate ? new Date(student.graduationDate).toLocaleDateString() : 'N/A'}</div></div>
                <div className="group"><label>Exit Date</label><div>{student.exitDate ? new Date(student.exitDate).toLocaleDateString() : 'N/A'}</div></div>
                <div className="group"><label>Referral Source</label><div>{student.referralSource || 'N/A'}</div></div>
                <div className="group"><label>Referral From Pastor</label><div>{student.referralFromPastor ? 'Yes' : 'No'}</div></div>
                <div className="group"><label>Mentor</label><div>{student.mentor || 'None'}</div></div>
              </div>

              <h4 style={{ margin: '24px 0 12px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)' }}>Application & Background Check</h4>
              <div className="details-grid">
                <div className="group"><label>Application Status</label><div>{student.applicationStatus || 'Not Started'}</div></div>
                <div className="group"><label>Background Check Status</label><div>{student.backgroundStatus || 'Not Started'}</div></div>
                <div className="group"><label>Has Valid ID?</label><div>{student.hasID || 'N/A'}</div></div>
                <div className="group"><label>Background Fee Charged</label><div>{student.backgroundFee ? `$${Number(student.backgroundFee).toFixed(2)}` : 'N/A'}</div></div>
                <div className="group"><label>Fee Paid Date</label><div>{student.backgroundPaidDate ? new Date(student.backgroundPaidDate).toLocaleDateString() : 'N/A'}</div></div>
              </div>

              <h4 style={{ margin: '24px 0 12px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)' }}>Employment & Engagement</h4>
              <div className="details-grid">
                <div className="group"><label>Employment Status</label><div>{student.employment || 'Unemployed'}</div></div>
                <div className="group"><label>Employment Readiness</label><div>{student.readiness || 'N/A'}</div></div>
                <div className="group"><label>Employment Placement</label><div>{student.employmentPlacement || 'N/A'}</div></div>
                <div className="group"><label>Workshops / Trainings</label><div>{student.workshops || 'None recorded'}</div></div>
                <div className="group"><label>Volunteer / Service Hours</label><div>{student.volunteerHours ? `${student.volunteerHours} hrs` : '0 hrs'}</div></div>
                <div className="group"><label>Uniform Issued</label><div>{student.uniformIssued ? 'Yes' : 'No'}</div></div>
                <div className="group"><label>Physical Fitness</label><div>{student.fitnessParticipation || 'N/A'}</div></div>
              </div>

              <h4 style={{ margin: '24px 0 12px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)' }}>Health, Recovery & Spiritual</h4>
              <div className="details-grid">
                <div className="group"><label>Referred to Clinic</label><div>{student.referredToClinic ? 'Yes' : 'No'}</div></div>
                <div className="group wide"><label>Health / Recovery Notes</label><div style={{ whiteSpace: 'pre-wrap' }}>{student.healthRecovery || 'No notes recorded.'}</div></div>
                <div className="group wide"><label>Spiritual Notes</label><div style={{ whiteSpace: 'pre-wrap' }}>{student.spiritualNotes || 'No notes recorded.'}</div></div>
                <div className="group wide"><label>Achievements / Celebrate</label><div style={{ whiteSpace: 'pre-wrap' }}>{student.celebrate || 'No recorded achievements.'}</div></div>
              </div>

              {student.dismissed && (
                <>
                  <h4 style={{ margin: '24px 0 12px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#ef4444' }}>Dismissal</h4>
                  <div className="details-grid">
                    <div className="group"><label>Dismissal Date</label><div>{student.dismissalDate ? new Date(student.dismissalDate).toLocaleDateString() : 'N/A'}</div></div>
                    <div className="group wide"><label>Reason</label><div>{student.dismissalReason || 'Not specified'}</div></div>
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </section>
  );
}

function NoteModal({ studentId, api, user, onClose, onSaved }) {
  const { data } = useApp();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef(null);

  const adminUsers = useMemo(() => 
    (data.users || []).filter(u => String(u.role || "").toLowerCase() === "admin" && u.id !== user?.id),
    [data.users, user?.id]
  );

  const mentionMatches = useMemo(() => {
    if (!showMention) return [];
    const q = (mentionQuery || "").toLowerCase();
    return adminUsers.filter(u => (u.name || "").replace(/\s/g, "").toLowerCase().startsWith(q));
  }, [showMention, mentionQuery, adminUsers]);

  const handleInput = (e) => {
    const val = e.target.value;
    setText(val);
    const caret = e.target.selectionStart || 0;
    const before = val.slice(0, caret);
    const m = before.match(/@(\w*)$/);
    if (m) {
      setShowMention(true); setMentionQuery(m[1]); setMentionIndex(0);
    } else {
      setShowMention(false); setMentionQuery("");
    }
  };

  const insertMention = (u) => {
    const first = (u.name || "").split(" ")[0];
    const el = textareaRef.current;
    const caret = el ? el.selectionStart : text.length;
    const before = text.slice(0, caret).replace(/@(\w*)$/, `@${first} `);
    const after = text.slice(caret);
    const next = before + after;
    setText(next);
    setShowMention(false);
    setMentionQuery("");
    setTimeout(() => {
      if (el) { el.focus(); const pos = before.length; el.setSelectionRange(pos, pos); }
    }, 0);
  };

  const save = async () => {
    if (!text.trim()) return alert("Note text is required");
    setSaving(true);
    try {
      await api.add("notes", {
        studentId,
        text: text.trim(),
        by: user?.name || "Admin",
        at: Date.now()
      });
      onSaved?.();
      onClose();
    } catch (e) {
      alert("Failed to add note");
    } finally { setSaving(false); }
  };

  return (
    <div className="dsm-modal-overlay">
      <div className="dsm-modal-card" style={{ maxWidth: '500px' }}>
        <div className="dsm-modal-header">
          <h3>Add Note</h3>
          <button className="dsm-close-btn" onClick={onClose}><FaTimes /></button>
        </div>
        <div className="dsm-modal-body" style={{ position: 'relative' }}>
          <textarea 
            ref={textareaRef}
            className="dsm-input" 
            style={{ width: '100%', minHeight: '150px', resize: 'vertical', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px' }}
            placeholder="Write student note here... Use @ to mention staff"
            value={text}
            onChange={handleInput}
            onKeyDown={(e) => {
              if (showMention && mentionMatches.length) {
                if (e.key === "ArrowDown") { setMentionIndex(i => (i + 1) % mentionMatches.length); e.preventDefault(); }
                if (e.key === "ArrowUp") { setMentionIndex(i => (i - 1 + mentionMatches.length) % mentionMatches.length); e.preventDefault(); }
                if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionMatches[mentionIndex]); }
                if (e.key === "Escape") setShowMention(false);
              }
            }}
            autoFocus
          />

          {showMention && mentionMatches.length > 0 && (
            <div className="eng-mention-pop" style={{ bottom: 'auto', top: '100%', left: '0', marginTop: '4px' }}>
              <div className="pop-head">Suggested Staff</div>
              {mentionMatches.slice(0, 5).map((u, idx) => (
                <div key={u.id} className={`item ${idx === mentionIndex ? "active" : ""}`} onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}>
                  <div className="av" style={{ background: avatarColor(u.id) }}>{u.initials || u.name[0]}</div>
                  <div className="info">
                    <div className="label">{u.name}</div>
                    <div className="tag">Administrator</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="dsm-modal-footer">
          <button className="dsm-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="dsm-btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save Note"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CredentialsModal({ student, api, onClose, onSaved, envelopes = [] }) {
  const { data, setToast } = useApp();

  // Find any existing login for this student in the users collection
  const existingUser = useMemo(() => {
    const arr = Array.isArray(data?.users) ? data.users : [];
    return arr.find(u => String(u.studentId || "") === String(student.id)) || null;
  }, [data?.users, student.id]);

  // Suggested default username (firstname + lastname, lowercased)
  const suggestedUsername = useMemo(() => {
    const raw = `${student.firstName || ""}${student.lastName || ""}`
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    return raw || `student${String(student.id || "").slice(0, 6)}`;
  }, [student.firstName, student.lastName, student.id]);

  const [form, setForm] = useState({
    username: existingUser?.username || student.username || suggestedUsername,
    email: existingUser?.email || student.email || "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastResult, setLastResult] = useState(null); // { username, password, action }
  const [error, setError] = useState("");

  // Dashboard-reflection: summarise what the student would see
  const dashboardSummary = useMemo(() => {
    const me = (env) => env.recipients?.find(r =>
      String(r.studentId || r.id) === String(student.id) ||
      String(r.userId) === String(existingUser?.id || "")
    );
    const pending = envelopes.filter(e => {
      const s = String(me(e)?.status || "pending").toLowerCase();
      return ["pending", "viewed", "in-progress"].includes(s);
    }).length;
    const completed = envelopes.filter(e => String(me(e)?.status || "").toLowerCase() === "completed").length;
    return { pending, completed, total: envelopes.length };
  }, [envelopes, student.id, existingUser?.id]);

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    let p = "";
    for (let i = 0; i < 12; i++) p += chars[Math.floor(Math.random() * chars.length)];
    setForm(f => ({ ...f, password: p }));
    setShowPassword(true);
  };

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text || "");
      setToast?.(`${label} copied to clipboard`);
    } catch {
      setToast?.({ type: "error", text: "Copy failed" });
    }
  };

  const save = async () => {
    setError("");
    const username = form.username.trim();
    if (!username) { setError("Username is required"); return; }
    if (!existingUser && !form.password.trim()) {
      setError("Password is required for first-time setup");
      return;
    }

    setSaving(true);
    try {
      // This hits POST /students/:id/credentials on the server, which creates
      // or updates a linked User record (role: student) that the
      // /auth/login endpoint used by UserLogin.jsx authenticates against.
      const resp = await api.provisionStudentLogin(student.id, {
        username,
        email: form.email.trim() || undefined,
        password: form.password.trim() || undefined,
        generate: !form.password.trim() && !existingUser,
      });

      // Refresh parent + keep modal open with confirmation so admin can copy
      setLastResult({
        username: resp?.user?.username || username,
        password: resp?.password || form.password.trim(),
        action: resp?.action || "updated",
      });
      onSaved?.();
      setToast?.(
        resp?.action === "created"
          ? "Student login provisioned"
          : "Student credentials updated"
      );
    } catch (e) {
      const msg = e?.message || "Failed to update credentials";
      setError(msg);
    } finally { setSaving(false); }
  };

  return (
    <div className="dsm-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dsm-modal-card cred-modal" style={{ maxWidth: '520px' }}>
        <div className="dsm-modal-header">
          <h3 className="cred-modal-title"><FaKey /> <span>Manage Access</span></h3>
          <button className="dsm-close-btn" onClick={onClose}><FaTimes /></button>
        </div>
        <div className="dsm-modal-body cred-body">
          {/* Current login status — reflects what UserLogin.jsx will authenticate */}
          <div className={`cred-status ${existingUser ? 'active' : 'none'}`}>
            <div className="cred-status-icon">
              {existingUser ? <FaCheckCircle /> : <FaUserClock />}
            </div>
            <div className="cred-status-body">
              <div className="cred-status-title">
                {existingUser ? "Student portal login is active" : "No portal login yet"}
              </div>
              <div className="cred-status-sub">
                {existingUser
                  ? <>Currently signs in as <strong>{existingUser.username || existingUser.email}</strong></>
                  : <>Create credentials to let {student.firstName} sign in at <code>/login</code></>}
              </div>
            </div>
          </div>

          {/* Dashboard reflection — what the student sees after logging in */}
          {existingUser && (
            <div className="cred-dash-preview">
              <div className="cred-dash-head">
                <FaInbox /> <span>What {student.firstName || "they"} will see on their dashboard</span>
              </div>
              <div className="cred-dash-stats">
                <div className="cred-stat">
                  <div className="val">{dashboardSummary.pending}</div>
                  <div className="lbl">Action required</div>
                </div>
                <div className="cred-stat">
                  <div className="val">{dashboardSummary.completed}</div>
                  <div className="lbl">Completed</div>
                </div>
                <div className="cred-stat">
                  <div className="val">{dashboardSummary.total}</div>
                  <div className="lbl">Total envelopes</div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="cred-error">
              <FaExclamationTriangle /> <span>{error}</span>
            </div>
          )}

          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>
            {existingUser
              ? <>Update the username or password used by <strong>{student.firstName} {student.lastName}</strong> on the Student Portal.</>
              : <>Set a username and password for <strong>{student.firstName} {student.lastName}</strong> to enable student dashboard access.</>}
          </p>

          <div className="cred-fields">
            <label className="dsm-label">
              <span>Username</span>
              <div className="cred-field">
                <input
                  className="dsm-input"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value.replace(/\s+/g, "") }))}
                  placeholder="e.g. jsmith24"
                  autoComplete="off"
                />
                <button type="button" className="cred-ico-btn" title="Copy username" onClick={() => copy(form.username, "Username")}>
                  <FaCopy />
                </button>
              </div>
            </label>

            <label className="dsm-label">
              <span>Email (optional)</span>
              <input
                className="dsm-input"
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="student@example.com"
                autoComplete="off"
              />
            </label>

            <label className="dsm-label">
              <span>{existingUser ? "New Password (leave blank to keep current)" : "Password"}</span>
              <div className="cred-field">
                <input
                  className="dsm-input"
                  type={showPassword ? "text" : "password"}
                  placeholder={existingUser ? "••••••••" : "Choose or generate a password"}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  autoComplete="new-password"
                />
                <button type="button" className="cred-ico-btn" title={showPassword ? "Hide" : "Reveal"} onClick={() => setShowPassword(s => !s)}>
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
                <button type="button" className="cred-ico-btn" title="Generate strong password" onClick={generatePassword}>
                  <FaRandom />
                </button>
                {form.password && (
                  <button type="button" className="cred-ico-btn" title="Copy password" onClick={() => copy(form.password, "Password")}>
                    <FaCopy />
                  </button>
                )}
              </div>
            </label>
          </div>

          {/* Post-save confirmation / shareable credential card */}
          {lastResult && (
            <div className="cred-result">
              <div className="cred-result-head">
                <FaCheckCircle /> <span>Credentials {lastResult.action}. Share with the student:</span>
              </div>
              <div className="cred-result-grid">
                <div>
                  <span className="lbl">Username</span>
                  <code>{lastResult.username}</code>
                  <button className="cred-ico-btn" onClick={() => copy(lastResult.username, "Username")}><FaCopy /></button>
                </div>
                {lastResult.password && (
                  <div>
                    <span className="lbl">Password</span>
                    <code>{lastResult.password}</code>
                    <button className="cred-ico-btn" onClick={() => copy(lastResult.password, "Password")}><FaCopy /></button>
                  </div>
                )}
                <div>
                  <span className="lbl">Login URL</span>
                  <code>{typeof window !== "undefined" ? `${window.location.origin}/login` : "/login"}</code>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="dsm-modal-footer">
          <button className="dsm-btn-ghost" onClick={onClose}>{lastResult ? "Done" : "Cancel"}</button>
          <button className="dsm-btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving..." : (existingUser ? "Update Credentials" : "Create Login")}
          </button>
        </div>
      </div>
    </div>
  );
}

const SP_CSS = `
  .sp-page { 
    width: 100%; min-height: 100%; display: flex; flex-direction: column; overflow-x: hidden; 
    background: var(--bg);
    color: var(--text);
  }
  
  .sp-header { 
    background: var(--surface); 
    border-bottom: 1px solid var(--border); 
    padding: 24px 32px; 
    display: flex; 
    align-items: center; 
    justify-content: space-between; 
    z-index: 100; 
    position: relative; 
    flex-shrink: 0;
    box-shadow: 0 4px 20px -5px rgba(0,0,0,0.05);
  }
  
  .sp-header-left { display: flex; align-items: center; gap: 24px; }
  .back-btn { 
    width: 44px; height: 44px; border-radius: 14px; 
    background: var(--surface-2); color: var(--text-muted); 
    display: grid; place-items: center; 
    transition: all 0.2s ease;
    border: 1px solid var(--border);
  }
  .back-btn:hover { background: var(--primary-soft); color: var(--primary); transform: translateX(-2px); }
  
  .sp-avatar-wrap { position: relative; }
  .sp-avatar { 
    width: 68px; height: 68px; border-radius: 22px; 
    background: linear-gradient(135deg, var(--primary), var(--brand-gold-dark, #A88A3F)); 
    color: white; display: grid; place-items: center; font-size: 26px; font-weight: 900; 
    box-shadow: 0 8px 24px -6px rgba(var(--primary-rgb), 0.4); 
    border: 2px solid var(--surface);
  }
  .presence-indicator { 
    position: absolute; bottom: -2px; right: -2px; 
    width: 20px; height: 20px; border-radius: 50%; 
    border: 4px solid var(--surface); 
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }
  .presence-indicator.online { background: var(--success); }

  .sp-identity h1 { font-size: 26px; font-weight: 900; margin: 0; color: var(--text); letter-spacing: -0.8px; }
  .sp-badges { display: flex; gap: 10px; margin-top: 8px; }
  .sp-badge { padding: 6px 12px; border-radius: 10px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
  .sp-badge.status { background: rgba(var(--primary-rgb), 0.08); color: var(--primary); border: 1px solid rgba(var(--primary-rgb), 0.1); }
  .sp-badge.phase { background: rgba(var(--accent-rgb), 0.1); color: var(--accent); border: 1px solid rgba(var(--accent-rgb), 0.15); }
  .sp-badge.squad { background: var(--surface-2); color: var(--text-muted); border: 1px solid var(--border); }

  .sp-header-actions { display: flex; gap: 14px; align-items: center; }
  .sp-btn { 
    height: 48px; padding: 0 22px; border-radius: 16px; 
    font-weight: 800; font-size: 14px; display: flex; align-items: center; gap: 10px; 
    cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
    border: 2px solid var(--border); background: var(--surface); color: var(--text); 
  }
  .sp-btn:hover { border-color: var(--primary); transform: translateY(-2px); box-shadow: var(--shadow); }
  .sp-btn.primary { background: var(--primary); border: none; color: white; box-shadow: var(--shadow-brand); }
  .sp-btn.primary:hover { filter: brightness(1.1); box-shadow: 0 12px 24px -8px rgba(var(--primary-rgb), 0.4); }
  .sp-btn.primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }
  
  .sp-btn-circle { 
    width: 48px; height: 48px; border-radius: 16px; 
    border: 2px solid var(--border); display: grid; place-items: center; 
    color: var(--text-muted); cursor: pointer; transition: all 0.3s ease; 
    background: var(--surface);
  }
  .sp-btn-circle:hover, .sp-btn-circle.active { 
    background: var(--primary-soft); 
    color: var(--primary); 
    border-color: var(--primary); 
    transform: rotate(90deg);
  }

  .sp-layout { flex: 1; display: grid; grid-template-columns: 320px 1fr; gap: 32px; padding: 40px; min-height: 0; }
  
  .sp-sidebar { display: flex; flex-direction: column; gap: 32px; }
  .sp-sidebar-card { 
    background: var(--surface); border-radius: 28px; padding: 28px; 
    border: 1px solid var(--border); box-shadow: var(--shadow-lg); 
  }
  .sp-sidebar-card .card-head { font-size: 11px; font-weight: 900; text-transform: uppercase; color: var(--primary); letter-spacing: 1.5px; margin-bottom: 24px; opacity: 0.8; }
  
  .info-list { display: flex; flex-direction: column; gap: 18px; }
  .info-item { display: flex; align-items: center; gap: 14px; font-size: 14px; font-weight: 700; color: var(--text); }
  .info-item svg { color: var(--accent); font-size: 18px; width: 20px; text-align: center; }

  .sp-nav { display: flex; flex-direction: column; gap: 8px; }
  .sp-nav button { 
    padding: 16px 24px; border-radius: 18px; display: flex; align-items: center; gap: 14px; 
    font-size: 15px; font-weight: 800; color: var(--text-muted); 
    transition: all 0.3s ease; background: transparent; border: 2px solid transparent; 
    cursor: pointer; width: 100%; text-align: left; 
  }
  .sp-nav button:hover { background: var(--surface-2); color: var(--text); transform: translateX(4px); }
  .sp-nav button.active { 
    background: var(--surface); color: var(--primary); 
    box-shadow: var(--shadow-lg); border-color: var(--primary); 
    transform: translateX(8px);
  }

  .sp-tab-card { 
    background: var(--surface); border-radius: 32px; padding: 40px; 
    border: 1px solid var(--border); box-shadow: var(--shadow-lg); 
    min-height: 500px; display: flex; flex-direction: column;
  }
  .sp-tab-card .card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 40px; }
  .sp-tab-card h3 { font-size: 20px; font-weight: 900; margin: 0; display: flex; align-items: center; gap: 14px; color: var(--text); letter-spacing: -0.5px; }

  .timeline-list { display: flex; flex-direction: column; gap: 32px; position: relative; }
  .timeline-list::before { content: ''; position: absolute; left: 24px; top: 0; bottom: 0; width: 2px; background: var(--border); opacity: 0.5; }
  .timeline-item { display: flex; gap: 24px; position: relative; }
  .item-icon { 
    width: 48px; height: 48px; border-radius: 16px; 
    display: grid; place-items: center; font-size: 16px; z-index: 1; 
    border: 4px solid var(--surface); background: var(--surface-2); color: var(--text-muted);
    box-shadow: var(--shadow);
  }
  .item-icon.note { background: var(--primary-soft); color: var(--primary); }
  .item-icon.status { background: rgba(16, 185, 129, 0.1); color: #10b981; }
  
  .item-content { flex: 1; min-width: 0; }
  .item-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .item-head strong { font-size: 15px; font-weight: 800; color: var(--text); }
  .item-head span { font-size: 12px; font-weight: 600; color: var(--text-muted); }
  .item-content .text { font-size: 15px; color: var(--text); line-height: 1.7; margin: 0; }

  .doc-list { display: flex; flex-direction: column; gap: 16px; }
  .doc-item { 
    display: flex; align-items: center; gap: 20px; padding: 20px; 
    border-radius: 20px; border: 2px solid var(--border); 
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
    background: var(--surface);
  }
  .doc-item:hover { border-color: var(--primary); background: var(--surface-2); transform: translateY(-2px); }
  .doc-icon { width: 56px; height: 56px; border-radius: 16px; background: var(--surface-2); display: grid; place-items: center; font-size: 24px; color: var(--text-muted); }
  .doc-icon .pdf { color: #ef4444; }
  .doc-icon .img { color: #10b981; }
  .doc-icon .doc { color: #3b82f6; }

  .cred-body { display: flex; flex-direction: column; gap: 20px; padding: 28px 32px !important; }
  .cred-body > p { margin: 0; font-size: 13px; color: var(--text-muted); font-weight: 600; line-height: 1.5; }

  .cred-status {
    display: flex; align-items: flex-start; gap: 14px;
    padding: 16px 18px; border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--bg);
  }
  .cred-status.active {
    background: linear-gradient(135deg, rgba(45, 95, 63, 0.06), rgba(45, 95, 63, 0.12));
    border-color: rgba(45, 95, 63, 0.25);
  }
  .cred-status.none {
    background: linear-gradient(135deg, rgba(201, 169, 97, 0.08), rgba(201, 169, 97, 0.16));
    border-color: rgba(201, 169, 97, 0.3);
  }
  :root[data-theme="dark"] .cred-status.active { background: linear-gradient(135deg, rgba(111, 178, 134, 0.1), rgba(111, 178, 134, 0.18)); border-color: rgba(111, 178, 134, 0.3); }
  :root[data-theme="dark"] .cred-status.none { background: linear-gradient(135deg, rgba(201, 169, 97, 0.1), rgba(201, 169, 97, 0.18)); border-color: rgba(201, 169, 97, 0.3); }

  .cred-status-icon {
    width: 38px; height: 38px; border-radius: 12px;
    display: grid; place-items: center; font-size: 18px; flex-shrink: 0;
  }
  .cred-status.active .cred-status-icon { background: var(--brand-forest, #2D5F3F); color: #FFFCF7; }
  .cred-status.none .cred-status-icon { background: var(--accent); color: var(--brand-burgundy, #7B1F2C); }
  :root[data-theme="dark"] .cred-status.active .cred-status-icon { background: #6FB286; color: #1A1014; }

  .cred-status-body { flex: 1; min-width: 0; }
  .cred-status-title { font-size: 14px; font-weight: 800; color: var(--text); line-height: 1.3; }
  .cred-status-sub { font-size: 12px; color: var(--text-muted); margin-top: 4px; line-height: 1.5; }
  .cred-status-sub strong { color: var(--primary); font-weight: 800; }
  .cred-status-sub code { background: rgba(0,0,0,0.05); padding: 2px 6px; border-radius: 4px; font-family: 'SF Mono', ui-monospace, monospace; font-size: 11px; }
  :root[data-theme="dark"] .cred-status-sub code { background: rgba(255,255,255,0.06); }

  /* Dashboard preview */
  .cred-dash-preview {
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--bg);
    overflow: hidden;
  }
  .cred-dash-head {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 16px;
    font-size: 11px; font-weight: 800; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 1px;
    background: var(--surface-2, var(--bg));
    border-bottom: 1px solid var(--border);
  }
  .cred-dash-head svg { color: var(--accent); font-size: 13px; }

  .cred-dash-stats {
    display: grid; grid-template-columns: repeat(3, 1fr);
    padding: 16px;
  }
  .cred-stat { text-align: center; padding: 4px 8px; }
  .cred-stat + .cred-stat { border-left: 1px solid var(--border); }
  .cred-stat .val {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 26px; font-weight: 800; color: var(--primary);
    line-height: 1;
  }
  .cred-stat .lbl {
    font-size: 10px; font-weight: 700; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 0.6px;
    margin-top: 6px;
  }

  /* Field group */
  .cred-body label.dsm-label { display: flex; flex-direction: column; gap: 8px; font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px; }
  .cred-body label.dsm-label > span:first-child { color: var(--primary); }
  .cred-fields { display: flex; flex-direction: column; gap: 16px; }
  .cred-field { position: relative; display: flex; align-items: center; }
  .cred-field .dsm-input { flex: 1; padding-right: 48px; }
  .cred-field:has(.cred-ico-btn ~ .cred-ico-btn) .dsm-input { padding-right: 110px; }
  .cred-field:has(.cred-ico-btn:nth-of-type(3)) .dsm-input { padding-right: 142px; }

  .cred-field .cred-ico-btn {
    position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
    width: 32px; height: 32px; border-radius: 8px;
    display: grid; place-items: center;
    background: transparent; color: var(--text-muted); border: none;
    cursor: pointer; transition: 0.2s;
  }
  .cred-field .cred-ico-btn:hover:not(:disabled) { background: var(--primary-soft); color: var(--primary); }
  .cred-field .cred-ico-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .cred-field .cred-ico-btn:nth-of-type(2) { right: 40px; }
  .cred-field .cred-ico-btn:nth-of-type(3) { right: 74px; }
  .cred-field .cred-ico-btn:nth-of-type(4) { right: 108px; }

  /* Error */
  .cred-error {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 14px; border-radius: 12px;
    background: rgba(176, 38, 60, 0.08);
    border: 1px solid rgba(176, 38, 60, 0.22);
    color: var(--danger);
    font-size: 13px; font-weight: 600;
  }

  /* Result card */
  .cred-result {
    margin-top: 4px;
    border-radius: 14px;
    border: 1px solid rgba(45, 95, 63, 0.25);
    background: linear-gradient(135deg, rgba(45, 95, 63, 0.06), rgba(201, 169, 97, 0.08));
    overflow: hidden;
  }
  :root[data-theme="dark"] .cred-result {
    border-color: rgba(111, 178, 134, 0.3);
    background: linear-gradient(135deg, rgba(111, 178, 134, 0.08), rgba(201, 169, 97, 0.1));
  }
  .cred-result-head {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 16px;
    font-size: 12px; font-weight: 800; color: var(--brand-forest, #2D5F3F);
    background: rgba(45, 95, 63, 0.08);
    border-bottom: 1px solid rgba(45, 95, 63, 0.18);
  }
  :root[data-theme="dark"] .cred-result-head { color: #6FB286; background: rgba(111, 178, 134, 0.12); border-bottom-color: rgba(111, 178, 134, 0.2); }
  .cred-result-head svg { font-size: 14px; }

  .cred-result-grid { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; }
  .cred-result-grid > div {
    display: grid;
    grid-template-columns: 90px 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 10px;
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .cred-result-grid .lbl {
    font-size: 10px; font-weight: 800; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 0.6px;
  }
  .cred-result-grid code {
    font-family: 'SF Mono', ui-monospace, monospace;
    font-size: 13px; font-weight: 700; color: var(--primary);
    word-break: break-all;
  }
  .cred-result-grid .cred-ico-btn {
    width: 28px; height: 28px; border-radius: 8px;
    display: grid; place-items: center;
    background: transparent; color: var(--text-muted); border: none;
    cursor: pointer; transition: 0.2s; flex-shrink: 0;
  }
  .cred-result-grid .cred-ico-btn:hover { background: var(--primary-soft); color: var(--primary); }

  @media (max-width: 480px) {
    .cred-body { padding: 20px !important; }
    .cred-dash-stats { grid-template-columns: 1fr; }
    .cred-stat + .cred-stat { border-left: none; border-top: 1px solid var(--border); padding-top: 12px; margin-top: 4px; }
    .cred-result-grid > div { grid-template-columns: 70px 1fr auto; }
  }

  /* ============================================================================
     Mobile: stack sidebar above content, horizontal nav, larger touch targets
     ============================================================================ */
  @media (max-width: 1024px) {
    .sp-layout { 
      display: flex;
      flex-direction: column;
      gap: 20px; 
      padding: 12px; 
      width: 100%;
      box-sizing: border-box;
    }
    .sp-sidebar { width: 100%; gap: 16px; }
    .sp-content { width: 100%; }
    
    .sp-nav-wrap { position: relative; width: 100%; }
    .sp-nav-wrap::after {
      content: "";
      position: absolute;
      top: 0; right: 0; bottom: 0;
      width: 40px;
      background: linear-gradient(to left, var(--bg), transparent);
      pointer-events: none;
      z-index: 2;
    }

    .sp-nav {
      flex-direction: row;
      overflow-x: auto;
      overflow-y: hidden;
      gap: 8px;
      padding: 6px 40px 6px 6px;
      background: var(--bg);
      border-radius: 16px;
      border: 1px solid var(--border);
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      scroll-snap-type: x mandatory;
    }
    .sp-nav::-webkit-scrollbar { display: none; }
    .sp-nav button {
      flex: 0 0 calc(33.33% - 12px); /* Show exactly ~3 items and a bit of the next */
      min-width: 100px;
      justify-content: center;
      padding: 10px 8px;
      font-size: 12px;
      min-height: 42px;
      white-space: nowrap;
      border-radius: 12px;
      scroll-snap-align: start;
    }
    .sp-nav button.active {
      background: var(--surface);
      color: var(--primary);
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      font-weight: 800;
    }
  }

  @media (max-width: 768px) {
    .sp-header {
      padding: 32px 20px;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 20px;
      background: #fff;
      border-bottom: 1px solid var(--border);
      width: 100%;
      box-sizing: border-box;
    }
    .sp-header-left { flex-direction: column; gap: 16px; width: 100%; align-items: center; }
    .sp-avatar { width: 80px; height: 80px; border-radius: 24px; font-size: 32px; box-shadow: 0 8px 20px rgba(99,102,241,0.2); }
    .sp-identity h1 { font-size: 22px; letter-spacing: -0.5px; margin: 0; }
    .sp-badges { justify-content: center; gap: 6px; flex-wrap: wrap; }
    .sp-badge { padding: 4px 10px; font-size: 10px; }
    
    .sp-header-actions { width: 100%; display: flex; gap: 8px; }
    .sp-header-actions .sp-btn { flex: 1; height: 48px; border-radius: 12px; font-size: 13px; justify-content: center; }
    .back-btn { position: absolute; top: 12px; left: 12px; z-index: 10; background: #f1f5f9; width: 36px; height: 36px; }
    .sp-btn-circle { height: 48px; width: 48px; border-radius: 12px; flex-shrink: 0; }

    .sp-layout { padding: 12px; gap: 20px; }
    .sp-sidebar-card { padding: 16px; border-radius: 20px; width: 100%; box-sizing: border-box; }
    .info-list { display: grid; grid-template-columns: 1fr; gap: 12px; }
    .info-item { display: flex; flex-direction: row; align-items: center; gap: 12px; font-size: 13px; }
    .info-item svg { font-size: 14px; color: var(--primary); }

    .sp-tab-card { padding: 20px 16px; border-radius: 20px; width: 100%; box-sizing: border-box; }
    .sp-tab-card .card-head { flex-direction: column; align-items: stretch; gap: 16px; margin-bottom: 24px; }
    .sp-tab-card h3 { font-size: 17px; }
    
    .details-grid { grid-template-columns: 1fr; gap: 16px; }
    .group label { font-size: 10px; margin-bottom: 2px; }
    .group div { font-size: 14px; }

    .doc-item { padding: 12px; border-radius: 16px; }
    .doc-icon { width: 44px; height: 44px; border-radius: 12px; }
    
    .photo-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 8px; }
    .photo-item { border-radius: 14px; }
  }

  @media (max-width: 480px) {
    .sp-header { padding: 24px 16px; }
    .sp-avatar { width: 64px; height: 64px; }
    .sp-identity h1 { font-size: 18px; }
    .sp-tab-card { padding: 16px; }
    .info-item { font-size: 12px; }
  }
`;
