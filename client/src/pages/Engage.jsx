// Fixed Engage.jsx
import React from "react";
import { useApp } from "../context/AppContext";
import { FaPlus, FaSearch, FaTrash, FaPaperPlane, FaTimes, FaUsers } from "react-icons/fa";

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
    if (u) {
      const first = (u.name || "").split(" ")[0];
      return `<span class="mention">@${first}</span>`;
    }
    return match;
  });
}

export default function Engage() {
  const { api, data, user, refreshStore, engage } = useApp();

  const me = user?.id || null;

  const [threads, setThreads] = React.useState([]);
  const [users, setUsers] = React.useState([]);
  const [activeId, setActiveId] = React.useState(null);
  const [searchQ, setSearchQ] = React.useState("");
  const [compose, setCompose] = React.useState("");
  const [showNew, setShowNew] = React.useState(false);
  const [delConfirm, setDelConfirm] = React.useState(null);
  const [apiError, setApiError] = React.useState(null);
  const [editingId, setEditingId] = React.useState(null);
  const [editText, setEditText] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  // --- Mentions state ---
  const composeRef = React.useRef(null);
  const [showMention, setShowMention] = React.useState(false);
  const [mentionQuery, setMentionQuery] = React.useState("");
  const [mentionIndex, setMentionIndex] = React.useState(0);

  const listRef = React.useRef(null);

  // Load data on mount and when user changes
  React.useEffect(() => {
    let alive = true;

    const loadData = async () => {
      setLoading(true);
      
      if (!me) {
        console.log("No user ID, clearing data");
        setThreads([]);
        setUsers([]);
        setApiError(null);
        setLoading(false);
        return;
      }

      try {
        console.log("Loading messages for user:", me);
        
        // Use the engage helper for messages and api.getAll for users
        const [messageThreads, userList] = await Promise.all([
          engage.listMine().catch((err) => {
            console.error("Failed to load messages:", err);
            return [];
          }),
          api.getAll("users", {}).catch((err) => {
            console.error("Failed to load users:", err);
            return [];
          })
        ]);

        if (!alive) return;

        console.log("Loaded threads:", messageThreads);
        console.log("Loaded users:", userList);

        // Normalize thread structure
        const normalizedThreads = messageThreads.map(thread => ({
          ...thread,
          members: thread.members || thread.participants || [],
          participants: thread.participants || thread.members || [],
          messages: Array.isArray(thread.messages) ? thread.messages : [],
          readBy: thread.readBy || {}
        }));

        setThreads(normalizedThreads);
        setUsers(userList);
        setApiError(null);
      } catch (err) {
        console.error("Error loading data:", err);
        if (!alive) return;
        
        // Fallback to context data
        const contextMessages = Array.isArray(data?.messages) ? data.messages : [];
        const contextUsers = Array.isArray(data?.users) ? data.users : [];
        
        // Normalize context messages
        const normalizedContextThreads = contextMessages.map(thread => ({
          ...thread,
          members: thread.members || thread.participants || [],
          participants: thread.participants || thread.members || [],
          messages: Array.isArray(thread.messages) ? thread.messages : [],
          readBy: thread.readBy || {}
        }));
        
        setThreads(normalizedContextThreads);
        setUsers(contextUsers);
        setApiError("Backend unavailable. Working in offline mode.");
      } finally {
        if (alive) setLoading(false);
      }
    };

    loadData();

    return () => { alive = false; };
  }, [me, api, engage, data]);

  // Auto-select first thread
  React.useEffect(() => {
    if (!activeId && threads.length > 0) {
      setActiveId(threads[0].id);
    }
  }, [threads, activeId]);

  const active = React.useMemo(() => threads.find((t) => t.id === activeId) || null, [threads, activeId]);

  // Mark thread as read
  React.useEffect(() => {
    if (!active || !me) return;
    if (active.readBy?.[me]) return;
    
    const next = { ...active, readBy: { ...(active.readBy || {}), [me]: true } };
    (async () => {
      try {
        await api.put("messages", next);
        setThreads((list) => list.map((t) => (t.id === next.id ? next : t)));
      } catch (err) {
        console.warn("Failed to mark thread as read", err);
      }
    })();
  }, [activeId, active, api, me]);

  // Auto-scroll messages
  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight + 1000;
  }, [activeId, active?.messages?.length]);

  function lastMessage(t) {
    const arr = Array.isArray(t?.messages) ? t.messages : [];
    return arr[arr.length - 1] || null;
  }

  function threadTitle(t) {
    if (t?.title) return t.title;
    const members = t?.members || t?.participants || [];
    const ids = members.filter((id) => id !== me);
    const names = ids
      .map((id) => {
        const user = users.find((u) => u.id === id);
        return user?.name || id;
      })
      .filter(Boolean);
    return names.length > 0 ? names.join(", ") : "DM";
  }

  async function send() {
    const text = compose.trim();
    if (!text || !active) return;

    const msgId = crypto.randomUUID ? crypto.randomUUID() : `msg-${Date.now()}`;
    const msg = { id: msgId, by: me, at: Date.now(), text };
    const next = {
      ...active,
      messages: [...(active.messages || []), msg],
      readBy: { ...(active.readBy || {}), [me]: true },
    };
    
    try {
      await api.put("messages", next);
      setThreads((list) => list.map((t) => (t.id === next.id ? next : t)));
      setCompose("");
    } catch (err) {
      console.error("Send failed", err);
      setApiError("Failed to send message. Please try again.");
    }
  }

  function startEdit(msg) {
    if (!msg || msg.by !== me) return;
    setEditingId(msg.id);
    setEditText(msg.text || "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  async function saveEdit() {
    if (!active || !editingId) return;
    const text = (editText || "").trim();
    if (!text) { cancelEdit(); return; }

    const next = {
      ...active,
      messages: (active.messages || []).map(m =>
        m.id === editingId ? { ...m, text, editedAt: Date.now() } : m
      ),
    };
    
    try {
      await api.put("messages", next);
      setThreads(list => list.map(t => t.id === next.id ? next : t));
      cancelEdit();
    } catch (err) {
      console.error("Edit failed", err);
    }
  }

  function deleteThread(id) {
    setDelConfirm({ id });
  }

  const filtered = React.useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      const title = threadTitle(t).toLowerCase();
      const lm = (lastMessage(t)?.text || "").toLowerCase();
      return title.includes(q) || lm.includes(q);
    });
  }, [threads, searchQ, users, me]);

  // Handle input and mentions
  function handleInput(e) {
    const val = e.target.value;
    setCompose(val);
    const caret = e.target.selectionStart || 0;
    const before = val.slice(0, caret);
    const m = before.match(/@(\w*)$/);
    if (m) {
      setShowMention(true);
      setMentionQuery(m[1]);
      setMentionIndex(0);
    } else {
      setShowMention(false);
      setMentionQuery("");
    }
  }

  const mentionMatches = React.useMemo(() => {
    if (!showMention) return [];
    const q = (mentionQuery || "").toLowerCase();
    return users.filter(u =>
      u.id !== me &&
      (u.name || "").replace(/\s/g, "").toLowerCase().startsWith(q)
    );
  }, [showMention, mentionQuery, users, me]);

  function insertMention(u) {
    const first = (u.name || "").split(" ")[0];
    setCompose(prev => {
      const el = composeRef.current;
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
  }

  async function handleRefresh() {
    console.log("Manual refresh triggered");
    setLoading(true);
    try {
      await Promise.all([
        refreshStore("users", { force: true }),
        refreshStore("messages", { force: true })
      ]);
      
      // Reload data using engage helper
      if (me) {
        const [msgs, us] = await Promise.all([
          engage.listMine(),
          api.getAll("users", {})
        ]);
        
        const normalizedThreads = msgs.map(thread => ({
          ...thread,
          members: thread.members || thread.participants || [],
          participants: thread.participants || thread.members || [],
          messages: Array.isArray(thread.messages) ? thread.messages : [],
          readBy: thread.readBy || {}
        }));
        
        setThreads(normalizedThreads);
        setUsers(us);
      }
    } catch (err) {
      console.error("Refresh failed:", err);
    } finally {
      setLoading(false);
    }
  }

  function isSameDay(a, b) {
    if (!a || !b) return false;
    const da = new Date(a), db = new Date(b);
    return da.getFullYear() === db.getFullYear() &&
           da.getMonth() === db.getMonth() &&
           da.getDate() === db.getDate();
  }
  function fmtDay(ts) {
    return new Date(ts).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  }

  if (loading) {
    return (
      <section className="page active discord" aria-label="Engage">
        <style>{LOCAL_CSS}</style>
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div>Loading messages...</div>
        </div>
      </section>
    );
  }

  if (!me) {
    return (
      <section className="page active discord" aria-label="Engage">
        <style>{LOCAL_CSS}</style>
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div>Please sign in to view messages</div>
        </div>
      </section>
    );
  }

  return (
    <section className="page active discord" aria-label="Engage">
      <style>{LOCAL_CSS}</style>

      <div className="card engage-head">
        <div className="title">
          <h2>Engage</h2>
          <div className="sub">Direct messages & team chats</div>
        </div>
        <div className="tools">
          <div className="search">
            <FaSearch />
            <input placeholder="Search conversations" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
          </div>
          <button className="btn secondary" onClick={handleRefresh} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button className="btn primary" onClick={() => setShowNew(true)}>
            <FaPlus /> New Message
          </button>
        </div>
      </div>

      {apiError && (
        <div className="api-warn" role="alert">{apiError}</div>
      )}

      <div className="engage-grid card">
        {/* Threads */}
        <div className="threads">
          <ul className="thread-list">
            {filtered.map((t) => {
              const lm = lastMessage(t);
              const unread = !(t.readBy && t.readBy[me]) && lm && lm.by !== me;
              const others = (t.members || t.participants || []).filter((id) => id !== me);
              const firstOther = users.find((u) => u.id === others[0]);
              const avInit = (firstOther?.initials) || ((firstOther?.name || "")
                  .split(" ")
                  .map((p) => p[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
              ).toUpperCase();
              return (
                <li key={t.id} className={`thread ${t.id === activeId ? "active" : ""}`} onClick={() => setActiveId(t.id)}>
                  <div className="t-avatar">{avInit || "?"}</div>
                  <div className="t-row">
                    <div className="t-title">{threadTitle(t)}</div>
                    <button
                      className="icon-btn danger"
                      title="Delete conversation"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteThread(t.id);
                      }}
                    >
                      <FaTrash />
                    </button>
                  </div>
                  <div className="t-last">
                    {lm ? (
                      <>
                        <span className="t-from">{lm.by === me ? "You:" : "Them:"}</span> {lm.text}
                      </>
                    ) : (
                      <em>No messages yet</em>
                    )}
                  </div>
                  {unread && <span className="unread" aria-label="Unread" />}
                </li>
              );
            })}
            {!filtered.length && (
              <li className="empty">
                {threads.length === 0 ? "No conversations yet" : "No matching conversations"}
              </li>
            )}
          </ul>
        </div>

        {/* Chat */}
        <div className="chat">
          {!active ? (
            <div className="empty-chat">
              <FaUsers size={26} />
              <div>Select or start a conversation</div>
            </div>
          ) : (
            <>
              <div className="chat-head">
                <div className="ch-title">{threadTitle(active)}</div>
              </div>
              <div className="bubbles" ref={listRef}>
                {(active.messages || []).map((m, idx, arr) => {
                  const sender = users.find((u) => u.id === m.by);
                  const senderName = m.by === me ? "You" : (sender?.name || m.by);
                  const prev = idx > 0 ? arr[idx - 1] : null;
                  const showDate = !prev || !isSameDay(m.at, prev.at);
                  return (
                    <React.Fragment key={m.id}>
                      {showDate && <div className="date-sep">{fmtDay(m.at)}</div>}
                      <div className={`bubble ${m.by === me ? "me" : "them"}`}>
                        <div className="meta">
                          <span className="who">{senderName}</span>
                          <span className="ts">{new Date(m.at).toLocaleString()}</span>
                          {m.by === me && editingId !== m.id && (
                            <button
                              className="link-btn"
                              onClick={() => startEdit(m)}
                              title="Edit your message"
                            >
                              Edit
                            </button>
                          )}
                          {m.editedAt && <span className="edited" aria-label="edited">(edited)</span>}
                        </div>
                        {editingId === m.id ? (
                          <div className="edit-box">
                            <input
                              className="edit-input"
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                                if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                              }}
                              autoFocus
                            />
                            <div className="edit-actions">
                              <button className="btn small" onClick={cancelEdit}>Cancel</button>
                              <button className="btn primary small" onClick={saveEdit} disabled={!editText.trim()}>Save</button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="text"
                            dangerouslySetInnerHTML={{ __html: highlightMentions(m.text, users) }}
                          />
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
              <div className="compose">
                <input
                  ref={composeRef}
                  placeholder="Type a message. Press Enter to send. Use @ to mention someone"
                  value={compose}
                  onChange={handleInput}
                  onKeyDown={(e) => {
                    if (showMention && mentionMatches.length) {
                      if (e.key === "ArrowDown") { setMentionIndex(i => (i + 1) % mentionMatches.length); e.preventDefault(); return; }
                      if (e.key === "ArrowUp") { setMentionIndex(i => (i - 1 + mentionMatches.length) % mentionMatches.length); e.preventDefault(); return; }
                      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionMatches[mentionIndex]); return; }
                      if (e.key === "Escape") { setShowMention(false); setMentionQuery(""); return; }
                    }
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                  }}
                />
                {showMention && mentionMatches.length > 0 && (
                  <div className="mention-pop">
                    {mentionMatches.slice(0, 5).map((u, idx) => (
                      <div
                        key={u.id}
                        className={`m-item ${idx === mentionIndex ? "active" : ""}`}
                        onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
                      >
                        <span className="avatar small">{u.initials || (u.name || "").split(" ").map(p => p[0]).join("")}</span>
                        <span className="m-name">{u.name}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button className="btn primary" onClick={send} disabled={!compose.trim()}>
                  <FaPaperPlane /> Send
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showNew && (
        <NewThreadModal 
          users={users} 
          me={me} 
          api={api} 
          engage={engage}
          onClose={() => setShowNew(false)} 
          onCreated={(t) => { 
            const normalized = {
              ...t,
              members: t.members || t.participants || [],
              participants: t.participants || t.members || [],
              messages: Array.isArray(t.messages) ? t.messages : [],
              readBy: t.readBy || {}
            };
            setThreads((l) => [normalized, ...l]); 
            setActiveId(t.id); 
          }} 
        />
      )}
      {delConfirm && (
        <ConfirmDeleteModal
          onClose={() => setDelConfirm(null)}
          onConfirm={async () => {
            const id = delConfirm.id;
            try {
              await api.del("messages", id);
              setThreads((list) => list.filter((t) => t.id !== id));
              setActiveId((cur) => (cur === id ? null : cur));
            } catch (err) {
              console.error("Delete failed", err);
              setApiError("Backend unavailable. Delete failed.");
            } finally {
              setDelConfirm(null);
            }
          }}
        />
      )}
    </section>
  );
}

function ConfirmDeleteModal({ onClose, onConfirm }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal show confirm-modal" role="dialog" aria-modal="true">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-card" style={{ width: "min(520px, 94vw)" }}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FaTrash />
            <strong>Delete conversation?</strong>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <FaTimes />
          </button>
        </div>

        <div className="modal-body" style={{ display: "grid", gap: 12 }}>
          <div className="warn">
            This will permanently delete this conversation and all of its messages. This action cannot be undone.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 6px" }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn danger" onClick={onConfirm} style={{ borderColor: "#5b2a2a" }}>
            <FaTrash style={{ marginRight: 6 }} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function NewThreadModal({ users = [], me, api, engage, onClose, onCreated }) {
  const [q, setQ] = React.useState("");
  const [pick, setPick] = React.useState(() => new Set());
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase();
    return users.filter((u) => u.id !== me && (!qq || (u.name || "").toLowerCase().includes(qq)));
  }, [q, users, me]);

  const toggle = (id) =>
    setPick((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const clearAll = () => setPick(new Set());

  const create = async () => {
    if (!pick.size) return;
    setSaving(true);
    
    const members = [me, ...Array.from(pick)];
    const title = name.trim() || null;
    
    try {
      // Use the engage helper to create thread
      const created = await engage.createThread({ 
        title, 
        members,
        text: "" // Empty initial message
      });
      
      onCreated?.(created);
      onClose?.();
    } catch (err) {
      console.error("Create thread failed", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal show new-thread-modal" role="dialog" aria-modal="true">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-card" style={{ width: "min(720px, 96vw)", maxHeight: "80vh" }}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FaUsers />
            <strong>New Message</strong>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <FaTimes />
          </button>
        </div>

        <div className="modal-body" style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
              Conversation name (optional for groups)
            </span>
            <input className="btn" value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <div className="nt-head">
            <div className="search">
              <FaSearch />
              <input
                placeholder="Search team"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <div className="nt-picked">
              {Array.from(pick).map((id) => {
                const u = users.find((x) => x.id === id);
                if (!u) return null;
                const initials =
                  u.initials || (u.name || "").split(" ").map((p) => p[0]).join("");
                return (
                  <span key={id} className="chip" onClick={() => toggle(id)} title="Remove">
                    <span className="avatar tiny">{initials}</span>
                    {u.name}
                  </span>
                );
              })}
              {!!pick.size && (
                <button className="btn outline" onClick={clearAll} style={{ height: 30 }}>
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="user-list">
            {filtered.map((u) => {
              const initials =
                u.initials || (u.name || "").split(" ").map((p) => p[0]).join("");
              const selected = pick.has(u.id);
              return (
                <div
                  key={u.id}
                  className={`u-row ${selected ? "sel" : ""}`}
                  onClick={() => toggle(u.id)}
                  role="button"
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggle(u.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="avatar small">{initials}</span>
                  <span className="name">{u.name}</span>
                </div>
              );
            })}
            {!filtered.length && <div style={{ opacity: 0.7 }}>No users</div>}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 6px" }}>
          <button className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn primary" disabled={!pick.size || saving} onClick={create}>
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

const LOCAL_CSS = `
/* =====================================================
   Engage — Discord‑style layout
   ===================================================== */
.discord .card{ border:1px solid #1a2748; }
.discord .btn{  border:1px solid #25335d; color:var(--text); }
.discord .btn.primary{border-color:#2b4fd7; }
.discord .btn.secondary{ border-color:#25335d; }
.discord .btn.outline{ background:transparent; border:1px solid #2b4fd7;  }

.engage-head{ display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; }
.engage-head .title h2{ margin:0; }
.engage-head .sub{ color:#9fb4de; opacity:.8; }
.engage-head .tools{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.search{ display:flex; align-items:center; gap:8px; border:1px solid #25335d;  padding:4px 8px; border-radius:8px; }
.search input{ background:transparent; border:0; outline:0; color:var(--text); min-width:0; }

/* Two column layout: fixed left rail like Discord DMs */
.engage-grid{
  display:grid;
  grid-template-columns: 300px 1fr;
  column-gap:0; row-gap:0;
  margin-top:12px; min-height:70vh; align-items:stretch;
}
@media (max-width: 900px){
  .engage-grid{ grid-template-columns: 1fr; }
  .threads{ border-right:none; border-bottom:1px solid #1a2748; }
}

/* Threads list (left) */
.threads{
  border-right:1px solid #1a2748;
  padding:8px 6px;
  display:flex; flex-direction:column; min-width:0; 
}
.thread-list{
  list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; overflow:auto; min-height:0;
}
.thread{
  position:relative;
  display:grid;
  grid-template-columns: 44px 1fr 28px; /* avatar, text, action */
  grid-template-rows: auto auto;
  align-items:center; gap:4px 10px;
  padding:8px 10px; border-radius:10px; cursor:pointer;
   border:1px solid #1a2748;
  transition:background .15s ease, border-color .15s ease, outline .15s ease;
}
.thread:hover{ background:#151e39; border-color:#2a3c6a; }
.thread.active{ background:#17254a; outline:2px solid #2b4fd7; border-color:#2b4fd7; }

:root[data-theme="light"] .thread.active {
outline:2px solid #2b4fd7;
background: #9fb9ff55;
border-color:#2b4fd7;
}

:root[data-theme="light"] .thread:hover{
 background: #bccafa6c; border-color:#2b4fd7;
  }

.t-avatar{
  grid-column:1; grid-row:1 / span 2;
  width:36px; height:36px; border-radius:50%;
  display:grid; place-items:center; font-weight:800;
  border:1px solid #2a3c6a;  font-size:12px;
}
.thread .t-row{ grid-column:2; grid-row:1; display:flex; align-items:center; justify-content:space-between; gap:8px; min-width:0; }
.thread .t-title{ font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.thread .icon-btn{ grid-column:3; grid-row:1; width:28px; height:28px; opacity:.65; flex:0 0 auto; }
.thread:hover .icon-btn{ opacity:1; }
.thread .t-last{ grid-column:2; grid-row:2; font-size:12px; opacity:.85; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.thread .t-from{  margin-right:6px; }
.unread{
  position:absolute; left:24px; top:6px; width:10px; height:10px; border-radius:50%;
 box-shadow:0 0 0 2px #0f162b;
}
 
.thread-list .empty{ text-align:center; padding:20px; opacity:.6; }

/* Chat pane (right) */
.chat{ display:grid; grid-template-rows:auto 1fr auto; min-height:0; }
.chat-head{ display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #1a2748; padding:8px 10px; min-width:0; }
.ch-title{ font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* Date separators like Discord */
.date-sep{
  margin:16px auto 8px; width:fit-content; padding:4px 10px;
   border:1px solid #25335d; color:#9fb4de;
  border-radius:999px; font-size:12px; opacity:.9;
}

/* Messages */
.bubbles{ overflow:auto; display:flex; flex-direction:column; gap:10px; padding:12px 12px; min-height:0; }
.bubble{
  max-width:760px; padding:8px 10px; border-radius:8px;
 border:1px solid #1f2c52;
  word-break:break-word; overflow-wrap:anywhere;
}
.bubble.me{ align-self:flex-end; border-color:#2b4fd7; }
.bubble.them{ align-self:flex-start; }
.bubble .meta{ font-size:11px; opacity:.85; margin-bottom:4px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.bubble .who{ font-weight:700;  }
.bubble .ts{ opacity:.7; }
.bubble .text{ white-space:pre-wrap; }

/* Composer */
.compose{ display:flex; gap:8px; align-items:center; position:relative; padding:10px; border-top:1px solid #1a2748; }
.compose input{ flex:1; min-width:0;  border:1px solid #25335d; border-radius:8px; padding:10px; color:var(--text); }
.btn.primary{ display:inline-flex; align-items:center; gap:8px; }

/* Mentions */
.mention{ color:#7db2ff; font-weight:700; }

.mention-pop{
  position:absolute; left:16px; bottom:calc(100% + 8px); width:min(360px, 80%);
   border:1px solid #25335d; border-radius:10px;
  box-shadow:0 10px 30px rgba(0,0,0,.45); padding:6px; z-index:30;
  max-height:240px; overflow:auto;
}

:root[data-theme="light"] .mention-pop {
 background: white;
}

.m-item{ display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:8px; cursor:pointer; }
.m-item:hover, .m-item.active{ background:#142043; }

:root[data-theme="light"] .m-item:hover, .m-item.active {
background: white;
}


/* New Thread modal + confirm (reuse existing styles where possible) */
.new-thread-modal .modal-card{ overflow:hidden; }
.nt-head{ display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
.nt-picked{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.chip{ display:flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px;  border:1px solid #25335d; cursor:pointer; }
.user-list{ display:grid; gap:8px; max-height:42vh; overflow:auto; padding-right:4px; }
.u-row{ display:flex; align-items:center; gap:10px; padding:8px; border:1px solid #22325b; border-radius:10px; cursor:pointer;  transition:background .2s,border-color .2s; }
.u-row.sel{ outline:2px solid #2b4fd7;}
.u-row input[type="checkbox"]{ width:16px; height:16px; }
.u-row .name{ flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

.avatar{ width:32px; height:32px; border-radius:50%; display:grid; place-items:center; border:1px solid #2a3c6a;  font-weight:800; font-size:12px; }
.avatar.small{ width:28px; height:28px; font-size:12px; }
.avatar.tiny{ width:22px; height:22px; font-size:11px; }

.confirm-modal .warn{ padding:10px; border-radius:10px;  border:1px solid #5b2a2a; color:#ffd9d9; }
:root[data-theme="light"] .confirm-modal .warn{ border-color:#ffc7c7; color:#6b1f1f; }

.api-warn{ margin:8px 0; padding:8px; border-radius:10px;  border:1px solid #5b2a2a; color:#ffd9d9; }
:root[data-theme="light"] .api-warn{ border-color:#ffc7c7; color:#6b1f1f; }

.link-btn{ background:none; border:0; color:#9fb4de; cursor:pointer; padding:0 6px; font-size:11px; }
.link-btn:hover{  text-decoration:underline; }
.edited{ font-style:italic; opacity:.7; margin-left:6px; }
.edit-box{ display:grid; gap:8px; }
.edit-input{ width:100%;  border:1px solid #25335d; color:var(--text); border-radius:8px; padding:8px 10px; }
.edit-actions{ display:flex; gap:8px; }
.btn.small{ padding:6px 10px; font-size:12px; border-radius:8px; }
`;