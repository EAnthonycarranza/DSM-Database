import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { FaUser, FaLock, FaShieldAlt, FaArrowRight, FaSignInAlt, FaExclamationTriangle } from "react-icons/fa";
import dsmLogo from "../../assets/images/DSM LOGO.png";

export default function UserLogin() {
  const { ready, authenticated, user, login, verifyMfa, need2FA, pending2FAEmail, logout } = useApp();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [mfaStep, setMfaStep] = useState(false);
  const [otp, setOtp] = useState("");
  const [usingBackup, setUsingBackup] = useState(false);
  const [backupCode, setBackupCode] = useState("");

  useEffect(() => {
    if (need2FA) { setMfaStep(true); setLoading(false); setError(""); }
  }, [need2FA]);

  const role = String(user?.role || "").toLowerCase();
  const isStudent = role === "student";

  useEffect(() => {
    if (ready && authenticated && user && isStudent) navigate("/dashboard", { replace: true });
  }, [ready, authenticated, user, isStudent, navigate]);

  const onSubmit = async (e) => {
    e?.preventDefault?.();
    setError(""); setLoading(true);
    try {
      const res = await login(username.trim(), password, { remember, useUsername: true });
      if (res?.success && String(res.user?.role).toLowerCase() !== "student") {
        setError("Please use the Administrator Login.");
        setLoading(false);
        try { await logout("/admin/login"); } catch {}
        return;
      }
    } catch (err) {
      setError(err?.message || "Authentication failed");
      setLoading(false);
    }
  };

  if (!ready) return <div className="auth-loading">Initializing Secure Tunnel...</div>;

  return (
    <section className="auth-page fade-in">
      <style>{AUTH_CSS}</style>
      
      <div className="auth-card">
        <header className="auth-header">
          <div className="auth-logo">
            <img src={dsmLogo} alt="Discipleship School of Ministry" />
          </div>
          <div className="auth-divider"><span /></div>
          <h1>Student Portal</h1>
          <p>Discipleship School of Ministry</p>
        </header>

        {error && (
          <div className="auth-alert">
            <FaExclamationTriangle />
            <span>{error}</span>
          </div>
        )}

        {!mfaStep ? (
          <form className="auth-form" onSubmit={onSubmit}>
            <div className="auth-group">
              <label><FaUser /> Username</label>
              <div className="input-wrap">
                <input value={username} onChange={e => setUsername(e.target.value)} required placeholder="Your assigned username" />
              </div>
            </div>
            <div className="auth-group">
              <div className="label-row">
                <label><FaLock /> Password</label>
                <a href="/password-reset">Forgot?</a>
              </div>
              <div className="input-wrap">
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
              </div>
            </div>
            
            <div className="auth-meta">
              <label className="check-label">
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                <span>Keep me signed in</span>
              </label>
            </div>

            <button className="auth-btn" type="submit" disabled={loading}>
              {loading ? 'Authenticating...' : 'Sign In'} <FaSignInAlt />
            </button>
          </form>
        ) : (
          <div className="auth-mfa">
            <div className="mfa-head">
              <FaShieldAlt size={32} />
              <h3>Two-Step Verification</h3>
              <p>Enter the code sent to your device.</p>
            </div>
            <input className="otp-input" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="000000" />
            <button className="auth-btn" onClick={() => verifyMfa({ code: otp })}>Verify Identity</button>
            <button className="text-btn" onClick={() => setMfaStep(false)}>Back to Login</button>
          </div>
        )}
      </div>
    </section>
  );
}

const AUTH_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');

  .auth-page {
    min-height: 100vh;
    display: grid; place-items: center;
    padding: 20px;
    font-family: 'Inter', sans-serif;
    background:
      radial-gradient(circle at 15% 20%, rgba(201, 169, 97, 0.18), transparent 45%),
      radial-gradient(circle at 85% 80%, rgba(123, 31, 44, 0.12), transparent 45%),
      linear-gradient(180deg, #FAF6EE 0%, #F4ECDC 100%);
    position: relative;
    overflow: hidden;
  }
  .auth-page::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image:
      repeating-linear-gradient(45deg, rgba(123, 31, 44, 0.015) 0 1px, transparent 1px 60px);
    pointer-events: none;
  }

  .auth-card {
    width: 100%;
    max-width: 440px;
    background: #FFFCF7;
    border-radius: 24px;
    padding: 48px 40px;
    box-shadow:
      0 25px 50px -12px rgba(91, 38, 31, 0.18),
      0 0 0 1px rgba(201, 169, 97, 0.25),
      inset 0 1px 0 rgba(255, 255, 255, 0.8);
    border: 1px solid #E8DDC8;
    position: relative;
    z-index: 1;
  }
  .auth-card::before {
    content: "";
    position: absolute;
    top: 0; left: 24px; right: 24px;
    height: 3px;
    background: linear-gradient(90deg, transparent, #C9A961, #7B1F2C, #C9A961, transparent);
    border-radius: 3px;
  }

  .auth-header { text-align: center; margin-bottom: 28px; }
  .auth-logo {
    width: 88px; height: 88px;
    background: #FFFCF7;
    border-radius: 50%;
    display: grid; place-items: center;
    margin: 0 auto 18px;
    box-shadow: 0 8px 24px rgba(123, 31, 44, 0.25), 0 0 0 3px #C9A961, 0 0 0 5px rgba(201, 169, 97, 0.2);
    overflow: hidden;
    padding: 4px;
  }
  .auth-logo img { width: 100%; height: 100%; object-fit: contain; display: block; }

  .auth-divider { display: flex; align-items: center; gap: 8px; margin: 14px auto 16px; max-width: 200px; }
  .auth-divider::before, .auth-divider::after { content: ""; flex: 1; height: 1px; background: linear-gradient(90deg, transparent, rgba(123, 31, 44, 0.3), transparent); }
  .auth-divider span { width: 7px; height: 7px; border-radius: 50%; background: #C9A961; box-shadow: 0 0 8px rgba(201, 169, 97, 0.5); }

  .auth-header h1 { font-family: 'Playfair Display', Georgia, serif; font-size: 28px; font-weight: 800; margin: 0; color: #7B1F2C; letter-spacing: 0.3px; }
  .auth-header p { font-size: 12px; color: #6F5E5E; margin: 8px 0 0; letter-spacing: 1.4px; text-transform: uppercase; font-weight: 700; }

  .auth-alert { display: flex; align-items: center; gap: 12px; background: rgba(176, 38, 60, 0.08); color: #B0263C; padding: 12px 16px; border-radius: 12px; margin-bottom: 24px; font-size: 13px; font-weight: 600; border: 1px solid rgba(176, 38, 60, 0.2); }

  .auth-form { display: flex; flex-direction: column; gap: 20px; }
  .auth-group { display: flex; flex-direction: column; gap: 8px; }
  .auth-group label { font-size: 11px; font-weight: 800; color: #7B1F2C; text-transform: uppercase; letter-spacing: 1.2px; display: flex; align-items: center; gap: 6px; }

  .label-row { display: flex; justify-content: space-between; align-items: center; }
  .label-row a { font-size: 11px; color: #7B1F2C; font-weight: 800; text-transform: uppercase; transition: 0.2s; }
  .label-row a:hover { color: #5A1620; text-decoration: underline; }

  .input-wrap input { width: 100%; padding: 14px 16px; border-radius: 12px; border: 1.5px solid #E8DDC8; background: #FAF6EE; color: #2A1A1F; font-size: 15px; font-weight: 600; outline: none; transition: 0.2s; font-family: inherit; }
  .input-wrap input::placeholder { color: rgba(111, 94, 94, 0.5); }
  .input-wrap input:focus { border-color: #7B1F2C; background: #FFFCF7; box-shadow: 0 0 0 4px rgba(123, 31, 44, 0.1); }

  .auth-meta { display: flex; align-items: center; }
  .check-label { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600; color: #6F5E5E; cursor: pointer; }
  .check-label input[type="checkbox"] { accent-color: #7B1F2C; width: 16px; height: 16px; }

  .auth-btn { height: 52px; background: linear-gradient(135deg, #7B1F2C, #9B3041); color: #FFFCF7; border-radius: 14px; border: 1px solid rgba(201, 169, 97, 0.4); font-weight: 800; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; transition: 0.2s; box-shadow: 0 8px 20px rgba(123, 31, 44, 0.28), inset 0 1px 0 rgba(255,255,255,0.12); letter-spacing: 1px; text-transform: uppercase; font-family: inherit; }
  .auth-btn:hover { background: linear-gradient(135deg, #5A1620, #7B1F2C); transform: translateY(-1px); box-shadow: 0 12px 28px rgba(123, 31, 44, 0.4); }
  .auth-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

  .auth-mfa { text-align: center; display: flex; flex-direction: column; gap: 20px; }
  .mfa-head { color: #C9A961; }
  .mfa-head h3 { font-family: 'Playfair Display', Georgia, serif; color: #7B1F2C; margin: 12px 0 4px; font-size: 22px; }
  .mfa-head p { font-size: 14px; color: #6F5E5E; }
  .otp-input { width: 100%; height: 64px; text-align: center; font-size: 32px; font-weight: 800; letter-spacing: 12px; border-radius: 16px; border: 1.5px solid #E8DDC8; background: #FAF6EE; color: #7B1F2C; outline: none; font-family: inherit; }
  .otp-input:focus { border-color: #7B1F2C; box-shadow: 0 0 0 4px rgba(123, 31, 44, 0.1); }
  .text-btn { background: none; border: none; color: #6F5E5E; font-weight: 700; font-size: 13px; cursor: pointer; transition: 0.2s; }
  .text-btn:hover { color: #7B1F2C; }
  .auth-loading { height: 100vh; display: grid; place-items: center; background: #FAF6EE; color: #7B1F2C; font-weight: 800; font-size: 16px; letter-spacing: 1px; text-transform: uppercase; font-family: 'Inter', sans-serif; }

  @media (max-width: 640px) {
    .auth-page { padding: 16px 12px; }
    .auth-card { padding: 36px 24px; border-radius: 20px; }
    .auth-logo { width: 76px; height: 76px; }
    .auth-header { margin-bottom: 22px; }
    .auth-header h1 { font-size: 24px; }
    .auth-header p { font-size: 11px; }

    /* iOS: 16px+ inputs prevent forced page zoom */
    .input-wrap input { padding: 14px 16px; font-size: 16px; min-height: 50px; }
    .auth-btn { height: 54px; font-size: 14px; }
    .otp-input { height: 58px; font-size: 28px; letter-spacing: 8px; }
  }

  @media (max-width: 380px) {
    .auth-card { padding: 28px 18px; }
    .auth-logo { width: 64px; height: 64px; }
    .auth-header h1 { font-size: 21px; }
    .auth-header p { font-size: 10px; letter-spacing: 1px; }
    .otp-input { letter-spacing: 6px; font-size: 24px; }
  }

  .auth-loading { height: 100vh; display: grid; place-items: center; background: #0f172a; color: white; font-weight: 800; }
`;
