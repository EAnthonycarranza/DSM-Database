import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import TopNav from "./components/TopNav";
import Modal from "./components/Modal";
import Toast from "./components/Toast";
import Panel from "./components/Panel";
import ChatPanel from "./components/ChatPanel";
import Settings from "./pages/Settings";
import Documents from "./components/PdfEditor";
import DocsCenter from "./pages/DocsCenter";
import Teams from "./pages/Teams";
import UserDashboard from "./pages/User/Dashboard";
import UserLogin from "./pages/User/UserLogin";
import UserCreation from "./pages/User/UserCreation";
import LoginPage from "./pages/LoginPage";
import Password from "./pages/PasswordReset";
import ResetPassword from "./pages/ResetPassword";
import Profile from "./pages/CRMProfile";
import UserDocument from "./pages/User/UserPdfTool";
import DSMAdmission from "./pages/User/DSMAdmission";
import AdminFormBuilder from "./pages/Admin/FormBuilder";
import FormManager from "./pages/Admin/FormManager";
import FormViewer from "./pages/User/FormViewer";

import { useApp } from "./context/AppContext";

import Home from "./pages/Home";
import Students from "./pages/Students";
import StudentProfile from "./pages/StudentProfile";
import Calendar from "./components/calendar/SimpleCalendar";
import Insights from "./pages/Insights";
import Boards from "./pages/Boards";
import Engage from "./pages/Engage";
import { Payments, Marketing } from "./pages/Placeholders";

/* =====================================================================================
   DEV-SAFE ResizeObserver + noisy error suppression (Chrome/React overlay workaround)
   ===================================================================================== */
(() => {
  if (typeof window === "undefined") return;

  // 1) Filter the two noisy RO loop messages from error events & unhandled rejections
  const suppressResizeObserverErrors = (e) => {
    const msg = (e?.message || e?.reason?.message || e?.reason || "") + "";
    if (
      msg.includes("ResizeObserver loop limit exceeded") ||
      msg.includes("ResizeObserver loop completed with undelivered notifications")
    ) {
      e.preventDefault?.();
      e.stopImmediatePropagation?.();
      return false;
    }
  };
  window.addEventListener("error", suppressResizeObserverErrors, true);
  window.addEventListener("unhandledrejection", suppressResizeObserverErrors, true);

  // 2) Also silence console.error spam for the same messages (dev overlay sometimes logs, not throws)
  if (!window.__consoleErrorPatchedForRO) {
    const origErr = console.error;
    console.error = function (...args) {
      const first = (args?.[0] ?? "") + "";
      if (
        typeof first === "string" &&
        (first.includes("ResizeObserver loop limit exceeded") ||
          first.includes("ResizeObserver loop completed with undelivered notifications"))
      ) {
        return;
      }
      return origErr.apply(this, args);
    };
    window.__consoleErrorPatchedForRO = true;
  }

  // 3) Patch ResizeObserver to deliver callbacks outside the layout/paint cycle
  //    This avoids triggering the Chrome RO loop detection in many libs.
  if (
    typeof window.ResizeObserver !== "undefined" &&
    !window.__patchedResizeObserverSafeguard
  ) {
    const NativeRO = window.ResizeObserver;

    class SafeResizeObserver {
      constructor(callback) {
        // Queue callback to the next animation frame, then microtask, wrapped in try/catch
        // This reduces re-entrant measure->mutate loops that Chrome flags.
        const invoke = (entries, observer) => {
          // Use rAF to get off the current frame, then microtask to preserve ordering
          const raf = window.requestAnimationFrame || ((fn) => setTimeout(fn, 16));
          raf(() => {
            Promise.resolve().then(() => {
              try {
                callback(entries, observer);
              } catch {
                // swallow userland errors to avoid noisy overlay during dev
              }
            });
          });
        };
        this.__ro = new NativeRO(invoke);
      }
      observe(...args) {
        // Some libraries call observe repeatedly; ignore if node is detached
        try {
          return this.__ro.observe(...args);
        } catch {
          // no-op
        }
      }
      unobserve(...args) {
        try {
          return this.__ro.unobserve(...args);
        } catch {
          // no-op
        }
      }
      disconnect(...args) {
        try {
          return this.__ro.disconnect(...args);
        } catch {
          // no-op
        }
      }
      takeRecords(...args) {
        try {
          return this.__ro.takeRecords(...args);
        } catch {
          return [];
        }
      }
    }

    // Only patch in development to avoid affecting production performance/semantics
    const isDev =
      !("ENV" in window) &&
      (typeof process !== "undefined"
        ? (process.env && process.env.NODE_ENV !== "production")
        : true);

    if (isDev) {
      window.ResizeObserver = SafeResizeObserver;
    }

    window.__patchedResizeObserverSafeguard = true;
  }
})();

/* =====================================================================================
  Route-aware layout to hide chrome on /admin/login
   ===================================================================================== */
function AppLayout({ panels, setPanels, notifs }) {
  const location = useLocation();
  const hideChrome =
    location.pathname === "/admin/login" ||
  location.pathname.startsWith("/dashboard") ||
  location.pathname === "/login" ||
  location.pathname === "/create" ||
  location.pathname === "/admission" ||
  location.pathname.startsWith("/form/") ||
  location.pathname === "/document";

  // Admin-only route guard: allows admins; blocks students -> redirect to student dashboard
  const { user, authenticated } = useApp();
  const isStudent = String(user?.role || "").toLowerCase() === "student";
  const AdminOnly = ({ children }) => {
    if (!authenticated) return children; // allow unauthenticated to fall through to /admin/login route
    return isStudent ? <Navigate to="/dashboard" replace /> : children;
  };

  // Force light theme for student users and student routes
  useEffect(() => {
    try {
      const p = location.pathname || "";
      const isStudentRoute =
        p === "/dashboard" ||
        p === "/login" ||
        p === "/create" ||
        p === "/admission" ||
        p === "/document" ||
        p.startsWith("/form/");
      if (isStudent || isStudentRoute) {
        document.documentElement.setAttribute("data-theme", "light");
        // Persist preference so subsequent loads default to light for students
        try { localStorage.setItem("dsm:theme", "light"); } catch {}
      }
    } catch {}
  }, [isStudent, location.pathname]);

  return (
    <>
      {!hideChrome && <TopNav />}

      <main className={hideChrome ? "" : "content"} id="content" tabIndex="-1">
        <Routes>
          <Route path="/" element={<Navigate to="/admin/login" replace />} />
          {/* Admin dashboard aliases */}
          <Route path="/admin/dashboard" element={<AdminOnly><Home /></AdminOnly>} />
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/home" element={<AdminOnly><Home /></AdminOnly>} />
          <Route path="/admin/students" element={<AdminOnly><Students /></AdminOnly>} />
          <Route path="/admin/students/:id" element={<AdminOnly><StudentProfile /></AdminOnly>} />
          <Route path="/admin/calendar" element={<AdminOnly><Calendar /></AdminOnly>} />
          <Route path="/admin/insights" element={<AdminOnly><Insights /></AdminOnly>} />
          <Route path="/admin/boards" element={<AdminOnly><Boards /></AdminOnly>} />
          <Route path="/admin/engage" element={<AdminOnly><Engage /></AdminOnly>} />
          <Route path="/admin/payments" element={<AdminOnly><Payments /></AdminOnly>} />
          <Route path="/admin/marketing" element={<AdminOnly><Marketing /></AdminOnly>} />
          <Route path="/admin/settings" element={<AdminOnly><Settings /></AdminOnly>} />
          <Route path="/admin/documents" element={<AdminOnly><Documents /></AdminOnly>} />
          <Route path="/admin/docs-center" element={<AdminOnly><DocsCenter /></AdminOnly>} />
          <Route path="/admin/teams" element={<AdminOnly><Teams /></AdminOnly>} />
          <Route path="/admin/forms" element={<AdminOnly><FormManager /></AdminOnly>} />
          <Route path="/admin/form-builder" element={<AdminOnly><AdminFormBuilder /></AdminOnly>} />
          <Route path="/admin/password-reset" element={<AdminOnly><Password /></AdminOnly>} />
          <Route path="/admin/reset-password" element={<AdminOnly><ResetPassword /></AdminOnly>} />
          <Route path="/admin/login" element={<AdminOnly><LoginPage /></AdminOnly>} />
          {/* Back-compat: redirect old path to new admin login */}
          <Route path="/admin/profile" element={<AdminOnly><Profile /></AdminOnly>} />


          {/* Student routes (moved from /* to top-level) */}
          <Route path="/dashboard" element={<UserDashboard />} />
          <Route path="/login" element={<UserLogin />} />
          <Route path="/create" element={<UserCreation />} />
          <Route path="/document" element={<UserDocument />} />
          <Route path="/form/:formId" element={<FormViewer />} />
          <Route path="/admission" element={<DSMAdmission />} />
        </Routes>
      </main>

      {!hideChrome && <ChatPanel />}

      {!hideChrome && (
        <Panel
          open={panels.notifications}
          title="Notifications"
          onClose={() => setPanels((p) => ({ ...p, notifications: false }))}
        >
          <div id="notifList">
            {notifs.map((n) => (
              <div key={n.id} className="notif-item">
                <div>🔔</div>
                <div>
                  <div>{n.text || "Notification"}</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>
                    {new Date(n.at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Modal />
      <Toast />
    </>
  );
}

export default function App() {
  const { ready, panels, setPanels, setModal, api } = useApp();
  const [threads, setThreads] = useState([]);
  const [notifs, setNotifs] = useState([]);

  // normalize external open-modal events
  useEffect(() => {
    const openHandler = (e) => {
      const det = e?.detail || {};
      if (det.type) {
        setModal({
          open: true,
          type: det.type,
          title: det.title || "",
          props: det.props || null,
          node: det.node || null,
          content: det.content ?? null,
        });
        return;
      }
      if (det.content && React.isValidElement(det.content)) {
        setModal({ open: true, type: "node", title: det.title || "", node: det.content });
        return;
      }
      setModal({ open: true, type: "text", title: det.title || "", content: det.content ?? "" });
    };
    const closeHandler = () => setModal((m) => ({ ...m, open: false }));
    window.addEventListener("open-modal", openHandler);
    window.addEventListener("close-modal", closeHandler);
    return () => {
      window.removeEventListener("open-modal", openHandler);
      window.removeEventListener("close-modal", closeHandler);
    };
  }, [setModal]);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      setThreads(await api.getAll("messages"));
      setNotifs((await api.getAll("notifications")).sort((a, b) => b.at - a.at));
    })();
  }, [ready, api]);

  if (!ready) return null;

  return (
    <BrowserRouter>
      <AppLayout panels={panels} setPanels={setPanels} notifs={notifs} />
    </BrowserRouter>
  );
}
