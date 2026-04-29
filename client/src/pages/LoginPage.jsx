import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";
import { FaUserShield, FaLock, FaEnvelope, FaShieldAlt, FaSignInAlt, FaExclamationTriangle, FaCheckCircle, FaChevronLeft } from "react-icons/fa";
import dsmLogo from "../assets/images/DSM LOGO.png";

export default function LoginPage() {
  const navigate = useNavigate();
  const { ready, authenticated, user, login, logout, verifyMfa, need2FA } = useApp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  
  const [mfaStep, setMfaStep] = useState(false);
  const [otp, setOtp] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [backupCode, setBackupCode] = useState('');

  useEffect(() => {
    if (need2FA) { setMfaStep(true); setError(''); setLoading(false); }
  }, [need2FA]);

  useEffect(() => {
    if (ready && authenticated && user) {
      const role = String(user.role || '').toLowerCase();
      if (role === 'student') {
        navigate('/login', { replace: true });
      } else {
        navigate('/admin/dashboard', { replace: true });
      }
    }
  }, [ready, authenticated, user, navigate]);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (mfaStep || loading) {
      return;
    }
    setError(''); setLoading(true);

    try {
      const result = await login(email, password, { remember: rememberMe });
      
      if (!result?.success) {
        setError(result?.error || 'Sign in failed');
        setLoading(false);
        return;
      }
      if (String(result?.user?.role || '').toLowerCase() === 'student') {
        setError('Unauthorized access. Use the student portal.');
        setLoading(false);
        try { await logout('/login'); } catch (logoutErr) {}
        return;
      }
      if (result?.mfaRequired) {
        setMfaStep(true); setLoading(false);
        return;
      }
      
      setLoading(false);
    } catch (err) {
      setError(err?.message || 'Authentication error');
      setLoading(false);
    }
  };

  if (!ready) return <div className="auth-loading">Establishing Secure Link...</div>;

  return (
    <section className="auth-page fade-in">
      <style>{AUTH_CSS}</style>
      
      <div className="auth-card">
        <header className="auth-header">
          <div className="auth-logo admin">
            <img src={dsmLogo} alt="Discipleship School of Ministry" />
          </div>
          <div className="auth-divider"><span /></div>
          <h1>System Gateway</h1>
          <p>Administrator &amp; Staff Access Only</p>
        </header>

        {error && (
          <div className="auth-alert">
            <FaExclamationTriangle />
            <span>{error}</span>
          </div>
        )}

        {!mfaStep ? (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-group">
              <label><FaEnvelope /> Work Email</label>
              <div className="input-wrap">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="staff@dsmschool.org" />
              </div>
            </div>
            <div className="auth-group">
              <div className="label-row">
                <label><FaLock /> Access Key</label>
                <a href="/admin/password-reset">Forgot?</a>
              </div>
              <div className="input-wrap">
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
              </div>
            </div>
            
            <div className="auth-meta">
              <label className="check-label">
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                <span>Maintain active session</span>
              </label>
            </div>

            <button className="auth-btn primary" type="submit" disabled={loading}>
              {loading ? 'Authenticating...' : 'Sign In'} <FaSignInAlt />
            </button>
          </form>
        ) : (
          <div className="auth-mfa">
            <div className="mfa-head">
              <FaShieldAlt size={32} />
              <h3>Identity Verification</h3>
              <p>Enter your 2FA security code.</p>
            </div>
            <input className="otp-input" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="000000" />
            <button className="auth-btn primary" onClick={() => verifyMfa({ code: otp })}>Verify Securely</button>
            <button className="text-btn" onClick={() => setMfaStep(false)}><FaChevronLeft /> Back to Login</button>
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
    background:
      radial-gradient(circle at 20% 20%, rgba(123, 31, 44, 0.35), transparent 50%),
      radial-gradient(circle at 80% 80%, rgba(201, 169, 97, 0.18), transparent 50%),
      linear-gradient(135deg, #1A1014 0%, #2A1620 50%, #1A0F14 100%);
    position: relative;
    overflow: hidden;
  }
  .auth-page::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image:
      repeating-linear-gradient(45deg, rgba(201, 169, 97, 0.02) 0 2px, transparent 2px 80px);
    pointer-events: none;
  }

  .auth-card {
    width: 100%;
    max-width: 440px;
    background: linear-gradient(180deg, #241620 0%, #1F121A 100%);
    border-radius: 24px;
    padding: 48px 40px;
    box-shadow:
      0 25px 50px -12px rgba(0, 0, 0, 0.8),
      0 0 0 1px rgba(201, 169, 97, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(201, 169, 97, 0.15);
    color: #F5EBDB;
    position: relative;
    z-index: 1;
  }
  .auth-card::before {
    content: "";
    position: absolute;
    top: 0; left: 24px; right: 24px;
    height: 2px;
    background: linear-gradient(90deg, transparent, #C9A961, transparent);
    border-radius: 2px;
  }

  .auth-header { text-align: center; margin-bottom: 28px; }
  .auth-logo {
    width: 88px; height: 88px;
    background: #FFFCF7;
    border-radius: 50%;
    display: grid; place-items: center;
    margin: 0 auto 20px;
    box-shadow: 0 8px 24px rgba(123, 31, 44, 0.5), 0 0 0 3px #C9A961, 0 0 0 5px rgba(201, 169, 97, 0.25);
    overflow: hidden;
    padding: 4px;
  }
  .auth-logo img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .auth-logo.admin { box-shadow: 0 8px 24px rgba(123, 31, 44, 0.5), 0 0 0 3px #C9A961, 0 0 0 5px rgba(201, 169, 97, 0.25); }

  .auth-divider { display: flex; align-items: center; gap: 8px; margin: 16px auto 18px; max-width: 200px; }
  .auth-divider::before, .auth-divider::after { content: ""; flex: 1; height: 1px; background: linear-gradient(90deg, transparent, rgba(201, 169, 97, 0.4), transparent); }
  .auth-divider span { width: 8px; height: 8px; border-radius: 50%; background: #C9A961; box-shadow: 0 0 12px rgba(201, 169, 97, 0.6); }

  .auth-header h1 { font-family: 'Playfair Display', Georgia, serif; font-size: 28px; font-weight: 800; margin: 0; color: #F5EBDB; letter-spacing: 0.3px; }
  .auth-header p { font-size: 13px; color: #B8A99A; margin: 8px 0 0; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 600; }

  .auth-alert { display: flex; align-items: center; gap: 12px; background: rgba(176, 38, 60, 0.15); color: #F4B7C0; padding: 12px 16px; border-radius: 12px; margin-bottom: 24px; font-size: 13px; font-weight: 600; border: 1px solid rgba(176, 38, 60, 0.3); }

  .auth-form { display: flex; flex-direction: column; gap: 20px; }
  .auth-group { display: flex; flex-direction: column; gap: 8px; }
  .auth-group label { font-size: 11px; font-weight: 800; color: #C9A961; text-transform: uppercase; letter-spacing: 1.2px; display: flex; align-items: center; gap: 6px; }

  .label-row { display: flex; justify-content: space-between; align-items: center; }
  .label-row a { font-size: 11px; color: #C9A961; font-weight: 800; text-transform: uppercase; transition: 0.2s; }
  .label-row a:hover { color: #E5C77F; }

  .input-wrap input { width: 100%; padding: 14px 16px; border-radius: 12px; border: 1px solid rgba(201, 169, 97, 0.2); background: rgba(15, 8, 12, 0.5); color: #F5EBDB; font-size: 15px; font-weight: 600; outline: none; transition: 0.2s; font-family: inherit; }
  .input-wrap input::placeholder { color: rgba(184, 169, 154, 0.5); }
  .input-wrap input:focus { border-color: #C9A961; background: rgba(15, 8, 12, 0.8); box-shadow: 0 0 0 4px rgba(201, 169, 97, 0.12); }

  .auth-meta { display: flex; align-items: center; }
  .check-label { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600; color: #B8A99A; cursor: pointer; }
  .check-label input[type="checkbox"] { accent-color: #C9A961; }

  .auth-btn { height: 52px; background: linear-gradient(135deg, #7B1F2C, #9B3041); color: #F5EBDB; border-radius: 14px; border: 1px solid rgba(201, 169, 97, 0.35); font-weight: 800; font-size: 15px; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; transition: 0.2s; box-shadow: 0 8px 20px rgba(123, 31, 44, 0.4), inset 0 1px 0 rgba(255,255,255,0.08); letter-spacing: 0.5px; text-transform: uppercase; font-family: inherit; }
  .auth-btn:hover { background: linear-gradient(135deg, #9B3041, #B53F52); transform: translateY(-1px); box-shadow: 0 12px 28px rgba(123, 31, 44, 0.55); }
  .auth-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
  .auth-btn.primary { background: linear-gradient(135deg, #7B1F2C, #9B3041); }

  .auth-mfa { text-align: center; display: flex; flex-direction: column; gap: 20px; }
  .mfa-head { color: #C9A961; }
  .mfa-head h3 { font-family: 'Playfair Display', Georgia, serif; color: #F5EBDB; margin: 12px 0 4px; font-size: 22px; }
  .mfa-head p { font-size: 14px; color: #B8A99A; }
  .otp-input { width: 100%; height: 64px; text-align: center; font-size: 32px; font-weight: 800; letter-spacing: 12px; border-radius: 16px; border: 1px solid rgba(201, 169, 97, 0.2); background: rgba(15, 8, 12, 0.5); color: #F5EBDB; outline: none; font-family: inherit; }
  .otp-input:focus { border-color: #C9A961; box-shadow: 0 0 0 4px rgba(201, 169, 97, 0.12); }
  .text-btn { background: none; border: none; color: #B8A99A; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: 0.2s; font-family: inherit; }
  .text-btn:hover { color: #C9A961; }

  .auth-loading { height: 100vh; display: grid; place-items: center; background: #1A1014; color: #C9A961; font-weight: 800; font-size: 16px; letter-spacing: 1px; text-transform: uppercase; font-family: 'Inter', sans-serif; }

  @media (max-width: 480px) {
    .auth-card { padding: 32px 24px; }
    .auth-logo { width: 72px; height: 72px; }
    .auth-header h1 { font-size: 24px; }
  }
`;
