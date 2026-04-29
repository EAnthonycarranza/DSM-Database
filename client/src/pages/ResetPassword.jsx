// src/pages/ResetPassword.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { FaLock, FaCheckCircle, FaExclamationTriangle, FaArrowLeft, FaShieldAlt } from "react-icons/fa";
import dsmLogo from "../assets/images/DSM LOGO.png";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => (params.get('token') || '').trim(), [params]);

  const [status, setStatus] = useState({ kind: 'checking', msg: 'Validating security token...' });
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!token) {
        setStatus({ kind: 'error', msg: 'Missing or invalid reset token.' });
        return;
      }
      try {
        const r = await fetch(`/api/auth/password/reset/check?token=${encodeURIComponent(token)}`);
        const data = await r.json();
        if (!ignore) {
          if (r.ok && data?.valid) setStatus({ kind: 'ok', msg: 'Verification successful. Please enter your new password.' });
          else setStatus({ kind: 'error', msg: data?.error || 'This reset link is invalid or has expired.' });
        }
      } catch (e) {
        if (!ignore) setStatus({ kind: 'error', msg: 'Secure tunnel connection failed.' });
      }
    })();
    return () => { ignore = true; };
  }, [token]);

  const canSubmit = pw1 && pw2 && pw1 === pw2 && pw1.length >= 8 && status.kind === 'ok' && !submitting;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const r = await fetch('/api/auth/password/reset/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: pw1 }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data?.success) {
        setStatus({ kind: 'done', msg: 'Access key updated successfully.' });
        setTimeout(() => navigate('/admin/login'), 2000);
      } else {
        setStatus({ kind: 'error', msg: data?.error || 'Failed to synchronize new key.' });
      }
    } catch (e) {
      setStatus({ kind: 'error', msg: 'Network synchronization error.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-page fade-in">
      <style>{RESET_CSS}</style>
      
      <div className="auth-card">
        <header className="auth-header">
          <div className="auth-logo security">
            <img src={dsmLogo} alt="DSM" />
          </div>
          <div className="auth-divider"><span /></div>
          <h1>Reset Password</h1>
          <p>{status.kind === 'ok' ? 'Establish a new secure access key.' : 'Security Verification'}</p>
        </header>

        {status.kind === 'checking' && (
          <div className="auth-loading-state">
            <div className="spinner" />
            <span>Verifying identity...</span>
          </div>
        )}

        {status.kind === 'error' && (
          <div className="auth-alert error">
            <FaExclamationTriangle />
            <span>{status.msg}</span>
            <button className="text-btn" onClick={() => navigate('/admin/login')}>Return to Login</button>
          </div>
        )}

        {status.kind === 'ok' && (
          <form className="auth-form" onSubmit={onSubmit}>
            <div className="auth-group">
              <label><FaLock /> New Password</label>
              <input 
                type="password" 
                value={pw1} 
                onChange={(e) => setPw1(e.target.value)} 
                placeholder="At least 8 characters"
                required
              />
            </div>
            <div className="auth-group">
              <label><FaLock /> Confirm Password</label>
              <input 
                type="password" 
                value={pw2} 
                onChange={(e) => setPw2(e.target.value)} 
                placeholder="Repeat new password"
                required
              />
            </div>
            
            {pw2 && pw1 !== pw2 && (
              <div className="field-hint error">Passwords do not match</div>
            )}
            
            <button className="auth-btn primary" type="submit" disabled={!canSubmit}>
              {submitting ? 'Updating Security...' : 'Reset Access Key'}
            </button>
          </form>
        )}

        {status.kind === 'done' && (
          <div className="auth-success-state">
            <FaCheckCircle size={48} color="#10b981" />
            <h3>Success</h3>
            <p>{status.msg}</p>
            <p className="dim">Redirecting to login portal...</p>
          </div>
        )}
      </div>
    </section>
  );
}

const RESET_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');

  .auth-page {
    min-height: 100vh; display: grid; place-items: center; padding: 20px;
    font-family: 'Inter', sans-serif;
    background:
      radial-gradient(circle at 20% 20%, rgba(123, 31, 44, 0.35), transparent 50%),
      radial-gradient(circle at 80% 80%, rgba(201, 169, 97, 0.18), transparent 50%),
      linear-gradient(135deg, #1A1014 0%, #2A1620 50%, #1A0F14 100%);
  }
  .auth-card {
    width: 100%; max-width: 440px;
    background: linear-gradient(180deg, #241620 0%, #1F121A 100%);
    border-radius: 24px; padding: 48px 40px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(201, 169, 97, 0.18);
    border: 1px solid rgba(201, 169, 97, 0.15);
    color: #F5EBDB; position: relative;
  }
  .auth-card::before {
    content: ""; position: absolute; top: 0; left: 24px; right: 24px;
    height: 2px; background: linear-gradient(90deg, transparent, #C9A961, transparent);
  }

  .auth-header { text-align: center; margin-bottom: 28px; }
  .auth-logo {
    width: 88px; height: 88px; background: #FFFCF7; border-radius: 50%;
    display: grid; place-items: center; margin: 0 auto 18px;
    box-shadow: 0 8px 24px rgba(123, 31, 44, 0.5), 0 0 0 3px #C9A961, 0 0 0 5px rgba(201, 169, 97, 0.25);
    overflow: hidden; padding: 4px;
  }
  .auth-logo img { width: 100%; height: 100%; object-fit: contain; }
  .auth-divider { display: flex; align-items: center; gap: 8px; margin: 14px auto 16px; max-width: 200px; }
  .auth-divider::before, .auth-divider::after { content: ""; flex: 1; height: 1px; background: linear-gradient(90deg, transparent, rgba(201, 169, 97, 0.4), transparent); }
  .auth-divider span { width: 7px; height: 7px; border-radius: 50%; background: #C9A961; box-shadow: 0 0 10px rgba(201, 169, 97, 0.6); }

  .auth-header h1 { font-family: 'Playfair Display', Georgia, serif; font-size: 28px; font-weight: 800; margin: 0; color: #F5EBDB; }
  .auth-header p { font-size: 13px; color: #B8A99A; margin: 8px 0 0; letter-spacing: 0.5px; }

  .auth-form { display: flex; flex-direction: column; gap: 20px; }
  .auth-group { display: flex; flex-direction: column; gap: 8px; }
  .auth-group label { font-size: 11px; font-weight: 800; color: #C9A961; text-transform: uppercase; letter-spacing: 1.2px; display: flex; align-items: center; gap: 6px; }
  .auth-group input { width: 100%; padding: 14px 16px; border-radius: 12px; border: 1px solid rgba(201, 169, 97, 0.2); background: rgba(15, 8, 12, 0.5); color: #F5EBDB; font-size: 15px; font-weight: 600; outline: none; transition: 0.2s; font-family: inherit; }
  .auth-group input:focus { border-color: #C9A961; box-shadow: 0 0 0 4px rgba(201, 169, 97, 0.12); }

  .auth-btn { height: 52px; background: linear-gradient(135deg, #7B1F2C, #9B3041); color: #F5EBDB; border-radius: 14px; border: 1px solid rgba(201, 169, 97, 0.35); font-weight: 800; font-size: 15px; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; transition: 0.2s; box-shadow: 0 8px 20px rgba(123, 31, 44, 0.4); letter-spacing: 0.5px; text-transform: uppercase; font-family: inherit; }
  .auth-btn:hover:not(:disabled) { background: linear-gradient(135deg, #9B3041, #B53F52); transform: translateY(-1px); }
  .auth-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .auth-alert { text-align: center; padding: 24px; border-radius: 16px; background: rgba(176, 38, 60, 0.12); border: 1px solid rgba(176, 38, 60, 0.3); color: #F4B7C0; display: flex; flex-direction: column; gap: 12px; align-items: center; }
  .auth-alert span { font-size: 14px; font-weight: 600; }

  .auth-loading-state { text-align: center; padding: 40px 0; color: #B8A99A; display: flex; flex-direction: column; gap: 16px; align-items: center; }
  .spinner { width: 32px; height: 32px; border: 3px solid rgba(201, 169, 97, 0.18); border-top-color: #C9A961; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .auth-success-state { text-align: center; padding: 20px 0; display: flex; flex-direction: column; gap: 16px; align-items: center; color: #F5EBDB; }
  .auth-success-state h3 { font-family: 'Playfair Display', Georgia, serif; font-size: 22px; font-weight: 800; margin: 0; color: #C9A961; }
  .auth-success-state p { color: #B8A99A; font-size: 14px; margin: 0; }
  .dim { opacity: 0.6; font-size: 12px !important; }

  .field-hint.error { font-size: 12px; color: #E05A6E; font-weight: 700; margin-top: -12px; }
  .text-btn { background: none; border: none; color: #C9A961; font-weight: 800; font-size: 13px; cursor: pointer; text-transform: uppercase; margin-top: 8px; transition: 0.2s; }
  .text-btn:hover { color: #E5C77F; }
`;
