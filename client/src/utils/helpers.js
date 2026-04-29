// src/utils/helpers.js

/** ---------- date + time basics ---------- */
export const todayISO = () => new Date().toISOString().slice(0, 10);

export const startOfMonth = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);

export const endOfMonth = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

/** Parse a clock string like "7", "7:30", "7am", "7:30 pm", "19:05" → minutes since midnight */
export function parseClock(str) {
  if (typeof str === "number" && Number.isFinite(str)) return Math.max(0, str);
  const s = String(str || "").trim().toLowerCase();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  let min = m[2] ? parseInt(m[2], 10) : 0;
  const suf = m[3];
  if (suf === "am") {
    if (h === 12) h = 0;
  } else if (suf === "pm") {
    if (h !== 12) h += 12;
  }
  // if no am/pm and 0–23 hour we assume 24h input, leave as-is
  return h * 60 + min;
}

/** minutes → "h:mm AM/PM" (e.g., 450 → "7:30 AM") */
export function minsToStr(mins) {
  mins = Math.max(0, Math.round(mins));
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const am = h24 < 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}

/** Combine a date (Date|ISO) with a time ("7:30 AM" | 450) → Date */
export function withTime(dateLike, time) {
  const d0 = new Date(dateLike);
  const mins = typeof time === "number" ? time : parseClock(time);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), h, m, 0, 0);
}

/** Light formatter used by inputs and labels */
export function fmtDate(dt, style = "dateTime") {
  const d = new Date(dt);
  if (style === "ymd") return d.toISOString().slice(0, 10); // YYYY-MM-DD
  if (style === "date")
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  if (style === "time")
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
  // default: "MM/DD/YYYY , hh:mm AM/PM"
  return `${fmtDate(d, "date")} , ${fmtDate(d, "time")}`;
}

/** ---------- strings / misc ---------- */
export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/** days between two ISO dates (exit optional → now) */
export function daysBetween(aISO, bISO) {
  if (!aISO) return 0;
  const a = new Date(aISO);
  const b = new Date(bISO || Date.now());
  return Math.max(0, Math.round((b - a) / (24 * 3600 * 1000)));
}

/** “Duration” label for tables (intake→exit/now) */
export function durationLabel(intake, exit) {
  const d = daysBetween(intake, exit);
  if (d < 14) return `${d} day${d === 1 ? "" : "s"}`;
  const w = Math.round(d / 7);
  if (w < 8) return `${w} wk`;
  const m = Math.round(d / 30.437);
  return `${m} mo`;
}

/** ---------- Weekly schedule parser (for your pasted text) ---------- */
/** Returns array of { dayIndex(0=Sun), title, startMins, endMins, rawLine } */
export function parseWeeklySchedule(text) {
  if (!text) return [];
  const DAYS = ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"];
  const lines = String(text).split(/\r?\n/);
  let curDay = null;
  const out = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Day headers like "MONDAY - Squad A"
    const dayHit = line.match(/^(SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)\b/i);
    if (dayHit) { curDay = DAYS.findIndex(d => d === dayHit[1].toUpperCase()); continue; }
    if (curDay == null) continue;

    // times: "7:00am 8:30am ------- Title"
    const m = line.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)(.*)$/i);
    if (!m) continue;
    const start = parseClock(m[1]);
    const end   = parseClock(m[2]);
    const title = m[3].replace(/^-+/, "").trim() || "Event";
    out.push({ dayIndex: curDay, title, startMins: start, endMins: end, rawLine: raw });
  }
  return out;
}

/** default bundle (so `import helpers from ...` still works) */
const helpers = {
  todayISO,
  startOfMonth,
  endOfMonth,
  parseClock,
  minsToStr,
  withTime,
  fmtDate,
  esc,
  daysBetween,
  durationLabel,
  parseWeeklySchedule,
};
export default helpers;
