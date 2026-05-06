// src/components/calendar/TuiCalendarView.jsx
import React, {
  forwardRef, useEffect, useImperativeHandle, useMemo, useRef
} from "react";
import Calendar from "@toast-ui/calendar";
import "@toast-ui/calendar/dist/toastui-calendar.min.css";

/* ---------- helpers ---------- */
const hueFrom = (str = "") => { let h = 0; for (let i=0;i<str.length;i++) h = (h*31 + str.charCodeAt(i)) % 360; return h; };
const mapToTuiEvent = (ev) => {
  const start = new Date(ev.date);
  const end   = new Date(start.getTime() + ((ev.duration || 60) * 60000));
  const isAll = !!ev.allDay || (ev.duration >= 1440);
  const cal   = ev.calendar || "DSM Schedule";
  const h     = hueFrom(cal);
  return {
    id: ev.id,
    calendarId: cal,
    title: ev.title + (ev.whom ? ` — ${ev.whom}` : ""),
    start, end,
    category: isAll ? "allday" : "time",
    isAllday: isAll,
    backgroundColor: `hsl(${h} 60% 34% / 1)`,
    borderColor:     `hsl(${h} 64% 58% / .85)`,
    color: "#ffffff",
    raw: { whom: ev.whom || "", notes: ev.notes || "" },
  };
};

/* ---------- anchor helpers (used to position popup NEAR the clicked day) ---------- */
function findSelectionRect(container) {
  const SEL = [
    ".toastui-calendar-grid-selection",
    ".toastui-calendar-weekday-selection",
    ".toastui-calendar-timegrid-selection",
    ".tui-full-calendar-weekday-selection" // legacy
  ].join(",");
  const list = [...(container?.querySelectorAll?.(SEL) || [])].filter(el => el.offsetParent);
  if (!list.length) return null;
  let best = list[0], bestArea = 0;
  for (const el of list) {
    const r = el.getBoundingClientRect();
    const a = Math.max(0, r.width) * Math.max(0, r.height);
    if (a > bestArea) { best = el; bestArea = a; }
  }
  return best.getBoundingClientRect();
}

function findCellRectForDate(container, date) {
  const ymd = date.toISOString().slice(0, 10);
  const CAND = [
    `[data-date="${ymd}"]`,
    `.toastui-calendar-grid-cell[data-date="${ymd}"]`,
    `.toastui-calendar-weekday-grid-date[data-date="${ymd}"]`,
    `.toastui-calendar-month-week-item[data-date="${ymd}"]`,
    `.tui-full-calendar-weekday-grid-date[data-date="${ymd}"]`
  ];
  for (const sel of CAND) {
    const el = container?.querySelector?.(sel);
    if (el && el.getBoundingClientRect) return el.getBoundingClientRect();
  }
  return null;
}

/* ---------- dark + popup visual styles (NO positioning here) ---------- */
const TUI_CSS = `
  .toastui-calendar, .toastui-calendar * { color:#fff; }

  .toastui-calendar-form-container,
  .toastui-calendar-popup-container,
  .toastui-calendar-detail-container,
  .toastui-calendar-section-container {
    background: linear-gradient(180deg,#0b0f1d 0%,#0c1020 40%,#0a0e1b 100%) !important;
    border: 1px solid #27325a !important;
    border-radius: 14px !important;
    box-shadow: 0 24px 60px rgba(0,0,0,.55) !important;
    color:#e9eef8 !important;
  }
  .toastui-calendar-popup-section-item .toastui-calendar-content {
    background:#10172c !important;
    border:1px solid #2a3c6a !important;
    border-radius:10px !important;
    padding:6px 8px !important;
  }
  .toastui-calendar-popup-container input,
  .toastui-calendar-popup-container select,
  .toastui-calendar-popup-container textarea {
    background:transparent !important;
    color:#e9eef8 !important;
    border:0 !important; outline:none;
  }
  .toastui-calendar-popup-button.toastui-calendar-popup-confirm { background:#1e88ff !important; color:#fff !important; }
  .toastui-calendar-popup-button.toastui-calendar-popup-cancel  { color:#9fb6ff !important; }

  .toastui-calendar-dropdown-menu,
  .toastui-calendar-popup-section-item.toastui-calendar-dropdown-menu-item {
    background:#10172c !important; border:1px solid #2a3c6a !important; border-radius:10px !important;
  }
`;

/* ---------- theme ---------- */
const TUI_THEME = {
  common: { backgroundColor: "#0f162b", color: "#ffffff" },
  week:   { dayname: { color: "#cfe0ff" }, nowIndicatorLabel: { color: "#fff" } },
  month:  { dayname: { color: "#cfe0ff" } },
  event:  { color: "#ffffff" },
};

const TuiCalendarView = forwardRef(function TuiCalendarView(
  {
    events = [],
    calendars = [],
    selectedCalendars = [],
    onCreate, onUpdate, onDelete,
    onNavigate, onViewChange,
    height = "100%",
  },
  ref
) {
  const hostRef = useRef(null);
  const instRef = useRef(null);
  const seededRef = useRef(false);

  // where to anchor the creation popup
  const anchorRectRef = useRef(null);
  const popupObserverRef = useRef(null);

  const tuiCalendars = useMemo(
    () => calendars.map((name) => {
      const h = hueFrom(name);
      return {
        id: name,
        name,
        backgroundColor: `hsl(${h} 60% 34% / .22)`,
        borderColor:     `hsl(${h} 64% 58% / .85)`,
        color: "#ffffff",
      };
    }),
    [calendars]
  );

  const positionPopupNearAnchor = () => {
    const popup = document.querySelector(".toastui-calendar-popup");
    const anchorRect = anchorRectRef.current;
    if (!popup || !anchorRect) return;

    popup.style.position = "fixed";
    popup.style.transform = "none";
    popup.style.zIndex = "1200";

    const popupRect = popup.getBoundingClientRect();
    const containerRect = hostRef.current?.getBoundingClientRect()
      ?? { left:0, top:0, width:window.innerWidth, height:window.innerHeight };

    // to the left by default; otherwise to the right; clamp vertically
    let left = anchorRect.left - popupRect.width - 12;
    if (left < containerRect.left + 8) {
      left = Math.min(
        anchorRect.right + 12,
        containerRect.left + containerRect.width - popupRect.width - 8
      );
    }
    let top = anchorRect.top + (anchorRect.height - popupRect.height) / 2;
    const minTop = containerRect.top + 8;
    const maxTop = containerRect.top + containerRect.height - popupRect.height - 8;
    if (top < minTop) top = minTop;
    if (top > maxTop) top = maxTop;

    popup.style.left = `${Math.round(left)}px`;
    popup.style.top  = `${Math.round(top)}px`;
  };

  const attachPopupObserver = () => {
    if (popupObserverRef.current) return;
    const obs = new MutationObserver(() => {
      requestAnimationFrame(positionPopupNearAnchor);
      setTimeout(positionPopupNearAnchor, 0);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    popupObserverRef.current = obs;
  };

  /* ---------- mount once ---------- */
  useEffect(() => {
    if (!hostRef.current || instRef.current) return;

    // Anchor to real day cells on pointer down
    const onDown = (e) => {
      const cell = e.target.closest?.(
        "[data-date], .toastui-calendar-grid-cell, .toastui-calendar-weekday-grid-date, .toastui-calendar-month-week-item"
      ) || e.target;
      anchorRectRef.current = cell.getBoundingClientRect();
    };
    hostRef.current.addEventListener("mousedown", onDown);

    const inst = new Calendar(hostRef.current, {
      defaultView: "month",
      usageStatistics: false,
      theme: TUI_THEME,
      isReadOnly: false,
      useFormPopup: true,
      useDetailPopup: true,
      month: { startDayOfWeek: 1, visibleWeeksCount: 6 },
      week:  { startDayOfWeek: 1, hourStart: 6, hourEnd: 22, showNowIndicator: true },
      calendars: tuiCalendars,
    });
    instRef.current = inst;

    requestAnimationFrame(() => inst.render?.());

    // Create
    inst.on("beforeCreateEvent", async (e) => {
      try {
        const start = e.start?.toDate ? e.start.toDate() : new Date(e.start);
        const end   = e.end?.toDate   ? e.end.toDate()   : new Date(e.end);
        const allDay = !!(e.isAllday || e.isAllDay);
        const payload = {
          id: crypto.randomUUID(),
          title: (e.title || "").trim() || "Untitled",
          date: start.toISOString(),
          duration: Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000)),
          calendar: e.calendarId || "DSM Schedule",
          allDay,
        };
        const saved = (await onCreate?.(payload)) || payload;

        const h = hueFrom(saved.calendar);
        inst.createEvents?.([{
          id: saved.id, calendarId: saved.calendar, title: saved.title,
          start, end, category: saved.allDay ? "allday" : "time", isAllday: saved.allDay,
          backgroundColor: `hsl(${h} 60% 34% / 1)`,
          borderColor:     `hsl(${h} 64% 58% / .85)`,
          color: "#fff",
        }]);
      } catch {}
    });

    // Update
    inst.on("beforeUpdateEvent", async (e) => {
      try {
        const s  = e?.changes?.start ?? e?.event?.start;
        const en = e?.changes?.end   ?? e?.event?.end;
        const start = s?.toDate ? s.toDate() : new Date(s);
        const end   = en?.toDate ? en.toDate() : new Date(en);

        const allDay =
          (e?.changes?.isAllday ?? e?.changes?.isAllDay) ??
          (e?.event?.isAllday  ?? e?.event?.isAllDay) ??
          false;

        const changes = {
          id: e?.event?.id,
          title: e?.changes?.title ?? e?.event?.title ?? "",
          calendar: e?.changes?.calendarId ?? e?.event?.calendarId ?? "DSM Schedule",
          date: start.toISOString(),
          duration: Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000)),
          allDay,
        };
        const next = (await onUpdate?.(changes)) || changes;
        inst.updateEvent?.(e.event.id, e.event.calendarId, {
          title: next.title,
          start, end,
          isAllday: next.allDay,
          calendarId: next.calendar,
        });
      } catch {}
    });

    // Delete
    inst.on("beforeDeleteEvent", async (e) => {
      try {
        await onDelete?.(e?.event?.id);
        inst.deleteEvent?.(e?.event?.id, e?.event?.calendarId);
      } catch {}
    });

    // Creation popup – anchor near the day you clicked
    inst.on("selectDateTime", (ev) => {
      const container = hostRef.current;
      const start = ev.start?.toDate ? ev.start.toDate() : new Date(ev.start);
      const end   = ev.end?.toDate   ? ev.end.toDate()   : new Date(start.getTime() + 60*60000);
      const firstCal = (selectedCalendars[0] || calendars[0] || "DSM Schedule");

      const selRect  = findSelectionRect(container);
      const cellRect = findCellRectForDate(container, start);
      const viewRect = container?.getBoundingClientRect?.();

      anchorRectRef.current =
        selRect ||
        cellRect ||
        (viewRect && {
          left: viewRect.left + viewRect.width * 0.33,
          right: viewRect.left + viewRect.width * 0.33 + 1,
          top: viewRect.top + viewRect.height * 0.4,
          bottom: viewRect.top + viewRect.height * 0.4 + 1,
          width: 1, height: 1
        });

      inst.openFormPopup?.({ start, end, isAllday: !!ev.isAllday, calendarId: firstCal, title: "" });

      requestAnimationFrame(positionPopupNearAnchor);
      setTimeout(positionPopupNearAnchor, 0);
      attachPopupObserver();
    });

    return () => {
      try { inst.destroy(); } catch {}
      instRef.current = null;
      seededRef.current = false;
      hostRef.current?.removeEventListener?.("mousedown", onDown);
      popupObserverRef.current?.disconnect?.();
      popupObserverRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial seed once
  useEffect(() => {
    const inst = instRef.current;
    if (!inst || seededRef.current || events.length === 0) return;
    const visible = new Set(selectedCalendars);
    inst.createEvents?.(
      events.filter(ev => visible.has(ev.calendar || "DSM Schedule")).map(mapToTuiEvent)
    );
    seededRef.current = true;
  }, [events, selectedCalendars]);

  // Calendar sets / visibility
  useEffect(() => { instRef.current?.setCalendars?.(tuiCalendars); }, [tuiCalendars]);
  useEffect(() => {
    const inst = instRef.current; if (!inst) return;
    const selected = new Set(selectedCalendars);
    calendars.forEach(id => inst.setCalendarVisibility?.(id, selected.has(id)));
  }, [calendars, selectedCalendars]);

  useImperativeHandle(ref, () => ({
    prev(){ instRef.current?.prev();  onNavigate?.(new Date()); },
    next(){ instRef.current?.next();  onNavigate?.(new Date()); },
    today(){ instRef.current?.today(); onNavigate?.(new Date()); },
    changeView(v){ instRef.current?.changeView(v); onViewChange?.(v); },
    openCreatePopupNow(){
      const start = new Date(); const end = new Date(start.getTime() + 60*60000);
      const cal = selectedCalendars[0] || calendars[0] || "DSM Schedule";
      const container = hostRef.current;
      anchorRectRef.current =
        findCellRectForDate(container, start) ||
        container?.getBoundingClientRect?.();
      instRef.current?.openFormPopup?.({ start, end, isAllday:false, calendarId:cal, title:"" });
      requestAnimationFrame(positionPopupNearAnchor);
      setTimeout(positionPopupNearAnchor, 0);
      attachPopupObserver();
    },
    addEvents(raw = []){ instRef.current?.createEvents?.(raw.map(mapToTuiEvent)); }
  }), [calendars, selectedCalendars, onNavigate, onViewChange]);

  return (
    <div style={{ height }}>
      <style>{TUI_CSS}</style>
      <div
        ref={hostRef}
        style={{
          height: "100%",
          minHeight: 420,
          contain: "layout paint size",
          overflow: "hidden",
        }}
      />
    </div>
  );
});

export default TuiCalendarView;
