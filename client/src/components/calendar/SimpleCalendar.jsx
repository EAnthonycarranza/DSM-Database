// FILE: src/components/calendar/SimpleCalendar.jsx
import React, { useMemo, useState, useRef, useEffect } from "react";
import { useApp } from "../../context/AppContext"; // + get users for @mentions

/* ============================================================================
   Font Awesome (auto-inject once)
   ============================================================================ */
const ensureFontAwesome = () => {
  if (typeof document === "undefined") return;
  if (document.querySelector('link[data-fontawesome="true"]')) return;
  // If any FA stylesheet already exists, skip.
  if ([...document.styleSheets].some(s => (s?.href || "").includes("fontawesome") || (s?.href || "").includes("font-awesome"))) {
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css";
  link.setAttribute("data-fontawesome", "true");
  document.head.appendChild(link);
};

/* ============================================================================
   Helpers (no libs)
   ============================================================================ */
// Safe UUID for browsers; falls back to random string if needed
const uuid = () => {
  if (typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function") {
    try { return window.crypto.randomUUID(); } catch {}
  }
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
};

const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const minutesBetween = (a, b) => Math.max(0, Math.round((b - a) / 60000));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const startOfWeek = (d, weekStartsOn = 1) => {
  const x = new Date(d);
  const day = (x.getDay() + 7 - weekStartsOn) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfWeek = (d) => addDays(startOfWeek(d), 6);
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const monthTitle = (d) => d.toLocaleString(undefined, { month: "long", year: "numeric" });
const fmt12 = (mins) => { let h = Math.floor(mins / 60); const m = mins % 60; const am = h < 12; const h12 = h % 12 === 0 ? 12 : h % 12; return `${h12}:${pad(m)} ${am ? "AM" : "PM"}`; };
const minutesOfDay = (d) => d.getHours() * 60 + d.getMinutes();
const withMinutesOfDay = (ymd, mins) => { const [Y, m, D] = ymd.split("-").map(Number); const H = Math.floor(mins / 60); const M = mins % 60; return new Date(Y, m - 1, D, H, M, 0, 0); };
const topPct = (mins) => `${(mins / 1440) * 100}%`;
const heightPct = (mins) => `${(mins / 1440) * 100}%`;

const parseHex = (hex) => {
  let h = (hex || "#8899ff").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
};
const rgba = (hex, a) => { const { r, g, b } = parseHex(hex); return `rgba(${r}, ${g}, ${b}, ${a})`; };

// + Safe HTML escaper and @mention highlighter (match "@word" and wrap)
const escHtml = (s) =>
  String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }));
const highlightMentions = (text, users = []) => {
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
};

/* ============================================================================
   Category helpers
   ============================================================================ */
const styleForCategory = (cat, opts = {}) => {
  const color = cat?.color || "#6ea8fe";
  const bgA = opts.bgA ?? 0.18;
  const bdA = opts.bdA ?? 0.55;
  return {
    backgroundColor: rgba(color, bgA),
    borderColor: rgba(color, bdA),
    color: "#e9eef8",
  };
};
const dotStyle = (color) => ({ backgroundColor: color || "#6ea8fe" });

/* ============================================================================
   Peek Card (sneak-peek)
   ============================================================================ */
function EventPeek({ evt, anchorRect, category, users = [], onEdit, onDelete, onClose }) {
  const cardRef = useRef(null);
  const editingRef = useRef(false);

  // Smart placement beside anchor
  useEffect(() => {
    const el = cardRef.current;
    if (!el || !anchorRect || typeof window === "undefined") return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = el.getBoundingClientRect();
    let left = anchorRect.left - rect.width - 12;
    if (left < 8) left = Math.min(anchorRect.right + 12, vw - rect.width - 8);
    let top = anchorRect.top + (anchorRect.height - rect.height) / 2;
    top = clamp(top, 8, vh - rect.height - 8);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }, [anchorRect]);

  // Outside click / Esc closes
  useEffect(() => {
    const onDown = (e) => { if (!cardRef.current?.contains(e.target)) onClose?.(); };
    const onKey = (e) => e.key === "Escape" && onClose?.();
    setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const [isDeleting, setIsDeleting] = useState(false);

  // Explicit handlers for edit and delete
  const handleEditMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (editingRef.current) return;
    editingRef.current = true;
    const snapshot = { ...evt }; // avoid stale references
    try { onClose?.(); } catch {}
    // open editor on next tick so unmount completes first
    setTimeout(() => {
      try { onEdit?.(snapshot); } catch (err) { console.error("[Peek] onEdit failed:", err); }
      finally { editingRef.current = false; }
    }, 0);
  };

  const handleDeleteClick = async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete?.(evt.id);
    } finally {
      setIsDeleting(false);
      onClose?.();
    }
  };

  const s = new Date(evt.start), e = new Date(evt.end || evt.start);
  const ymd = s.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const when = evt.allDay
    ? `${ymd} · All day`
    : `${ymd} · ${s.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} – ${e.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

  return (
    <div className="peek" ref={cardRef} role="dialog" aria-modal="true">
      <div className="peek-title">
        <span className="cat-dot" style={dotStyle(category?.color)} />{evt.title}
      </div>
      <div className="peek-row"><i className="fa-solid fa-clock" />{when}</div>
      {evt.location && <div className="peek-row"><i className="fa-solid fa-location-dot" />{evt.location}</div>}
      {category && <div className="peek-row"><i className="fa-solid fa-tag" />{category.name}</div>}
      {evt.attendees && (
        <div
          className="peek-row"
          title="Attendees"
        >
          <i className="fa-solid fa-user-group" />
          <span
            dangerouslySetInnerHTML={{ __html: highlightMentions(evt.attendees, users) }}
          />
        </div>
      )}
      {evt.notes && (
        <div
          className="peek-notes"
          dangerouslySetInnerHTML={{ __html: highlightMentions(evt.notes, users) }}
        />
      )}

      <div className="peek-actions">
        <button className="sc-btn" type="button" onMouseDown={handleEditMouseDown}><i className="fa-regular fa-pen-to-square" /> Edit</button>
        <button
          className="sc-btn danger"
          type="button"
          disabled={isDeleting}
          onMouseDown={handleDeleteClick}
          title={isDeleting ? "Deleting…" : "Delete"}
        >
          <i className="fa-regular fa-trash-can" /> {isDeleting ? "Deleting…" : "Delete"}
        </button>
        <div className="spacer" />
        <button className="sc-btn" type="button" onClick={onClose}><i className="fa-solid fa-xmark" /> Close</button>
      </div>
      <div className="peek-arrow" />
    </div>
  );
}

/* ============================================================================
   Month grid (+ DnD of all-day chips)
   ============================================================================ */
function MonthGrid({ viewDate, events, categories, onDayClick, onEventClick, onDropToDay }) {
  const first = startOfMonth(viewDate);
  const gridStart = startOfWeek(first, 1);
  const days = useMemo(() => [...Array(42)].map((_, i) => addDays(gridStart, i)), [gridStart]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const ev of events) {
      const s = new Date(ev.start);
      const e = new Date(ev.end || ev.start);
      const from = startOfDay(s);
      const to = startOfDay(e);
      for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
        const k = toYmd(d);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(ev);
      }
    }
    return map;
  }, [events]);

  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);

  const allowDrop = (e) => e.preventDefault();
  const onDrop = (e, day) => {
    e.preventDefault();
    const payload = e.dataTransfer.getData("text/plain");
    if (!payload) return;
    try {
      const { id } = JSON.parse(payload);
      onDropToDay?.(id, day, true);
    } catch {}
  };

  return (
    <div className="sc-grid">
      <div className="sc-daynames">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((n) => (
          <div key={n} className="sc-dayname">{n}</div>
        ))}
      </div>

      <div className="sc-cells">
        {days.map((d) => {
          const dim = d.getMonth() !== viewDate.getMonth();
          const today = sameDay(d, new Date());
          const list = byDay.get(toYmd(d)) || [];
          return (
            <div
              key={toYmd(d)}
              data-date={toYmd(d)}
              className={`sc-cell${dim ? " dim" : ""}${today ? " today" : ""}`}
              onClick={() => onDayClick?.(d)}
              onDragOver={allowDrop}
              onDrop={(e) => onDrop(e, d)}
            >
              <div className="sc-date">{d.getDate()}</div>
              <div className="sc-events">
                {list.slice(0, 3).map((ev) => {
                  const cat = catById[ev.categoryId];
                  const styles = styleForCategory(cat, { bgA: 0.22, bdA: 0.65 });
                  return (
                    <div
                      key={ev.id}
                      className="sc-chip"
                      draggable
                      style={styles}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", JSON.stringify({ id: ev.id }));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        onEventClick?.(ev, r);
                      }}
                      title={ev.title}
                    >
                      <span className="cat-dot dot--sm" style={dotStyle(cat?.color)} />
                      {ev.title}
                    </div>
                  );
                })}
                {list.length > 3 && <div className="sc-more">+{list.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================================
   Unified horizontal grid lines overlay (runs across the whole grid)
   ============================================================================ */
function GridLines() {
  return (
    <div className="tg-lines" aria-hidden>
      {Array.from({ length: 24 }, (_, i) => (
        <div key={i} className="tg-line" style={{ top: `${(i / 24) * 100}%` }} />
      ))}
    </div>
  );
}

/* ============================================================================
   Time Grids (Week / Day) + DnD / resize
   ============================================================================ */
function TimeGutter() {
  return (
    <div className="tg-gutter">
      {Array.from({ length: 24 }, (_, h) => (
        <div key={h} className="tg-hour">
          {`${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`}
        </div>
      ))}
    </div>
  );
}

function DayColumn({ date, events, categories, onEmptyClick, onEventClick, onTimedDragCommit }) {
  const colRef = useRef(null);
  const [ghost, setGhost] = useState(null); // {topMin, endMin, id, title}

  const dayEvents = useMemo(
    () => events.filter((ev) => !ev.allDay && sameDay(new Date(ev.start), date)),
    [events, date]
  );
  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);

  // Click anywhere in column creates event (full width)

const onColumnClick = (e) => {
  // block "create" if a drag/resize just happened
  if (Date.now() < suppressCreateUntil.current) return;

  if (!colRef.current) return;
  // extra guard: ignore clicks originating on existing events/ghosts
  if (e.target.closest(".tg-event") || e.target.closest(".tg-drag-ghost")) return;

  const rect = colRef.current.getBoundingClientRect();
  const y = clamp(e.clientY - rect.top, 0, rect.height);
  const mins = Math.round(((y / rect.height) * 1440) / 30) * 30;

  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setMinutes(mins);

  const end = new Date(start.getTime() + 60 * 60000);
  onEmptyClick?.(start, end);
};

const ghostRef = useRef(null);

  const suppressCreateUntil = useRef(0);
const armSuppress = (ms = 300) => {
  suppressCreateUntil.current = Date.now() + ms;
};

// NEW: guard clicks after a drag to prevent accidental "edit"
const draggingRef = useRef(false);

// FILE: src/components/calendar/SimpleCalendar.jsx
const startDrag = (e, ev, forcedMode = null) => {
  e.preventDefault();
  e.stopPropagation();
  if (!colRef.current) return;

  // prevent a "click-create" after dragging/resizing
  armSuppress(600);

  // reset drag flag at start
  draggingRef.current = false;

  // keep pointer events on this element during drag
  e.currentTarget.setPointerCapture?.(e.pointerId);

  const rect = colRef.current.getBoundingClientRect();
  const startMin = minutesOfDay(new Date(ev.start));
  const endMin = minutesOfDay(new Date(ev.end || ev.start));
  const y0 = e.clientY;
  const yTopPx = (startMin / 1440) * rect.height;
  const yBottomPx = (endMin / 1440) * rect.height;
  const atTop = Math.abs((e.clientY - rect.top) - yTopPx) < 10;
  const atBottom = Math.abs((e.clientY - rect.top) - yBottomPx) < 10;
  const atLeftEdge = Math.abs(e.clientX - rect.left) < 16;

  const mode = forcedMode
    ? forcedMode
    : atTop
      ? "resizeStart"
      : atBottom
        ? "resizeEnd"
        : atLeftEdge
          ? "move"
          : "move";

  const onMove = (evp) => {
    const dy = evp.clientY - y0;
    const deltaMin = Math.round(((dy / rect.height) * 1440) / 15) * 15; // 15-min snapping
    const minBlock = 30; // minimum 30 minutes
    let s = startMin;
    let en = endMin;

    if (mode === "move") {
      const dur = en - s;
      s = clamp(s + deltaMin, 0, 1440 - dur);
      en = s + dur;
    } else if (mode === "resizeStart") {
      s = clamp(s + deltaMin, 0, en - minBlock);
    } else { // resizeEnd
      en = clamp(en + deltaMin, s + minBlock, 1440);
    }

    // mark as dragging once any change occurs
    if (deltaMin !== 0) draggingRef.current = true;

    const nextGhost = { topMin: s, endMin: en, title: ev.title, id: ev.id };
    ghostRef.current = nextGhost;     // keep live value for drop
    setGhost(nextGhost);
  };

  const onUp = (evp) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);

    // keep suppression briefly through the click phase
    armSuppress(250);

    const g = ghostRef.current;
    if (g) {
      const newStart = withMinutesOfDay(toYmd(date), g.topMin);
      const newEnd = withMinutesOfDay(toYmd(date), g.endMin);
      onTimedDragCommit?.(ev.id, newStart, newEnd);
    }
    ghostRef.current = null;
    setGhost(null);

    // reset drag flag after completing drag
    setTimeout(() => { draggingRef.current = false; }, 0);
  };

  const initialGhost = { topMin: startMin, endMin, title: ev.title, id: ev.id };
  ghostRef.current = initialGhost;
  setGhost(initialGhost);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
};

  return (
    <div className="tg-col" ref={colRef} onClick={onColumnClick}>
      {/* Timed events */}
      {dayEvents.map((ev) => {
        const s = new Date(ev.start);
        const e = new Date(ev.end || ev.start);
        const startMin = s.getHours() * 60 + s.getMinutes();
        const duration = Math.max(30, minutesBetween(s, e));
        const cat = catById[ev.categoryId];
        const styles = styleForCategory(cat);
        return (
          // FILE: src/components/calendar/SimpleCalendar.jsx
          // ⬇️ UPDATE the timed event markup inside DayColumn (adds explicit resize handles)
          <div
            key={ev.id}
            className="tg-event"
            style={{ ...styles, top: topPct(startMin), height: heightPct(duration) }}
            title={`${ev.title} (${fmt12(startMin)}–${fmt12(startMin + duration)})`}
            onPointerDown={(pe) => startDrag(pe, ev)}               // move by dragging body
            onClick={(click) => {
              // ignore click if a drag just occurred
              if (draggingRef.current) { click.stopPropagation(); return; }
              click.stopPropagation();
              const r = click.currentTarget.getBoundingClientRect();
              onEventClick?.(ev, r);
            }}
          >
            {/* explicit handles to extend/shrink */}
            <div
              className="tg-handle tg-handle--top"
              onPointerDown={(pe) => startDrag(pe, ev, "resizeStart")}
              title="Drag to adjust start time"
            />
            <div className="tg-label">
              <span className="cat-dot dot--sm" style={dotStyle(cat?.color)} />
              {ev.title}
            </div>
            <div
              className="tg-handle tg-handle--bot"
              onPointerDown={(pe) => startDrag(pe, ev, "resizeEnd")}
              title="Drag to extend end time"
            />
          </div>
        );
      })}

      {/* Drag ghost */}
      {ghost && (
        <div
          className="tg-drag-ghost"
          style={{ top: topPct(ghost.topMin), height: heightPct(ghost.endMin - ghost.topMin) }}
        >
          {ghost.title}
        </div>
      )}
    </div>
  );
}

function WeekGrid({ viewDate, events, categories, onCreateAt, onEventClick, onDropToDay, onTimedDragCommit }) {
  const weekStart = startOfWeek(viewDate, 1);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);

  const allDayByDay = useMemo(() => {
    const map = new Map();
    for (const d of days) map.set(toYmd(d), []);
    for (const ev of events.filter((x) => !!x.allDay)) {
      const s = startOfDay(new Date(ev.start));
      const e = startOfDay(new Date(ev.end || ev.start));
      for (let d = new Date(s); d <= e; d = addDays(d, 1)) {
        const key = toYmd(d);
        if (map.has(key)) map.get(key).push(ev);
      }
    }
    return map;
  }, [events, days]);

  const allowDrop = (e) => e.preventDefault();
  const onDrop = (e, day) => {
    e.preventDefault();
    const payload = e.dataTransfer.getData("text/plain");
    if (!payload) return;
    try {
      const { id } = JSON.parse(payload);
      onDropToDay?.(id, day, true);
    } catch {}
  };

  return (
    <div className="tg-wrap">
      <div className="tg-head">
        <div className="tg-spacer" />
        {days.map((d) => (
          <div key={toYmd(d)} className="tg-head-col">
            <div className={`tg-head-date${sameDay(d, new Date()) ? " today" : ""}`}>
              {d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </div>
          </div>
        ))}
      </div>

      <div className="tg-allday">
        <div className="tg-gutter tg-gutter--all">All-day</div>
        {days.map((d) => (
          <div
            key={toYmd(d)}
            className="tg-allday-col"
            onDragOver={allowDrop}
            onDrop={(e) => onDrop(e, d)}
          >
            {(allDayByDay.get(toYmd(d)) || []).slice(0, 4).map((ev) => {
              const cat = catById[ev.categoryId];
              const styles = styleForCategory(cat, { bgA: 0.22, bdA: 0.65 });
              return (
                <div
                  key={ev.id}
                  className="tg-chip"
                  draggable
                  style={styles}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", JSON.stringify({ id: ev.id }));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    onEventClick?.(ev, r);
                  }}
                  title={ev.title}
                >
                  <span className="cat-dot dot--sm" style={dotStyle(cat?.color)} /> {ev.title}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="tg-grid-wrap">
        <GridLines />
        <div className="tg-grid">
          <TimeGutter />
          {days.map((d) => (
            <DayColumn
              key={toYmd(d)}
              date={d}
              events={events}
              categories={categories}
              onEmptyClick={(s, e) => onCreateAt(s, e)}
              onEventClick={onEventClick}
              onTimedDragCommit={(id, ns, ne) => onTimedDragCommit?.(id, ns, ne)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayGrid({ viewDate, events, categories, onCreateAt, onEventClick, onTimedDragCommit }) {
  return (
    <div className="tg-wrap">
      <div className="tg-head">
        <div className="tg-spacer" />
        <div className="tg-head-col">
          <div className="tg-head-date today">
            {viewDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </div>
        </div>
      </div>

      <div className="tg-allday">
        <div className="tg-gutter tg-gutter--all">All-day</div>
        <div className="tg-allday-col" />
      </div>

      <div className="tg-grid-wrap">
        <GridLines />
        <div className="tg-grid">
          <TimeGutter />
          <DayColumn
            date={viewDate}
            events={events}
            categories={categories}
            onEmptyClick={(s, e) => onCreateAt(s, e)}
            onEventClick={onEventClick}
            onTimedDragCommit={onTimedDragCommit}
          />
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   Draggable Time Range Picker + dropdown readout
   ============================================================================ */
function TimeRangePicker({ startMinutes, endMinutes, step = 30, minBlock = 30, onChange }) {
  const railRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const snap = (mins) => Math.round(mins / step) * step;

  const minsFromY = (clientY) => {
    const rect = railRef.current.getBoundingClientRect();
    const y = clamp(clientY - rect.top, 0, rect.height);
    const mins = snap((y / rect.height) * 1440);
    return clamp(mins, 0, 1440);
  };

  const begin = (type) => (e) => {
    e.preventDefault(); e.stopPropagation();
    railRef.current.setPointerCapture?.(e.pointerId);
    setDrag(type);
  };

  const onPointerMove = (e) => {
    if (!drag) return;
    const pos = minsFromY(e.clientY);
    let s = startMinutes;
    let en = endMinutes;
    if (drag === "start") s = clamp(pos, 0, en - minBlock);
    else if (drag === "end") en = clamp(pos, s + minBlock, 1440);
    else {
      const dur = en - s;
      let newS = clamp(pos - Math.floor(dur / 2), 0, 1440 - dur);
      s = snap(newS);
      en = s + dur;
    }
    if (s !== startMinutes || en !== endMinutes) onChange?.(s, en);
  };

  const endDrag = () => setDrag(null);

  useEffect(() => {
    const el = railRef.current;
    el?.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    return () => {
      el?.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, startMinutes, endMinutes]);

  const top = (startMinutes / 1440) * 100;
  const height = ((endMinutes - startMinutes) / 1440) * 100;

  return (
    <div className="trp">
      <div className="trp-legend"><div>AM</div><div>PM</div></div>
      <div
        ref={railRef}
        className="trp-rail"
        onPointerDown={(e) => {
          const m = minsFromY(e.clientY);
          const dStart = Math.abs(startMinutes - m);
          const dEnd = Math.abs(endMinutes - m);
          if (dStart <= dEnd) onChange?.(clamp(snap(m), 0, endMinutes - minBlock), endMinutes);
          else onChange?.(startMinutes, clamp(snap(m), startMinutes + minBlock, 1440));
        }}
      >
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="trp-hour">
            <span className="tick" />
            <span className="lbl">{`${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`}</span>
          </div>
        ))}
        <div className="trp-block" style={{ top: `${top}%`, height: `${height}%` }} onPointerDown={begin("block")}>
          <div className="trp-handle trp-handle--start" onPointerDown={begin("start")}><span className="cap" /><span className="time">{fmt12(startMinutes)}</span></div>
          <div className="trp-handle trp-handle--end" onPointerDown={begin("end")}><span className="cap" /><span className="time">{fmt12(endMinutes)}</span></div>
        </div>
      </div>
    </div>
  );
}

/* Time dropdown pills (never allow start >= end) */
function TimeDropdown({ labelMinutes, role, startMinutes, endMinutes, step = 30, minBlock = 30, onChangeRange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const selectedRef = useRef(null);

  useEffect(() => {
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  useEffect(() => { if (open) selectedRef.current?.scrollIntoView({ block: "center" }); }, [open]);

  const options = useMemo(() => { const out = []; for (let m = 0; m < 1440; m += step) out.push(m); return out; }, [step]);

  const pick = (val) => {
    if (role === "start") {
      let s = val, e = endMinutes;
      if (s > e - minBlock) {
        e = Math.min(1440, s + minBlock);
        if (e === 1440 && s > e - minBlock) s = 1440 - minBlock;
      }
      onChangeRange(s, e);
    } else {
      let e = val, s = startMinutes;
      if (e < s + minBlock) {
        s = Math.max(0, e - minBlock);
        if (s === 0 && e < s + minBlock) e = minBlock;
      }
      onChangeRange(s, e);
    }
    setOpen(false);
  };

  return (
    <div className="time-pill-wrap" ref={wrapRef}>
      <button className="pill select" type="button" onClick={() => setOpen((v) => !v)}>
        {fmt12(labelMinutes)}
      </button>
      {open && (
        <div className="time-menu">
          {options.map((m) => {
            const active = m === labelMinutes;
            const illegal = role === "start" ? m > endMinutes - minBlock : m < startMinutes + minBlock;
            return (
              <button
                key={m}
                type="button"
                className={`time-opt${active ? " active" : ""}${illegal ? " disabled" : ""}`}
                onClick={() => !illegal && pick(m)}
                ref={active ? selectedRef : undefined}
                disabled={illegal}
                title={fmt12(m)}
              >
                {fmt12(m)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
function TimeReadout({ startM, endM, step = 30, minBlock = 30, onChangeRange }) {
  return (
    <div className="time-pills">
      <TimeDropdown
        role="start"
        labelMinutes={startM}
        startMinutes={startM}
        endMinutes={endM}
        step={step}
        minBlock={minBlock}
        onChangeRange={onChangeRange}
      />
      <div className="dash">–</div>
      <TimeDropdown
        role="end"
        labelMinutes={endM}
        startMinutes={startM}
        endMinutes={endM}
        step={step}
        minBlock={minBlock}
        onChangeRange={onChangeRange}
      />
    </div>
  );
}

/* ============================================================================
   Compact single-day interactive grid
   ============================================================================ */
function SingleDayInteractiveGrid({
  date,
  events = [],
  categories = [],
  onCreateAt,
  onEventClick,
  value,                 // { startM, endM } (optional controlled)
  onChange,              // (startM, endM)
}) {
  const START = 0;            // 12:00 AM in minutes
  const END = 24 * 60;        // 1440
  const STEP = 30;

  // Zoom levels: 1 = compressed, 2 = normal, 3 = expanded, 4 = very expanded
  const [zoomLevel, setZoomLevel] = useState(2);
  const PX_PER_MINUTE = zoomLevel * 1.5; // Dynamic based on zoom

  const gridRef = useRef(null);
  const gutterRef = useRef(null);
  const [draft, setDraft] = useState(null);         // { startM, endM } (uncontrolled mode)
  const [hoverMin, setHoverMin] = useState(null);   // hover highlight
  const resizingRef = useRef(false);
  // New: live preview while dragging (resize/move/create)
  const [dragPreview, setDragPreview] = useState(null); // { startM, endM }
  const dragPreviewRef = useRef(null);
  useEffect(() => { dragPreviewRef.current = dragPreview; }, [dragPreview]);
  const dragOffsetRef = useRef(0);

  // New: track current drag mode to prevent cross-interference
  const dragModeRef = useRef(null); // null | 'resize' | 'move' | 'create'
  // Suppress accidental click-create after drag/resize finishes
  const SUPPRESS_CLICK_MS = 300;
  const suppressClickUntilRef = useRef(0);
  const suppressClick = (ms = SUPPRESS_CLICK_MS) => {
    suppressClickUntilRef.current = Date.now() + ms;
  };

  const snapTo = (mins) => Math.round(mins / STEP) * STEP;

  // Convert pointer Y to minutes, accounting for scroll position
  const pxToMins = (clientY) => {
    const grid = gridRef.current;
    if (!grid) return START;
    const rect = grid.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const scrolledY = relativeY + grid.scrollTop; // Add scrollTop to get true position
    const mins = Math.floor(scrolledY / PX_PER_MINUTE);
    const snapped = snapTo(mins);
    return clamp(snapped, START, END - STEP);
  };

  // Controlled or internal draft
  const activeDraft = value ? { startM: value.startM, endM: value.endM } : draft;

  // Handle grid click to place/move event / or update current range
  const onGridClick = (e) => {
    // Do not create immediately after a drag/resize, or while a drag is active
    if (Date.now() < suppressClickUntilRef.current) return;
    if (dragModeRef.current) return;
    // Don't create if clicking on resize handle or existing event
    if (e.target.closest('[role="separator"]') || e.target.closest('.qday-event')) return;
    // Ignore click if a drag preview was active (handled on pointerup)
    if (dragPreview) return;

    const startM = pxToMins(e.clientY);
    const endM = Math.min(startM + STEP, END);

    if (typeof onChange === "function") {
      onChange(startM, endM);
      return;
    }
    if (onCreateAt) {
      const start = withMinutesOfDay(toYmd(date), startM);
      const end = withMinutesOfDay(toYmd(date), endM);
      onCreateAt(start, end);
    } else {
      setDraft({ startM, endM });
    }
  };

  // Handle hover to show target slot
  const onGridMove = (e) => {
    if (resizingRef.current) return;
    const mins = pxToMins(e.clientY);
    setHoverMin(mins);
  };

  const onGridLeave = () => setHoverMin(null);

  // BEGIN: Drag-to-resize with live preview; commit on pointer up
  const beginResize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeDraft) return;
    if (dragModeRef.current && dragModeRef.current !== 'resize') return; // do not interrupt other drags
    dragModeRef.current = 'resize';
    resizingRef.current = true;

    // capture pointer to the handle so move events don't leak
    e.currentTarget.setPointerCapture?.(e.pointerId);

    // seed preview from current draft
    setDragPreview({ startM: activeDraft.startM, endM: activeDraft.endM });

    const onMove = (ev) => {
      if (dragModeRef.current !== 'resize' || !activeDraft) return;
      const newEnd = snapTo(pxToMins(ev.clientY));
      const nextEnd = Math.max(activeDraft.startM + STEP, newEnd);
      setDragPreview({ startM: activeDraft.startM, endM: nextEnd });
    };

    const onUp = () => {
      resizingRef.current = false;
      dragModeRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

      const fin = dragPreviewRef.current || activeDraft;
      if (!fin) { setDragPreview(null); return; }
      if (typeof onChange === "function") onChange(fin.startM, fin.endM);
      else setDraft({ startM: fin.startM, endM: fin.endM });
      setDragPreview(null);
      // prevent trailing click-create
      suppressClick();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  // END: Drag-to-resize with live preview; commit on pointer up

  // BEGIN: Drag-to-move entire draft block; commit on pointer up
  const beginMove = (e) => {
    if (!activeDraft) return;
    if (e.target.closest('[role="separator"]')) return; // ignore when grabbing the handle
    if (dragModeRef.current && dragModeRef.current !== 'move') return; // do not interrupt other drags
    e.preventDefault();
    e.stopPropagation();
    dragModeRef.current = 'move';

    const dur = activeDraft.endM - activeDraft.startM; // duration preserved

    // Compute pointer offset from the draft's top (in minutes), clamped to [0, dur]
    const anchor = pxToMins(e.clientY);
    dragOffsetRef.current = clamp(anchor - activeDraft.startM, 0, dur);

    // seed preview from current draft
    setDragPreview({ startM: activeDraft.startM, endM: activeDraft.endM });

    const onMove = (ev) => {
      if (dragModeRef.current !== 'move') return;
      // Compute the candidate new top by subtracting the initial offset,
      // then SNAP THE TOP to the nearest 30 mins. End is start + duration.
      const posTop = pxToMins(ev.clientY) - dragOffsetRef.current;
      const s = clamp(snapTo(posTop), START, END - dur);
      setDragPreview({ startM: s, endM: s + dur });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const fin = dragPreviewRef.current || activeDraft;
      dragModeRef.current = null;
      if (!fin) { setDragPreview(null); return; }
      if (typeof onChange === "function") onChange(fin.startM, fin.endM);
      else setDraft({ startM: fin.startM, endM: fin.endM });
      setDragPreview(null);
      // prevent trailing click-create
      suppressClick();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  // END: Drag-to-move entire draft block; commit on pointer up

  // BEGIN: Drag-to-create range on empty grid; commit on pointer up
  const onGridPointerDown = (e) => {
    // start only if not on event/draft/handle and no other drag mode is active
    if (e.target.closest('.qday-event') || e.target.closest('.qday-draft') || e.target.closest('[role="separator"]')) return;
    if (dragModeRef.current && dragModeRef.current !== 'create') return;

    e.preventDefault();
    e.stopPropagation();
    dragModeRef.current = 'create';

    const anchor = pxToMins(e.clientY);
    setDragPreview({ startM: anchor, endM: Math.min(anchor + STEP, END) });

    const onMove = (ev) => {
      if (dragModeRef.current !== 'create') return;
      const curr = pxToMins(ev.clientY);
      const s = Math.min(anchor, curr);
      const en = Math.max(anchor, curr);
      const start = snapTo(s);
      const end = snapTo(Math.max(start + STEP, en));
      setDragPreview({ startM: start, endM: Math.min(end, END) });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const fin = dragPreviewRef.current;
      dragModeRef.current = null;
      if (!fin) { setDragPreview(null); return; }
      if (typeof onChange === "function") onChange(fin.startM, fin.endM);
      else setDraft({ startM: fin.startM, endM: fin.endM });
      setDragPreview(null);
      // prevent trailing click-create
      suppressClick();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  // END: Drag-to-create range on empty grid; commit on pointer up

  // Keyboard support (arrows move selection; ctrl/cmd +/-/0 for zoom)
  const onKeyDown = (e) => {
    // Zoom controls
    if (e.ctrlKey || e.metaKey) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setZoomLevel(z => Math.min(4, z + 0.5));
        return;
      } else if (e.key === '-') {
        e.preventDefault();
        setZoomLevel(z => Math.max(1, z - 0.5));
        return;
      } else if (e.key === '0') {
        e.preventDefault();
        setZoomLevel(2);
        return;
      }
    }

    if (!activeDraft) return;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const dur = activeDraft.endM - activeDraft.startM;
      const newStart = Math.max(START, activeDraft.startM - STEP);
      if (typeof onChange === "function") onChange(newStart, newStart + dur);
      else setDraft({ startM: newStart, endM: newStart + dur });
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const dur = activeDraft.endM - activeDraft.startM;
      const newStart = Math.min(END - dur, activeDraft.startM + STEP);
      if (typeof onChange === "function") onChange(newStart, newStart + dur);
      else setDraft({ startM: newStart, endM: newStart + dur });
    } else if (e.key === "Escape") {
      if (!value) setDraft(null);
    }
  };

  // Filter events for this day
  const dayEvents = useMemo(
    () => events.filter((ev) => !ev.allDay && sameDay(new Date(ev.start), date)),
    [events, date]
  );
  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);

  // Sync scroll between gutter and grid
  const syncScroll = (source, target) => {
    if (target) target.scrollTop = source.scrollTop;
  };

  return (
    <div
      className="qday-wrap"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "70vh",
        border: "1px solid #22325b",
        borderRadius: 8,
        background: "#0f162b",
        overflow: "hidden"
      }}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      {/* Zoom controls */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        padding: "8px 12px",
        borderBottom: "1px solid #22325b",
        gap: 8
      }}>
        <button
          onClick={() => setZoomLevel(z => Math.max(1, z - 0.5))}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 4,
            color: "#8ca0d0",
            padding: "4px 8px",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600
          }}
          title="Zoom out (Ctrl+-)"
        >
          <i className="fa-solid fa-minus" />
        </button>
        <span style={{ color: "#8ca0d0", fontSize: 11, minWidth: 40, textAlign: "center" }}>
          {Math.round(zoomLevel * 50)}%
        </span>
        <button
          onClick={() => setZoomLevel(z => Math.min(4, z + 0.5))}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 4,
            color: "#8ca0d0",
            padding: "4px 8px",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600
          }}
          title="Zoom in (Ctrl++)"
        >
          <i className="fa-solid fa-plus" />
        </button>
        <button
          onClick={() => setZoomLevel(2)}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 4,
            color: "#8ca0d0",
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 600
          }}
          title="Reset zoom (Ctrl+0)"
        >
          Reset
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", flex: 1, overflow: "hidden" }}>
        {/* Fixed time gutter */}
        <div
          ref={gutterRef}
          className="qday-gutter"
          style={{
            position: "relative",
            borderRight: "1px solid #22325b",
            overflowY: "auto",
            overflowX: "hidden",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
          onScroll={(e) => syncScroll(e.currentTarget, gridRef.current)}
        >
          <style>{`.qday-gutter::-webkit-scrollbar{display:none;}`}</style>
          <div style={{ height: END * PX_PER_MINUTE, position: "relative" }}>
            {/* Hour labels */}
            {Array.from({ length: 24 }, (_, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: i * 60 * PX_PER_MINUTE,
                  height: 60 * PX_PER_MINUTE,
                  width: "100%",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "flex-end",
                  paddingRight: 8,
                  paddingTop: 2,
                }}
              >
                <span style={{
                  color: "#8ca0d0",
                  fontSize: 11,
                  fontWeight: 600,
                  lineHeight: "14px"
                }}>
                  {`${((i + 11) % 12) + 1} ${i < 12 ? "AM" : "PM"}`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable grid */}
        <div
          ref={gridRef}
          className="qday-grid"
          role="grid"
          aria-label="Day grid"
          onClick={onGridClick}
          onPointerMove={onGridMove}
          onPointerLeave={onGridLeave}
          onScroll={(e) => syncScroll(e.currentTarget, gutterRef.current)}
          style={{
            position: "relative",
            overflowY: "auto",
            overflowX: "hidden",
            cursor: "pointer",
          }}
        >
          <div
            className="qday-content"
            style={{
              position: "relative",
              height: END * PX_PER_MINUTE,
              minHeight: "100%"
            }}
            onPointerDown={onGridPointerDown}
          >
            {/* 30-minute row lines */}
            {Array.from({ length: 48 }, (_, i) => {
              const mins = i * 30;
              const isHour = mins % 60 === 0;
              return (
                <div
                  key={`line-${i}`}
                  style={{
                    position: "absolute",
                    top: mins * PX_PER_MINUTE,
                    left: 0,
                    right: 0,
                    height: 1,
                    background: isHour
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(255,255,255,0.03)",
                  }}
                />
              );
            })}

            {/* Hover highlight */}
            {hoverMin !== null && !resizingRef.current && !dragPreview && (
              <div
                className="qday-hover"
                style={{
                  position: "absolute",
                  top: hoverMin * PX_PER_MINUTE,
                  left: 8,
                  right: 8,
                  height: 30 * PX_PER_MINUTE,
                  background: "rgba(99, 102, 241, 0.08)",
                  border: "1px solid rgba(99, 102, 241, 0.2)",
                  borderRadius: 6,
                  pointerEvents: "none",
                  transition: "top 0.1s ease-out",
                }}
              />
            )}

            {/* Existing events */}
            {dayEvents.map((ev) => {
              const s = new Date(ev.start);
              const e = new Date(ev.end || ev.start);
              const startMin = s.getHours() * 60 + s.getMinutes();
              const duration = Math.max(30, minutesBetween(s, e));
              const cat = catById[ev.categoryId];
              const styles = styleForCategory(cat);

              return (
                <div
                  key={ev.id}
                  className="qday-event"
                  style={{
                    ...styles,
                    position: "absolute",
                    top: startMin * PX_PER_MINUTE,
                    left: 8,
                    right: 8,
                    height: duration * PX_PER_MINUTE,
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    overflow: "hidden",
                    borderWidth: 2,
                    borderStyle: "solid"
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    onEventClick?.(ev, r);
                  }}
                  title={ev.title}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span className="cat-dot dot--sm" style={dotStyle(cat?.color)} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ev.title}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>
                    {fmt12(startMin)} - {fmt12(startMin + duration)}
                  </div>
                </div>
              );
            })}

            {/* Live drag preview block (shown during move/resize/create) */}
            {dragPreview && (
              <>
                {/* Drop line at preview start */}
                <div
                  style={{
                    position: "absolute",
                    top: dragPreview.startM * PX_PER_MINUTE,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: "rgba(99,102,241,0.8)",
                    boxShadow: "0 0 6px rgba(99,102,241,0.6)"
                  }}
                />
                <div
                  className="qday-preview"
                  style={{
                    position: "absolute",
                    top: dragPreview.startM * PX_PER_MINUTE,
                    left: 6,
                    right: 6,
                    height: (dragPreview.endM - dragPreview.startM) * PX_PER_MINUTE,
                    background: "rgba(99, 102, 241, 0.18)",
                    border: "2px dashed rgba(99, 102, 241, 0.65)",
                    borderRadius: 8,
                    pointerEvents: "none",
                    color: "#c7d2fe",
                    fontSize: 12,
                    padding: "4px 8px"
                  }}
                >
                  {withMinutesOfDay(toYmd(date), dragPreview.startM).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  {" – "}
                  {withMinutesOfDay(toYmd(date), dragPreview.endM).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </div>
              </>
            )}

            {/* Draft event block (controlled via `value` or internal `draft`) */}
            {activeDraft && (
              <div
                className="qday-draft"
                style={{
                  position: "absolute",
                  top: activeDraft.startM * PX_PER_MINUTE,
                  left: 8,
                  right: 8,
                  height: (activeDraft.endM - activeDraft.startM) * PX_PER_MINUTE,
                  background: "rgba(63, 118, 255, 0.25)",
                  border: "2px solid rgba(63, 118, 255, 0.6)",
                  borderRadius: 8,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  color: "#e0e7ff",
                  padding: "6px 10px",
                  fontSize: 13,
                  fontWeight: 600,
                  overflow: "hidden",
                  cursor: "grab"
                }}
                onPointerDown={beginMove}
              >
                <div style={{ pointerEvents: "none" }}>
                  {withMinutesOfDay(toYmd(date), activeDraft.startM).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit"
                  })}
                  {" – "}
                  {withMinutesOfDay(toYmd(date), activeDraft.endM).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit"
                  })}
                </div>

                {/* Resize handle at bottom */}
                <div
                  role="separator"
                  aria-label="Resize event"
                  onPointerDown={beginResize}
                  style={{
                    position: "absolute",
                    left: "50%",
                    transform: "translateX(-50%)",
                    bottom: -2,
                    width: 40,
                    height: 8,
                    borderRadius: 4,
                    background: "rgba(63, 118, 255, 0.4)",
                    border: "1px solid rgba(63, 118, 255, 0.8)",
                    cursor: "ns-resize",
                  }}
                  title="Drag to resize"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   Category select / create (with circular color picker)
   ============================================================================ */
function CategorySelect({ categories, value, onChange, onCreate }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6ea8fe");

  const current = categories.find(c => c.id === value);

  const add = () => {
    const id = uuid();
    const cat = { id, name: name.trim() || "New category", color };
    onCreate?.(cat);
    onChange?.(id);
    setAdding(false); setName(""); setColor("#6ea8fe");
  };

  return (
    <div className="cat-select">
      <div className="cat-row">
        <span className="cat-dot" style={dotStyle(current?.color)} />
        <select className="sc-input" value={value} onChange={(e) => onChange?.(e.target.value)}>
          {categories.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
        <button className="sc-btn" type="button" onClick={() => setAdding((v) => !v)}>
          <i className="fa-solid fa-plus" /> New
        </button>
      </div>

      {adding && (
        <div className="cat-new">
          <input className="sc-input" placeholder="Category name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="sc-input color round" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          <button className="sc-btn primary" type="button" onClick={add}>
            <i className="fa-solid fa-check" /> Add
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   Event Modal (RIGHT replaced with SingleDayInteractiveGrid)
   ============================================================================ */
function EventModal({
  mode = "create",
  initial,
  categories,
  events,
  users = [],                 // + users for @mentions
  onUpsertCategory,
  onSave,
  onDelete,
  onClose
}) {
  const [title, setTitle] = useState(initial.title || "");
  const [attendees, setAttendees] = useState(initial.attendees || "");
  const [location, setLocation] = useState(initial.location || "");
  const [notes, setNotes] = useState(initial.notes || "");
  const [allDay, setAllDay] = useState(!!initial.allDay);
  const [categoryId, setCategoryId] = useState(initial.categoryId || categories[0]?.id);
  const [_start, _setStart] = useState(new Date(initial.start || Date.now()));
  const [_end, _setEnd] = useState(new Date(initial.end || Date.now() + 60 * 60000));
  const [date, setDate] = useState(toYmd(_start));

  const startM = minutesOfDay(_start);
  const endM = Math.max(startM + 30, minutesOfDay(_end));

  const updateDateOnly = (ymd) => {
    setDate(ymd);
    _setStart(withMinutesOfDay(ymd, startM));
    _setEnd(withMinutesOfDay(ymd, endM));
  };
  const updateRange = (sMins, eMins) => {
    _setStart(withMinutesOfDay(date, sMins));
    _setEnd(withMinutesOfDay(date, eMins));
  };

  // + Refs for caret-aware insertions
  const attendeesRef = useRef(null);
  const notesRef = useRef(null);

  // + Mention state for attendees input
  const [showMentionAtt, setShowMentionAtt] = useState(false);
  const [mentionQueryAtt, setMentionQueryAtt] = useState("");
  const [mentionIndexAtt, setMentionIndexAtt] = useState(0);

  // + Mention state for notes textarea
  const [showMentionNotes, setShowMentionNotes] = useState(false);
  const [mentionQueryNotes, setMentionQueryNotes] = useState("");
  const [mentionIndexNotes, setMentionIndexNotes] = useState(0);

  // + Compute mention matches
  const matchesAtt = useMemo(() => {
    if (!showMentionAtt) return [];
    const q = (mentionQueryAtt || "").toLowerCase();
    return (users || []).filter(
      (u) => (u.name || "").replace(/\s/g, "").toLowerCase().startsWith(q)
    );
  }, [showMentionAtt, mentionQueryAtt, users]);
  const matchesNotes = useMemo(() => {
    if (!showMentionNotes) return [];
    const q = (mentionQueryNotes || "").toLowerCase();
    return (users || []).filter(
      (u) => (u.name || "").replace(/\s/g, "").toLowerCase().startsWith(q)
    );
  }, [showMentionNotes, mentionQueryNotes, users]);

  // + Helpers to detect @cursor and open popup
  const onAttendeesChange = (e) => {
    const val = e.target.value;
    setAttendees(val);
    const caret = e.target.selectionStart || 0;
    const before = val.slice(0, caret);
    const m = before.match(/@(\w*)$/);
    if (m) {
      setShowMentionAtt(true);
      setMentionQueryAtt(m[1]);
      setMentionIndexAtt(0);
    } else {
      setShowMentionAtt(false);
      setMentionQueryAtt("");
    }
  };
  const onNotesChange = (e) => {
    const val = e.target.value;
    setNotes(val);
    const caret = e.target.selectionStart || 0;
    const before = val.slice(0, caret);
    const m = before.match(/@(\w*)$/);
    if (m) {
      setShowMentionNotes(true);
      setMentionQueryNotes(m[1]);
      setMentionIndexNotes(0);
    } else {
      setShowMentionNotes(false);
      setMentionQueryNotes("");
    }
  };

  // + Insert mention at caret, replacing "@partial"
  const insertMention = (which, user) => {
    const first = (user.name || "").split(" ")[0];
    if (which === "att") {
      setAttendees((prev) => {
        const el = attendeesRef.current;
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
      setShowMentionAtt(false);
      setMentionQueryAtt("");
    } else {
      setNotes((prev) => {
        const el = notesRef.current;
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
      setShowMentionNotes(false);
      setMentionQueryNotes("");
    }
  };

  // + Minimal inline styles for the popup
  const mentionPopStyle = {
    position: "absolute",
    left: 6,
    bottom: 42,
    width: "min(360px, 80%)",
    background: "#0f162b",
    border: "1px solid #25335d",
    borderRadius: 10,
    boxShadow: "0 10px 30px rgba(0,0,0,.45)",
    padding: 6,
    zIndex: 50,
  };
  const mItemStyle = (active) => ({
    display: "flex",
    alignItems: "center",
   gap: 8,
    padding: "6px 8px",
    borderRadius: 8,
    cursor: "pointer",
    background: active ? "#142043" : "transparent",
  });
  const avatarStyle = {
    width: 24,
    height: 24,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "#13254a",
    border: "1px solid #2a3c6a",
    color: "#cfe0ff",
    fontWeight: 800,
    fontSize: 11,
  };

  const doSave = () => {
    const payload = {
      id: initial.id || uuid(),
      title: title.trim() || "Untitled",
      attendees,
      location, notes,
      categoryId,
      allDay: !!allDay,
      start: (allDay ? startOfDay(_start) : _start).toISOString(),
      end: (allDay ? startOfDay(_end) : _end).toISOString(),
    };
    onSave?.(payload);
  };

  // Close on Esc
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="sc-backdrop" onClick={onClose} />
      <div className="sc-modal" role="dialog" aria-modal="true">
        <div className="sc-card">
          <div className="ed-header">
            <button className="sc-btn primary" type="button" onClick={doSave}>
              <i className="fa-solid fa-floppy-disk" /> Save
            </button>
            <div className="spacer" />
            <button className="sc-btn icon close-x" type="button" onClick={onClose} aria-label="Close">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>

          <div className="ed-body">
            {/* LEFT: fields + readout */}
            <div className="ed-left">
              <div className="ed-row">
                <input className="ed-title" placeholder="Add a title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>

              <div className="ed-row two">
                <div className="ed-field">
                  <label>Invite attendees <span className="dim">(@mentions)</span></label>
                  <input
                    ref={attendeesRef}
                    className="sc-input"
                    placeholder="@alex, @sarah, name@example.com"
                    value={attendees}
                    onChange={onAttendeesChange}
                    onKeyDown={(e) => {
                      if (showMentionAtt && matchesAtt.length) {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setMentionIndexAtt((i) => (i + 1) % matchesAtt.length);
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setMentionIndexAtt((i) => (i - 1 + matchesAtt.length) % matchesAtt.length);
                          return;
                        }
                        if (e.key === "Enter" || e.key === "Tab") {
                          e.preventDefault();
                          insertMention("att", matchesAtt[mentionIndexAtt]);
                          return;
                        }
                        if (e.key === "Escape") {
                          setShowMentionAtt(false);
                          setMentionQueryAtt("");
                          return;
                        }
                      }
                    }}
                  />
                  {showMentionAtt && matchesAtt.length > 0 && (
                    <div style={mentionPopStyle} role="listbox" aria-label="Mention suggestions">
                      {matchesAtt.slice(0, 5).map((u, idx) => {
                        const initials = u.initials || (u.name || "").split(" ").map((p) => p[0]).join("");
                        return (
                          <div
                            key={u.id}
                            style={mItemStyle(idx === mentionIndexAtt)}
                            className={idx === mentionIndexAtt ? "active" : ""}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              insertMention("att", u);
                            }}
                          >
                            <span style={avatarStyle}>{initials}</span>
                            <span className="m-name">{u.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="ed-field">
                  <label>Date</label>
                  <input type="date" className="sc-input" value={date} onChange={(e) => updateDateOnly(e.target.value)} />
                </div>
              </div>

              <div className="ed-row two">
                <div className="ed-field" style={{ alignItems: "center" }}>
                  <label>All day</label>
                  <label className="switch">
                    <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
                    <span />
                  </label>
                </div>

                <div className="ed-field">
                  <label>Category</label>
                  <CategorySelect
                    categories={categories}
                    value={categoryId}
                    onChange={setCategoryId}
                    onCreate={onUpsertCategory}
                  />
                </div>
              </div>

              {!allDay && (
                <div className="ed-row">
                  <div className="ed-field" style={{ width: "100%" }}>
                    <label>Time</label>
                    <TimeReadout
                      startM={startM}
                      endM={endM}
                      step={30}
                      minBlock={30}
                      onChangeRange={(s, e) => updateRange(s, e)}
                    />
                  </div>
                </div>
              )}

              <div className="ed-row">
                <div className="ed-field">
                  <label>Room or location</label>
                  <input className="sc-input" placeholder="Add a room or location" value={location} onChange={(e) => setLocation(e.target.value)} />
                </div>
              </div>

              {/* Description with @mentions */}
              <div className="ed-row">
                <div className="ed-field" style={{ width: "100%", position: "relative" }}>
                  <label>Description</label>
                  <div className="editor">
                    <textarea
                      ref={notesRef}
                      className="sc-input ed-notes"
                      placeholder="Write details…  Use @ to mention someone."
                      value={notes}
                      onChange={onNotesChange}
                      onKeyDown={(e) => {
                        if (showMentionNotes && matchesNotes.length) {
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setMentionIndexNotes((i) => (i + 1) % matchesNotes.length);
                            return;
                                                                            }
                          if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setMentionIndexNotes((i) => (i - 1 + matchesNotes.length) % matchesNotes.length);
                            return;
                          }
                          if (e.key === "Enter" || e.key === "Tab") {
                            e.preventDefault();
                            insertMention("notes", matchesNotes[mentionIndexNotes]);
                            return;
                          }
                          if (e.key === "Escape") {
                            setShowMentionNotes(false);
                            setMentionQueryNotes("");
                            return;
                          }
                        }
                      }}
                    />
                  </div>
                  {showMentionNotes && matchesNotes.length > 0 && (
                    <div style={{ ...mentionPopStyle, bottom: 10 }} role="listbox" aria-label="Mention suggestions">
                      {matchesNotes.slice(0, 5).map((u, idx) => {
                        const initials = u.initials || (u.name || "").split(" ").map((p) => p[0]).join("");
                        return (
                          <div
                            key={u.id}
                            style={mItemStyle(idx === mentionIndexNotes)}
                            className={idx === mentionIndexNotes ? "active" : ""}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              insertMention("notes", u);
                            }}
                          >
                            <span style={avatarStyle}>{initials}</span>
                            <span className="m-name">{u.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {mode === "edit" && (
                <div className="ed-row">
                  <button className="sc-btn danger" type="button" onClick={() => onDelete?.(initial.id)}>
                    <i className="fa-regular fa-trash-can" /> Delete
                  </button>
                </div>
              )}
            </div>

            {/* RIGHT: picker */}
            <div className="ed-right picker-only">
              <div className="ed-right-title">
                {new Date(date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </div>
              {allDay ? (
                <div className="mdp-allday">All-day</div>
              ) : (
                <SingleDayInteractiveGrid
                  date={new Date(date)}
                  events={events}
                  categories={categories}
                  value={{ startM, endM }}
                  onChange={(s, e) => updateRange(s, e)}
                  // Optional: click an existing event while editing
                  onEventClick={() => {}}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================================================================
   Main
   ============================================================================ */
export default function SimpleCalendar({
  initialDate = new Date(),
  initialEvents = [],
  initialCategories = [
    { id: "default", name: "DSM Schedule", color: "#8b5cf6" },
    { id: "meeting", name: "Meetings", color: "#34d399" },
    { id: "teaching", name: "Teaching", color: "#60a5fa" },
  ],
  onCreate,
  onUpdate,
  onDelete,
  height = "100vh",
}) {
  useEffect(() => { ensureFontAwesome(); }, []);

  // + Get users for @mentions/highlighting
  const { data, api, ready } = useApp(); // CHANGED: include ready
  const users = (data && Array.isArray(data.users)) ? data.users : [];

  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(startOfDay(initialDate));
  // const [events, setEvents] = useState(initialEvents); // REMOVED
  const [categories, setCategories] = useState(initialCategories);

  // Use events from AppContext; fall back to prop if not loaded
  const events = (ready && Array.isArray(data?.events)) ? data.events : initialEvents; // CHANGED

  // FIX: missing category map used by Peek
  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);

  // Peek
  const [peek, setPeek] = useState(null); // {event, anchorRect}

  // Nav
  const goPrev = () => { if (view === "month") setCursor((d) => addMonths(d, -1)); else if (view === "week") setCursor((d) => addDays(d, -7)); else setCursor((d) => addDays(d, -1)); };
  const goNext = () => { if (view === "month") setCursor((d) => addMonths(d, 1)); else if (view === "week") setCursor((d) => addDays(d, 7)); else setCursor((d) => addDays(d, 1)); };
  const goToday = () => setCursor(startOfDay(new Date()));

  // Modal
  const [modal, setModal] = useState(null);
  const [modalSeq, setModalSeq] = useState(0);
  const openCreateAt = (start, end) => setModal({ mode: "create", draft: { title: "", start, end, allDay: false, categoryId: categories[0]?.id } });
  const openCreateOnDay = (day) => {
    const s = startOfDay(day);
    const e = new Date(s.getTime() + 60 * 60000);
    setModal({ mode: "create", draft: { title: "", start: s, end: e, allDay: true, categoryId: categories[0]?.id } });
  };
  const openEditModal = (ev) => {
    setModalSeq((s) => s + 1);
    setModal({
      mode: "edit",
      draft: { ...ev, start: new Date(ev.start), end: new Date(ev.end || ev.start) },
      _k: Date.now()
    });
  };

  // FIX: missing toolbar action used by "Add Event"
  const openAddNow = () => {
    const base = new Date(cursor);
    base.setHours(12, 0, 0, 0); // start at 12:00 PM
    const s = base;
    const e = new Date(s.getTime() + 30 * 60000); // 30‑minute minimum block
    setModal({
      mode: "create",
      draft: { title: "", start: s, end: e, allDay: view === "month", categoryId: categories[0]?.id }
    });
  };

  const upsertCategory = (cat) => {
    setCategories((prev) => {
      const exists = prev.find((c) => c.id === cat.id);
      return exists ? prev.map((c) => (c.id === cat.id ? cat : c)) : [...prev, cat];
    });
  };

  // Save / Delete
  const handleSave = async (payload) => {
    if (modal?.mode === "create") {
      await api.add("events", payload);
      await onCreate?.(payload);
    } else {
      await api.put("events", payload);
      await onUpdate?.(payload);
    }
    setModal(null); setPeek(null);
  };

  const handleDelete = async (id) => {
    await api.del("events", id);
    await onDelete?.(id);
    setModal(null); setPeek(null);
  };

  // DnD to another day (month/all-day)
  const moveEventToDay = async (id, day, preferAllDay) => {   // CHANGED: async and persist
    const ev = events.find((e) => e.id === id);
    if (!ev) return;
    const startOld = new Date(ev.start);
    const endOld = new Date(ev.end || ev.start);
    const dur = endOld.getTime() - startOld.getTime();
    const ymd = toYmd(day);
    const keepTime = !ev.allDay; // keep time for timed items
    const ns = keepTime ? new Date(ymd + "T" + startOld.toTimeString().slice(0, 8)) : startOfDay(day);
    const ne = new Date(ns.getTime() + (dur || 60 * 60000));
    await api.put("events", {
      ...ev,
      start: ns.toISOString(),
      end: ne.toISOString(),
      allDay: preferAllDay ? true : ev.allDay,
    });
  };

  // Timed drag commit
  const commitTimedDrag = async (id, ns, ne) => {             // CHANGED: async and persist
    await api.put("events", { id, ...events.find(e => e.id === id), start: ns.toISOString(), end: ne.toISOString(), allDay: false });
    await onUpdate?.({ id, start: ns.toISOString(), end: ne.toISOString(), allDay: false });
  };

  // FIX: missing handlers referenced in JSX/effects
  const handleEventClick = (ev, rect) => setPeek({ event: ev, anchorRect: rect });
  const closePeek = () => setPeek(null);

  // Keyboard: arrows move the cursor range, Esc closes peek
  // Guard: ignore when user is typing in an editable field or when a modal is open
  useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      const tag = (el && el.tagName) ? el.tagName.toLowerCase() : "";
      const inEditable =
        (el && (el.isContentEditable ||
                tag === "input" ||
                tag === "textarea" ||
                tag === "select" ||
                (typeof el.getAttribute === "function" && el.getAttribute("role") === "textbox")));

      if (modal || inEditable) return;

      if (e.key === "Escape") { closePeek(); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
      if (e.key === "t" || e.key === "T") { e.preventDefault(); goToday(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [view, cursor, modal]);

  return (
    <section className="sc-wrap" style={{ height }}>
      {/* Toolbar (icons centered) */}
      <div className="sc-toolbar">
        <button className="sc-btn icon" onClick={goPrev} aria-label="Previous"><i className="fa-solid fa-chevron-left" /></button>
        <button className="sc-btn icon" onClick={goNext} aria-label="Next"><i className="fa-solid fa-chevron-right" /></button>
        <button className="sc-btn" onClick={goToday}><i className="fa-solid fa-calendar-check" /> Today</button>

        <div className="spacer" />

        <div className="sc-title">
          {view === "month"
            ? monthTitle(cursor)
            : view === "week"
            ? `${startOfWeek(cursor, 1).toLocaleDateString()} – ${endOfWeek(cursor).toLocaleDateString()}`
            : cursor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </div>

        <div className="spacer" />

        <div className="btn-group">
          <button className={`sc-btn${view === "day" ? " active" : ""}`} onClick={() => setView("day")}><i className="fa-solid fa-calendar-day" /> Day</button>
          <button className={`sc-btn${view === "week" ? " active" : ""}`} onClick={() => setView("week")}><i className="fa-solid fa-calendar-week" /> Week</button>
          <button className={`sc-btn${view === "month" ? " active" : ""}`} onClick={() => setView("month")}><i className="fa-solid fa-calendar-days" /> Month</button>
        </div>

        <button className="sc-btn primary" onClick={openAddNow} style={{ marginLeft: 8 }}>
          <i className="fa-solid fa-plus" /> Add Event
        </button>
      </div>

      {/* Views (no internal scroll; fill page) */}
      {view === "month" && (
        <MonthGrid
          viewDate={startOfMonth(cursor)}
          events={events}
          categories={categories}
          onDayClick={openCreateOnDay}
          onEventClick={handleEventClick}
          onDropToDay={moveEventToDay}
        />
      )}
      {view === "week" && (
        <WeekGrid
          viewDate={cursor}
          events={events}
          categories={categories}
          onCreateAt={openCreateAt}
          onEventClick={handleEventClick}
          onDropToDay={moveEventToDay}
          onTimedDragCommit={commitTimedDrag}
        />
      )}
      {view === "day" && (
        <DayGrid
          viewDate={cursor}
          events={events}
          categories={categories}
          onCreateAt={openCreateAt}
          onEventClick={handleEventClick}
          onTimedDragCommit={commitTimedDrag}
        />
      )}

      {/* Modals / Peek */}
      {modal && (
        <EventModal
          key={`ed-${modalSeq}-${modal._k || 0}`}
          mode={modal.mode}
          initial={modal.draft}
          categories={categories}
          events={events}
          users={users}                 // + pass users for @mentions
          onUpsertCategory={upsertCategory}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
        />
      )}

      {peek && (
        <EventPeek
          evt={peek.event}
          anchorRect={peek.anchorRect}
          category={catById[peek.event.categoryId]}
          users={users}
          onEdit={(ev) => {
            console.log("[Calendar] Opening edit modal for", ev?.id, ev);
            openEditModal(ev);
          }}
          onDelete={handleDelete}
          onClose={closePeek}
        />
      )}
    </section>
  );
}