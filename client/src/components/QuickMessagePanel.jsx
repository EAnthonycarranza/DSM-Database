// client/src/components/QuickMessagePanel.jsx
// Right-side slide-in quick messaging panel. Mirrors the core functionality
// of pages/Engage.jsx (threads, compose, send, edit, @mentions) in a
// compact sidebar suitable for anywhere in the app.
import React from "react";
import { useApp } from "../context/AppContext";
import {
  FaTimes, FaSearch, FaPaperPlane, FaPlus, FaChevronLeft,
  FaPen, FaCheck, FaExternalLinkAlt, FaSync
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";

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
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function highlightMentions(text, users) {
  if (!text) return "";
  const safe = escHtml(text);
  return safe.replace(/@(\w+)/g, (match, username) => {
    const u = users.find(
      (x) => (x.name || "").replace(/\s/g, "").toLowerCase().startsWith(String(username).toLowerCase())
    );
    if (u && String(u.role || "").toLowerCase() === "admin") {
      const first = (u.name || "").split(" ")[0];
      return `<span class="qmp-mention">@${first}</span>`;
    }
    return match;
  });
}

export default function QuickMessagePanel() {
  const { panels, setPanels, api, engage, user, ready } = useApp();
  const navigate = useNavigate();

  const open = !!panels?.messages;
  const me = user?.id || null;

  const [threads, setThreads] = React.useState([]);
  const [users, setUsers] = React.useState([]);
  const [activeId, setActiveId] = React.useState(null);
  const [compose, setCompose] = React.useState("");
  const [searchQ, setSearchQ] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [view, setView] = React.useState("list"); // list | chat | new
  const [newRecipients, setNewRecipients] = React.useState([]);
  const [newSearch, setNewSearch] = React.useState("");
  const [editingId, setEditingId] = React.useState(null);
  const [editText, setEditText] = React.useState("");
  const [showMention, setShowMention] = React.useState(false);
  const [mentionQuery, setMentionQuery] = React.useState("");

  const composeRef = React.useRef(null);
  const bubblesRef = React.useRef(null);

  const close = () => setPanels((p) => ({ ...p, messages: false }));

  const loadData = React.useCallback(async () => {
    if (!me || !ready) return;
    setLoading(true);
    try {
      const [msgs, us] = await Promise.all([
        engage.listMine().catch(() => []),
        api.getAll("users", {}).catch(() => []),
      ]);
      const normalized = (msgs || []).map((t) => ({
        ...t,
        members: t.members || t.participants || [],
        participants: t.participants || t.members || [],
        messages: Array.isArray(t.messages) ? t.messages : [],
        readBy: t.readBy || {},
      }));
      setThreads(normalized);
      setUsers(us || []);
    } finally {
      setLoading(false);
    }
  }, [api, engage, me, ready]);

  // Load when opening
  React.useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  // Poll while open
  React.useEffect(() => {
    if (!open) return;
    const int = setInterval(() => loadData(), 6000);
    return () => clearInterval(int);
  }, [open, loadData]);

  // Esc to close
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const active = React.useMemo(
    () => threads.find((t) => t.id === activeId) || null,
    [threads, activeId]
  );

  // Mark active as read
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

  // Autoscroll chat
  React.useEffect(() => {
    const el = bubblesRef.current;
    if (el) el.scrollTop = el.scrollHeight + 1000;
  }, [activeId, active?.messages?.length, view]);

  const threadTitle = (t) => {
    if (t?.title) return t.title;
    const members = t?.members || t?.participants || [];
    const ids = members.filter((id) => id !== me);
    const names = ids.map((id) => users.find((u) => u.id === id)?.name || id).filter(Boolean);
    return names.length ? names.join(", ") : "Direct Message";
  };
  const threadInitials = (t) => {
    const title = threadTitle(t);
    return title.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  };
  const lastMessage = (t) => {
    const arr = Array.isArray(t?.messages) ? t.messages : [];
    return arr[arr.length - 1] || null;
  };

  const filteredThreads = React.useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    const sorted = [...threads].sort((a, b) => {
      const la = lastMessage(a)?.at || a.updatedAt || a.createdAt || 0;
      const lb = lastMessage(b)?.at || b.updatedAt || b.createdAt || 0;
      return lb - la;
    });
    if (!q) return sorted;
    return sorted.filter((t) => {
      const title = threadTitle(t).toLowerCase();
      const lm = (lastMessage(t)?.text || "").toLowerCase();
      return title.includes(q) || lm.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, searchQ, users, me]);

  // Admins-only directory for new-message flow
  const adminDirectory = React.useMemo(() => {
    return (users || []).filter(
      (u) => u.id !== me && String(u.role || "").toLowerCase() === "admin"
    );
  }, [users, me]);
  const filteredDirectory = React.useMemo(() => {
    const q = newSearch.trim().toLowerCase();
    if (!q) return adminDirectory;
    return adminDirectory.filter((u) => (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q));
  }, [adminDirectory, newSearch]);

  const openThread = (tid) => {
    setActiveId(tid);
    setView("chat");
  };

  const handleCompose = (e) => {
    const val = e.target.value;
    setCompose(val);
    const caret = e.target.selectionStart || 0;
    const before = val.slice(0, caret);
    const m = before.match(/@(\w*)$/);
    if (m) { setShowMention(true); setMentionQuery(m[1] || ""); }
    else { setShowMention(false); setMentionQuery(""); }
  };

  const insertMention = (u) => {
    const first = (u.name || "").split(" ")[0];
    setCompose((prev) => {
      const el = composeRef.current;
      const caret = el ? el.selectionStart : prev.length;
      const before = prev.slice(0, caret).replace(/@(\w*)$/, `@${first} `);
      const after = prev.slice(caret);
      const next = before + after;
      setTimeout(() => { if (el) { el.focus(); el.setSelectionRange(before.length, before.length); } }, 0);
      return next;
    });
    setShowMention(false);
    setMentionQuery("");
  };

  const mentionMatches = React.useMemo(() => {
    if (!showMention) return [];
    const q = (mentionQuery || "").toLowerCase();
    return (users || []).filter(
      (u) =>
        u.id !== me &&
        String(u.role || "").toLowerCase() === "admin" &&
        (u.name || "").replace(/\s/g, "").toLowerCase().startsWith(q)
    ).slice(0, 6);
  }, [showMention, mentionQuery, users, me]);

  const send = async () => {
    const text = (compose || "").trim();
    if (!text || !active) return;
    const msgId = crypto.randomUUID ? crypto.randomUUID() : `msg-${Date.now()}`;
    const msg = { id: msgId, by: me, at: Date.now(), text };
    const next = {
      ...active,
      messages: [...(active.messages || []), msg],
      readBy: { [me]: true },
      updatedAt: Date.now(),
    };
    try {
      await api.put("messages", next);
      setThreads((list) => list.map((t) => (t.id === next.id ? next : t)));
      setCompose("");
      setShowMention(false);

      // @mention notifications (admins only)
      const mentions = text.match(/@(\w+)/g);
      if (mentions) {
        for (const m of mentions) {
          const username = m.slice(1).toLowerCase();
          const target = (users || []).find(
            (u) =>
              (u.name || "").replace(/\s/g, "").toLowerCase().startsWith(username) &&
              String(u.role || "").toLowerCase() === "admin"
          );
          if (target && target.id !== me) {
            const preview = text.length > 60 ? text.slice(0, 60) + "..." : text;
            try {
              await api.add("notifications", {
                id: crypto.randomUUID ? crypto.randomUUID() : `notif-${Date.now()}`,
                to: target.id,
                from: me,
                title: "Staff Mention",
                text: `${user?.name || "Someone"}: "${preview}"`,
                type: "mention",
                threadId: active.id,
                read: false,
                createdAt: Date.now(),
              });
            } catch {}
          }
        }
      }
    } catch {}
  };

  const beginEdit = (m) => { if (m.by !== me) return; setEditingId(m.id); setEditText(m.text || ""); };
  const cancelEdit = () => { setEditingId(null); setEditText(""); };
  const saveEdit = async () => {
    if (!active || !editingId) return cancelEdit();
    const text = (editText || "").trim();
    if (!text) return cancelEdit();
    const next = {
      ...active,
      messages: (active.messages || []).map((m) => (m.id === editingId ? { ...m, text, editedAt: Date.now() } : m)),
      updatedAt: Date.now(),
    };
    try {
      await api.put("messages", next);
      setThreads((list) => list.map((t) => (t.id === next.id ? next : t)));
    } catch {}
    cancelEdit();
  };

  const toggleRecipient = (u) => {
    setNewRecipients((prev) =>
      prev.find((p) => p.id === u.id) ? prev.filter((p) => p.id !== u.id) : [...prev, u]
    );
  };

  const startNewThread = async () => {
    if (!newRecipients.length) return;
    // Reuse an existing DM if members match exactly (same set)
    const targetIds = new Set([me, ...newRecipients.map((u) => u.id)]);
    const existing = threads.find((t) => {
      const m = new Set(t.members || t.participants || []);
      if (m.size !== targetIds.size) return false;
      for (const id of targetIds) if (!m.has(id)) return false;
      return true;
    });
    if (existing) {
      openThread(existing.id);
      setNewRecipients([]);
      setNewSearch("");
      return;
    }
    try {
      const created = await engage.createThread({
        title: newRecipients.map((u) => u.name).join(", "),
        members: newRecipients.map((u) => u.id),
      });
      await loadData();
      if (created?.id) openThread(created.id);
      setNewRecipients([]);
      setNewSearch("");
    } catch {}
  };

  if (!open) return null;

  return (
    <>
      <style>{QMP_CSS}</style>
      <div className="qmp-backdrop" onClick={close} />
      <aside className="qmp-panel" role="dialog" aria-label="Quick Messages">
        <header className="qmp-header">
          {view !== "list" ? (
            <button
              className="qmp-icon-btn"
              onClick={() => { setView("list"); setActiveId(null); setNewRecipients([]); }}
              title="Back"
            >
              <FaChevronLeft />
            </button>
          ) : (
            <div className="qmp-head-title">Messages</div>
          )}

          {view === "chat" && active && (
            <div className="qmp-head-title qmp-head-title-chat">
              <div className="qmp-avatar" style={{ background: avatarColor(threadTitle(active)) }}>
                {threadInitials(active)}
              </div>
              <div className="qmp-head-name">{threadTitle(active)}</div>
            </div>
          )}

          <div className="qmp-head-actions">
            {view === "list" && (
              <>
                <button className="qmp-icon-btn" onClick={loadData} title="Refresh"><FaSync /></button>
                <button className="qmp-icon-btn" onClick={() => setView("new")} title="New message"><FaPlus /></button>
              </>
            )}
            <button
              className="qmp-icon-btn"
              onClick={() => { close(); navigate("/admin/engage"); }}
              title="Open Engage"
            >
              <FaExternalLinkAlt />
            </button>
            <button className="qmp-icon-btn" onClick={close} title="Close"><FaTimes /></button>
          </div>
        </header>

        {/* LIST VIEW */}
        {view === "list" && (
          <div className="qmp-body">
            <div className="qmp-search">
              <FaSearch />
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search conversations..."
              />
            </div>

            <div className="qmp-threads">
              {loading && !threads.length ? (
                <div className="qmp-empty">Loading...</div>
              ) : filteredThreads.length === 0 ? (
                <div className="qmp-empty">
                  <p>No conversations yet.</p>
                  <button className="qmp-btn-primary" onClick={() => setView("new")}>
                    <FaPlus /> Start one
                  </button>
                </div>
              ) : (
                filteredThreads.map((t) => {
                  const unread = !(t.readBy?.[me]);
                  const lm = lastMessage(t);
                  const title = threadTitle(t);
                  return (
                    <button
                      key={t.id}
                      className={`qmp-thread ${unread ? "unread" : ""}`}
                      onClick={() => openThread(t.id)}
                    >
                      <div className="qmp-avatar" style={{ background: avatarColor(title) }}>
                        {threadInitials(t)}
                      </div>
                      <div className="qmp-thread-main">
                        <div className="qmp-thread-top">
                          <span className="qmp-thread-title">{title}</span>
                          <span className="qmp-thread-time">{relTime(lm?.at)}</span>
                        </div>
                        <div className="qmp-thread-preview">
                          {lm ? (lm.by === me ? "You: " : "") + (lm.text || "") : "No messages yet"}
                        </div>
                      </div>
                      {unread && <span className="qmp-unread-dot" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* NEW MESSAGE VIEW */}
        {view === "new" && (
          <div className="qmp-body">
            <div className="qmp-section-label">To</div>
            <div className="qmp-chips">
              {newRecipients.map((u) => (
                <span key={u.id} className="qmp-chip" onClick={() => toggleRecipient(u)}>
                  {u.name} <FaTimes />
                </span>
              ))}
              {!newRecipients.length && <span className="qmp-muted">Select team members below</span>}
            </div>
            <div className="qmp-search">
              <FaSearch />
              <input
                value={newSearch}
                onChange={(e) => setNewSearch(e.target.value)}
                placeholder="Search team..."
                autoFocus
              />
            </div>
            <div className="qmp-directory">
              {filteredDirectory.map((u) => {
                const picked = !!newRecipients.find((r) => r.id === u.id);
                return (
                  <button
                    key={u.id}
                    className={`qmp-dir-item ${picked ? "picked" : ""}`}
                    onClick={() => toggleRecipient(u)}
                  >
                    <div className="qmp-avatar" style={{ background: avatarColor(u.name || u.id) }}>
                      {(u.name || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                    </div>
                    <div className="qmp-dir-info">
                      <div className="qmp-dir-name">{u.name}</div>
                      <div className="qmp-dir-sub">{u.email || u.role || ""}</div>
                    </div>
                    {picked && <FaCheck className="qmp-dir-check" />}
                  </button>
                );
              })}
              {!filteredDirectory.length && <div className="qmp-empty">No team members found</div>}
            </div>
            <div className="qmp-new-footer">
              <button className="qmp-btn-ghost" onClick={() => setView("list")}>Cancel</button>
              <button
                className="qmp-btn-primary"
                disabled={!newRecipients.length}
                onClick={startNewThread}
              >
                <FaPaperPlane /> Start chat
              </button>
            </div>
          </div>
        )}

        {/* CHAT VIEW */}
        {view === "chat" && active && (
          <div className="qmp-chat">
            <div className="qmp-bubbles" ref={bubblesRef}>
              {(active.messages || []).map((m) => {
                const mine = m.by === me;
                const fromUser = users.find((u) => u.id === m.by);
                const name = mine ? "You" : fromUser?.name || "User";
                return (
                  <div key={m.id} className={`qmp-bubble ${mine ? "me" : "them"}`}>
                    {!mine && <div className="qmp-bubble-name">{name}</div>}
                    {editingId === m.id ? (
                      <div className="qmp-edit">
                        <input
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") cancelEdit();
                          }}
                          autoFocus
                        />
                        <button className="qmp-icon-btn sm" onClick={saveEdit}><FaCheck /></button>
                        <button className="qmp-icon-btn sm" onClick={cancelEdit}><FaTimes /></button>
                      </div>
                    ) : (
                      <>
                        <div
                          className="qmp-bubble-text"
                          dangerouslySetInnerHTML={{ __html: highlightMentions(m.text || "", users) }}
                        />
                        <div className="qmp-bubble-meta">
                          {new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          {m.editedAt ? " · edited" : ""}
                          {mine && (
                            <button className="qmp-edit-btn" onClick={() => beginEdit(m)} title="Edit">
                              <FaPen />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {!active.messages?.length && <div className="qmp-empty">Say hi 👋</div>}
            </div>

            <div className="qmp-compose-wrap">
              {showMention && mentionMatches.length > 0 && (
                <div className="qmp-mention-pop">
                  {mentionMatches.map((u) => (
                    <button key={u.id} className="qmp-mention-item" onClick={() => insertMention(u)}>
                      <div className="qmp-avatar sm" style={{ background: avatarColor(u.name || u.id) }}>
                        {(u.name || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                      </div>
                      <span>@{(u.name || "").split(" ")[0]}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="qmp-compose">
                <input
                  ref={composeRef}
                  value={compose}
                  onChange={handleCompose}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (compose.trim()) send();
                    }
                  }}
                  placeholder="Type a message... use @ to mention"
                />
                <button
                  className="qmp-btn-primary send"
                  onClick={() => compose.trim() && send()}
                  disabled={!compose.trim()}
                >
                  <FaPaperPlane />
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

const QMP_CSS = `
  .qmp-backdrop {
    position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(4px); z-index: 2800;
    animation: qmpFade 0.2s ease-out;
  }
  @keyframes qmpFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes qmpSlide { from { transform: translateX(100%); } to { transform: translateX(0); } }

  .qmp-panel {
    position: fixed; top: 0; right: 0; bottom: 0;
    width: min(420px, 100vw);
    background: var(--surface, #fff);
    border-left: 1px solid var(--border, #e5e7eb);
    box-shadow: -24px 0 48px rgba(15, 23, 42, 0.18);
    z-index: 2900; display: flex; flex-direction: column;
    animation: qmpSlide 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    color: var(--text, #0f172a);
  }

  .qmp-header {
    display: flex; align-items: center; gap: 10px;
    padding: 16px 18px; border-bottom: 1px solid var(--border, #e5e7eb);
    background: var(--surface, #fff); min-height: 64px;
  }
  .qmp-head-title { font-size: 17px; font-weight: 800; flex: 1; }
  .qmp-head-title-chat { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .qmp-head-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 15px; font-weight: 700; }
  .qmp-head-actions { display: flex; align-items: center; gap: 4px; }

  .qmp-icon-btn {
    width: 36px; height: 36px; border-radius: 10px; border: none;
    background: transparent; color: var(--text-muted, #64748b);
    display: grid; place-items: center; cursor: pointer; transition: 0.15s;
  }
  .qmp-icon-btn:hover { background: var(--bg, #f1f5f9); color: var(--text, #0f172a); }
  .qmp-icon-btn.sm { width: 28px; height: 28px; }

  .qmp-body { flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 14px 16px; gap: 12px; }

  .qmp-search {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px; background: var(--bg, #f1f5f9);
    border-radius: 12px; border: 1px solid transparent;
  }
  .qmp-search:focus-within { border-color: var(--primary, #6366f1); background: var(--surface, #fff); }
  .qmp-search svg { color: var(--text-muted, #64748b); font-size: 13px; }
  .qmp-search input { flex: 1; border: none; outline: none; background: transparent;
    font-size: 14px; font-weight: 500; color: var(--text, #0f172a); font-family: inherit; }

  .qmp-threads { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; margin: 0 -4px; padding: 0 4px; }
  .qmp-thread {
    display: flex; align-items: center; gap: 12px; padding: 12px 10px;
    border-radius: 14px; background: transparent; border: none; cursor: pointer;
    text-align: left; transition: 0.15s; width: 100%;
  }
  .qmp-thread:hover { background: var(--bg, #f1f5f9); }
  .qmp-thread.unread .qmp-thread-title { font-weight: 800; }
  .qmp-thread-main { flex: 1; min-width: 0; }
  .qmp-thread-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .qmp-thread-title { font-size: 14px; font-weight: 700; color: var(--text, #0f172a); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .qmp-thread-time { font-size: 11px; font-weight: 600; color: var(--text-muted, #64748b); flex-shrink: 0; }
  .qmp-thread-preview {
    font-size: 12px; color: var(--text-muted, #64748b);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    margin-top: 2px;
  }
  .qmp-unread-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--primary, #6366f1); flex-shrink: 0; }

  .qmp-avatar {
    width: 40px; height: 40px; border-radius: 50%;
    display: grid; place-items: center; color: white;
    font-weight: 800; font-size: 13px; flex-shrink: 0;
  }
  .qmp-avatar.sm { width: 26px; height: 26px; font-size: 10px; }

  .qmp-empty {
    padding: 40px 20px; text-align: center;
    color: var(--text-muted, #64748b); font-size: 13px;
    display: flex; flex-direction: column; align-items: center; gap: 14px;
  }

  .qmp-btn-primary {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 18px; border-radius: 10px; border: none;
    background: var(--primary, #6366f1); color: white;
    font-size: 13px; font-weight: 700; cursor: pointer;
    transition: 0.15s;
  }
  .qmp-btn-primary:hover:not(:disabled) { filter: brightness(1.05); transform: translateY(-1px); }
  .qmp-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .qmp-btn-primary.send { padding: 0 16px; height: 42px; border-radius: 10px; }

  .qmp-btn-ghost {
    padding: 10px 18px; border-radius: 10px; border: 1px solid var(--border, #e5e7eb);
    background: transparent; color: var(--text, #0f172a); font-weight: 700; font-size: 13px; cursor: pointer;
  }
  .qmp-btn-ghost:hover { background: var(--bg, #f1f5f9); }

  /* New message view */
  .qmp-section-label { font-size: 11px; font-weight: 800; color: var(--text-muted, #64748b); text-transform: uppercase; letter-spacing: 0.8px; }
  .qmp-chips { display: flex; flex-wrap: wrap; gap: 6px; min-height: 24px; }
  .qmp-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 10px; border-radius: 999px;
    background: rgba(99, 102, 241, 0.1); color: var(--primary, #6366f1);
    font-size: 12px; font-weight: 700; cursor: pointer;
  }
  .qmp-chip svg { font-size: 10px; }
  .qmp-muted { color: var(--text-muted, #64748b); font-size: 12px; }
  .qmp-directory { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
  .qmp-dir-item {
    display: flex; align-items: center; gap: 12px;
    padding: 10px; border-radius: 12px; cursor: pointer;
    background: transparent; border: none; text-align: left; width: 100%;
    transition: 0.15s;
  }
  .qmp-dir-item:hover { background: var(--bg, #f1f5f9); }
  .qmp-dir-item.picked { background: rgba(99, 102, 241, 0.08); }
  .qmp-dir-info { flex: 1; min-width: 0; }
  .qmp-dir-name { font-size: 13px; font-weight: 700; color: var(--text, #0f172a); }
  .qmp-dir-sub { font-size: 11px; color: var(--text-muted, #64748b); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .qmp-dir-check { color: var(--primary, #6366f1); }
  .qmp-new-footer {
    display: flex; gap: 10px; padding-top: 10px;
    border-top: 1px solid var(--border, #e5e7eb);
  }
  .qmp-new-footer .qmp-btn-primary { flex: 1; justify-content: center; }

  /* Chat view */
  .qmp-chat { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .qmp-bubbles {
    flex: 1; overflow-y: auto; padding: 16px 18px;
    display: flex; flex-direction: column; gap: 10px;
    background: var(--bg, #f8fafc);
  }
  .qmp-bubble {
    max-width: 80%; padding: 10px 14px; border-radius: 16px;
    font-size: 14px; line-height: 1.45; word-wrap: break-word;
  }
  .qmp-bubble.me {
    align-self: flex-end; background: var(--primary, #6366f1); color: white;
    border-bottom-right-radius: 4px;
  }
  .qmp-bubble.them {
    align-self: flex-start; background: var(--surface, #fff);
    color: var(--text, #0f172a); border-bottom-left-radius: 4px;
    border: 1px solid var(--border, #e5e7eb);
  }
  .qmp-bubble-name { font-size: 11px; font-weight: 800; margin-bottom: 3px; color: var(--text-muted, #64748b); text-transform: uppercase; letter-spacing: 0.4px; }
  .qmp-bubble-text { white-space: pre-wrap; }
  .qmp-bubble-text .qmp-mention { background: rgba(255,255,255,0.25); padding: 1px 4px; border-radius: 4px; font-weight: 700; }
  .qmp-bubble.them .qmp-bubble-text .qmp-mention { background: rgba(99,102,241,0.15); color: var(--primary, #6366f1); }
  .qmp-bubble-meta { display: flex; align-items: center; gap: 8px; font-size: 10px; font-weight: 600; opacity: 0.75; margin-top: 4px; }
  .qmp-edit-btn { background: transparent; border: none; color: inherit; cursor: pointer; opacity: 0.8; padding: 0; }
  .qmp-edit-btn:hover { opacity: 1; }
  .qmp-edit { display: flex; align-items: center; gap: 6px; }
  .qmp-edit input {
    flex: 1; padding: 6px 10px; border-radius: 8px;
    border: 1px solid var(--border, #e5e7eb);
    background: var(--surface, #fff); color: var(--text, #0f172a);
    font-family: inherit; font-size: 13px;
  }

  .qmp-compose-wrap { position: relative; padding: 14px 16px; border-top: 1px solid var(--border, #e5e7eb); background: var(--surface, #fff); }
  .qmp-compose { display: flex; gap: 8px; align-items: center; }
  .qmp-compose input {
    flex: 1; padding: 12px 16px; border-radius: 12px;
    border: 1px solid var(--border, #e5e7eb);
    background: var(--bg, #f1f5f9);
    font-size: 14px; font-family: inherit; color: var(--text, #0f172a);
    outline: none; transition: 0.15s;
  }
  .qmp-compose input:focus { border-color: var(--primary, #6366f1); background: var(--surface, #fff); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); }

  .qmp-mention-pop {
    position: absolute; left: 16px; right: 16px; bottom: calc(100% - 6px);
    background: var(--surface, #fff); border: 1px solid var(--border, #e5e7eb);
    border-radius: 12px; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
    max-height: 220px; overflow-y: auto; padding: 6px; z-index: 5;
  }
  .qmp-mention-item {
    display: flex; align-items: center; gap: 10px; width: 100%;
    padding: 8px 10px; border-radius: 8px; border: none; background: transparent;
    font-size: 13px; font-weight: 600; color: var(--text, #0f172a); cursor: pointer;
    text-align: left;
  }
  .qmp-mention-item:hover { background: var(--bg, #f1f5f9); }

  @media (max-width: 520px) {
    .qmp-panel { width: 100vw; border-left: none; }
  }
`;
