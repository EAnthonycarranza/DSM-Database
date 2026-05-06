import React from "react";

export default function CalendarSidebar({
  users = [],
  calendars = [],
  selectedCalendars = [],
  onToggleCalendar,
  onAddEvent,
  onLoadSchedule,
}) {
  return (
    <aside className="cal-left">
      <div className="toolbar" style={{ padding: 10 }}>
        <button className="btn primary" onClick={onAddEvent}>+ Add Event</button>
        <button className="btn small" onClick={onLoadSchedule}>Load Weekly Schedule</button>
      </div>

      <div style={{ padding: 10 }}>
        <h4>Team Members</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {users.map(u => <label key={u.id}><input type="checkbox" defaultChecked/> {u.name}</label>)}
        </div>

        <h4 style={{ marginTop: 12 }}>Calendars</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
          {calendars.map(c => {
            const checked = selectedCalendars.includes(c);
            return (
              <label key={c}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e)=>onToggleCalendar?.(c, e.target.checked)}
                /> {c}
              </label>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
