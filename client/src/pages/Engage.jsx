// Engage.jsx — redesigned messaging hub with optimistic updates & beautiful UI
import React from "react";
import { useApp } from "../context/AppContext";
import {
  FaPlus, FaSearch, FaTrash, FaPaperPlane, FaTimes, FaUsers,
  FaHashtag, FaEllipsisH, FaPen, FaCircle, FaUserShield, FaChevronLeft,
  FaCheck, FaCheckDouble
} from "react-icons/fa";

// ─── Helpers ───────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function highlightMentions(text, users) {
  if (!text) return "";
  const safe = escHtml(text);
  return safe.replace(/@(\w+)/g, (match, username) => {
    const u = users.find(
      (x) => (x.name || "").replace(/\s/g, "").toLowerCase().startsWith(username.toLowerCase())
    );
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

function relTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isSameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function fmtDay(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (isSameDay(ts, today)) return "Today";
  if (isSameDay(ts, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

// ─── Main Component ────────────────────────────────────────
export default function Engage() {
  const { api, user, engage, presenceFor } = useApp();

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
  const [mobileView, setMobileView] = React.useState("list");
  const [sending, setSending] = React.useState(false);

  const composeRef = React.useRef(null);
  const [showMention, setShowMention] = React.useState(false);
  const [mentionQuery, setMentionQuery] = React.useState("");
  const [mentionIndex, setMentionIndex] = React.useState(0);
  const listRef = React.useRef(null);
  const pollRef = React.useRef(null);
  const mountedRef = React.useRef(true);

  // ─── Initial load (runs ONCE, no `data` dependency) ───
  React.useEffect(() => {
    mountedRef.current = true;
    const loadData = async () => {
      setLoading(true);
      if (!me) { setThreads([]); setUsers([]); setLoading(false); return; }
      try {
        const [messageThreads, userList] = await Promise.all([
          engage.listMine().catch(() => []),
          api.getAll("users", {}).catch(() => [])
        ]);
        if (!mountedRef.current) return;
        const normalizedThreads = messageThreads.map(thread => ({
          ...thread,
          members: thread.members || thread.participants || [],
          participants: thread.participants || thread.members || [],
          messages: Array.isArray(thread.messages) ? thread.messages : [],
          readBy: thread.readBy || {}
        })).filter(t => {
          const others = (t.members || []).filter(id => id !== me);
          return others.every(id => {
            const u = userList.find(x => x.id === id);
            return !u || String(u.role || "").toLowerCase() === "admin";
          });
        });
        setThreads(normalizedThreads);
        setUsers(userList);
        setApiError(null);
      } catch {
        if (mountedRef.current) setApiError("Connection issues detected.");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };
    loadData();
    return () => { mountedRef.current = false; };
  }, [me]);

  // ─── Background polling (silent, no flicker) ───
  React.useEffect(() => {
    if (!me) return;
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      try {
        const [freshThreads, freshUsers] = await Promise.all([
          engage.listMine().catch(() => null),
          api.getAll("users", {}).catch(() => null)
        ]);
        if (stopped || !mountedRef.current) return;
        if (freshThreads) {
          setThreads(prev => {
            const normalized = freshThreads.map(t => ({
              ...t,
              members: t.members || t.participants || [],
              participants: t.participants || t.members || [],
              messages: Array.isArray(t.messages) ? t.messages : [],
              readBy: t.readBy || {}
            })).filter(t => {
              const others = (t.members || []).filter(id => id !== me);
              return others.every(id => {
                const u = (freshUsers || users).find(x => x.id === id);
                return !u || String(u.role || "").toLowerCase() === "admin";
              });
            });
            // Only update if message counts or content actually changed
            if (JSON.stringify(prev.map(t => t.messages?.length)) === JSON.stringify(normalized.map(t => t.messages?.length))
                && prev.length === normalized.length) {
              return prev;
            }
            return normalized;
          });
        }
        if (freshUsers) {
          setUsers(prev => {
            if (prev.length === freshUsers.length && prev.every((u, i) => u.id === freshUsers[i]?.id && u.presence === freshUsers[i]?.presence)) return prev;
            return freshUsers;
          });
        }
      } catch {}
      if (!stopped) pollRef.current = setTimeout(poll, 8000);
    };
    pollRef.current = setTimeout(poll, 8000);
    return () => { stopped = true; if (pollRef.current) clearTimeout(pollRef.current); };
  }, [me]);

  // Auto-select first thread on desktop
  React.useEffect(() => {
    if (!activeId && threads.length > 0 && window.innerWidth > 768) {
      setActiveId(threads[0].id);
    }
  }, [threads, activeId]);

  const active = React.useMemo(() => threads.find((t) => t.id === activeId) || null, [threads, activeId]);

  // Mark as read
  React.useEffect(() => {
    if (!active || !me) return;
    if (active.readBy?.[me]) return;
    const next = { ...active, readBy: { ...(active.readBy || {}), [me]: true } };
    (async () => {
      try {
        await api.put("messages", next);
        setThreads((list) => list.map((t) => (t.id === next.id ? next : t)));
      } catch {}
    })();
  }, [activeId, active, api, me]);

  // Auto-scroll to bottom
  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [activeId, active?.messages?.length]);

  function lastMessage(t) {
    const arr = Array.isArray(t?.messages) ? t.messages : [];
    return arr[arr.length - 1] || null;
  }

  function threadTitle(t) {
    if (t?.title) return t.title;
    const members = t?.members || t?.participants || [];
    const ids = members.filter((id) => id !== me);
    const names = ids.map((id) => users.find((u) => u.id === id)?.name || id).filter(Boolean);
    return names.length > 0 ? names.join(", ") : "Direct Message";
  }

  function getInitials(t) {
    const members = t?.members || t?.participants || [];
    const others = members.filter((id) => id !== me);
    const first = users.find((u) => u.id === others[0]);
    return (first?.initials || (first?.name || "").split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("")).toUpperCase() || "?";
  }

  function getOtherUser(t) {
    const members = t?.members || t?.participants || [];
    const others = members.filter((id) => id !== me);
    return users.find((u) => u.id === others[0]) || null;
  }

  // ─── Optimistic send (no full refresh) ───
  async function send() {
    const text = compose.trim();
    if (!text || !active || sending) return;

    const msgId = crypto.randomUUID ? crypto.randomUUID() : `msg-${Date.now()}`;
    const optimisticMsg = { id: msgId, by: me, at: Date.now(), text, _pending: true };

    // Optimistic update — instant feedback
    setThreads(list => list.map(t =>
      t.id === active.id
        ? { ...t, messages: [...(t.messages || []), optimisticMsg], readBy: { [me]: true } }
        : t
    ));
    setCompose("");
    setSending(true);

    try {
      // Build the full updated thread and PUT it (server only has PUT /messages/:id)
      const updatedThread = {
        ...active,
        messages: [...(active.messages || []), { id: msgId, by: me, at: Date.now(), text }],
        readBy: { [me]: true },
      };
      await api.put("messages", updatedThread);
      // Mark optimistic message as confirmed
      setThreads(list => list.map(t =>
        t.id === active.id
          ? { ...t, messages: (t.messages || []).map(m => m.id === msgId ? { ...m, _pending: false } : m) }
          : t
      ));

      // Handle @mentions for notifications
      const mentions = text.match(/@(\w+)/g);
      if (mentions) {
        for (const m of mentions) {
          const username = m.slice(1).toLowerCase();
          const targetUser = users.find(u =>
            (u.name || "").replace(/\s/g, "").toLowerCase().startsWith(username) &&
            String(u.role || "").toLowerCase() === "admin"
          );
          if (targetUser && targetUser.id !== me) {
            const previewText = text.length > 60 ? text.substring(0, 60) + "..." : text;
            await api.add("notifications", {
              id: crypto.randomUUID ? crypto.randomUUID() : `notif-${Date.now()}`,
              to: targetUser.id,
              from: me,
              title: "Staff Mention",
              text: `${user?.name || 'Someone'}: "${previewText}"`,
              type: "mention",
              threadId: active.id,
              read: false,
              createdAt: Date.now()
            });
          }
        }
      }
    } catch {
      // Revert optimistic update on failure
      setThreads(list => list.map(t =>
        t.id === active.id
          ? { ...t, messages: (t.messages || []).filter(m => m.id !== msgId) }
          : t
      ));
      setApiError("Failed to deliver message.");
    } finally {
      setSending(false);
    }
  }

  function startEdit(msg) {
    if (!msg || msg.by !== me) return;
    setEditingId(msg.id);
    setEditText(msg.text || "");
  }
  function cancelEdit() { setEditingId(null); setEditText(""); }

  async function saveEdit() {
    if (!active || !editingId) return;
    const text = (editText || "").trim();
    if (!text) { cancelEdit(); return; }

    // Optimistic edit
    const oldMessages = active.messages || [];
    setThreads(list => list.map(t =>
      t.id === active.id
        ? { ...t, messages: (t.messages || []).map(m => m.id === editingId ? { ...m, text, editedAt: Date.now() } : m) }
        : t
    ));
    cancelEdit();

    try {
      // Build the full updated thread with the edited message
      const currentThread = threads.find(t => t.id === active.id);
      const updatedThread = {
        ...currentThread,
        messages: (currentThread?.messages || []).map(m => m.id === editingId ? { ...m, text, editedAt: Date.now() } : m),
      };
      await api.put("messages", updatedThread);
    } catch {
      // Revert on failure
      setThreads(list => list.map(t => t.id === active.id ? { ...t, messages: oldMessages } : t));
    }
  }

  function deleteThread(id) { setDelConfirm({ id }); }

  const filteredThreads = React.useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      const title = threadTitle(t).toLowerCase();
      const lm = (lastMessage(t)?.text || "").toLowerCase();
      return title.includes(q) || lm.includes(q);
    });
  }, [threads, searchQ, users, me]);

  function handleInput(e) {
    const val = e.target.value;
    setCompose(val);
    const caret = e.target.selectionStart || 0;
    const before = val.slice(0, caret);
    const m = before.match(/@(\w*)$/);
    if (m) { setShowMention(true); setMentionQuery(m[1]); setMentionIndex(0); }
    else { setShowMention(false); setMentionQuery(""); }
  }

  const mentionMatches = React.useMemo(() => {
    if (!showMention) return [];
    const q = (mentionQuery || "").toLowerCase();
    return users.filter(u =>
      u.id !== me &&
      String(u.role || "").toLowerCase() === "admin" &&
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
        if (el) { el.focus(); const pos = before.length; el.setSelectionRange(pos, pos); }
      }, 0);
      return next;
    });
    setShowMention(false); setMentionQuery("");
  }

  const handleThreadClick = (tid) => { setActiveId(tid); setMobileView("chat"); };
  const handleBackToList = () => { setMobileView("list"); };

  if (loading) return (
    <section className="eng-page"><style>{ENGAGE_CSS}</style>
      <div className="eng-loading"><div className="eng-spinner" /><span>Loading workspace...</span></div>
    </section>
  );

  if (!me) return (
    <section className="eng-page"><style>{ENGAGE_CSS}</style>
      <div className="eng-empty-full"><FaUserShield size={48} /><p>Access restricted. Log in to continue.</p></div>
    </section>
  );

  const activeOther = active ? getOtherUser(active) : null;
  const activeMembers = active ? (active.members || active.participants || []).filter(id => id !== me) : [];

  return (
    <section className="eng-page" aria-label="Engage">
      <style>{ENGAGE_CSS}</style>

      <div className={`eng-grid ${mobileView === 'chat' ? 'show-chat' : 'show-list'}`}>
        {/* ─── Sidebar ─── */}
        <aside className="eng-sidebar">
          <div className="eng-sidebar-header">
            <div className="eng-sidebar-title">
              <div className="eng-logo-icon"><FaHashtag /></div>
              <div>
                <h1>Messages</h1>
                <span className="eng-online-tag"><span className="eng-dot-online" />Staff Portal</span>
              </div>
            </div>
            <button className="eng-btn-new" onClick={() => setShowNew(true)} title="New Thread"><FaPlus /></button>
          </div>

          <div className="eng-sidebar-search">
            <FaSearch className="eng-search-icon" />
            <input className="eng-search-input" placeholder="Search conversations..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
          </div>

          <div className="eng-thread-list">
            {filteredThreads.map((t) => {
              const lm = lastMessage(t);
              const unread = !(t.readBy && t.readBy[me]) && lm && lm.by !== me;
              const initials = getInitials(t);
              const other = getOtherUser(t);
              const color = avatarColor(other?.id || t.id);
              const presence = other ? presenceFor(other) : "offline";
              const isGroup = (t.members || t.participants || []).length > 2;

              return (
                <div key={t.id} className={`eng-thread ${t.id === activeId ? "active" : ""} ${unread ? "unread" : ""}`} onClick={() => handleThreadClick(t.id)}>
                  <div className="eng-avatar-wrap">
                    <div className="eng-avatar" style={{ background: color }}>{isGroup ? <FaUsers size={14} /> : initials}</div>
                    {!isGroup && <span className={`presence-indicator ${presence}`} />}
                  </div>
                  <div className="eng-thread-info">
                    <div className="eng-thread-top">
                      <span className="name">{threadTitle(t)}</span>
                      <span className="time">{lm ? relTime(lm.at) : ""}</span>
                    </div>
                    <div className="preview">
                      {lm ? (
                        <>{lm.by === me && <FaCheck size={10} className="preview-check" />}{lm.by === me ? " " : ""}{lm.text}</>
                      ) : <em>No messages yet</em>}
                    </div>
                  </div>
                  {unread && <div className="unread-badge" />}
                  <button className="del-btn" onClick={(e) => { e.stopPropagation(); deleteThread(t.id); }} title="Delete"><FaTrash /></button>
                </div>
              );
            })}
            {!filteredThreads.length && (
              <div className="eng-thread-empty">
                <div className="empty-illust">
                  <FaUsers size={28} />
                </div>
                <p>No conversations yet</p>
                <span>Start a new thread to get going</span>
              </div>
            )}
          </div>
        </aside>

        {/* ─── Chat Panel ─── */}
        <div className="eng-chat">
          {!active ? (
            <div className="eng-chat-empty">
              <div className="empty-chat-illust">
                <div className="empty-bubble b1" />
                <div className="empty-bubble b2" />
                <div className="empty-bubble b3" />
              </div>
              <h3>Your Messages</h3>
              <p>Select a conversation or start a new thread</p>
              <button className="eng-btn-start" onClick={() => setShowNew(true)}><FaPlus /> New Conversation</button>
            </div>
          ) : (
            <>
              <div className="eng-chat-header">
                <div className="eng-chat-header-info">
                  <button className="mobile-back-btn" onClick={handleBackToList}><FaChevronLeft /></button>
                  <div className="eng-header-avatar" style={{ background: avatarColor(activeOther?.id || active.id) }}>
                    {activeMembers.length > 1 ? <FaUsers size={13} /> : getInitials(active)}
                  </div>
                  <div className="eng-header-meta">
                    <div className="name">{threadTitle(active)}</div>
                    <div className="status">
                      {activeMembers.length > 1
                        ? `${activeMembers.length + 1} members`
                        : activeOther
                          ? (presenceFor(activeOther) === "online"
                            ? <><span className="status-dot online" /> Online</>
                            : <><span className="status-dot" /> Last seen recently</>)
                          : ""}
                    </div>
                  </div>
                </div>
                <button className="eng-more-btn"><FaEllipsisH /></button>
              </div>

              <div className="eng-messages" ref={listRef}>
                {(active.messages || []).map((m, idx, arr) => {
                  const sender = users.find((u) => u.id === m.by);
                  const prev = idx > 0 ? arr[idx - 1] : null;
                  const next = idx < arr.length - 1 ? arr[idx + 1] : null;
                  const showDate = !prev || !isSameDay(m.at, prev.at);
                  const isMe = m.by === me;
                  const grouped = prev && prev.by === m.by && !showDate && (m.at - prev.at < 300000);
                  const isLast = !next || next.by !== m.by || (next.at - m.at >= 300000);
                  const isPending = m._pending;

                  return (
                    <React.Fragment key={m.id}>
                      {showDate && <div className="eng-date-sep"><span>{fmtDay(m.at)}</span></div>}
                      <div className={`eng-msg ${isMe ? "me" : "them"} ${grouped ? "grouped" : ""} ${isLast ? "last-in-group" : ""} ${isPending ? "pending" : ""}`}>
                        {!isMe && !grouped && (
                          <div className="eng-msg-avatar" style={{ background: avatarColor(m.by) }}>
                            {sender?.initials || (sender?.name || "?")[0]}
                          </div>
                        )}
                        {!isMe && grouped && <div className="eng-msg-avatar-spacer" />}
                        <div className="eng-msg-body">
                          {!grouped && !isMe && (
                            <div className="eng-msg-sender">{sender?.name || m.by}</div>
                          )}
                          <div className="eng-bubble-row">
                            <div className={`eng-bubble ${isLast ? "tail" : ""}`}>
                              {editingId === m.id ? (
                                <div className="eng-edit-box">
                                  <textarea value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                                    if (e.key === "Escape") cancelEdit();
                                  }} autoFocus />
                                  <div className="eng-edit-actions">
                                    <button onClick={cancelEdit}>Cancel</button>
                                    <button className="save" onClick={saveEdit}>Save</button>
                                  </div>
                                </div>
                              ) : (
                                <div className="eng-bubble-text" dangerouslySetInnerHTML={{ __html: highlightMentions(m.text, users) }} />
                              )}
                              {m.editedAt && editingId !== m.id && <span className="eng-edited-tag">edited</span>}
                            </div>
                            {isMe && editingId !== m.id && (
                              <button className="eng-edit-trigger" onClick={() => startEdit(m)} title="Edit"><FaPen size={10} /></button>
                            )}
                          </div>
                          <div className={`eng-msg-meta ${isMe ? "me" : ""}`}>
                            <span className="eng-msg-time">
                              {new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            </span>
                            {isMe && (
                              <span className="eng-msg-status">
                                {isPending ? <FaCheck size={9} className="pending-icon" /> : <FaCheckDouble size={10} className="sent-icon" />}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>

              <div className="eng-composer">
                {showMention && mentionMatches.length > 0 && (
                  <div className="eng-mention-pop">
                    <div className="pop-head">Staff Members</div>
                    {mentionMatches.slice(0, 5).map((u, idx) => (
                      <div key={u.id} className={`mention-item ${idx === mentionIndex ? "active" : ""}`} onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}>
                        <div className="mention-av" style={{ background: avatarColor(u.id) }}>{u.initials || u.name[0]}</div>
                        <div className="mention-info">
                          <div className="mention-name">{u.name}</div>
                          <div className="mention-role">Administrator</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="eng-composer-inner">
                  <input
                    ref={composeRef}
                    placeholder="Type a message..."
                    value={compose}
                    onChange={handleInput}
                    onKeyDown={(e) => {
                      if (showMention && mentionMatches.length) {
                        if (e.key === "ArrowDown") { setMentionIndex(i => (i + 1) % mentionMatches.length); e.preventDefault(); }
                        if (e.key === "ArrowUp") { setMentionIndex(i => (i - 1 + mentionMatches.length) % mentionMatches.length); e.preventDefault(); }
                        if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionMatches[mentionIndex]); }
                        if (e.key === "Escape") setShowMention(false);
                      } else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                    }}
                  />
                  <button className="eng-send-btn" onClick={send} disabled={!compose.trim() || sending}>
                    <FaPaperPlane size={14} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {apiError && (
        <div className="eng-toast" role="alert">
          <span>{apiError}</span>
          <button onClick={() => setApiError(null)}><FaTimes size={12} /></button>
        </div>
      )}

      {showNew && (
        <NewThreadModal users={users} me={me} myRole={user?.role} api={api} engage={engage} onClose={() => setShowNew(false)} onCreated={(t) => {
          setThreads((l) => [t, ...l]); setActiveId(t.id); setMobileView("chat");
        }} />
      )}

      {delConfirm && (
        <ConfirmDeleteModal onClose={() => setDelConfirm(null)} onConfirm={async () => {
          await api.del("messages", delConfirm.id);
          setThreads((list) => list.filter((t) => t.id !== delConfirm.id));
          if (activeId === delConfirm.id) { setActiveId(null); setMobileView("list"); }
          setDelConfirm(null);
        }} />
      )}
    </section>
  );
}

// ─── Modals ────────────────────────────────────────────────
function ConfirmDeleteModal({ onClose, onConfirm }) {
  return (
    <div className="eng-overlay" onClick={onClose}>
      <div className="eng-modal small" onClick={e => e.stopPropagation()}>
        <div className="eng-modal-header"><h3>Delete Conversation</h3><button onClick={onClose}><FaTimes /></button></div>
        <div className="eng-modal-body"><p>This will permanently remove this thread. This action cannot be undone.</p></div>
        <div className="eng-modal-footer">
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function NewThreadModal({ users = [], me, myRole, api, engage, onClose, onCreated }) {
  const [q, setQ] = React.useState("");
  const [pick, setPick] = React.useState(new Set());
  const [saving, setSaving] = React.useState(false);

  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase();
    return users.filter((u) =>
      u.id !== me &&
      String(u.role || "").toLowerCase() === "admin" &&
      (!qq || (u.name || "").toLowerCase().includes(qq))
    );
  }, [q, users, me]);

  const toggle = (id) => setPick((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const create = async () => {
    if (!pick.size) return;
    setSaving(true);
    try {
      const created = await engage.createThread({ members: [me, ...Array.from(pick)], text: "" });
      onCreated?.(created); onClose?.();
    } catch {} finally { setSaving(false); }
  };

  return (
    <div className="eng-overlay" onClick={onClose}>
      <div className="eng-modal" onClick={e => e.stopPropagation()}>
        <div className="eng-modal-header"><h3>New Conversation</h3><button onClick={onClose}><FaTimes /></button></div>
        <div className="eng-modal-body">
          <div className="eng-nt-search">
            <FaSearch className="nt-icon" />
            <input placeholder="Search staff..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          {pick.size > 0 && (
            <div className="eng-selected-chips">
              {Array.from(pick).map(id => {
                const u = users.find(x => x.id === id);
                return u ? (
                  <span key={id} className="eng-chip">
                    {u.name?.split(" ")[0]}
                    <button onClick={() => toggle(id)}><FaTimes size={8} /></button>
                  </span>
                ) : null;
              })}
            </div>
          )}
          <div className="eng-user-list">
            {filtered.map((u) => (
              <div key={u.id} className={`user-row ${pick.has(u.id) ? "selected" : ""}`} onClick={() => toggle(u.id)}>
                <div className="av" style={{ background: avatarColor(u.id) }}>{u.initials || u.name[0]}</div>
                <div className="details">
                  <div className="name">{u.name}</div>
                  <div className="role-tag">Administrator</div>
                </div>
                <div className="check-circle">{pick.has(u.id) && <FaCheck size={10} />}</div>
              </div>
            ))}
            {!filtered.length && <div className="no-results">No staff members found</div>}
          </div>
        </div>
        <div className="eng-modal-footer">
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!pick.size || saving} onClick={create}>{saving ? "Creating..." : `Start Chat${pick.size > 1 ? ` (${pick.size})` : ""}`}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────
const ENGAGE_CSS = `
  /* ── Page Layout ── */
  .eng-page {
    display: flex; flex-direction: column; height: calc(100vh - 64px);
    background: var(--bg); color: var(--text); position: relative; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  /* ── Grid ── */
  .eng-grid {
    flex: 1; display: grid; grid-template-columns: 380px 1fr;
    overflow: hidden; position: relative;
  }

  /* ── Sidebar ── */
  .eng-sidebar {
    background: var(--surface); border-right: 1px solid var(--border);
    display: flex; flex-direction: column; z-index: 2;
  }
  .eng-sidebar-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; background: var(--surface); border-bottom: 1px solid var(--border);
  }
  .eng-sidebar-title { display: flex; align-items: center; gap: 12px; }
  .eng-logo-icon {
    width: 38px; height: 38px; border-radius: 12px;
    background: linear-gradient(135deg, var(--primary) 0%, #8b5cf6 100%);
    color: #fff; display: grid; place-items: center; font-size: 16px;
  }
  .eng-sidebar-title h1 { margin: 0; font-size: 17px; font-weight: 700; color: var(--text); }
  .eng-online-tag { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-muted); font-weight: 500; }
  .eng-dot-online { width: 6px; height: 6px; border-radius: 50%; background: #25d366; }
  .eng-btn-new {
    width: 36px; height: 36px; border-radius: 50%; border: none;
    background: var(--primary); color: #fff; cursor: pointer;
    display: grid; place-items: center; font-size: 14px;
    transition: all 0.2s; box-shadow: 0 2px 8px rgba(99,102,241,0.3);
  }
  .eng-btn-new:hover { transform: scale(1.05); box-shadow: 0 4px 12px rgba(99,102,241,0.4); }

  .eng-sidebar-search { padding: 8px 12px; position: relative; }
  .eng-search-input {
    width: 100%; padding: 9px 12px 9px 38px; border-radius: 8px;
    border: none; background: var(--bg); font-size: 13px; color: var(--text);
    outline: none; transition: background 0.2s;
  }
  .eng-search-input:focus { background: var(--surface); box-shadow: 0 0 0 1.5px var(--primary); }
  .eng-search-icon { position: absolute; left: 24px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 13px; }

  /* ── Thread List ── */
  .eng-thread-list { flex: 1; overflow-y: auto; }
  .eng-thread {
    display: flex; align-items: center; gap: 14px;
    padding: 14px 20px; cursor: pointer; position: relative;
    transition: background 0.15s;
    border-bottom: 1px solid var(--border);
  }
  .eng-thread:hover { background: rgba(0,0,0,0.02); }
  :root[data-theme="dark"] .eng-thread:hover { background: rgba(255,255,255,0.02); }
  .eng-thread.active { background: var(--bg); }
  .eng-thread.unread .eng-thread-info .name { color: var(--text); font-weight: 800; }
  .eng-thread.unread .preview { color: var(--text); font-weight: 600; }

  .eng-avatar-wrap { position: relative; flex-shrink: 0; }
  .eng-avatar {
    width: 48px; height: 48px; border-radius: 50%;
    color: #fff; display: grid; place-items: center;
    font-weight: 700; font-size: 16px; letter-spacing: 0.5px;
  }
  .presence-indicator {
    position: absolute; bottom: 0; right: 0;
    width: 13px; height: 13px; border-radius: 50%;
    border: 2.5px solid var(--surface); background: var(--text-muted);
  }
  .presence-indicator.online { background: #25d366; }
  .presence-indicator.away { background: #f59e0b; }

  .eng-thread-info { flex: 1; min-width: 0; }
  .eng-thread-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3px; }
  .eng-thread-top .name { font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text); }
  .eng-thread-top .time { font-size: 11px; color: var(--text-muted); flex-shrink: 0; margin-left: 8px; }
  .preview {
    font-size: 13px; color: var(--text-muted); white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 2px;
  }
  .preview-check { color: #53bdeb; flex-shrink: 0; }

  .unread-badge {
    position: absolute; right: 20px; bottom: 16px;
    width: 10px; height: 10px; border-radius: 50%;
    background: #25d366;
  }
  .del-btn {
    opacity: 0; position: absolute; right: 12px; top: 12px;
    background: var(--surface); border: 1px solid var(--border); color: var(--text-muted);
    cursor: pointer; padding: 5px; border-radius: 50%;
    font-size: 10px; transition: all 0.15s; display: grid; place-items: center;
    width: 26px; height: 26px;
  }
  .eng-thread:hover .del-btn { opacity: 0.6; }
  .del-btn:hover { opacity: 1 !important; color: #ef4444; border-color: #fecaca; background: #fff1f2; }
  :root[data-theme="dark"] .del-btn:hover { background: #451a1a; }

  .eng-thread-empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 60px 20px; text-align: center;
  }
  .empty-illust {
    width: 64px; height: 64px; border-radius: 50%;
    background: var(--bg); display: grid; place-items: center;
    color: var(--text-muted); margin-bottom: 16px;
  }
  .eng-thread-empty p { font-size: 15px; font-weight: 600; color: var(--text); margin: 0 0 4px; }
  .eng-thread-empty span { font-size: 13px; color: var(--text-muted); }

  /* ── Chat Panel ── */
  .eng-chat {
    display: flex; flex-direction: column;
    background: #efeae2; position: relative; z-index: 1;
  }
  :root[data-theme="dark"] .eng-chat { background: #0b141a; }
  .eng-chat::before {
    content: ''; position: absolute; inset: 0;
    background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d1ccc0' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E") repeat;
    opacity: 0.4; z-index: 0; pointer-events: none;
  }
  :root[data-theme="dark"] .eng-chat::before { filter: invert(1); opacity: 0.05; }
  .eng-chat > * { position: relative; z-index: 1; }

  .eng-chat-empty {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    text-align: center; padding: 40px; z-index: 1; background: var(--surface);
  }
  .empty-chat-illust { display: flex; gap: 12px; margin-bottom: 28px; align-items: flex-end; }
  .empty-bubble { border-radius: 18px; opacity: 0.15; }
  .empty-bubble.b1 { width: 80px; height: 40px; background: var(--primary); border-bottom-left-radius: 6px; }
  .empty-bubble.b2 { width: 100px; height: 50px; background: var(--text-muted); border-bottom-right-radius: 6px; }
  .empty-bubble.b3 { width: 60px; height: 35px; background: var(--primary); border-bottom-left-radius: 6px; }
  .eng-chat-empty h3 { font-size: 22px; font-weight: 300; color: var(--text); margin: 0 0 8px; }
  .eng-chat-empty p { font-size: 14px; color: var(--text-muted); margin: 0 0 24px; }
  .eng-btn-start {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 24px; border-radius: 24px; border: none;
    background: var(--primary); color: #fff; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: all 0.2s;
    box-shadow: 0 2px 12px rgba(99,102,241,0.3);
  }
  .eng-btn-start:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(99,102,241,0.4); }

  /* ── Chat Header ── */
  .eng-chat-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 20px; background: var(--surface);
    border-bottom: 1px solid var(--border); min-height: 60px;
  }
  .eng-chat-header-info { display: flex; align-items: center; gap: 14px; }
  .mobile-back-btn { display: none; background: none; border: none; font-size: 18px; color: var(--primary); cursor: pointer; padding: 4px; }
  .eng-header-avatar {
    width: 40px; height: 40px; border-radius: 50%;
    color: #fff; display: grid; place-items: center;
    font-weight: 700; font-size: 14px; flex-shrink: 0;
  }
  .eng-header-meta .name { font-weight: 700; font-size: 15px; color: var(--text); }
  .eng-header-meta .status { font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 5px; }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-muted); display: inline-block; }
  .status-dot.online { background: #25d366; }
  .eng-more-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 8px; border-radius: 50%; }
  .eng-more-btn:hover { background: var(--bg); }

  /* ── Messages ── */
  .eng-messages {
    flex: 1; overflow-y: auto; padding: 16px 60px;
    display: flex; flex-direction: column; gap: 2px;
    scroll-behavior: smooth;
  }

  .eng-date-sep {
    display: flex; justify: center; margin: 16px 0 12px; justify-content: center;
  }
  .eng-date-sep span {
    font-size: 11px; font-weight: 600; color: var(--text-muted);
    background: var(--surface); padding: 5px 14px; border-radius: 8px;
    text-transform: uppercase; letter-spacing: 0.3px;
    box-shadow: 0 1px 1px rgba(0,0,0,0.06); border: 1px solid var(--border);
  }

  /* ── Message Bubbles ── */
  .eng-msg { display: flex; gap: 6px; max-width: 65%; margin-bottom: 1px; animation: msgIn 0.2s ease-out; }
  .eng-msg.me { align-self: flex-end; flex-direction: row-reverse; }
  .eng-msg.grouped { margin-top: 0; }
  .eng-msg.last-in-group { margin-bottom: 8px; }
  .eng-msg.pending { opacity: 0.7; }

  @keyframes msgIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .eng-msg-avatar {
    width: 28px; height: 28px; border-radius: 50%;
    color: #fff; display: grid; place-items: center;
    font-size: 10px; font-weight: 700; flex-shrink: 0;
    margin-top: 2px;
  }
  .eng-msg-avatar-spacer { width: 28px; flex-shrink: 0; }

  .eng-msg-body { display: flex; flex-direction: column; min-width: 0; }
  .eng-msg-sender {
    font-size: 11.5px; font-weight: 700; padding: 0 8px 2px;
    color: var(--primary);
  }
  .eng-bubble-row { display: flex; align-items: center; gap: 4px; }
  .eng-msg.me .eng-bubble-row { flex-direction: row-reverse; }

  .eng-bubble {
    padding: 7px 12px 8px; border-radius: 8px;
    font-size: 14px; line-height: 1.45; color: var(--text);
    background: var(--surface); position: relative; word-wrap: break-word;
    box-shadow: 0 1px 0.5px rgba(0,0,0,0.08);
    max-width: 100%;
  }
  .eng-msg.me .eng-bubble {
    background: #d9fdd3; color: #111b21;
  }
  :root[data-theme="dark"] .eng-msg.me .eng-bubble { background: #005c4b; color: #e9edef; }
  
  .eng-msg.them .eng-bubble {
    background: var(--surface);
  }

  /* Bubble tails */
  .eng-msg.them:not(.grouped) .eng-bubble.tail::before {
    content: ''; position: absolute; top: 0; left: -8px;
    border-width: 0 8px 8px 0; border-style: solid;
    border-color: transparent var(--surface) transparent transparent;
  }
  .eng-msg.me:not(.grouped) .eng-bubble.tail::after {
    content: ''; position: absolute; top: 0; right: -8px;
    border-width: 0 0 8px 8px; border-style: solid;
    border-color: transparent transparent transparent #d9fdd3;
  }
  :root[data-theme="dark"] .eng-msg.me:not(.grouped) .eng-bubble.tail::after {
    border-color: transparent transparent transparent #005c4b;
  }

  .eng-bubble-text { word-break: break-word; }
  .eng-edited-tag {
    font-size: 10px; color: var(--text-muted); font-style: italic;
    margin-left: 6px; opacity: 0.7;
  }

  .eng-msg-meta {
    display: flex; align-items: center; gap: 3px;
    padding: 0 8px; margin-top: 1px;
  }
  .eng-msg-meta.me { justify-content: flex-end; }
  .eng-msg-time { font-size: 10.5px; color: var(--text-muted); }
  .eng-msg-status { display: flex; align-items: center; margin-left: 2px; }
  .pending-icon { color: var(--text-muted); }
  .sent-icon { color: #53bdeb; }

  .eng-edit-trigger {
    opacity: 0; background: var(--surface); border: 1px solid var(--border);
    color: var(--text-muted); cursor: pointer; padding: 5px;
    border-radius: 50%; width: 24px; height: 24px;
    display: grid; place-items: center; transition: all 0.15s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }
  .eng-bubble-row:hover .eng-edit-trigger { opacity: 1; }
  .eng-edit-trigger:hover { color: var(--primary); border-color: var(--primary); }

  .eng-mention {
    font-weight: 700; color: var(--primary);
    background: rgba(99,102,241,0.1); padding: 1px 4px; border-radius: 4px;
  }
  .eng-msg.me .eng-mention { color: #075e54; background: rgba(7,94,84,0.1); }
  :root[data-theme="dark"] .eng-msg.me .eng-mention { color: #25d366; background: rgba(37,211,102,0.1); }

  /* ── Composer ── */
  .eng-composer {
    padding: 10px 60px 14px; background: var(--bg);
    position: relative;
  }
  .eng-composer-inner {
    display: flex; align-items: center; gap: 10px;
    background: var(--surface); border-radius: 8px; padding: 6px 6px 6px 16px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04); border: 1px solid var(--border);
  }
  .eng-composer-inner input {
    flex: 1; padding: 8px 0; border: none; background: none;
    outline: none; font-size: 14px; color: var(--text);
  }
  .eng-composer-inner input::placeholder { color: var(--text-muted); }
  .eng-send-btn {
    width: 40px; height: 40px; border-radius: 50%; border: none;
    background: var(--primary); color: #fff; cursor: pointer;
    display: grid; place-items: center; transition: all 0.2s; flex-shrink: 0;
  }
  .eng-send-btn:hover { background: var(--primary-hover); transform: scale(1.05); }
  .eng-send-btn:disabled { background: var(--text-muted); opacity: 0.5; cursor: default; transform: none; }

  /* ── Mention Popup ── */
  .eng-mention-pop {
    position: absolute; bottom: 100%; left: 60px; right: 60px;
    background: var(--surface); border-radius: 12px; border: 1px solid var(--border);
    box-shadow: 0 8px 32px rgba(0,0,0,0.12); padding: 6px;
    z-index: 100; margin-bottom: 4px; max-width: 300px;
  }
  .pop-head {
    font-size: 10px; font-weight: 700; color: var(--text-muted);
    text-transform: uppercase; padding: 6px 10px 4px; letter-spacing: 0.5px;
  }
  .mention-item {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px; cursor: pointer; border-radius: 8px; transition: background 0.1s;
  }
  .mention-item:hover, .mention-item.active { background: var(--bg); }
  .mention-av {
    width: 32px; height: 32px; border-radius: 50%;
    color: #fff; display: grid; place-items: center;
    font-size: 12px; font-weight: 700;
  }
  .mention-name { font-size: 13px; font-weight: 600; color: var(--text); }
  .mention-role { font-size: 10px; font-weight: 600; color: var(--primary); text-transform: uppercase; }

  /* ── Edit Box ── */
  .eng-edit-box textarea {
    width: 100%; min-height: 50px; padding: 8px; border-radius: 6px;
    border: 1.5px solid var(--primary); font-family: inherit; font-size: 13px;
    outline: none; resize: none; color: var(--text); background: var(--bg);
  }
  .eng-edit-actions { display: flex; gap: 6px; justify-content: flex-end; margin-top: 6px; }
  .eng-edit-actions button {
    padding: 5px 14px; border-radius: 6px; font-size: 12px;
    font-weight: 600; cursor: pointer; border: 1px solid var(--border);
    background: var(--surface); color: var(--text-muted); transition: all 0.15s;
  }
  .eng-edit-actions button.save { background: var(--primary); color: #fff; border-color: var(--primary); }

  /* ── Toast ── */
  .eng-toast {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: var(--text); color: var(--surface); padding: 10px 20px; border-radius: 10px;
    font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2); z-index: 2000; animation: toastIn 0.3s ease-out;
  }
  .eng-toast button { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 2px; }

  /* ── Loading ── */
  .eng-loading {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 16px; color: var(--text-muted);
  }
  .eng-spinner {
    width: 36px; height: 36px; border: 3px solid var(--border);
    border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .eng-empty-full {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 12px; color: var(--text-muted);
  }

  /* ── Overlay & Modal ── */
  .eng-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    backdrop-filter: blur(3px); z-index: 1000; display: grid; place-items: center;
    animation: fadeIn 0.15s ease-out;
  }
  .eng-modal {
    width: 440px; background: var(--surface); border-radius: 16px;
    box-shadow: 0 24px 64px rgba(0,0,0,0.2); overflow: hidden; border: 1px solid var(--border);
    animation: modalIn 0.2s ease-out;
  }
  .eng-modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 24px; border-bottom: 1px solid var(--border);
  }
  .eng-modal-header h3 { margin: 0; font-size: 17px; font-weight: 700; color: var(--text); }
  .eng-modal-header button {
    background: var(--bg); border: none; color: var(--text-muted); cursor: pointer;
    width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
    transition: all 0.15s;
  }
  .eng-modal-header button:hover { background: var(--border); }
  .eng-modal-body { padding: 20px 24px; }
  .eng-modal-body p { font-size: 14px; color: var(--text-muted); margin: 0; line-height: 1.5; }
  .eng-modal-footer {
    padding: 14px 24px; background: var(--bg); border-top: 1px solid var(--border);
    display: flex; justify-content: flex-end; gap: 10px;
  }
  .eng-modal-footer button {
    padding: 9px 20px; border-radius: 8px; font-weight: 600;
    font-size: 13px; cursor: pointer; border: none; transition: all 0.15s;
  }
  .eng-modal-footer button.ghost { background: transparent; color: var(--text-muted); }
  .eng-modal-footer button.primary { background: var(--primary); color: #fff; }
  .eng-modal-footer button.danger { background: #ef4444; color: #fff; }

  /* ── New Thread Modal ── */
  .eng-nt-search { position: relative; margin-bottom: 12px; }
  .eng-nt-search input {
    width: 100%; padding: 10px 12px 10px 40px; border-radius: 8px;
    border: 1.5px solid var(--border); background: var(--bg); font-size: 14px;
    outline: none; transition: all 0.2s; color: var(--text);
  }
  .eng-nt-search input:focus { border-color: var(--primary); background: var(--surface); }
  .nt-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted); }

  .eng-user-list { max-height: 240px; overflow-y: auto; }
  .user-row {
    display: flex; align-items: center; gap: 12px; padding: 10px;
    border-radius: 10px; cursor: pointer; transition: all 0.15s;
  }
  .user-row:hover { background: rgba(0,0,0,0.02); }
  :root[data-theme="dark"] .user-row:hover { background: rgba(255,255,255,0.02); }
  .user-row.selected { background: rgba(99,102,241,0.1); }
  .user-row .name { font-size: 14px; font-weight: 600; color: var(--text); }
  .user-row .role-tag { font-size: 10px; color: var(--primary); font-weight: 700; text-transform: uppercase; }

  /* ── Responsive ── */
  @media (max-width: 1024px) {
    .eng-grid { grid-template-columns: 280px 1fr; }
  }

  @media (max-width: 768px) {
    .eng-page { padding: 0; height: calc(100vh - 60px); }
    .eng-grid { grid-template-columns: 1fr; gap: 0; height: 100%; }
    .eng-grid.show-chat .eng-sidebar { display: none; }
    .eng-grid.show-list .eng-chat { display: none; }
    .mobile-back-btn { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--bg); }

    .eng-sidebar { border-radius: 0; border: none; }
    .eng-sidebar-header { padding: 14px; }
    .eng-sidebar-search { padding: 0 14px 12px; }
    .eng-sidebar-search input { padding: 12px 14px 12px 38px; font-size: 16px; min-height: 44px; }

    .eng-chat { border-radius: 0; border: none; }
    .eng-chat-header { padding: 12px 14px; gap: 10px; }
    .eng-messages { padding: 14px 12px; }
    .eng-composer { padding: 10px 12px 14px; }
    .eng-composer textarea, .eng-composer input { font-size: 16px; min-height: 44px; }
    .eng-mention-pop { left: 10px; right: 10px; }
    .eng-modal { width: calc(100vw - 24px); max-width: 480px; border-radius: 16px; }
    .eng-msg { max-width: 88%; font-size: 14px; }
    .eng-msg-avatar { width: 32px; height: 32px; }
  }

  @media (max-width: 480px) {
    .eng-modal { width: 100%; max-height: 100vh; border-radius: 0; }
    .eng-modal-body { padding: 16px; }
    .eng-modal-footer { padding: 12px 16px; flex-direction: column-reverse; gap: 8px; }
    .eng-modal-footer button { width: 100%; min-height: 46px; }
    .user-row { padding: 12px 10px; }
    .user-row .name { font-size: 15px; }
  }
`;
