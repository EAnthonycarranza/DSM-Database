import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";

export default function UserLogin() {
  const { ready, authenticated, user, login, verifyMfa, need2FA, pending2FAEmail, logout } = useApp();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 2FA
  const [mfaStep, setMfaStep] = useState(false);
  const [otp, setOtp] = useState("");
  const [usingBackup, setUsingBackup] = useState(false);
  const [backupCode, setBackupCode] = useState("");

  useEffect(() => {
    if (need2FA) {
      setMfaStep(true);
      setLoading(false);
      setError("");
    }
  }, [need2FA]);

  const role = String(user?.role || "").toLowerCase();
  const isStudent = role === "student";

  useEffect(() => {
    if (!ready) return;
    // Only auto-redirect to the student dashboard when the signed-in user IS a student.
    if (authenticated && user && isStudent) {
  navigate("/dashboard", { replace: true });
    }
  }, [ready, authenticated, user, isStudent, navigate]);

  const onSubmit = async (e) => {
    e?.preventDefault?.();
    setError("");
    setLoading(true);
    try {
      const res = await login(username.trim(), password, { remember, useUsername: true });
      const role = String(res?.user?.role || "").toLowerCase();
      if (res?.success && role !== "student") {
        // If an admin/user tried logging into student portal, bounce them
        setError("Use the Admin Login page to sign in.");
        setLoading(false);
  try { await logout("/admin/login"); } catch {}
        return;
      }
      // If no MFA required, AppContext will set authenticated and navigate effect will run.
    } catch (err) {
      const msg = err?.message || "Login failed";
      setError(msg);
      setLoading(false);
    }
  };

  const onVerifyOtp = async () => {
    setError("");
    setLoading(true);
    try {
      await verifyMfa({ code: usingBackup ? undefined : otp, backupCode: usingBackup ? backupCode : undefined });
      // authenticated state should flip true; navigate via effect
    } catch (err) {
      const msg = err?.message || "Invalid code";
      setError(msg);
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b0f1d" }}>
        <div style={{ color: "#cbd5e1" }}>Loading…</div>
      </div>
    );
  }

  // If logged in as a non-student (e.g., admin), allow reaching this page and offer logout
  if (ready && authenticated && user && !isStudent) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(180deg,#0b0f1d,#0c1020 40%,#0a0e1b)", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 440, background: "#0f142a", border: "1px solid #1f294a", borderRadius: 18, boxShadow: "0 24px 60px rgba(0,0,0,.55)", padding: 28, textAlign: "center" }}>
          <div style={{ marginBottom: 8, color: "#e8ecf3", fontSize: 20, fontWeight: 800 }}>Already signed in</div>
          <div style={{ color: "#9aa7c7", fontSize: 14, marginBottom: 18 }}>
            You are currently signed in as <strong style={{ color: "#cfe0ff" }}>{user?.name || user?.email || "user"}</strong> ({role || "user"}).
            To log in as a student, please sign out first.
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={() => navigate("/home")} style={{ height: 40, padding: "0 16px", borderRadius: 10, border: "1px solid #2a3763", background: "transparent", color: "#cbd6ff", cursor: "pointer" }}>Back to App</button>
            <button onClick={() => logout("/login")} style={{ height: 40, padding: "0 16px", borderRadius: 10, border: "none", background: "linear-gradient(180deg,#3f76ff,#315bff)", color: "#fff", fontWeight: 800, cursor: "pointer" }}>Sign out</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(180deg,#0b0f1d,#0c1020 40%,#0a0e1b)", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 440, background: "#0f142a", border: "1px solid #1f294a", borderRadius: 18, boxShadow: "0 24px 60px rgba(0,0,0,.55)", padding: 28 }}>
        <div style={{ textAlign: "center", marginBottom: 20, position: "relative" }}>
          <div style={{ width: 64, height: 64, borderRadius: 14, margin: "0 auto 12px", display: "grid", placeItems: "center", background: "#3f76ff", color: "#fff", fontWeight: 800 }}>DSM</div>
          <div style={{ color: "#e8ecf3", fontSize: 22, fontWeight: 800 }}>Student Login</div>
          <div style={{ color: "#9aa7c7", fontSize: 13 }}>Sign in to access your dashboard</div>
        </div>

        {!mfaStep ? (
          <form onSubmit={onSubmit}>
            {error && (
              <div style={{ background: "rgba(255,92,92,.12)", border: "1px solid rgba(255,92,92,.35)", color: "#ff9d9d", padding: "10px 12px", borderRadius: 10, marginBottom: 12, fontSize: 13 }}>{error}</div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", marginBottom: 6, color: "#cfe0ff", fontSize: 13, fontWeight: 600 }}>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                style={{ width: "100%", height: 44, background: "#0b1228", border: "1px solid #27325a", color: "#e8ecf3", borderRadius: 10, padding: "0 12px", outline: "none" }}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ color: "#cfe0ff", fontSize: 13, fontWeight: 600 }}>Password</label>
                <a href="/password-reset" style={{ color: "#8fb4ff", fontSize: 12, textDecoration: "none" }}>Forgot?</a>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                style={{ width: "100%", height: 44, background: "#0b1228", border: "1px solid #27325a", color: "#e8ecf3", borderRadius: 10, padding: "0 12px", outline: "none" }}
              />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#9aa7c7", fontSize: 13, marginBottom: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember me
            </label>
            <button type="submit" disabled={loading} style={{ width: "100%", height: 46, borderRadius: 10, border: "none", cursor: loading ? "default" : "pointer", background: loading ? "#2a3a78" : "linear-gradient(180deg,#3f76ff,#315bff)", color: "#fff", fontWeight: 800 }}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        ) : (
          <div>
            {error && (
              <div style={{ background: "rgba(255,92,92,.12)", border: "1px solid rgba(255,92,92,.35)", color: "#ff9d9d", padding: "10px 12px", borderRadius: 10, marginBottom: 12, fontSize: 13 }}>{error}</div>
            )}
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <div style={{ color: "#e8ecf3", fontWeight: 700 }}>Two-Factor Authentication</div>
              <div style={{ color: "#9aa7c7", fontSize: 13 }}>Enter the 6-digit code for {pending2FAEmail || username}</div>
            </div>
            {!usingBackup ? (
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0,6))}
                placeholder="_ _ _ _ _ _"
                style={{ width: "100%", height: 48, textAlign: "center", letterSpacing: 8, fontWeight: 800, fontSize: 22, background: "#0b1228", border: "1px solid #27325a", color: "#e8ecf3", borderRadius: 10, padding: "0 12px", outline: "none", marginBottom: 10 }}
              />
            ) : (
              <input
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                placeholder="BACKUP-CODE"
                style={{ width: "100%", height: 48, textAlign: "center", letterSpacing: 1, fontWeight: 700, fontSize: 16, background: "#0b1228", border: "1px solid #27325a", color: "#e8ecf3", borderRadius: 10, padding: "0 12px", outline: "none", marginBottom: 10 }}
              />
            )}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
              <button onClick={() => setUsingBackup(!usingBackup)} style={{ flex: 1, height: 40, borderRadius: 10, border: "1px solid #2a3763", background: "transparent", color: "#cbd6ff", cursor: "pointer" }}>
                {usingBackup ? "Use Authenticator" : "Use Backup Code"}
              </button>
              <button onClick={onVerifyOtp} disabled={loading || (!usingBackup && otp.length !== 6) || (usingBackup && backupCode.trim().length < 10)} style={{ flex: 1, height: 40, borderRadius: 10, border: "none", background: "linear-gradient(180deg,#3f76ff,#315bff)", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
                Verify
              </button>
            </div>
            <button onClick={() => { setMfaStep(false); setOtp(""); setBackupCode(""); setUsingBackup(false); setError(""); }} style={{ width: "100%", height: 38, borderRadius: 10, border: "1px solid #2a3763", background: "transparent", color: "#9aa7c7", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
