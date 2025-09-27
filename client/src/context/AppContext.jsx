import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef, startTransition } from "react";
import { io } from "socket.io-client";

const LS = {
  read(k, def) {
    try {
      const v = window.localStorage.getItem(k);
      return v ? JSON.parse(v) : def;
    } catch {
      return def;
    }
  },
  write(k, v) {
    window.localStorage.setItem(k, JSON.stringify(v));
  },
};
const AUTH_LS_KEY = "dsm:auth:v1";

const STORES = [
  "students",
  "tasks",
  "classes",
  "service",
  "documents",
  // New: PDF template library and envelopes for sending
  "pdfTemplates",
  "envelopes",
  // Form builder system
  "forms",
  "formSubmissions",
  "notifications",
  "messages",
  "users",
  "settings",
  "audit",
  "events", // <- NEW
];

// NEW: API base. Prefer CRA env, then Vite env, then window override, then relative '/api'.
const DEFAULT_API_BASE =
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE) ||
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) ||
  (typeof window !== "undefined" && window.__DSM_API_BASE__) ||
  "/api";

// Polling config for presence and users polling
const POLL = {
  presencePingMs: 120000,       // 2 minutes
  usersForegroundMs: 60000,     // 60s when on Team page (reduce churn)
  usersBackgroundMs: 300000,    // 5 minutes elsewhere / hidden tab
  usersCooldownMs: 8000,        // minimum 8s gap between users refreshes (debounce)
  messagesCooldownMs: 5000,     // minimum 5s gap between message refreshes (debounce)
  presenceVisDebounceMs: 2500,  // wait before flipping to away on hidden tab
  presenceServerGraceMs: 300000 // hold my presence locally up to 5m after a change
};

// Socket endpoint (overrideable). If not provided, derive from apiBase and finally fall back to :4000.
const SOCKET_URL =
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_SOCKET_URL) ||
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SOCKET_URL) ||
  (typeof window !== "undefined" && window.__DSM_SOCKET_URL__) ||
  null;

function deriveSocketUrl(apiBase) {
  try {
    // If apiBase is absolute, use its origin.
    const u = new URL(apiBase, typeof window !== "undefined" ? window.location.href : "http://localhost");
    // If apiBase was relative (e.g., "/api"), URL(...) resolves to the page origin (e.g., http://localhost:3000).
    // In CRA/Vite dev we still want to talk directly to the API server (default 4000) for websockets, but in
    // production we must reuse the same origin/port so the connection works on Heroku/Render/etc.
    const isRelative = /^\/(?!\/)/.test(apiBase || "");
    if (isRelative) {
      if (typeof window !== "undefined") {
        const { protocol, hostname, port } = window.location;
        const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
        const devPorts = new Set(["3000", "5173", "4173", "5174", "8080"]);
        if (localHosts.has(hostname) && devPorts.has(port || "")) {
          return `${protocol}//${hostname}:4000`;
        }
        return window.location.origin;
      }
      // Server-side rendering fallback
      return "http://localhost:4000";
    }
    // Absolute URL: return its origin (protocol + host + optional port)
    return u.origin;
  } catch {
    // Final fallback
    if (typeof window !== "undefined") {
      return `${window.location.protocol}//${window.location.hostname}:4000`;
    }
    return "http://localhost:4000";
  }
}

/* ---------- defaults ---------- */
const defaultSettings = {
  id: "settings",
  capacity: 21,
  dorms: [
    { id: "d-1", name: "Bethany", slots: 7 },
    { id: "d-2", name: "Hebron", slots: 7 },
    { id: "d-3", name: "Zion", slots: 7 },
  ],
  // NEW: editable lists used by dropdowns
  lists: {
    statuses: ["Current", "Waitlist", "Future Applicant", "Alumni", "Withdrawn"],
    phases:   ["", "1", "2"],
    squads:   ["", "A", "B", "C"],
    recordTypes: ["Resident", "Applicant", "Prospect", "Alumni"],
  },
  // NEW: Google Vision API key (client-side demo only; use backend for prod)
  visionApiKey: "",
  // NEW: Optional proxy endpoint to call Vision server-side
  visionProxyUrl: "",
};

const emptyData = {
  students: [],
  tasks: [],
  classes: [],
  service: [],
  documents: [],
  pdfTemplates: [],
  envelopes: [],
  notifications: [],
  messages: [],
  users: [],
  settings: defaultSettings,
  audit: [],
  events: [], // <- NEW
};


/* ---------- ctx ---------- */
const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

/* ---------- provider ---------- */
export function AppProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [data, setData] = useState(emptyData);
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  // UI state used across app
  const [page, setPage] = useState("home");
  const [params, setParams] = useState({});
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [panels, setPanels] = useState({ messages: false, notifications: false });
  const [modal, setModal] = useState({
    open: false,
    type: "text",
    title: "",
    content: "",
    props: null,
    node: null,
  });

  // NEW: backend detection state
  const [apiBase] = useState(() => {
    const base = (DEFAULT_API_BASE || "/api").replace(/\/+$/, "");
    return base;
  });
  const [serverOnline, setServerOnline] = useState(false);

  // Log selected API base and whether we're cross-origin (CORS) or same-origin (dev proxy)
  useEffect(() => {
    try {
      const baseUrl = new URL(apiBase, typeof window !== "undefined" ? window.location.href : "http://localhost");
      const sameOrigin = typeof window !== "undefined" && baseUrl.origin === window.location.origin;
  // One-time info suppressed (console.log removed)
    } catch {
      // ignore URL parse issues
    }
  }, [apiBase]);

  // Silence ResizeObserver loop errors (Chrome devtools noise)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isROErr = (src) => {
      const msg = String(
        (typeof src === "string" && src) ||
        src?.message ||
        src?.reason?.message ||
        src?.error?.message ||
        src?.reason ||
        src ||
        ""
      );
      return /ResizeObserver loop/i.test(msg) &&
             (/(undelivered notifications|limit exceeded)/i.test(msg) || true);
    };

    // Capture-phase listeners to intercept before React overlay
    const onGlobalErrorCapture = (e) => {
      if (isROErr(e)) {
        e.preventDefault?.();
        e.stopImmediatePropagation?.();
        return false;
      }
    };
    window.addEventListener("error", onGlobalErrorCapture, true);
    window.addEventListener("unhandledrejection", onGlobalErrorCapture, true);

    // Fallback: bubble-phase as well
    const onGlobalError = (e) => {
      if (isROErr(e)) {
        e.preventDefault?.();
        e.stopImmediatePropagation?.();
        return false;
      }
    };
    window.addEventListener("error", onGlobalError);
    window.addEventListener("unhandledrejection", onGlobalError);

    // Guard window.onerror/onunhandledrejection
    const prevOnError = window.onerror;
    const prevOnUR = window.onunhandledrejection;
    window.onerror = function (message, source, lineno, colno, error) {
      if (isROErr(error || message)) return true;
      return typeof prevOnError === "function"
        ? prevOnError(message, source, lineno, colno, error)
        : false;
    };
    window.onunhandledrejection = function (event) {
      if (isROErr(event?.reason)) return true;
      return typeof prevOnUR === "function" ? prevOnUR(event) : false;
    };

    // Filter console noise
    const origError = console.error;
    console.error = (...args) => {
      if (isROErr(args?.[0])) return;
      origError.apply(console, args);
    };

    return () => {
      window.removeEventListener("error", onGlobalErrorCapture, true);
      window.removeEventListener("unhandledrejection", onGlobalErrorCapture, true);
      window.removeEventListener("error", onGlobalError);
      window.removeEventListener("unhandledrejection", onGlobalError);
      console.error = origError;
      window.onerror = prevOnError;
      window.onunhandledrejection = prevOnUR;
    };
  }, []);

// bootstrap from server once (no local placeholders)
useEffect(() => {
  let cancelled = false;
  const bootstrap = async () => {
    try {
      // Health check first; if server is reachable, hydrate all stores
      const health = await fetch(`${apiBase}/health`, { method: "GET", credentials: "include" }).catch(() => null);
      if (!health || !health.ok) {
        console.warn("Server health check failed.");
        setReady(true);
        return;
      }
      const stores = {};
      await Promise.all(
        STORES.map(async (s) => {
          // Do not fetch messages before we know who is signed in; avoid leaking others' threads
          if (s === "messages") {
            stores[s] = [];
            return;
          }
          try {
            const res = await fetch(`${apiBase}/${s}`, { method: "GET", credentials: "include" });
            const ct = res.headers.get("content-type") || "";
            const body = ct.includes("application/json") ? await res.json() : (s === "settings" ? defaultSettings : []);
            stores[s] = Array.isArray(body) ? body : (s === "settings" ? body || defaultSettings : []);
          } catch {
            stores[s] = s === "settings" ? defaultSettings : [];
          }
        })
      );
      if (!cancelled) {
        // SANITIZE: force correct shapes for all stores
  const sanitized = coerceStores(stores);
  // console.log removed: bootstrap completed
        setData((d) => ({ ...d, ...sanitized }));
        setReady(true);
      }
    } catch (e) {
      console.error("Bootstrap failed:", e);
      if (!cancelled) setReady(true);
    }
  };
  bootstrap();
  return () => { cancelled = true; };
}, [apiBase]);

  // NEW: detect server availability and optionally bootstrap data from server
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`${apiBase}/health`, { method: "GET", credentials: "include" });
        if (!res.ok) throw new Error("unhealthy");
        const body = await res.json().catch(() => ({}));
        // CORS diagnostics: log relevant headers if cross-origin
        try {
          const apiUrl = new URL(apiBase, typeof window !== "undefined" ? window.location.href : "http://localhost");
          const sameOrigin = typeof window !== "undefined" && apiUrl.origin === window.location.origin;
          const acao = res.headers.get("access-control-allow-origin");
          const acc = res.headers.get("access-control-allow-credentials");
          const note = sameOrigin
            ? "same-origin/proxy — CORS headers not required"
            : `CORS headers — ACAO: ${acao || "(none)"}, ACC: ${acc || "(none)"}`;
          // console.log removed: health OK
          if (!sameOrigin) {
            const expected = typeof window !== "undefined" ? window.location.origin : null;
            if (expected && acao && acao !== "*" && acao !== expected) {
              console.warn(`[DSM] Warning: ACAO (${acao}) does not match page origin (${expected}).`);
            }
          }
        } catch {}
        if (!cancelled) setServerOnline(true);
      } catch {
        console.warn(`[DSM] Health check failed at ${apiBase}/health. If API is on a different origin, verify CORS settings on the server.`);
        if (!cancelled) setServerOnline(false);
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  // NEW: tiny fetch helper + store refresher (server mode only)
  const apiRequest = async (path, opts = {}) => {
    const res = await fetch(`${apiBase}${path}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      ...opts,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`API ${opts.method || "GET"} ${path} failed: ${res.status} ${t}`);
    }
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? res.json() : res.text();
  };

  // Loose POST helper that returns body even on 4xx (used for auth to read MFA prompts)
  const postJsonLoose = async (path, bodyObj = {}) => {
    const res = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      credentials: "include",
      body: JSON.stringify(bodyObj),
    });
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, data };
  };

  // --- auth state (moved up so it's defined before any hook uses it) ---
// Replace the existing auth state initialization with this:
const [auth, setAuth] = useState(() => {
  // Try localStorage first
  const stored = LS.read(AUTH_LS_KEY, null);
  if (stored?.authenticated && stored?.user) {
    return stored;
  }
  
  // Try sessionStorage as fallback
  try {
    const sessionAuth = window.sessionStorage.getItem(AUTH_LS_KEY);
    if (sessionAuth) {
      const parsed = JSON.parse(sessionAuth);
      if (parsed?.authenticated && parsed?.user) {
        return parsed;
      }
    }
  } catch {}
  
  return { authenticated: false, user: null };
});

const authRef = useRef(auth);
useEffect(() => { authRef.current = auth; }, [auth]);

// Add this effect to persist auth to sessionStorage (always) and localStorage (if remember)
useEffect(() => {
  if (auth?.authenticated && auth?.user) {
    // Always save to session storage for current session
    try {
      window.sessionStorage.setItem(AUTH_LS_KEY, JSON.stringify(auth));
    } catch {}
  } else {
    // Clear session storage on logout
    try {
      window.sessionStorage.removeItem(AUTH_LS_KEY);
    } catch {}
  }
}, [auth]);

  // Hold email/password temporarily when server asks for 2FA
  const [pending2FA, setPending2FA] = useState(null); // { email, password, remember }

  // Track last presence we sent to avoid spamming server/UI and causing flicker
  const presenceRef = useRef({ last: null, lastSent: 0, lastChange: 0 });
  // Track last refresh times per store for cooldown/debounce
  const lastRefreshRef = useRef({});
  // Prevent overlapping fetches per store
  const refreshingRef = useRef({});
  // Socket.IO reference
  const socketRef = useRef(null);

  // Update presence for the signed-in user (throttled + change-only)
const setPresence = async (presence = "online", { beacon = false } = {}) => {
  try {
    const id = auth?.user?.id;
    if (!id) return;

    const now = Date.now();
    const last = presenceRef.current.last;
    const lastSent = presenceRef.current.lastSent || 0;

    // Throttle churn and only update when changed or after ~90s
    if (presence === last && now - lastSent < 90000) return;

    presenceRef.current = {
      last: presence,
      lastSent: now,
      lastChange: presence !== last ? now : (presenceRef.current.lastChange || now),
    };

    // Optimistic LOCAL update only (no network)
    setData((d) => {
      if (!Array.isArray(d.users)) return d;
      let changed = false;
      const users = d.users.map((u) => {
        if (u.id !== id) return u;
        const cur = String(u.presence || "").toLowerCase();
        if (cur === presence && (u.lastSeen || 0) >= now - 5000) return u;
        changed = true;
        return { ...u, presence, lastSeen: now };
      });
      return changed ? { ...d, users } : d;
    });

    // Inform server via Socket.IO (if connected)
        if (socketRef.current && socketRef.current.connected) {
      try {
        socketRef.current.emit("presence:set", { presence });
      } catch {}
    }
  } catch {
    /* ignore local presence errors */
  }
};

  // Socket.IO connection lifecycle
  useEffect(() => {
    const userId = auth?.user?.id;
    if (!auth?.authenticated || !userId) {
      // Tear down any previous socket
      if (socketRef.current) {
        try { socketRef.current.disconnect(); } catch {}
        socketRef.current = null;
      }
      return;
    }

    const url = SOCKET_URL || deriveSocketUrl(apiBase);
    const s = io(url, {
      transports: ["websocket"],
      withCredentials: true,
      auth: { userId },
    });
    socketRef.current = s;

  s.on("connect", () => {
      // announce current presence right away
      try { s.emit("presence:set", { presence: presenceRef.current.last || "online" }); } catch {}
    });
    s.on("connect_error", (err) => console.warn("[socket] connect_error", err?.message || err));
  s.on("disconnect", (reason) => {});

  s.on("presence:init", ({ admins } = {}) => {
      if (!Array.isArray(admins) || !admins.length) return;
      setData((d) => {
        if (!Array.isArray(d.users)) return d;
        const map = new Map(admins.map((a) => [a.userId, a]));
        const users = d.users.map((u) => {
          const a = map.get(u.id);
          return a ? { ...u, presence: a.presence || u.presence, lastSeen: a.lastSeen || u.lastSeen } : u;
        });
        return { ...d, users };
      });
    });

  s.on("presence:update", (p = {}) => {
      if (!p?.userId) return;
      setData((d) => {
        const users = (Array.isArray(d.users) ? d.users : []).map((u) =>
          u.id === p.userId ? { ...u, presence: p.presence || u.presence, lastSeen: p.lastSeen || Date.now() } : u
        );
        return { ...d, users };
      });
    });

    return () => {
      try { s.disconnect(); } catch {}
      socketRef.current = null;
    };
  }, [auth?.authenticated, auth?.user?.id, apiBase]);

  // Keepalive ping
  useEffect(() => {
    if (!auth?.authenticated || !auth?.user?.id) return;
    const t = setInterval(() => {
      const s = socketRef.current;
      if (s && s.connected) {
        try { s.emit("presence:ping"); } catch {}
      }
    }, POLL.presencePingMs);
    return () => clearInterval(t);
  }, [auth?.authenticated, auth?.user?.id]);
  // ---- Users store diff helpers to avoid flicker ----
  const shapeUsers = (arr) =>
    (Array.isArray(arr) ? arr : []).map((u) => ({
      id: u?.id,
      name: u?.name,
      role: u?.role,
      initials: u?.initials,
      presence: String(u?.presence || "offline").toLowerCase(),
    }));
  const usersEqualShallow = (a, b) => {
    const A = shapeUsers(a);
    const B = shapeUsers(b);
    if (A.length !== B.length) return false;
    const mapB = new Map(B.map((u) => [u.id, u]));
    for (const u of A) {
      const v = mapB.get(u.id);
      if (!v) return false;
      if (u.name !== v.name || u.role !== v.role || u.initials !== v.initials || u.presence !== v.presence) {
        return false;
      }
    }
    return true;
  };

  // ---- Generic shallow equality by id/version to avoid unnecessary re-renders on other stores ----
  const versionOf = (o) =>
    (o?.updatedAt ?? o?.modifiedAt ?? o?.version ?? o?.ts ?? o?.timeUpdated ?? o?.lastModified ?? o?.lastSeen ?? 0);

  const shallowEqualByIdVersion = (prevArr, nextArr) => {
    const A = Array.isArray(prevArr) ? prevArr : [];
    const B = Array.isArray(nextArr) ? nextArr : [];
    if (A.length !== B.length) return false;
    const mapB = new Map(B.map((x) => [x?.id ?? x?._id, versionOf(x)]));
    for (const x of A) {
      const key = x?.id ?? x?._id;
      if (!mapB.has(key)) return false;
      if (versionOf(x) !== mapB.get(key)) return false;
    }
    return true;
  };

  const refreshStore = useCallback(async (store, { force = false } = {}) => {
    try {
      const now = Date.now();

      // Enforce cooldowns to prevent loops/churn. For users/messages we *always* respect cooldowns,
      // even if force=true (UI can still refresh after the window).
      const minGap =
        store === "users" ? POLL.usersCooldownMs :
        store === "messages" ? (POLL.messagesCooldownMs || 5000) : 0;

      const last = lastRefreshRef.current[store] || 0;
      if (now - last < minGap) return;

      // De-dupe in-flight fetches for the same store
      if (refreshingRef.current[store]) return;
      refreshingRef.current[store] = true;
      lastRefreshRef.current[store] = now;

      const path =
        store === "messages" && auth?.user?.id
          ? `/messages?for=${encodeURIComponent(auth.user.id)}`
          : `/${store}`;

      if (process.env.NODE_ENV !== "production") {
        // console.log removed: refreshing store
      }

      const items = await apiRequest(path);

      if (process.env.NODE_ENV !== "production") {
        // console.log removed: got store data
      }

      // Defer low-priority updates to reduce layout jank/flicker
      startTransition(() => {
        setData((d) => {
          const prevArr = Array.isArray(d[store]) ? d[store] : [];
          let nextArr = Array.isArray(items) ? items : [];

          if (store === "messages") {
            const myId = auth?.user?.id;
            let threads = Array.isArray(items) ? items : [];

            // map server shape -> UI shape
            threads = threads.map((t) => {
              const members = Array.isArray(t.members)
                ? t.members
                : Array.isArray(t.participants)
                ? t.participants
                : [];
              const msgs = Array.isArray(t.messages) ? t.messages : [];
              const last = msgs.length ? msgs[msgs.length - 1] : null;

              return {
                ...t,
                members,
                messages: msgs,
                lastAt: t.updatedAt || last?.at || t.createdAt || 0,
                lastText: last?.text || "",
              };
            });

            if (myId) {
              threads = threads.filter((t) => Array.isArray(t.members) && t.members.includes(myId));
            }

            // Sort newest first
            threads.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));

            const prevMsgs = Array.isArray(d.messages) ? d.messages : [];
            if (shallowEqualByIdVersion(prevMsgs, threads)) return d;
            return { ...d, messages: threads };
          }

          if (store === "users") {
            const id = auth?.user?.id;
            const now2 = Date.now();

            const lp = presenceRef.current.last;
            const sentAt = presenceRef.current.lastSent || 0;
            const changedAt = presenceRef.current.lastChange || sentAt;
            const keepLocal = id && lp && (now2 - sentAt < POLL.presenceServerGraceMs || now2 - changedAt < POLL.presenceServerGraceMs);

            if (keepLocal) {
              nextArr = nextArr.map((u) =>
                u.id === id ? { ...u, presence: lp, lastSeen: Math.max(now2, u.lastSeen || 0) } : u
              );
            }

            if (usersEqualShallow(prevArr, nextArr)) return d;
            return { ...d, users: nextArr };
          }

          if (shallowEqualByIdVersion(prevArr, nextArr)) return d;
          return { ...d, [store]: nextArr };
        });
      });
    } catch (e) {
      console.warn(`Failed to refresh ${store}:`, e?.message || e);
    } finally {
      refreshingRef.current[store] = false;
    }
  }, [apiRequest, auth?.user?.id]);


// Update the login function to always persist to session:
const login = useCallback(async (identifier, password, { remember = false, useUsername = false } = {}) => {
  const idRaw = String(identifier || "").trim();
  const pass = String(password || "");
  const isEmailLike = /@/.test(idRaw);

  // Build primary + secondary payloads to gracefully handle users who only have email or only username
  const primary = (useUsername || !isEmailLike)
    ? { username: idRaw, password: pass, remember }
    : { email: idRaw.toLowerCase(), password: pass, remember };
  const secondary = (() => {
    if (useUsername && isEmailLike) return { email: idRaw.toLowerCase(), password: pass, remember };
    if (!useUsername && !isEmailLike) return { username: idRaw, password: pass, remember };
    return null;
  })();

  const attempt = async (payload) => {
    const res = await postJsonLoose(`/auth/login`, payload);
    const { ok, status, data } = res || {};

    // 2FA required path
    if ((status === 401 || status === 400 || ok === false) && (data?.need2FA || data?.mfaRequired)) {
      setPending2FA({ email: payload.email || null, username: payload.username || null, password: payload.password, remember });
      return { mfa: true };
    }
    return { ok, status, data };
  };

  // Try primary
  let r = await attempt(primary);

  // If primary failed unauthorized without MFA, try secondary form when available
  if ((r?.ok === false || r?.status === 401) && !r?.data?.need2FA && !r?.data?.mfaRequired && secondary) {
    r = await attempt(secondary);
  }

  // Handle MFA case (caller UI will switch screens via need2FA from context)
  if (r?.mfa) {
    return { success: true, mfaRequired: true };
  }

  // Dev-only: if unauthorized and no matching user exists yet, auto-provision a student + user, then retry
  if ((r?.ok === false || r?.status === 401) && !r?.data?.need2FA && !r?.data?.mfaRequired && process.env.NODE_ENV !== "production") {
    try {
      const users = await apiRequest(`/users`);
      const hasMatching = (Array.isArray(users) ? users : []).some((u) =>
        String(u?.username || "").toLowerCase() === idRaw.toLowerCase() ||
        String(u?.email || "").toLowerCase() === idRaw.toLowerCase()
      );
      if (!hasMatching) {
        const guessEmail = isEmailLike ? idRaw.toLowerCase() : `${idRaw.toLowerCase()}@example.com`;
        const first = (guessEmail.split("@")[0] || "Student").replace(/[^a-z0-9]/gi, " ").trim() || "Student";
        const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : "Student";
        const student = await apiRequest(`/students`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firstName: cap(first), lastName: "", email: guessEmail, status: "Current", recordType: "Resident" })
        });
        await apiRequest(`/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: cap(first), username: idRaw, email: guessEmail, password: pass, role: "student", studentId: student?.id })
        });
        // retry login after provisioning
        r = await attempt(primary);
        if ((r?.ok === false || r?.status === 401) && secondary) {
          r = await attempt(secondary);
        }
      }
    } catch {
      // ignore provisioning errors; fall back to normal error handling
    }
  }

  if (!r?.ok || !r?.data?.success) {
    const errMsg = (typeof r?.data === "object" && (r?.data?.error || r?.data?.message)) || "Invalid username/email or password";
    throw new Error(errMsg);
  }

  const user = r.data.user;
  if (!user?.id) {
    throw new Error("Invalid user data received from server");
  }

  setPending2FA(null);
  const authData = { authenticated: true, user };
  setAuth(authData);

  if (remember) {
    LS.write(AUTH_LS_KEY, authData);
  }
  try {
    window.sessionStorage.setItem(AUTH_LS_KEY, JSON.stringify(authData));
  } catch {}

  try {
    await setPresence("online");
    await refreshStore("users", { force: true });
    await refreshStore("messages", { force: true });
  } catch {}

  return { success: true, user };
}, [postJsonLoose, setPresence, refreshStore, apiRequest]);

// Update logout to clear both storages, with role-aware default redirect
const logout = useCallback((redirect) => {
  // Prefer explicit redirect, else choose based on current role
  const role = String(auth?.user?.role || "").toLowerCase();
  const target = redirect ?? (role === "student" ? "/login" : "/admin/login");
  const id = auth?.user?.id;
  // Try to inform server & peers first
  try {
    if (socketRef.current && socketRef.current.connected) {
      try { socketRef.current.emit("presence:set", { presence: "offline" }); } catch {}
    }
    if (id) {
      postJsonLoose(`/auth/logout`, { userId: id }).catch(() => {});
    }
  } catch {}
  try { setPresence("offline"); } catch {}
  // Clear client state
  setPending2FA(null);
  setAuth({ authenticated: false, user: null });
  
  // Clear both storage types
  try { 
    window.localStorage.removeItem(AUTH_LS_KEY);
    window.sessionStorage.removeItem(AUTH_LS_KEY);
  } catch {}
  
  // Disconnect socket
  try {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  } catch {}
  // Redirect
  try { if (target) window.location.assign(target); } catch {}
}, [auth?.user?.id, auth?.user?.role, setPresence, postJsonLoose]);

// Update verifyMfa similarly:
const verifyMfa = useCallback(async ({ code, backupCode } = {}) => {
  if (!pending2FA) {
    return { success: false, error: "No pending login. Please enter your email and password again." };
  }
  const { email, username, password, remember = false } = pending2FA;
  const otp = String(code || backupCode || "").replace(/\D/g, "");
  if (!otp) {
    return { success: false, error: "Enter your 6‑digit code or a backup code." };
  }

  // Your server completes 2FA by re-posting to /auth/login with otp
  const payload = email ? { email, password, otp, remember } : { username, password, otp, remember };
  const res = await postJsonLoose(`/auth/login`, payload);
  if (res.ok && res.data?.success) {
    const user = res.data.user;
    
    // Make sure user has an ID
    if (!user?.id) {
      console.error("2FA response missing user.id:", user);
      return { success: false, error: "Invalid user data received from server" };
    }
    
    const authData = { authenticated: true, user };
    setAuth(authData);
    setPending2FA(null);
    
    if (remember) {
      LS.write(AUTH_LS_KEY, authData);
    }
    
    // Always save to sessionStorage
    try {
      window.sessionStorage.setItem(AUTH_LS_KEY, JSON.stringify(authData));
    } catch {}
    
    try {
      await setPresence("online");
      await refreshStore("users", { force: true });
      await refreshStore("messages", { force: true });
    } catch {}
    return { success: true, user };
  }

  // Bubble up a clear message on bad code
  const msg = (typeof res.data === "object" && (res.data?.error || res.data?.message)) || "";
  if (res.status === 401) {
    return { success: false, error: msg || "Invalid or expired two‑factor code" };
  }
  return { success: false, error: msg || "Could not verify 2FA with the server." };
}, [pending2FA, postJsonLoose, setPresence, refreshStore]);


  useEffect(() => {
    if (ready && auth?.authenticated && auth?.user?.id) {
      refreshStore("users", { force: true });
    }
  }, [ready, auth?.authenticated, auth?.user?.id, refreshStore]);

  const presenceFor = useCallback((u) => {
  if (!u) return "offline";
  // Consider the signed-in user online while authenticated (no flicker)
  if (u.id === auth?.user?.id && auth?.authenticated) {
    return String(presenceRef.current.last || "online").toLowerCase();
  }
  const ls = u.lastSeen || 0;
  if (!ls) return String(u.presence || "offline").toLowerCase();
  const diff = Date.now() - ls;
  if (diff < 5 * 60 * 1000) return "online";  // < 5m
  if (diff < 30 * 60 * 1000) return "away";   // 5–30m
  return "offline";                            // > 30m
}, [auth?.user?.id, auth?.authenticated]);

  // Helpers to sanitize store shapes
  const ensureArray = (v) => (Array.isArray(v) ? v : []);
  const coerceStores = (obj) => {
    const out = {};
    for (const s of STORES) {
      out[s] = s === "settings"
        ? (obj?.[s] && typeof obj[s] === "object" ? obj[s] : defaultSettings)
        : ensureArray(obj?.[s]);
    }
    return out;
  };

// Key changes to AppContext.js
// Replace the api object in your AppContext.js with this updated version:

const api = useMemo(() => {
  return {
    async getAll(store, queryParams = {}) {
      // Build query string from params
      const qp = { ...queryParams };
      // Scope notifications and messages to the current user when possible
      if ((store === "notifications" || store === "messages") && authRef.current?.user?.id && !("for" in qp)) {
        qp.for = authRef.current.user.id;
      }
      const queryString = Object.keys(qp).length ? "?" + new URLSearchParams(qp).toString() : "";
      const out = await apiRequest(`/${store}${queryString}`);
      // SANITIZE
      return Array.isArray(out) ? out : [];
    },
    async get(store, id) {
      return await apiRequest(`/${store}/${id}`);
    },
    async add(store, obj) {
      const rec = await apiRequest(`/${store}`, { method: "POST", body: JSON.stringify(obj) });
      await refreshStore(store);
      if (store === "documents" || store === "notifications") await refreshStore("notifications");
      return rec;
    },
    async put(store, obj) {
      const saved = await apiRequest(`/${store}/${obj.id}`, { method: "PUT", body: JSON.stringify(obj) });
      await refreshStore(store);
      return saved;
    },
    async del(store, id) {
      await apiRequest(`/${store}/${id}`, { method: "DELETE" });
      await refreshStore(store);
    },
    async logAudit(action, entityType, entityId, changes = []) {
      return await apiRequest(`/audit`, {
        method: "POST",
        body: JSON.stringify({ action, entityType, entityId, changes, by: authRef.current?.user?.name || "Unknown" }),
      });
    },
    async updateSettings(patchOrUpdater) {
      const cur = dataRef.current?.settings || defaultSettings;
      const patch = typeof patchOrUpdater === "function" ? patchOrUpdater(cur) : patchOrUpdater;
      const next = await apiRequest(`/settings`, { method: "POST", body: JSON.stringify(patch) });
      setData((d) => ({ ...d, settings: next }));
      return next;
    },
    async addNotification(notif) {
      const rec = await apiRequest(`/notifications`, { method: "POST", body: JSON.stringify(notif) });
      await refreshStore("notifications");
      return rec;
    },
    async markNotificationRead(id) {
      await apiRequest(`/notifications/${id}/read`, { method: "POST" });
      await refreshStore("notifications");
    },
    async markAllNotificationsRead() {
      await apiRequest(`/notifications/read-all`, { method: "POST" });
      await refreshStore("notifications");
    },
    async clearNotifications() {
      await apiRequest(`/notifications`, { method: "DELETE" });
      await refreshStore("notifications");
    },
    async exportStudents({ includePHI = false } = {}) {
      return await apiRequest(`/export/students?includePHI=${includePHI ? "1" : "0"}`);
    },
    async importStudentsPack(raw, { replace = true, clearDocuments = true } = {}) {
      const payload = typeof raw === "string" ? raw : { students: raw?.students || raw };
      const body = typeof payload === "string"
        ? payload
        : JSON.stringify({ replace, clearDocuments, payload });
      const res = await apiRequest(`/import/students-pack`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      await Promise.all([refreshStore("students"), refreshStore("documents")]);
      return res;
    },
    async upload(files, { studentId, by } = {}) {
      const arr = Array.isArray(files) ? files : [files].filter(Boolean);
      if (!arr.length) return { success: false, files: [] };

      const fd = new FormData();
      if (studentId) fd.append("studentId", studentId);
      if (by) fd.append("by", by);
      for (const f of arr) fd.append("files", f);

      const res = await fetch(`${apiBase}/upload`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Upload failed: ${res.status} ${text}`);
      }
      const out = await res.json();

      await Promise.all([
        refreshStore("documents"),
        refreshStore("notifications"),
      ]);

      return out;
    },

    // Form Builder API methods
    async createForm(formConfig) {
      const form = {
        ...formConfig,
        createdBy: authRef.current?.user?.id || 'admin',
        userId: authRef.current?.user?.id || 'admin'
      };
      const saved = await apiRequest(`/forms`, { 
        method: "POST", 
        body: JSON.stringify(form) 
      });
      await refreshStore("forms");
      return saved;
    },

    async updateForm(formId, updates) {
      const saved = await apiRequest(`/forms/${formId}`, { 
        method: "PUT", 
        body: JSON.stringify(updates) 
      });
      await refreshStore("forms");
      return saved;
    },

    async deleteForm(formId) {
      await apiRequest(`/forms/${formId}`, { method: "DELETE" });
      await Promise.all([
        refreshStore("forms"),
        refreshStore("formSubmissions"),
        refreshStore("notifications")
      ]);
    },

    async getFormSubmissions(formId, params = {}) {
      const queryString = Object.keys(params).length ? "?" + new URLSearchParams(params).toString() : "";
      return await apiRequest(`/forms/${formId}/submissions${queryString}`);
    },

    async submitForm(formId, submissionData, options = {}) {
      const submission = {
        formId,
        submissionData,
        submittedBy: authRef.current?.user?.id,
        userId: authRef.current?.user?.id,
        submitterName: options.submitterName || authRef.current?.user?.name || 'Anonymous User',
        ...options
      };
      const saved = await apiRequest(`/forms/${formId}/submit`, { 
        method: "POST", 
        body: JSON.stringify(submission) 
      });
      await Promise.all([
        refreshStore("forms"),
        refreshStore("formSubmissions"),
        refreshStore("notifications")
      ]);
      return saved;
    },

    async exportFormSubmissions(formId, format = 'csv') {
      const response = await fetch(`${apiBase}/forms/${formId}/export?format=${format}`, {
        method: "GET",
        credentials: "include"
      });
      
      if (!response.ok) {
        throw new Error(`Export failed: ${response.status}`);
      }
      
      if (format === 'csv') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `form_submissions.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        return { success: true };
      } else {
        return await response.json();
      }
    },

    async getUserForms(userId) {
      // Get forms assigned to user (for user dashboard)
      const params = userId ? { for: userId } : {};
      return await this.getAll("forms", params);
    },

    async getAssignedForms() {
      // Get forms assigned to current user
      if (!authRef.current?.user?.id) return [];
      const userId = authRef.current.user.id;
      
      // This would need backend implementation to track form assignments
      // For now, return all active forms
      return await this.getAll("forms", { status: 'active' });
    },
  };
}, [apiBase, refreshStore]);

// Also update the engage object to properly handle messages:
const engage = useMemo(() => {
  const myId = auth?.user?.id || null;
  return {
    async listMine() {
      if (!myId) return [];
      const items = await apiRequest(`/messages?for=${encodeURIComponent(myId)}`);
      const arr = Array.isArray(items) ? items : [];

      // Normalize the structure to ensure consistency
      const normalized = arr.map((thread) => ({
        ...thread,
        members: thread.members || thread.participants || [],
        participants: thread.participants || thread.members || [],
        messages: Array.isArray(thread.messages) ? thread.messages : [],
        lastAt: thread.updatedAt || (Array.isArray(thread.messages) && thread.messages.length ? thread.messages[thread.messages.length - 1].at : thread.createdAt || 0),
      }));

      // Only write if changed by id/version
      setData((d) => {
        const prev = Array.isArray(d.messages) ? d.messages : [];
        if (shallowEqualByIdVersion(prev, normalized)) return d;
        return { ...d, messages: normalized };
      });
      return normalized;
    },
    async createThread({ title, members, text }) {
      if (!myId) throw new Error("Not signed in");
      const allMembers = Array.from(new Set([...(members || []), myId]));
      const payload = {
        title,
        members: allMembers,
        participants: allMembers, // Include both for compatibility
        by: myId,
        firstText: text
      };
      const rec = await apiRequest(`/messages`, { method: "POST", body: JSON.stringify(payload) });
      await refreshStore("messages");
      return rec;
    },
    async post({ threadId, text }) {
      if (!myId) throw new Error("Not signed in");
      const rec = await apiRequest(`/messages/${encodeURIComponent(threadId)}/post`, {
        method: "POST",
        body: JSON.stringify({ text, by: myId }),
      });
      await refreshStore("messages");
      return rec;
    },
    async editPost({ threadId, postId, text }) {
      if (!myId) throw new Error("Not signed in");
      const rec = await apiRequest(`/messages/${encodeURIComponent(threadId)}/post/${encodeURIComponent(postId)}`, {
        method: "PUT",
        body: JSON.stringify({ text, by: myId }),
      });
      await refreshStore("messages");
      return rec;
    },
  };
}, [apiRequest, auth?.user?.id, refreshStore]);
  // Auto-poll messages ONLY when the Messages panel is open
  useEffect(() => {
    if (!serverOnline || !auth?.user?.id || !panels?.messages) return;

    let stopped = false;
    let timer = null;

    const tick = async () => {
      if (stopped) return;
      try {
        await refreshStore("messages");
      } finally {
        if (!stopped) {
          timer = setTimeout(tick, POLL.messagesCooldownMs || 5000);
        }
      }
    };

    // kick off quickly, then back off to cooldown
    timer = setTimeout(tick, 200);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [serverOnline, auth?.user?.id, panels?.messages, refreshStore]);
  // --- profile helper: fetch a fresh copy of the signed-in user ---
  const fetchMyProfile = useCallback(async () => {
    const id = auth?.user?.id;
    if (!id) return null;
    try {
      const me = await apiRequest(`/users/${id}`);

      // Only update auth if something meaningful changed to avoid render loops
      const prev = authRef.current?.user;
      const sameId = me?.id === prev?.id;
      const prevVer = versionOf(prev);
      const nextVer = versionOf(me);

      if (!sameId || prevVer !== nextVer) {
        setAuth((a) => ({ ...a, user: me }));
        // Keep users collection fresh but avoid hammering
        await refreshStore("users");
      }
      return me;
    } catch (e) {
      console.warn("Failed to fetch profile:", e?.message || e);
      return null;
    }
  }, [apiRequest, auth?.user?.id, refreshStore]);

  // If the server is online and we have a logged-in user, hydrate their profile once
  useEffect(() => {
    if (serverOnline && auth?.user?.id) {
      fetchMyProfile().catch(() => {});
    }
  }, [serverOnline, auth?.user?.id]);

  // lightweight “navigation”
  const goToStudent = (id) => {
    if (!id) return;
    setParams({ studentId: id });
    setPage("student");
  };

  const value = useMemo(
    () => ({
      // data
      ready,
      authenticated: auth.authenticated,
      user: auth.user,
      data,
      api,
      engage,
      refreshProfile: fetchMyProfile,
      refreshStore,
      presenceFor,
      serverOnline,

      // auth
      login,
      logout,
      verifyMfa,
      need2FA: !!pending2FA,
      pending2FAEmail: pending2FA?.email || null,

      // navigation
      page,
      setPage,
      params,
      setParams,
      goToStudent,

      // ui
      search,
      setSearch,
      toast,
      setToast,
      panels,
      setPanels,
      modal,
      setModal,
    }),
    [
      ready,
      auth,
      data,
      api,
      engage,
      fetchMyProfile,
      refreshStore,
      presenceFor,
      serverOnline,
      page,
      params,
      search,
      toast,
      panels,
      modal,
      pending2FA,
      login,
      logout,
      verifyMfa,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
