import React, { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";

// Removed mock AppContext hook for authentication

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  
  const { ready, authenticated, user, login, logout, verifyMfa, need2FA, pending2FAEmail } = useApp();
  const navigate = useNavigate();

  // 2FA state
  const [mfaStep, setMfaStep] = useState(false);
  const [otp, setOtp] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  useEffect(() => {
    if (need2FA) {
      setMfaStep(true);
      setError('');
      setLoading(false);
    }
  }, [need2FA]);

  // Add initial animation
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // If a student is already authenticated, redirect them to the student login page
  useEffect(() => {
    if (ready && authenticated && user && String(user.role || '').toLowerCase() === 'student') {
  navigate('/login', { replace: true });
    }
  }, [ready, authenticated, user, navigate]);
  
  const handleSubmit = async () => {
    if (mfaStep) return; // MFA handled separately
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      const result = await login(email, password, { remember: rememberMe });

      // If the server returned a user and it's a student, block here
      const role = String(result?.user?.role || '').toLowerCase();
      if (role === 'student') {
        setError('Use the Student Login page to sign in.');
        setLoading(false);
        // Ensure we sign back out if a student slipped through
  try { await logout('/login'); } catch {}
        return;
      }

      if (result?.mfaRequired || need2FA) {
        // Switch to 2FA step
        setMfaStep(true);
        setOtp('');
        setBackupCode('');
        setUseBackup(false);
        setLoading(false);
        return;
      }

      if (!result?.success) {
        setError(result?.error || 'Sign in failed');
        setLoading(false);
      } else {
        setLoading(false);
      }
    } catch (err) {
      setError('Something went wrong. Try again.');
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const code = useBackup ? backupCode.trim() : otp.trim();
    if (!code) {
      setError('Please enter your ' + (useBackup ? 'backup code' : '6-digit code'));
      return;
    }

    setError('');
    setLoading(true);
    try {
      const res = await (typeof verifyMfa === 'function'
        ? verifyMfa({ code, remember: rememberMe, method: useBackup ? 'backup' : 'totp' })
        : login(email, password, { otp: code, remember: rememberMe })
      );
      if (!res?.success) {
        setError(res?.error || 'Invalid code. Try again.');
        setLoading(false);
        return;
      }

      // Block students from using admin login
      const role = String(res?.user?.role || '').toLowerCase();
      if (role === 'student') {
        setLoading(false);
  try { await logout('/login'); } catch {}
        return;
      }

      // success
      setMfaStep(false);
      setOtp('');
      setBackupCode('');
      setUseBackup(false);
      setLoading(false);
      navigate('/admin/home');
    } catch (e) {
      setError('Verification failed. Try again.');
      setLoading(false);
    }
  };
  
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !loading) {
      if (mfaStep) {
        handleVerifyOtp();
      } else {
        handleSubmit();
      }
    }
  };
  
  // Wait for context to load before checking authentication
  if (!ready) {
    return (
      <div className="login-container">
        <div className={`login-card ${mounted ? 'mounted' : ''}`}>
          <div className="loading">
            <span className="spinner"></span>
            Loading...
          </div>
        </div>
      </div>
    );
  }

  if (authenticated && user) {
    const role = String(user.role || '').toLowerCase();
    if (role === 'student') return null; // redirected in effect above
    return (
      <div className="login-container">
        <div className="login-success">
          <div className="success-card">
            <div className="success-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="var(--green)" strokeWidth="2"/>
                <path d="M8 12l2 2 4-4" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2>Welcome back, {user.name}!</h2>
            <p className="role-badge">{user.role}</p>
            <p>You are now logged in to DSM CRM</p>
            <div className="success-actions">
              <button className="btn primary" onClick={() => navigate("/admin/dashboard")}>
                Go to Dashboard
              </button>
              <button className="btn ghost" onClick={() => logout("/admin/login")}>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="login-container">
      <div className={`login-card ${mounted ? 'mounted' : ''}`}>
        {/* Logo Section */}
        <div className="login-header">
          <div className="logo-large">
            <div className="logo-mark">DSM</div>
          </div>
          <h1>Welcome to DSM CRM</h1>
          <p className="subtitle">Discipleship & Service Management</p>
        </div>

        {/* Login Form or 2FA */}
        { !mfaStep ? (
          <div className="login-form">
            <div className="login-field">
              <label htmlFor="email">Email Address</label>
              <div className="input-wrapper">
                <input
                  type="email"
                  id="email"
                  className="input"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={loading}
                />
                <span className="input-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                </span>
              </div>
            </div>

            <div className="login-field">
              <div className="login-field-header">
                <label htmlFor="password">Password</label>
                <a className="forgot-link" onClick={(e) => { e.preventDefault(); navigate('/admin/password-reset'); }}>
                  Forgot password?
                </a>
              </div>
              <div className="input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  className="input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="input-icon clickable"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="remember-section">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={loading}
                />
                <span className="checkbox-custom"></span>
                <span>Remember me</span>
              </label>
            </div>

            {error && (
              <div className="error-message">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                {error}
              </div>
            )}

            <button 
              className="btn primary submit-btn" 
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <span className="loading">
                  <span className="spinner"></span>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </div>
        ) : (
          <div className="twofa-card">
            <div className="twofa-header">
              <h2>Two‑Factor Verification</h2>
              <p className="twofa-sub">Enter the {useBackup ? 'backup code' : '6‑digit code'} from your authenticator app</p>
            </div>

            {!useBackup ? (
              <div className="otp-wrap">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  className="input otp-input"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyPress={handleKeyPress}
                  disabled={loading}
                  autoFocus
                />
              </div>
            ) : (
              <div className="otp-wrap">
                <input
                  type="text"
                  className="input"
                  placeholder="Enter backup code"
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value.trim())}
                  onKeyPress={handleKeyPress}
                  disabled={loading}
                  autoFocus
                />
              </div>
            )}

            {error && (
              <div className="error-message" style={{marginTop:12}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                {error}
              </div>
            )}

            <div className="twofa-actions">
              <button className="btn secondary" onClick={() => setUseBackup(b => !b)} disabled={loading}>
                {useBackup ? 'Use authenticator code' : 'Use backup code'}
              </button>
              <button 
                className="btn primary" 
                onClick={handleVerifyOtp}
                disabled={loading || (!useBackup ? otp.length !== 6 : backupCode.length < 8)}
              >
                {loading ? (
                  <span className="loading">
                    <span className="spinner"></span>
                    Verifying...
                  </span>
                ) : (
                  'Verify'
                )}
              </button>
            </div>

            <div style={{display:'flex', justifyContent:'center', marginTop:12}}>
              <button 
                className="btn ghost"
                onClick={() => { setMfaStep(false); setOtp(''); setBackupCode(''); setUseBackup(false); setError(''); }}
                disabled={loading}
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
      {/* Footer */}
      <div className="login-footer">
        <p>© 2025 Discipleship & Service Management. All rights reserved.</p>
      </div>
    </div>
  );
};

export default LoginPage;

// CSS embedded in style tag for the component
const style = document.createElement('style');
style.textContent = `

  /* Login Container */
  .login-container {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: linear-gradient(180deg, #0b0f1d 0%, #0c1020 40%, #0a0e1b 100%);
    padding: 20px;
  }
  
  /* Login Card */
  .login-card {
    width: 100%;
    max-width: 440px;
    background: var(--panel);
    border: 1px solid #1f294a;
    border-radius: 20px;
    padding: 40px;
    box-shadow: 0 24px 60px rgba(0,0,0,.55);
    opacity: 0;
    transform: translateY(10px);
    transition: all 0.4s ease;
  }
  
  .login-card.mounted {
    opacity: 1;
    transform: translateY(0);
  }
  
  /* Header */
  .login-header {
    text-align: center;
    margin-bottom: 32px;
  }
  
  .logo-large {
    display: flex;
    justify-content: center;
    margin-bottom: 24px;
  }
  
  .logo-mark {
    width: 72px;
    height: 72px;
    display: grid;
    place-items: center;
    background: var(--blue);
    color: white;
    font-weight: 800;
    font-size: 24px;
    border-radius: 16px;
    box-shadow: 0 8px 24px rgba(30,136,255,.35);
  }
  
  .login-header h1 {
    margin: 0 0 8px;
    font-size: 28px;
    font-weight: 800;
    color: var(--text);
  }
  
  .subtitle {
    color: var(--text-dim);
    font-size: 14px;
    margin: 0;
  }
  
  /* Form */
  .login-form {
    margin-bottom: 24px;
  }
  
  .login-field {
    margin-bottom: 20px;
  }

  .login-field label {
    display: block;
    margin-bottom: 8px;
    color: #cfe0ff;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }
  
  .login-field-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  
  .forgot-link {
    color: #8fb4ff;
    font-size: 13px;
    text-decoration: none;
    cursor: pointer;
    transition: color 0.15s;
  }
  
  .forgot-link:hover {
    color: #a9c8ff;
    text-decoration: underline;
  }
  
  .input-wrapper {
    position: relative;
  }
  
  .input {
    width: 100%;
    height: 48px;
    background: linear-gradient(180deg, #0d1530, #0a1228);
    border: 1px solid #27325a;
    color: var(--text);
    border-radius: 12px;
    padding: 0 44px 0 16px;
    font-size: 15px;
    outline: none;
    transition: all 0.15s;
  }
  
  .input:focus {
    border-color: #4c66ff;
    box-shadow: 0 0 0 3px rgba(76,102,255,.25);
    background: linear-gradient(180deg, #0e1736, #0b142e);
  }
  
  .input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .input-icon {
    position: absolute;
    right: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: #7785ab;
    display: flex;
    align-items: center;
  }
  
  .input-icon.clickable {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    transition: color 0.15s;
  }
  
  .input-icon.clickable:hover {
    color: #a9b3c9;
  }
  
  /* Remember Me */
  .remember-section {
    margin-bottom: 20px;
  }
  
  .checkbox-label {
    display: flex;
    align-items: center;
    cursor: pointer;
    user-select: none;
    color: var(--text-dim);
    font-size: 14px;
  }
  
  .checkbox-label input[type="checkbox"] {
    position: absolute;
    opacity: 0;
  }
  
  .checkbox-custom {
    width: 18px;
    height: 18px;
    border: 2px solid #27325a;
    border-radius: 4px;
    margin-right: 10px;
    transition: all 0.15s;
    position: relative;
  }
  
  .checkbox-label input:checked + .checkbox-custom {
    background: var(--blue);
    border-color: var(--blue);
  }
  
  .checkbox-label input:checked + .checkbox-custom::after {
    content: '';
    position: absolute;
    left: 5px;
    top: 2px;
    width: 5px;
    height: 9px;
    border: solid white;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
  
  /* Error Message */
  .error-message {
    background: rgba(255,92,92,.12);
    border: 1px solid rgba(255,92,92,.35);
    color: #ff9d9d;
    padding: 10px 14px;
    border-radius: 10px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    animation: shake 0.3s ease;
  }
  
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
  }
  
  /* Submit Button */
  .submit-btn {
    width: 100%;
    height: 48px;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.5px;
    background: linear-gradient(180deg, #3f76ff, #315bff);
    border: none;
    color: white;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }
  
  .submit-btn:hover:not(:disabled) {
    background: linear-gradient(180deg, #4a80ff, #3965ff);
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(30,136,255,.35);
  }
  
  .submit-btn:active:not(:disabled) {
    transform: translateY(0);
  }
  
  .submit-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
  
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
  
  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  /* Two-Factor */
  .twofa-card { margin-top: 8px; }
  .twofa-header { text-align: center; margin-bottom: 8px; }
  .twofa-header h2 { margin: 0 0 6px; font-size: 20px; font-weight: 800; color: var(--text); }
  .twofa-sub { color: var(--text-dim); margin: 0; }
  .otp-wrap { display: flex; justify-content: center; }
  .otp-input { width: 180px; text-align: center; letter-spacing: 8px; font-weight: 800; font-size: 20px; }
  .twofa-actions { display: flex; gap: 12px; justify-content: center; margin-top: 12px; }
  
  /* Footer */
  .login-footer {
    margin-top: 32px;
    text-align: center;
    color: #7785ab;
    font-size: 12px;
  }
  
  /* Success State */
  .login-success {
    animation: fadeIn 0.4s ease;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  .success-card {
    background: var(--panel);
    border: 1px solid #1f294a;
    border-radius: 20px;
    padding: 48px;
    box-shadow: 0 24px 60px rgba(0,0,0,.55);
    text-align: center;
    max-width: 440px;
  }
  
  .success-icon {
    margin-bottom: 24px;
    animation: scaleIn 0.4s ease 0.2s both;
  }
  
  @keyframes scaleIn {
    from { transform: scale(0); }
    to { transform: scale(1); }
  }
  
  .success-card h2 {
    margin: 0 0 12px;
    font-size: 24px;
    color: var(--text);
  }
  
  .role-badge {
    display: inline-block;
    padding: 6px 16px;
    background: rgba(30,136,255,.15);
    border: 1px solid rgba(30,136,255,.35);
    color: #9fbeff;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 16px;
  }
  
  .success-card p {
    color: var(--text-dim);
    margin: 0 0 32px;
  }
  
  .success-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
  }
  
  .btn {
    padding: 10px 20px;
    border-radius: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    border: 1px solid transparent;
  }
  
  .btn.primary {
    background: var(--blue);
    color: white;
    border-color: var(--blue);
  }
  
  .btn.primary:hover {
    background: #2b93ff;
  }
  
  .btn.ghost {
    background: transparent;
    color: var(--text-dim);
    border: 1px solid #2a3763;
  }
  
  .btn.ghost:hover {
    background: #111a34;
    color: var(--text);
  }
  
  /* Responsive */
  @media (max-width: 480px) {
    .login-card {
      padding: 32px 24px;
    }
    
    .login-header h1 {
      font-size: 24px;
    }
    
    .demo-buttons {
      grid-template-columns: 1fr;
    }
    
    .success-card {
      padding: 32px 24px;
    }
    
    .success-actions {
      flex-direction: column;
      width: 100%;
    }
    
    .success-actions .btn {
      width: 100%;
    }
  }
`;
document.head.appendChild(style);