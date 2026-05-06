// client/src/components/ChatPanel.jsx
import React, { useEffect, useRef, useState } from "react";
import Panel from "./Panel";
import { useApp } from "../context/AppContext";
import {
  FaSearch, FaPaperPlane, FaReply, FaPen, FaTrash, FaCheck, FaTimes
} from "react-icons/fa";

export default function ChatPanel() {
  const { ready, panels, setPanels, api, data, user } = useApp();

  const [threads, setThreads] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [threadSearch, setThreadSearch] = useState("");
  const [draft, setDraft] = useState("");

  // mentions
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");

  // edit + delete confirm
  const [editingId, setEditingId] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const composeRef = useRef(null);
  const chatEndRef = useRef(null);
  const users = data?.users || [];

  useEffect(() => {
    if (!ready) return;
    (async () => {
      setThreads(await api.getAll("messages"));
    })();
  }, [ready, api]);

  async function renderChat(threadId) {
    const t = await api.get("messages", threadId);
    if (!t) return;
    const uid = user?.id || "u-admin";
    const rb = { ...(t.readBy || {}) };
    rb[uid] = true;
    t.readBy = rb;
    await api.put("messages", t);
    setActiveThread(t);
    setMessages(t.messages || []);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
  }

  async function sendChat(text) {
    if (!activeThread || !text.trim()) return;
    const t = await api.get("messages", activeThread.id);
    if (!t) return;
    const senderId = user?.id || "u-admin";
    const msg = { id: crypto.randomUUID(), by: senderId, at: Date.now(), text: text.trim() };
    t.messages.push(msg);
    t.readBy = { ...(t.readBy || {}), [senderId]: true };
    await api.put("messages", t);
    setMessages(t.messages.slice());
    setDraft("");
    setShowMention(false);
    setMentionQuery("");
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
  }

  function getUserNameById(id) {
    const u = users.find((x) => x.id === id);
    return u?.name || id || "User";
  }

  // Title derived from participants (names instead of "DM")
  function threadTitle(t) {
    const meId = user?.id || "u-admin";
    const ids = Array.isArray(t.participants) ? t.participants : [];
    const others = ids.filter((id) => id !== meId);
    const names = others.map((id) => getUserNameById(id)).filter(Boolean);
    const list = names.length ? names : ids.map((id) => getUserNameById(id));
    if (!list.length) return t.title || "Messages";
    if (list.length > 3) {
      return list.slice(0, 3).map((n) => (n || "").split(" ")[0]).join(", ") + ` +${list.length - 3}`;
    }
    return list.join(", ");
  }

  // Render text with @mention spans
  function highlightMentions(text) {
    const re = /@(\w+)/g;
    const parts = [];
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      const tag = m[1];
      const match = users.find(
        (u) => (u.name || "").replace(/\s/g, "").toLowerCase().startsWith(tag.toLowerCase())
      );
      const label = match ? `@${match.name.split(" ")[0]}` : `@${tag}`;
      parts.push(
        <span key={`m-${m.index}`} className="mention">
          {label}
        </span>
      );
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  }

  function handleComposeInput(e) {
    const val = e.target.value;
    setDraft(val);
    const caret = e.target.selectionStart || val.length;
    const before = val.slice(0, caret);
    const match = before.match(/@(\w*)$/);
    if (match) {
      setShowMention(true);
      setMentionQuery(match[1] || "");
    } else {
      setShowMention(false);
      setMentionQuery("");
    }
  }

  function insertMention(userToInsert) {
    const el = composeRef.current;
    const val = draft;
    const caret = el?.selectionStart ?? val.length;
    const before = val.slice(0, caret);
    const after = val.slice(caret);
    const match = before.match(/@(\w*)$/);
    const token = `@${(userToInsert.name || "").split(" ")[0]} `;
    let newBefore = before;
    if (match) newBefore = before.slice(0, match.index) + token;
    const next = newBefore + after;
    setDraft(next);
    setShowMention(false);
    setMentionQuery("");
    setTimeout(() => {
      if (!el) return;
      const pos = newBefore.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    }, 0);
  }

  // edit / delete
  function beginEdit(id, text) {
    setEditingId(id);
    setEditVal(text);
    setTimeout(() => composeRef.current?.blur(), 0);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditVal("");
  }
  async function saveEdit() {
    const txt = (editVal || "").trim();
    if (!activeThread || !editingId) return cancelEdit();
    const t = await api.get("messages", activeThread.id);
    if (!t) return cancelEdit();
    const i = (t.messages || []).findIndex((m) => m.id === editingId);
    if (i >= 0) {
      t.messages[i] = { ...t.messages[i], text: txt, editedAt: Date.now() };
      await api.put("messages", t);
      setMessages(t.messages.slice());
    }
    cancelEdit();
  }
  async function performDelete(id) {
    if (!activeThread) return;
    const t = await api.get("messages", activeThread.id);
    if (!t) return;
    t.messages = (t.messages || []).filter((m) => m.id !== id);
    await api.put("messages", t);
    setMessages(t.messages.slice());
    if (editingId === id) cancelEdit();
    if (confirmDeleteId === id) setConfirmDeleteId(null);
  }

  // search threads by computed title
  const filteredThreads = (threads || []).filter((t) =>
    (threadTitle(t) || t.title || "DM").toLowerCase().includes(threadSearch.toLowerCase())
  );

  // autoscroll when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeThread]);

  if (!ready) return null;

  return (
    <Panel open={panels.messages} title="Messages" onClose={() => setPanels((p) => ({ ...p, messages: false }))}>
      {/* Local styles scoped to this panel */}
      <style>{`
          .msg-panel{ display:flex; gap:10px; min-height:420px; height:100%; }
          .msg-left{
            width: 280px; min-width: 240px; max-width: 340px;
            border-right:1px solid #1f294a; padding-right:8px; display:flex; flex-direction:column; gap:8px;
          }
          .msg-search{ display:flex; align-items:center; gap:8px; }
          .msg-search .btn{ height:34px; flex:1; }
          .msg-threads{ overflow:auto; min-height:0; }
          .msg-item{
            display:grid; grid-template-columns: 1fr auto; gap:6px; padding:8px; border-radius:10px; cursor:pointer;
          }
          .msg-item:hover{ background:#121a37; }
          .msg-title{ font-weight:700; }
          .msg-sub{ font-size:12px; color:var(--text-dim); }
          .unread-dot{ width:8px; height:8px; border-radius:50%; background:#6bd06b; align-self:center; }
          .msg-right{ flex:1; display:flex; flex-direction:column; min-width:0; }
          .bubbles{ flex:1; min-height:0; overflow:auto; display:flex; flex-direction:column; gap:10px; padding-right:4px; }
          .bubble{ max-width:72%; padding:10px 12px; border-radius:12px; }
          .bubble.me{ align-self:flex-end; background:#1d2a52; border:1px solid #2a3c6a; }
          .bubble.them{ align-self:flex-start; background:#0f162b; border:1px solid #22325b; }
          .bubble .meta{ font-size:11px; color:var(--text-dim); margin-bottom:4px; }
          .bubble .text{ white-space:pre-wrap; }
          .mention{ color:#7db2ff; font-weight:700; }
          .reply-btn{
            margin-top:6px; font-size:12px; opacity:.8; background:transparent; border:0; color:#9fb4de; cursor:pointer;
          }
          .compose{ display:grid; grid-template-columns: 1fr auto; gap:8px; align-items:center; padding-top:8px; border-top:1px solid #1f294a; }
          .compose .btn-send{ height:36px; display:flex; align-items:center; gap:6px; }
          .quick-replies{ display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; }
          .chip{ font-size:12px; padding:4px 8px; border-radius:999px; border:1px solid #2a3c6a; background:#0f162b; cursor:pointer; }
          .mention-pop{
            position:absolute; bottom:54px; left:12px; right:12px; max-height:160px; overflow:auto;
            background:#0f162b; border:1px solid #2a3c6a; border-radius:8px; box-shadow:0 10px 30px rgba(0,0,0,.45);
          }
          .mention-item{ padding:8px 10px; cursor:pointer; }
          .mention-item:hover{ background:#142043; }

          /* controls */
          .actions{ display:flex; gap:6px; margin-top:6px; }
          .edit-row{ display:grid; grid-template-columns: 1fr auto auto; gap:6px; align-items:center; }
          .icon-btn.sm{
            width:28px; height:28px; border-radius:8px;
            border:1px solid #2a3c6a; background:#0f162b; color:var(--text);
            display:flex; align-items:center; justify-content:center;
          }
          .icon-btn.sm.danger, .danger{ color:#ffb4b4; }

          /* inline delete confirm */
          .confirm{ display:flex; align-items:center; gap:6px; }
          .warn{ color:#ffb4b4; font-size:12px; }
        `}</style>

      <div className="msg-panel">
        {/* LEFT: threads */}
        <div className="msg-left">
          <div className="msg-search">
            <span className="ico">
              <FaSearch />
            </span>
            <input
              className="btn"
              placeholder="Search threads"
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.target.value)}
            />
          </div>

          <div className="msg-threads">
            <ul className="thread-list">
              {filteredThreads.map((t) => {
                const unread = !(t.readBy?.[user?.id || "u-admin"]);
                return (
                  <li key={t.id} className="msg-item" onClick={() => renderChat(t.id)}>
                    <div>
                      <div className="msg-title">{threadTitle(t)}</div>
                      <div className="msg-sub">
                        {(t.messages?.[t.messages.length - 1]?.text || "").slice(0, 60)}
                      </div>
                    </div>
                    {unread ? <span className="unread-dot" title="Unread"></span> : <small>›</small>}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* RIGHT: chat */}
        <div className="msg-right">
          <div className="bubbles" aria-live="polite">
            {messages.map((m) => {
              const mine = m.by === (user?.id || "u-admin");
              const name = mine ? "You" : getUserNameById(m.by);
              return (
                <div key={m.id} className={`bubble ${mine ? "me" : "them"}`}>
                  <div className="meta">
                    {name} • {new Date(m.at).toLocaleString()} {m.editedAt ? "• edited" : ""}
                  </div>

                  {mine && editingId === m.id ? (
                    <div className="edit-row">
                      <input
                        className="btn"
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") cancelEdit();
                        }}
                        autoFocus
                      />
                      <button className="icon-btn sm" onClick={saveEdit} title="Save">
                        <FaCheck />
                      </button>
                      <button className="icon-btn sm" onClick={cancelEdit} title="Cancel">
                        <FaTimes />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="text">{highlightMentions(m.text)}</div>
                      <div className="actions">
                        {mine ? (
                          <>
                            {confirmDeleteId === m.id ? (
                              <div className="confirm">
                                <span className="warn">Delete?</span>
                                <button
                                  className="icon-btn sm danger"
                                  onClick={() => performDelete(m.id)}
                                  title="Confirm delete"
                                >
                                  <FaCheck />
                                </button>
                                <button
                                  className="icon-btn sm"
                                  onClick={() => setConfirmDeleteId(null)}
                                  title="Cancel"
                                >
                                  <FaTimes />
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  className="icon-btn sm"
                                  onClick={() => beginEdit(m.id, m.text)}
                                  title="Edit"
                                >
                                  <FaPen />
                                </button>
                                <button
                                  className="icon-btn sm danger"
                                  onClick={() => setConfirmDeleteId(m.id)}
                                  title="Delete"
                                >
                                  <FaTrash />
                                </button>
                              </>
                            )}
                          </>
                        ) : (
                          <button
                            className="reply-btn"
                            onClick={() => {
                              const first = (name || "").split(" ")[0];
                              setDraft((d) => (d ? d + " " : "") + `@${first} `);
                              setTimeout(() => composeRef.current?.focus(), 0);
                            }}
                            title="Reply"
                          >
                            <FaReply /> Reply
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Compose */}
          <div style={{ position: "relative" }}>
            {/* mention dropdown */}
            {showMention && (
              <div className="mention-pop">
                {users
                  .filter((u) =>
                    (u.name || "")
                      .toLowerCase()
                      .replace(/\s/g, "")
                      .startsWith(mentionQuery.toLowerCase())
                  )
                  .slice(0, 8)
                  .map((u) => (
                    <div key={u.id} className="mention-item" onClick={() => insertMention(u)}>
                      @{u.name}
                    </div>
                  ))}
                {!users.length && (
                  <div className="mention-item" style={{ opacity: 0.7 }}>
                    No users
                  </div>
                )}
              </div>
            )}

            <div className="compose">
              <input
                ref={composeRef}
                className="btn"
                placeholder="Type a message. Press Enter to send • Use @ to mention"
                value={draft}
                onChange={handleComposeInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (draft.trim()) sendChat(draft);
                  }
                  if (e.key === "@" && !showMention) setShowMention(true);
                }}
              />
              <button className="btn primary btn-send" onClick={() => draft.trim() && sendChat(draft)}>
                <FaPaperPlane /> Send
              </button>
            </div>

            <div className="quick-replies">
              {["On it!", "Will do.", "Thanks!", "Can we chat later?"].map((q) => (
                <button key={q} className="chip" onClick={() => setDraft((d) => (d ? d + " " : "") + q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}