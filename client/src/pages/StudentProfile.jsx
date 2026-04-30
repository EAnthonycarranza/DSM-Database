// src/pages/StudentProfile.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
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
import { FaInfoCircle, FaFolderOpen, FaSignature, FaImage } from "react-icons/fa";

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
                {new Date(env.createdAt).toLocaleDateString()} • {env.kind === 'form' ? 'Web Form' : 'PDF Document'}{env.by ? ` • By ${env.by}` : ''}
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
  const [tab, setTab] = useState("activity"); // activity | documents | media | program | esign
  const [envelopes, setEnvelopes] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [credModalOpen, setCredModalOpen] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  // Multi-select delete state
  const [deleteMode, setDeleteMode] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmModal, setConfirmModal] = useState({ open: false, title: "", message: "", onConfirm: null, loading: false });

  const showConfirm = (title, message, onConfirm) => {
    setConfirmModal({ open: true, title, message, onConfirm, loading: false });
  };

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

  const handleDeleteSelected = () => {
    if (!selectedIds.size) return;
    showConfirm(
      "Delete Selected Items",
      `Are you sure you want to delete ${selectedIds.size} item(s)? This action cannot be undone.`,
      async () => {
        await Promise.all(Array.from(selectedIds).map(id => api.del("documents", id)));
        setToast({ title: "Deleted", message: `${selectedIds.size} item(s) removed.`, type: "success" });
        setSelectedIds(new Set());
        setDeleteMode(false);
      }
    );
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

    const closeAll = () => {
      setActiveMenuId(null);
      setMenuOpen(false);
    };
    window.addEventListener("click", closeAll);
    return () => window.removeEventListener("click", closeAll);
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

  const handleDeleteDoc = (docId) => {
    showConfirm(
      "Confirm Deletion",
      "Are you sure you want to delete this document? This action cannot be undone.",
      async () => {
        await api.del("documents", docId);
        setToast({ title: "Deleted", message: "Document removed successfully.", type: "success" });
      }
    );
  };

  const handleDeleteNote = (noteId) => {
    showConfirm(
      "Delete Note",
      "Are you sure you want to delete this note? This will remove it permanently.",
      async () => {
        await api.del("notes", noteId);
        setToast({ title: "Deleted", message: "Note removed.", type: "success" });
      }
    );
  };

  const handleDownloadAll = async (items) => {
    if (!items || !items.length) return;
    setToast({ title: "Downloading", message: `Zipping ${items.length} file(s)...`, type: "info" });
    
    try {
      const zip = new JSZip();
      const folderName = `${student?.firstName ?? "student"}_${student?.lastName ?? "files"}_${tab}`;
      const folder = zip.folder(folderName);

      await Promise.all(items.map(async (item) => {
        try {
          // Use our server proxy to avoid CORS issues when fetching from GCS
          const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(item.url)}`;
          const response = await fetch(proxyUrl);
          if (!response.ok) throw new Error("Proxy response was not ok");
          const blob = await response.blob();
          
          // Use original name or fallback
          let fileName = item.name || `file_${item.id}`;
          // Ensure extension if missing
          if (!fileName.includes(".") && item.mime) {
            const ext = item.mime.split("/")[1]?.toLowerCase();
            if (ext) fileName += `.${ext}`;
          }
          
          folder.file(fileName, blob);
        } catch (e) {
          console.warn(`Failed to include file in zip: ${item.url}`, e);
        }
      }));

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${folderName}.zip`);
      setToast({ title: "Success", message: "Archive created and download started.", type: "success" });
    } catch (err) {
      console.error("Zip error:", err);
      setToast({ title: "Download Failed", message: "Could not create zip archive.", type: "error" });
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
            <div className="sp-avatar">{student.firstName?.[0]}{student.lastName?.[0]}</div>
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
          <div className="action-menu-wrap" ref={menuRef}>
            <button className={`sp-btn-circle ${menuOpen ? 'active' : ''}`} onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}>
              <FaEllipsisV />
            </button>
            {menuOpen && (
              <div className="action-dropdown" style={{ top: '100%', right: 0, marginTop: '12px' }}>
                <button className="item" onClick={() => {
                  setMenuOpen(false);
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
                }}>
                  <FaEdit /> Edit Student
                </button>
                <button className="item" onClick={() => { setMenuOpen(false); setCredModalOpen(true); }}>
                  <FaKey /> Manage Access
                </button>
                <button className="item" onClick={() => setMenuOpen(false)}>
                  <FaHistory /> Archive Student
                </button>
                <div className="sep" />
                <button className="item danger" onClick={() => {
                  setMenuOpen(false);
                  showConfirm(
                    "Delete Student Record",
                    "Are you sure you want to delete this student record? This cannot be undone and will remove all associated documents and data.",
                    async () => {
                      await api.del("students", id);
                      setToast({ title: "Deleted", message: "Student record removed.", type: "success" });
                      navigate("/admin/students");
                    }
                  );
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
          existing={editingNote}
          onClose={() => { setNoteModalOpen(false); setEditingNote(null); }} 
          onSaved={() => { setToast("Note saved successfully"); setEditingNote(null); }} 
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
              <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}><FaHistory /> Activity</button>
              <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}><FaStickyNote /> Notes</button>
              <button className={tab === 'documents' ? 'active' : ''} onClick={() => setTab('documents')}><FaFolderOpen /> Documents</button>
              <button className={tab === 'esign' ? 'active' : ''} onClick={() => setTab('esign')}><FaSignature /> E-Sign</button>
              <button className={tab === 'media' ? 'active' : ''} onClick={() => setTab('media')}><FaImage /> Media</button>
              <button className={tab === 'program' ? 'active' : ''} onClick={() => setTab('program')}><FaClipboardList /> Program Data</button>
            </nav>
          </div>
        </aside>

        <main className="sp-content">
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} multiple onChange={handleFileUpload} />

          {tab === 'details' && (
            <div className="sp-tab-card details-center-view">
              <div className="card-head">
                <h3>Quick Info</h3>
              </div>
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
          )}

          {tab === 'activity' && (
            <div className="sp-tab-card doc-center-view activity-center-view">
              <div className="card-head">
                <div className="ch-left">
                  <h3>Activity</h3>
                </div>
                <div className="card-actions">
                  <div className="ch-filters">
                    <select className="dsm-input small" disabled><option>User Created</option></select>
                    <div className="ch-search-wrap">
                      <FaEye className="search-ico" />
                      <input type="text" placeholder="Search notes, emails, etc..." className="dsm-input small" />
                    </div>
                  </div>
                  <button className="sp-btn primary small" onClick={() => setNoteModalOpen(true)}><FaPlus /> Add note</button>
                </div>
              </div>

              <div className="act-table-header">
                <div className="th-col posted">Posted on</div>
                <div className="th-col related">Related</div>
                <div className="th-col text">Text</div>
                <div className="th-col actions"></div>
              </div>

              <div className="act-list-rows">
                {studentNotes.length > 0 ? (
                  studentNotes.map(n => (
                    <div key={n.id} className="act-row-item">
                      <div className="act-mobile-icon"><FaStickyNote /></div>
                      <div className="act-col-posted">
                        <div className="posted-at">{new Date(n.at).toLocaleString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })}</div>
                        <div className="user-link">{n.by || 'Admin'}</div>
                      </div>
                      <div className="act-col-related">
                        <span className="related-link">{student.firstName} {student.lastName} (student)</span>
                      </div>
                      <div className="act-col-text">
                        <div className="type-label-row">
                          <strong className="type-title">Note</strong>
                          <span className="type-meta">{new Date(n.at).toLocaleString()} • {n.by}</span>
                        </div>
                        <div className="text-body" dangerouslySetInnerHTML={{ __html: highlightMentions(n.text, data.users || []) }} />
                        <div className="act-mobile-footer">
                          <span className="footer-link" onClick={() => handleDeleteNote(n.id)} style={{ color: '#ef4444' }}>Delete</span>
                          <span className="footer-link" onClick={() => setNoteModalOpen(true)}>Edit</span>
                        </div>
                      </div>
                      <div className="act-col-actions desktop-only">
                        <div className="action-menu-wrap">
                          <button className="kebab-btn" onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(activeMenuId === n.id ? null : n.id);
                          }}>
                            <FaEllipsisV />
                          </button>
                          {activeMenuId === n.id && (
                            <div className="action-dropdown" onClick={(e) => e.stopPropagation()}>
                              <button className="item" onClick={() => { setActiveMenuId(null); setEditingNote(n); setNoteModalOpen(true); }}>
                                <FaEdit /> Edit Note
                              </button>
                              <div className="sep" />
                              <button className="item danger" onClick={() => { setActiveMenuId(null); handleDeleteNote(n.id); }}>
                                <FaTrash /> Delete Note
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <FaSync className="spin" />
                    <p>No activity recorded yet.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'notes' && (
            <div className="sp-tab-card doc-center-view activity-center-view">
              <div className="card-head">
                <div className="ch-left">
                  <h3>Admin Notes</h3>
                </div>
                <div className="card-actions">
                  <button className="sp-btn primary small" onClick={() => setNoteModalOpen(true)}><FaPlus /> Add Note</button>
                </div>
              </div>

              <div className="act-table-header">
                <div className="th-col posted">Posted on</div>
                <div className="th-col related">Related</div>
                <div className="th-col text">Text</div>
                <div className="th-col actions"></div>
              </div>

              <div className="act-list-rows">
                {studentNotes.length > 0 ? (
                  studentNotes.map(n => (
                    <div key={n.id} className="act-row-item">
                      <div className="act-mobile-icon"><FaStickyNote /></div>
                      <div className="act-col-posted">
                        <div className="posted-at">{new Date(n.at).toLocaleString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })}</div>
                        <div className="user-link">{n.by || 'Admin'}</div>
                      </div>
                      <div className="act-col-related">
                        <span className="related-link">{student.firstName} {student.lastName} (student)</span>
                      </div>
                      <div className="act-col-text">
                        <div className="type-label-row">
                          <strong className="type-title">Note</strong>
                          <span className="type-meta">{new Date(n.at).toLocaleString()} • {n.by}</span>
                        </div>
                        <div className="text-body" dangerouslySetInnerHTML={{ __html: highlightMentions(n.text, data.users || []) }} />
                        <div className="act-mobile-footer">
                          <span className="footer-link" onClick={() => handleDeleteNote(n.id)} style={{ color: '#ef4444' }}>Delete</span>
                          <span className="footer-link" onClick={() => setNoteModalOpen(true)}>Edit</span>
                        </div>
                      </div>
                      <div className="act-col-actions desktop-only">
                        <div className="action-menu-wrap">
                          <button className="kebab-btn" onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(activeMenuId === n.id ? null : n.id);
                          }}>
                            <FaEllipsisV />
                          </button>
                          {activeMenuId === n.id && (
                            <div className="action-dropdown" onClick={(e) => e.stopPropagation()}>
                              <button className="item" onClick={() => { setActiveMenuId(null); setEditingNote(n); setNoteModalOpen(true); }}>
                                <FaEdit /> Edit Note
                              </button>
                              <div className="sep" />
                              <button className="item danger" onClick={() => { setActiveMenuId(null); handleDeleteNote(n.id); }}>
                                <FaTrash /> Delete Note
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
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
            <div className="sp-tab-card doc-center-view">
              <div className="card-head">
                <div className="ch-left">
                  <h3>Documents</h3>
                </div>
                <div className="card-actions">
                  <div className="ch-filters">
                    <select className="dsm-input small" disabled><option>All</option></select>
                    <div className="ch-search-wrap">
                      <FaEye className="search-ico" />
                      <input type="text" placeholder="Search..." className="dsm-input small" />
                    </div>
                  </div>
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
                    <>
                      <button className="sp-btn primary small" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                        <FaPlus /> {uploading ? 'Uploading...' : 'Upload'}
                      </button>
                      <button className="sp-btn ghost small" onClick={() => handleDownloadAll(studentDocs)}><FaDownload /> Download all</button>
                    </>
                  )}
                </div>
              </div>
              
              <div className="doc-table-header">
                <div className="th-col preview">Preview</div>
                <div className="th-col related">Related</div>
                <div className="th-col posted">Posted on</div>
                <div className="th-col actions"></div>
              </div>

              <div className="doc-list-rows">
                {studentDocs.length > 0 ? (
                  studentDocs.map(doc => (
                    <div key={doc.id} className={`doc-row-item ${deleteMode ? 'manageable' : ''} ${selectedIds.has(doc.id) ? 'selected' : ''}`} onClick={() => deleteMode && toggleSelect(doc.id)}>
                      {deleteMode && (
                        <div className="doc-checkbox">
                          <div className={`check ${selectedIds.has(doc.id) ? 'checked' : ''}`}>
                            {selectedIds.has(doc.id) && <FaCheckCircle />}
                          </div>
                        </div>
                      )}
                      
                      <div className="doc-col-preview">
                        <div className="doc-preview-box" onClick={(e) => { e.stopPropagation(); doc.mime?.includes('pdf') ? openPdf(doc) : openImage(doc); }}>
                          {getFileIcon(doc)}
                        </div>
                      </div>

                      <div className="doc-col-related">
                        <span className="related-link">{student.firstName} {student.lastName} (student)</span>
                      </div>

                      <div className="doc-col-details">
                        <div className="doc-name-link" onClick={(e) => { e.stopPropagation(); openPdf(doc); }}>{doc.name}</div>
                        <div className="doc-meta-grid">
                          <div className="meta-row"><label>Type:</label> <span>{doc.mime?.split('/')[1]?.toUpperCase() || 'Document'}</span></div>
                          <div className="meta-row"><label>Size:</label> <span>{(doc.size / 1024).toFixed(1)} KB</span></div>
                          <div className="meta-row"><label>Date Created:</label> <span>{new Date(doc.at).toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
                          <div className="meta-row mobile-only"><label>Added:</label> <span>{new Date(doc.at).toLocaleDateString()} • {doc.mime?.split('/')[1]?.toUpperCase()} • {(doc.size / 1024).toFixed(1)} KB</span></div>
                          <div className="meta-row"><label>Uploaded by:</label> <span className="user-link">{doc.by}</span></div>
                        </div>
                      </div>

                      <div className="doc-col-chevron">
                        <FaChevronRight />
                      </div>

                      {!deleteMode && (
                        <div className="doc-col-actions desktop-only">
                          <div className="action-menu-wrap">
                            <button className="kebab-btn" onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(activeMenuId === doc.id ? null : doc.id);
                            }}>
                              <FaEllipsisV />
                            </button>
                            {activeMenuId === doc.id && (
                              <div className="action-dropdown" onClick={(e) => e.stopPropagation()}>
                                <button className="item" onClick={() => { setActiveMenuId(null); openPdf(doc); }}>
                                  <FaEye /> View
                                </button>
                                <a href={doc.url} target="_blank" rel="noreferrer" className="item" onClick={() => setActiveMenuId(null)}>
                                  <FaDownload /> Download
                                </a>
                                <div className="sep" />
                                <button className="item danger" onClick={() => { setActiveMenuId(null); handleDeleteDoc(doc.id); }}>
                                  <FaTrash /> Delete
                                </button>
                              </div>
                            )}
                          </div>
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
          {tab === 'media' && (
            <div className="sp-tab-card">
              <div className="card-head">
                <div className="ch-left">
                  <h3>Images</h3>
                </div>
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
                    <>
                      <button className="sp-btn primary small" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                        <FaUpload /> {uploading ? 'Uploading...' : 'Upload Image'}
                      </button>
                      <button className="sp-btn ghost small" onClick={() => handleDownloadAll(studentPhotos)}><FaDownload /> Download all</button>
                    </>
                  )}
                </div>
              </div>
              <div className="doc-table-header">
                <div className="th-col preview">Preview</div>
                <div className="th-col related">Related</div>
                <div className="th-col posted">Posted on</div>
                <div className="th-col actions"></div>
              </div>

              <div className="doc-list-rows">
                {studentPhotos.length > 0 ? (
                  studentPhotos.map(photo => (
                    <div key={photo.id} className={`doc-row-item ${deleteMode ? 'manageable' : ''} ${selectedIds.has(photo.id) ? 'selected' : ''}`} onClick={() => deleteMode && toggleSelect(photo.id)}>
                      {deleteMode && (
                        <div className="doc-checkbox">
                          <div className={`check ${selectedIds.has(photo.id) ? 'checked' : ''}`}>
                            {selectedIds.has(photo.id) && <FaCheckCircle />}
                          </div>
                        </div>
                      )}
                      
                      <div className="doc-col-preview">
                        <div className="doc-preview-box" onClick={(e) => { e.stopPropagation(); openImage(photo); }}>
                          <img src={photo.url} alt={photo.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      </div>

                      <div className="doc-col-related">
                        <span className="related-link">{student.firstName} {student.lastName} (student)</span>
                      </div>

                      <div className="doc-col-details">
                        <div className="doc-name-link" onClick={(e) => { e.stopPropagation(); openImage(photo); }}>{photo.name}</div>
                        <div className="doc-meta-grid">
                          <div className="meta-row"><label>Type:</label> <span>Photo</span></div>
                          <div className="meta-row"><label>Size:</label> <span>{(photo.size / 1024).toFixed(1)} KB</span></div>
                          <div className="meta-row"><label>Date Created:</label> <span>{new Date(photo.at).toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
                          <div className="meta-row"><label>Uploaded by:</label> <span className="user-link">{photo.by}</span></div>
                          <div className="meta-row"><span className="related-link" style={{ fontSize: '12px', fontWeight: '500' }}>Add comment</span></div>
                        </div>
                      </div>

                      <div className="doc-col-chevron">
                        <FaChevronRight />
                      </div>

                      {!deleteMode && (
                        <div className="doc-col-actions desktop-only">
                          <div className="action-menu-wrap">
                            <button className="kebab-btn" onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(activeMenuId === photo.id ? null : photo.id);
                            }}>
                              <FaEllipsisV />
                            </button>
                            {activeMenuId === photo.id && (
                              <div className="action-dropdown" onClick={(e) => e.stopPropagation()}>
                                <button className="item" onClick={() => { setActiveMenuId(null); openImage(photo); }}>
                                  <FaEye /> View
                                </button>
                                <a href={photo.url} target="_blank" rel="noreferrer" className="item" onClick={() => setActiveMenuId(null)}>
                                  <FaDownload /> Download
                                </a>
                                <div className="sep" />
                                <button className="item danger" onClick={() => { setActiveMenuId(null); handleDeleteDoc(photo.id); }}>
                                  <FaTrash /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <FaImages size={48} />
                    <p>No media files uploaded yet.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'esign' && (
            <div className="sp-tab-card">
              <div className="card-head">
                <div className="ch-left">
                  <h3>E-Sign Tracking</h3>
                </div>
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

          {tab === 'program' && (
            <div className="sp-tab-card program-view">
              <div className="program-section">
                <div className="section-head"><h4>Demographics & Status</h4></div>
                <div className="details-grid">
                  <div className="group"><label>Gender</label><div>{student.gender || 'N/A'}</div></div>
                  <div className="group"><label>Record Type</label><div>{student.recordType || 'Resident'}</div></div>
                  <div className="group"><label>Phase</label><div>{student.phase || '1'}</div></div>
                  <div className="group"><label>Squad</label><div>{student.squad || 'None'}</div></div>
                  <div className="group"><label>Dorm / Housing</label><div>{student.dorm || 'Unassigned'}</div></div>
                  <div className="group"><label>Current Location</label><div>{student.location || 'N/A'}</div></div>
                </div>
              </div>

              <div className="program-section">
                <div className="section-head"><h4>Intake & Referral</h4></div>
                <div className="details-grid">
                  <div className="group"><label>Intake Date</label><div>{student.intakeDate ? new Date(student.intakeDate).toLocaleDateString() : 'N/A'}</div></div>
                  <div className="group"><label>Graduation Date</label><div>{student.graduationDate ? new Date(student.graduationDate).toLocaleDateString() : 'N/A'}</div></div>
                  <div className="group"><label>Exit Date</label><div>{student.exitDate ? new Date(student.exitDate).toLocaleDateString() : 'N/A'}</div></div>
                  <div className="group"><label>Referral Source</label><div>{student.referralSource || 'N/A'}</div></div>
                  <div className="group"><label>Referral From Pastor</label><div>{student.referralFromPastor ? 'Yes' : 'No'}</div></div>
                  <div className="group"><label>Mentor</label><div>{student.mentor || 'None'}</div></div>
                </div>
              </div>

              <div className="program-section">
                <div className="section-head"><h4>Application & Background Check</h4></div>
                <div className="details-grid">
                  <div className="group"><label>Application Status</label><div>{student.applicationStatus || 'Not Started'}</div></div>
                  <div className="group"><label>Background Check Status</label><div>{student.backgroundStatus || 'Not Started'}</div></div>
                  <div className="group"><label>Has Valid ID?</label><div>{student.hasID || 'N/A'}</div></div>
                  <div className="group"><label>Background Fee Charged</label><div>{student.backgroundFee ? `$${Number(student.backgroundFee).toFixed(2)}` : 'N/A'}</div></div>
                  <div className="group"><label>Fee Paid Date</label><div>{student.backgroundPaidDate ? new Date(student.backgroundPaidDate).toLocaleDateString() : 'N/A'}</div></div>
                </div>
              </div>

              <div className="program-section">
                <div className="section-head"><h4>Employment & Engagement</h4></div>
                <div className="details-grid">
                  <div className="group"><label>Employment Status</label><div>{student.employment || 'Unemployed'}</div></div>
                  <div className="group"><label>Employment Readiness</label><div>{student.readiness || 'N/A'}</div></div>
                  <div className="group"><label>Employment Placement</label><div>{student.employmentPlacement || 'N/A'}</div></div>
                  <div className="group"><label>Volunteer / Service Hours</label><div>{student.volunteerHours ? `${student.volunteerHours} hrs` : '0 hrs'}</div></div>
                  <div className="group"><label>Uniform Issued</label><div>{student.uniformIssued ? 'Yes' : 'No'}</div></div>
                  <div className="group"><label>Physical Fitness</label><div>{student.fitnessParticipation || 'N/A'}</div></div>
                </div>
              </div>

              <div className="program-section">
                <div className="section-head"><h4>Health, Recovery & Spiritual</h4></div>
                <div className="details-grid">
                  <div className="group"><label>Medical Conditions</label><div>{student.medicalConditions || 'None'}</div></div>
                  <div className="group"><label>Medications</label><div>{student.medications || 'None'}</div></div>
                  <div className="group"><label>Recovery Group</label><div>{student.recoveryGroup || 'General'}</div></div>
                  <div className="group"><label>Spiritual Growth Plan</label><div>{student.spiritualPlan || 'Standard'}</div></div>
                  <div className="group wide"><label>Achievements / Celebrate</label><div style={{ whiteSpace: 'pre-wrap' }}>{student.celebrate || 'No recorded achievements.'}</div></div>
                </div>
              </div>

              {student.dismissed && (
                <div className="program-section" style={{ borderColor: '#ef4444' }}>
                  <div className="section-head" style={{ background: '#fef2f2' }}><h4 style={{ color: '#b91c1c' }}>Dismissal</h4></div>
                  <div className="details-grid">
                    <div className="group"><label>Dismissal Date</label><div>{student.dismissalDate ? new Date(student.dismissalDate).toLocaleDateString() : 'N/A'}</div></div>
                    <div className="group wide"><label>Reason</label><div>{student.dismissalReason || 'Not specified'}</div></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      {confirmModal.open && (
        <ConfirmModal 
          title={confirmModal.title}
          message={confirmModal.message}
          loading={confirmModal.loading}
          onCancel={() => setConfirmModal({ ...confirmModal, open: false })}
          onConfirm={async () => {
            setConfirmModal(prev => ({ ...prev, loading: true }));
            try {
              await confirmModal.onConfirm();
              setConfirmModal({ ...confirmModal, open: false, loading: false });
            } catch (err) {
              setToast({ title: "Error", message: err.message || "Action failed", type: "error" });
              setConfirmModal(prev => ({ ...prev, loading: false }));
            }
          }}
        />
      )}
    </section>
  );
}

function ConfirmModal({ title, message, loading, onConfirm, onCancel }) {
  return (
    <div className="dsm-modal-overlay">
      <div className="dsm-modal-card confirm-modal" style={{ maxWidth: '400px' }}>
        <div className="dsm-modal-header">
          <h3 style={{ color: '#ef4444' }}>{title}</h3>
          <button className="dsm-close-btn" onClick={onCancel} disabled={loading}><FaTimes /></button>
        </div>
        <div className="dsm-modal-body">
          <p style={{ fontSize: '15px', color: 'var(--text)', lineHeight: '1.6' }}>{message}</p>
        </div>
        <div className="dsm-modal-footer">
          <button className="dsm-btn-ghost" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className="dsm-btn-danger" onClick={onConfirm} disabled={loading} style={{ background: '#ef4444', color: '#fff' }}>
            {loading ? "Processing..." : "Confirm Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NoteModal({ studentId, api, user, onClose, onSaved, existing = null }) {
  const { data } = useApp();
  const [text, setText] = useState(existing?.text || "");
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
      if (existing) {
        await api.edit("notes", existing.id, {
          text: text.trim(),
          editedBy: user?.name || "Admin",
          editedAt: Date.now()
        });
      } else {
        await api.add("notes", {
          studentId,
          text: text.trim(),
          by: user?.name || "Admin",
          at: Date.now()
        });
      }
      onSaved?.();
      onClose();
    } catch (e) {
      alert(`Failed to ${existing ? "update" : "add"} note`);
    } finally { setSaving(false); }
  };

  return (
    <div className="dsm-modal-overlay">
      <div className="dsm-modal-card" style={{ maxWidth: '500px' }}>
        <div className="dsm-modal-header">
          <h3>{existing ? "Edit Note" : "Add Note"}</h3>
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
    border-bottom: 2px solid var(--border); 
    padding: 32px 40px; 
    display: flex; 
    align-items: center; 
    justify-content: space-between; 
    z-index: 100; 
    position: relative; 
    flex-shrink: 0;
    box-shadow: var(--shadow-lg);
  }
  
  .sp-header-left { display: flex; align-items: center; gap: 32px; }
  .back-btn { 
    width: 52px; height: 52px; border-radius: 18px; 
    background: var(--surface-2); color: var(--text-muted); 
    display: grid; place-items: center; font-size: 20px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border: 2px solid var(--border);
    cursor: pointer;
  }
  .back-btn:hover { background: var(--primary-soft); color: var(--primary); transform: translateX(-4px); border-color: var(--primary); }
  
  .sp-avatar-wrap { position: relative; }
  .sp-avatar { 
    width: 80px; height: 80px; border-radius: 28px; 
    background: linear-gradient(135deg, var(--primary), var(--brand-gold-dark, #A88A3F)); 
    color: white; display: grid; place-items: center; font-size: 32px; font-weight: 900; 
    box-shadow: 0 12px 32px -8px rgba(var(--primary-rgb), 0.5); 
    border: 3px solid var(--surface);
  }
  .presence-indicator { 
    position: absolute; bottom: 0; right: 0; 
    width: 24px; height: 24px; border-radius: 50%; 
    border: 4px solid var(--surface); 
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  }
  .presence-indicator.online { background: #10b981; }
  
  .sp-identity h1 { font-size: 28px; font-weight: 900; margin: 0; color: var(--text); letter-spacing: -1px; }
  .sp-badges { display: flex; gap: 12px; margin-top: 10px; flex-wrap: wrap; }
  .sp-badge { padding: 6px 14px; border-radius: 12px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
  .sp-badge.status { background: var(--primary-soft); color: var(--primary); border: 1.5px solid rgba(var(--primary-rgb), 0.2); }
  .sp-badge.phase { background: var(--accent-soft); color: var(--accent); border: 1.5px solid rgba(var(--accent-rgb), 0.2); }
  .sp-badge.squad { background: var(--surface-2); color: var(--text-muted); border: 1.5px solid var(--border); }
  
  .sp-header-actions { display: flex; gap: 16px; align-items: center; }
  .sp-btn { 
    height: 52px; padding: 0 24px; border-radius: 18px; 
    font-weight: 800; font-size: 14px; display: flex; align-items: center; gap: 10px; 
    cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
    border: 2px solid var(--border); background: var(--surface); color: var(--text); 
  }
  .sp-btn:hover { border-color: var(--primary); transform: translateY(-3px); box-shadow: var(--shadow-lg); }
  .sp-btn.primary { background: var(--primary); border: none; color: white; box-shadow: var(--shadow-brand); }
  .sp-btn.primary:hover { filter: brightness(1.1); box-shadow: 0 16px 32px -8px rgba(var(--primary-rgb), 0.5); }
  .sp-btn.secondary { background: var(--surface-2); color: var(--text); }
  .sp-btn.small { height: 40px; padding: 0 16px; font-size: 12px; border-radius: 12px; }
  .sp-btn.danger { background: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: rgba(239, 68, 68, 0.2); }
  .sp-btn.danger:hover { background: #ef4444; color: white; border-color: #ef4444; }
  .sp-btn.ghost { background: transparent; border: 1px solid var(--border); color: var(--text-muted); }
  .sp-btn.ghost:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-soft); }
  
  .sp-btn-circle { 
    width: 52px; height: 52px; border-radius: 18px; 
    border: 2px solid var(--border); display: grid; place-items: center; 
    color: var(--text-muted); cursor: pointer; transition: all 0.3s ease; 
    background: var(--surface);
  }
  .sp-btn-circle:hover { background: var(--primary-soft); color: var(--primary); border-color: var(--primary); transform: translateY(-2px); }
  .sp-btn-circle.small { width: 36px; height: 36px; border-radius: 10px; font-size: 12px; }
  .sp-btn-circle.danger:hover { background: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: #ef4444; }
  
  .sp-layout { flex: 1; display: grid; grid-template-columns: 360px 1fr; gap: 40px; padding: 40px; min-height: 0; }
  
  .sp-sidebar { display: flex; flex-direction: column; gap: 32px; }
  .sp-sidebar-card { 
    background: var(--surface); border-radius: 32px; padding: 32px; 
    border: 2px solid var(--border); box-shadow: var(--shadow-lg); 
  }
  .sp-sidebar-card .card-head { font-size: 12px; font-weight: 900; text-transform: uppercase; color: var(--primary); letter-spacing: 2px; margin-bottom: 24px; }
  
  .info-list { display: flex; flex-direction: column; gap: 20px; }
  .info-item { display: flex; align-items: center; gap: 16px; font-size: 15px; font-weight: 700; color: var(--text); }
  .info-item svg { color: var(--primary); font-size: 20px; opacity: 0.8; }
  
  .sp-nav { display: flex; flex-direction: column; gap: 10px; }
  .sp-nav button { 
    padding: 18px 24px; border-radius: 20px; display: flex; align-items: center; gap: 16px; 
    font-size: 16px; font-weight: 800; color: var(--text-muted); 
    transition: all 0.3s ease; background: transparent; border: 2px solid transparent; 
    cursor: pointer; width: 100%; text-align: left; 
  }
  .sp-nav button:hover { background: var(--surface-2); color: var(--text); transform: translateX(6px); }
  .sp-nav button.active { 
    background: var(--surface); color: var(--primary); 
    box-shadow: var(--shadow-lg); border-color: var(--primary); 
    transform: translateX(10px);
  }
  
  .sp-tab-card { 
    background: var(--surface); border-radius: 40px; padding: 48px; 
    border: 2px solid var(--border); box-shadow: var(--shadow-lg); 
    min-height: 600px; display: flex; flex-direction: column;
  }
  .sp-tab-card .card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 40px; gap: 20px; flex-wrap: wrap; }
  .card-actions { display: flex; align-items: center; gap: 12px; }
  .sp-tab-card h3 { font-size: 24px; font-weight: 900; margin: 0; display: flex; align-items: center; gap: 16px; color: var(--text); letter-spacing: -0.8px; }
  
  .doc-checkbox { position: absolute; left: 12px; top: 24px; }

  /* JobNimbus-style Center View (Shared) */
  .doc-center-view { padding: 0 !important; overflow: hidden; display: flex; flex-direction: column; }
  .doc-center-view .card-head { padding: 32px 40px 24px; margin-bottom: 0; background: var(--surface); border-bottom: 1px solid var(--border); }
  .ch-filters { display: flex; align-items: center; gap: 12px; }
  .ch-search-wrap { position: relative; display: flex; align-items: center; }
  .ch-search-wrap .search-ico { position: absolute; left: 12px; color: var(--text-muted); font-size: 14px; opacity: 0.5; }
  .ch-search-wrap input { padding-left: 36px; width: 220px; }
  
  .related-link { color: #2563eb; font-size: 14px; font-weight: 600; cursor: pointer; }
  .related-link:hover { text-decoration: underline; }
  .user-link { color: #2563eb; font-weight: 600; cursor: pointer; }
  .user-link:hover { text-decoration: underline; }
  
  .kebab-btn { 
    width: 32px; height: 32px; border-radius: 8px; 
    display: grid; place-items: center; color: var(--text-muted);
    transition: 0.2s; cursor: pointer; border: none; background: transparent;
  }
  .kebab-btn:hover { background: var(--surface-2); color: var(--primary); transform: scale(1.1); }

  /* Document Specifics */
  .doc-table-header { 
    display: grid; grid-template-columns: 140px 180px 1fr 100px; 
    padding: 12px 40px; background: var(--bg); border-bottom: 1px solid var(--border);
    font-size: 13px; font-weight: 700; color: var(--text-muted);
  }
  .doc-list-rows { display: flex; flex-direction: column; flex: 1; overflow-y: auto; }
  .doc-row-item { 
    display: grid; grid-template-columns: 140px 180px 1fr 100px; padding: 24px 40px; 
    border-bottom: 1px solid var(--border); background: var(--surface); position: relative; align-items: flex-start;
  }
  .doc-row-item:hover { background: var(--surface-2); }
  .doc-row-item.selected { background: var(--primary-soft); }
  .doc-preview-box { 
    width: 100px; height: 130px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; 
    overflow: hidden; display: grid; place-items: center; box-shadow: 0 2px 8px rgba(0,0,0,0.05); cursor: pointer; transition: 0.2s;
  }
  .doc-preview-box:hover { transform: scale(1.05); border-color: var(--primary); }
  .doc-name-link { color: var(--text); font-size: 16px; font-weight: 800; cursor: pointer; }
  .doc-name-link:hover { color: var(--primary); text-decoration: underline; }
  .doc-meta-grid { display: flex; flex-direction: column; gap: 4px; }
  .meta-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); }
  .meta-row label { font-weight: 600; color: var(--text-muted); width: 100px; opacity: 0.8; }
  .hover-actions { position: absolute; right: 40px; top: 0; display: flex; gap: 8px; opacity: 0; pointer-events: none; transition: 0.2s; transform: translateX(10px); }
  .doc-row-item:hover .hover-actions { opacity: 1; pointer-events: auto; transform: translateX(0); }

  /* Activity Specifics */
  .act-table-header { 
    display: grid; grid-template-columns: 180px 180px 1fr 60px; padding: 12px 40px; background: var(--bg); border-bottom: 1px solid var(--border);
    font-size: 13px; font-weight: 700; color: var(--text-muted);
  }
  .act-list-rows { display: flex; flex-direction: column; flex: 1; overflow-y: auto; }
  .act-row-item { 
    display: grid; grid-template-columns: 180px 180px 1fr 60px; padding: 32px 40px; border-bottom: 1px solid var(--border); background: var(--surface); align-items: flex-start;
  }
  .act-row-item:hover { background: var(--surface-2); }
  .act-col-posted { display: flex; flex-direction: column; gap: 4px; }
  .posted-at { font-size: 14px; font-weight: 800; color: #1e293b; margin-bottom: 2px; }
  .act-col-text { display: flex; flex-direction: column; gap: 10px; }
  .type-label-row { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
  .type-title { font-size: 13px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  .type-meta { font-size: 12px; color: #94a3b8; font-weight: 500; }
  .text-body { font-size: 15px; line-height: 1.7; color: #334155; white-space: pre-wrap; word-break: break-word; }
  .eng-mention { display: inline-block; padding: 2px 8px; border-radius: 6px; background: #dbeafe; color: #2563eb; font-weight: 700; font-size: 13px; margin: 2px 2px 2px 0; border: 1px solid #bfdbfe; }
  .act-col-actions { display: flex; justify-content: flex-end; }

  /* Action Menus */
  .action-menu-wrap { position: relative; }
  .action-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    width: 160px;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.12);
    z-index: 100;
    padding: 6px;
    margin-top: 8px;
    animation: sp-drop 0.2s ease-out;
  }
  @keyframes sp-drop {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .action-dropdown .item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: none;
    background: transparent;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #475569;
    text-decoration: none;
    cursor: pointer;
    transition: 0.2s;
  }
  .action-dropdown .item:hover { background: #f1f5f9; color: var(--primary); }
  .action-dropdown .item.danger { color: #ef4444; }
  .action-dropdown .item.danger:hover { background: #fef2f2; }
  .action-dropdown .sep { height: 1px; background: #eee; margin: 4px 0; }

  /* Media Gallery */
  .photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 24px; padding: 24px; }
  .photo-item { position: relative; border-radius: 16px; overflow: hidden; aspect-ratio: 1/1; background: var(--surface-2); border: 2px solid var(--border); transition: 0.3s; }
  .photo-item:hover { transform: translateY(-4px); border-color: var(--primary); box-shadow: 0 12px 24px rgba(0,0,0,0.1); }
  .photo-item img { width: 100%; height: 100%; object-fit: cover; }
  .photo-overlay { position: absolute; inset: 0; background: rgba(15,23,42,0.6); display: flex; align-items: center; justify-content: center; gap: 12px; opacity: 0; transition: 0.3s; }
  .photo-item:hover .photo-overlay { opacity: 1; }
  .photo-overlay .action-btn { width: 40px; height: 40px; border-radius: 12px; background: #fff; color: var(--text); display: grid; place-items: center; border: none; cursor: pointer; transition: 0.2s; }
  .photo-overlay .action-btn:hover { transform: scale(1.1); background: var(--primary); color: #fff; }
  .photo-overlay .action-btn.danger:hover { background: #ef4444; }

  /* E-Sign Sections */
  .envelope-sections { display: flex; flex-direction: column; gap: 40px; padding: 24px; }
  .env-section-head { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
  .env-section-head .icon { width: 40px; height: 40px; border-radius: 12px; background: var(--surface-2); color: var(--primary); display: grid; place-items: center; font-size: 18px; }
  .env-section-head h4 { font-size: 16px; font-weight: 700; color: var(--text); margin: 0; }
  .env-count { padding: 4px 10px; border-radius: 20px; background: var(--primary-soft); font-size: 12px; font-weight: 700; color: var(--primary); }

  .env-section-list { display: flex; flex-direction: column; gap: 12px; }
  .env-row { display: grid; grid-template-columns: 48px 1fr 140px 40px; align-items: center; gap: 20px; padding: 16px 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; transition: 0.2s; cursor: pointer; }
  .env-row:hover { border-color: var(--primary); transform: translateX(4px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
  .env-row-icon { width: 40px; height: 40px; border-radius: 10px; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; font-size: 18px; }
  .env-row-subject { font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
  .env-row-meta { font-size: 12px; color: var(--text-muted); }
  .env-badge { padding: 6px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; }
  .env-badge.completed { background: #dcfce7; color: #15803d; }
  .env-badge.pending { background: #fef9c3; color: #a16207; }
  .env-row .chevron { color: #cbd5e1; }

  /* Program Data Redesign */
  .program-view { padding: 32px; display: flex; flex-direction: column; gap: 32px; }
  .program-section { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; overflow: hidden; }
  .section-head { padding: 20px 24px; background: var(--bg); border-bottom: 1px solid var(--border); }
  .section-head h4 { font-size: 13px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin: 0; }
  .details-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; padding: 24px; }
  .group { display: flex; flex-direction: column; gap: 6px; }
  .group label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; }
  .group div { font-size: 15px; font-weight: 600; color: var(--text); }

  @media (max-width: 1024px) {
    .details-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 768px) {
    .program-view { padding: 16px; }
    .details-grid { grid-template-columns: 1fr; gap: 20px; }
    .env-row { grid-template-columns: 48px 1fr 40px; padding: 12px; gap: 12px; }
    .env-row-status { display: none; }
    .photo-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; padding: 16px; }
  }

  /* Details Center View */
  .details-center-view { padding: 48px 60px !important; }
  .details-center-view .info-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 32px; }
  .details-center-view .info-item { padding: 20px; background: var(--surface-2); border-radius: 20px; border: 1.5px solid var(--border); font-size: 16px; }
  
  @media (max-width: 768px) {
    .details-center-view { padding: 24px !important; }
    .details-center-view .info-list { grid-template-columns: 1fr; gap: 16px; }
  }

  /* E-Sign Tracking */
  .envelope-sections { display: flex; flex-direction: column; gap: 40px; }
  .env-section { display: flex; flex-direction: column; gap: 20px; }
  .env-section-head { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid var(--border); padding-bottom: 20px; margin-bottom: 4px; }
  .env-section-head .icon { width: 48px; height: 48px; border-radius: 14px; background: var(--surface-2); display: grid; place-items: center; font-size: 22px; color: var(--primary); box-shadow: var(--shadow); }
  .env-section-head h4 { font-size: 18px; font-weight: 900; margin: 0; color: var(--text); flex: 1; letter-spacing: -0.4px; }
  .env-count { background: var(--primary-soft); color: var(--primary); padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 900; border: 1.5px solid rgba(var(--primary-rgb), 0.1); }
  
  .env-section-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; }
  
  .env-row { 
    background: var(--surface); border: 2px solid var(--border); border-radius: 24px; padding: 20px; 
    display: flex; align-items: center; gap: 20px; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative; overflow: hidden;
  }
  .env-row:hover { border-color: var(--primary); transform: translateY(-4px); box-shadow: var(--shadow-lg); background: var(--surface-2); }
  .env-row::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 6px; background: var(--primary); opacity: 0; transition: 0.3s; }
  .env-row:hover::after { opacity: 1; }

  .env-row-icon { width: 52px; height: 52px; border-radius: 16px; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; font-size: 22px; flex-shrink: 0; }
  .env-row-info { flex: 1; min-width: 0; }
  .env-row-subject { font-size: 15px; font-weight: 800; color: var(--text); margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .env-row-meta { font-size: 12px; color: var(--text-muted); font-weight: 600; }
  
  .env-row-status { margin-left: 8px; }
  .env-badge { padding: 6px 12px; border-radius: 10px; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; border: 1px solid transparent; }
  .env-badge.pending { background: #fef3c7; color: #92400e; border-color: #fde68a; animation: envPulse 2s infinite ease-in-out; }
  .env-badge.completed { background: #d1fae5; color: #065f46; border-color: #a7f3d0; }
  
  @keyframes envPulse {
    0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
    70% { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); }
    100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
  }
  
  .chevron { color: var(--text-muted); opacity: 0.3; transition: 0.3s; font-size: 14px; }
  .env-row:hover .chevron { opacity: 1; transform: translateX(4px); color: var(--primary); }

  /* Media Gallery */
  .photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
  .photo-item { position: relative; aspect-ratio: 1; border-radius: 24px; overflow: hidden; border: 2px solid var(--border); transition: 0.3s ease; }
  .photo-item:hover { transform: scale(1.02); border-color: var(--primary); box-shadow: var(--shadow-lg); }
  .photo-item img { width: 100%; height: 100%; object-fit: cover; }
  .photo-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.5); opacity: 0; display: flex; align-items: center; justify-content: center; gap: 12px; transition: 0.3s; backdrop-filter: blur(4px); }
  .photo-item:hover .photo-overlay { opacity: 1; }
  .photo-overlay .action-btn { width: 44px; height: 44px; border-radius: 50%; background: white; color: var(--text); display: grid; place-items: center; border: none; cursor: pointer; transition: 0.2s; }
  .photo-overlay .action-btn:hover { transform: scale(1.1); color: var(--primary); }
  .photo-overlay .action-btn.danger:hover { color: #ef4444; }

  .empty-state {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 60px 20px; color: var(--text-muted); text-align: center; gap: 16px;
    background: var(--surface-2); border-radius: 32px; border: 2px dashed var(--border);
    grid-column: 1 / -1;
  }
  .empty-state svg { font-size: 48px; opacity: 0.4; color: var(--primary); }
  .empty-state p { font-size: 16px; font-weight: 700; margin: 0; }

  /* Credentials Modal */
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

  .cred-error {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 14px; border-radius: 12px;
    background: rgba(176, 38, 60, 0.08);
    border: 1px solid rgba(176, 38, 60, 0.22);
    color: var(--danger);
    font-size: 13px; font-weight: 600;
  }

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

  /* Utility */
  .mobile-only { display: none; }
  .act-mobile-icon { display: none; }
  .act-mobile-footer { display: none; }
  .doc-col-chevron { display: none; }
  .type-  /* ============================================================================
     Responsive Design (Consolidated)
     ============================================================================ */
  @media (max-width: 1024px) {
    .sp-layout { display: flex; flex-direction: column; gap: 20px; padding: 12px; width: 100%; box-sizing: border-box; }
    .sp-sidebar { width: 100%; gap: 16px; }
    .sp-content { width: 100%; }
    .sp-nav-wrap { position: relative; width: 100%; }
    .sp-nav-wrap::after { content: ""; position: absolute; top: 0; right: 0; bottom: 0; width: 40px; background: linear-gradient(to left, var(--bg), transparent); pointer-events: none; z-index: 2; }
    .sp-nav { flex-direction: row; overflow-x: auto; overflow-y: hidden; gap: 8px; padding: 6px 40px 6px 6px; background: var(--bg); border-radius: 16px; border: 1px solid var(--border); -webkit-overflow-scrolling: touch; scrollbar-width: none; scroll-snap-type: x mandatory; }
    .sp-nav::-webkit-scrollbar { display: none; }
    .sp-nav button { flex: 0 0 calc(33.33% - 12px); min-width: 100px; justify-content: center; padding: 10px 8px; font-size: 12px; min-height: 42px; white-space: nowrap; border-radius: 12px; scroll-snap-align: start; }
    .sp-nav button.active { background: var(--surface); color: var(--primary); box-shadow: 0 4px 12px rgba(0,0,0,0.08); font-weight: 800; }
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
    .sp-btn-circle { height: 48px; width: 48px; border-radius: 12px; flex-shrink: 0; }

    .sp-tab-card { padding: 0; border-radius: 20px; width: 100%; box-sizing: border-box; border: none; box-shadow: none; background: #fff; min-height: 400px; }
    .sp-tab-card .card-head { flex-direction: row; align-items: center; justify-content: space-between; padding: 16px; margin-bottom: 0; border-bottom: 1px solid #eee; }
    .card-actions { flex-direction: row; align-items: center; gap: 8px; width: auto; }
    .ch-filters { flex-direction: row; align-items: center; gap: 8px; width: auto; }
    .ch-search-wrap { display: none; }
    .ch-left h3 { font-size: 16px; font-weight: 700; }
    
    .desktop-only { display: none; }
    .mobile-only { display: block; }
    
    /* Document Mobile List */
    .doc-table-header { display: none; }
    .doc-row-item { grid-template-columns: 60px 1fr 40px; padding: 16px; align-items: center; gap: 12px; }
    .doc-preview-box { width: 48px; height: 64px; }
    .doc-col-preview { width: 48px; }
    .doc-col-related, .doc-col-actions.desktop-only { display: none; }
    .doc-name-link { font-size: 14px; font-weight: 600; color: #000; }
    .doc-meta-grid .meta-row:not(.mobile-only) { display: none; }
    .doc-meta-grid .mobile-only { display: block; font-size: 12px; color: #999; font-weight: 400; }
    .doc-meta-grid .mobile-only label { display: none; }
    .doc-col-chevron { display: flex; justify-content: flex-end; color: #ccc; font-size: 14px; }
    
    /* Activity Mobile List */
    .act-table-header { display: none; }
    .act-row-item { grid-template-columns: 40px 1fr; padding: 16px; gap: 12px; align-items: flex-start; border-bottom: 1px solid #eee; }
    .act-mobile-icon { display: flex; width: 32px; height: 32px; border-radius: 8px; background: #f0f7ff; color: #2563eb; align-items: center; justify-content: center; font-size: 14px; margin-top: 4px; }
    .act-col-posted, .act-col-related, .act-col-actions.desktop-only { display: none; }
    .type-label-row { display: flex; flex-direction: column; gap: 2px; }
    .type-title { font-size: 14px; font-weight: 700; color: #000; }
    .type-meta { font-size: 11px; color: #999; font-weight: 400; }
    .text-body { font-size: 14px; color: #333; line-height: 1.5; margin-top: 4px; }
    .act-mobile-footer { display: flex; gap: 20px; margin-top: 8px; border-top: 1px solid #f5f5f5; padding-top: 8px; }
    .footer-link { font-size: 13px; color: #2563eb; font-weight: 600; cursor: pointer; }
    
    .details-grid { grid-template-columns: 1fr; gap: 16px; }
    .photo-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 8px; }
    .env-section-list { grid-template-columns: 1fr; }
  }

  @media (max-width: 480px) {
    .sp-nav button { font-size: 12px; }
    .sp-header { padding: 24px 16px; }
    .sp-avatar { width: 64px; height: 64px; }
    .sp-identity h1 { font-size: 18px; }
    .info-item { font-size: 12px; }
  }

  /* Dark Mode Specific Refinements */
  :root[data-theme="dark"] .sp-tab-card { box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
  :root[data-theme="dark"] .sp-sidebar-card { box-shadow: 0 12px 32px rgba(0,0,0,0.3); }
  :root[data-theme="dark"] .action-dropdown { background: #1e293b; border-color: #334155; box-shadow: 0 12px 32px rgba(0,0,0,0.5); }
  :root[data-theme="dark"] .action-dropdown .item { color: #cbd5e1; }
  :root[data-theme="dark"] .action-dropdown .item:hover { background: #334155; color: #fff; }
  :root[data-theme="dark"] .action-dropdown .sep { background: #334155; }
  :root[data-theme="dark"] .env-badge.pending { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border-color: rgba(245, 158, 11, 0.3); }
  :root[data-theme="dark"] .env-badge.completed { background: rgba(16, 185, 129, 0.15); color: #34d399; border-color: rgba(16, 185, 129, 0.3); }
  :root[data-theme="dark"] .posted-at { color: var(--text); }
  :root[data-theme="dark"] .type-meta { color: var(--text-muted); opacity: 0.6; }
  
  /* Media Gallery Dark Mode Polish */
  :root[data-theme="dark"] .photo-overlay { background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(8px); }
  :root[data-theme="dark"] .photo-overlay .action-btn { 
    background: #1e293b; color: #cbd5e1; border: 1px solid #334155;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }
  :root[data-theme="dark"] .photo-overlay .action-btn:hover { 
    background: var(--primary); color: #fff; border-color: var(--primary);
    box-shadow: 0 8px 24px rgba(var(--primary-rgb), 0.4);
  }
  :root[data-theme="dark"] .photo-overlay .action-btn.danger:hover { background: #ef4444; border-color: #ef4444; }
`;
