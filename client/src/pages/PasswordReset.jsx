import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

const AdminSecurityPage = () => {
  const { user, data, refreshStore, serverOnline } = useApp();
  // Current user from AppContext (fallback for unauthenticated render)
  const currentUser = user || { name: '—', email: '—', role: '—', twoFactor: { enabled: false } };
  const currentUserName = currentUser?.name || currentUser?.fullName || '';
  const initials = (currentUserName || currentUser?.email || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  // Tab management
  const [activeTab, setActiveTab] = useState('password');
  
  // Password reset states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // User lookup states
  const [lookupEmail, setLookupEmail] = useState('');
  const [foundUser, setFoundUser] = useState(null);
  const [resetToken, setResetToken] = useState('');
  
  // 2FA states
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(!!(user?.twoFactor?.enabled));
  useEffect(() => {
    setTwoFactorEnabled(!!(user?.twoFactor?.enabled));
  }, [user]);
  const [qrCode, setQrCode] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  
  // UI states
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, text: '', color: '' });
  
  // Password strength calculator
  const calculatePasswordStrength = (password) => {
    if (!password) {
      setPasswordStrength({ score: 0, text: '', color: '' });
      return;
    }
    
    let score = 0;
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      numbers: /[0-9]/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };
    
    // Calculate score
    if (checks.length) score += 20;
    if (password.length >= 12) score += 20;
    if (checks.uppercase) score += 20;
    if (checks.lowercase) score += 20;
    if (checks.numbers) score += 20;
    if (checks.special) score += 20;
    
    // Determine strength level
    let strength = { score, checks };
    if (score <= 20) {
      strength.text = 'Very Weak';
      strength.color = '#ff5c5c';
    } else if (score <= 40) {
      strength.text = 'Weak';
      strength.color = '#ffb020';
    } else if (score <= 60) {
      strength.text = 'Fair';
      strength.color = '#ffd93d';
    } else if (score <= 80) {
      strength.text = 'Good';
      strength.color = '#6bcf7f';
    } else {
      strength.text = 'Strong';
      strength.color = '#1db954';
    }
    
    setPasswordStrength(strength);
  };
  
  useEffect(() => {
    calculatePasswordStrength(newPassword);
  }, [newPassword]);

  // Simple POST helper to hit our server API
async function apiPost(path, body) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}
  
  // Handle password change
  const handlePasswordChange = async () => {
    setMessage({ type: '', text: '' });
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: 'Please fill in all password fields' });
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    
    if (passwordStrength.score < 60) {
      setMessage({ type: 'error', text: 'Please choose a stronger password' });
      return;
    }
    
    setLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setMessage({ type: 'success', text: 'Password updated successfully!' });
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setLoading(false);
  };
  
  // Ensure users are loaded when opening the Reset tab
  useEffect(() => {
    let did = false;
    (async () => {
      if (activeTab === 'reset' && serverOnline && Array.isArray(data?.users) && data.users.length === 0) {
        try { await refreshStore?.('users', { force: true }); } catch {}
      }
      did = true;
    })();
    return () => { did = true; };
  }, [activeTab, serverOnline, data?.users?.length, refreshStore]);

  // Handle user lookup for password reset using actual users from AppContext/server
  const handleUserLookup = async () => {
    const q = String(lookupEmail || '').trim().toLowerCase();
    if (!q) {
      setMessage({ type: 'error', text: 'Please enter an email address' });
      return;
    }
    setLoading(true);
    try {
      // Try local cache first
      let users = Array.isArray(data?.users) ? data.users : [];
      let u = users.find((x) => String(x?.email || '').toLowerCase() === q);
      // If not found and server is online, refresh users and try again
      if (!u && serverOnline) {
        try { await refreshStore?.('users', { force: true }); } catch {}
        users = Array.isArray(data?.users) ? data.users : [];
        u = users.find((x) => String(x?.email || '').toLowerCase() === q);
      }
      if (u) {
        setFoundUser(u);
        // Generate a temporary token locally; server should mint an email link when sending
        const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        setResetToken(token);
        setMessage({ type: 'success', text: 'User found. You can send a reset email now.' });
      } else {
        setFoundUser(null);
        setMessage({ type: 'error', text: 'No user found with that email address' });
      }
    } finally {
      setLoading(false);
    }
  };

  // Attempt to ask server to send a reset email for found user (graceful fallback if not implemented)
  const sendResetEmail = async () => {
    if (!foundUser?.email) return;
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId: foundUser.id || foundUser._id,
          email: foundUser.email,
          origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(t || `Request failed (${res.status})`);
      }
      setMessage({ type: 'success', text: 'Password reset email sent.' });
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Server does not support reset emails yet.' });
    } finally {
      setLoading(false);
    }
  };
  
  // Handle 2FA setup
const handleEnable2FA = async () => {
  try {
    setMessage({ type: '', text: '' });
    setLoading(true);
    const r = await apiPost('/auth/2fa/start', {
      userId: user?.id,
      label: currentUser.email || currentUser.name,
    });
    setQrCode(r.qrDataUrl);        // real QR image from server
    setBackupCodes([]);            // will come after verify
    setMessage({ type: 'success', text: 'Scan the QR with your authenticator app, then enter the 6-digit code.' });
  } catch (err) {
    setMessage({ type: 'error', text: err.message });
  } finally {
    setLoading(false);
  }
};
  
const handleVerify2FA = async () => {
  if (!verificationCode || verificationCode.length !== 6) {
    setMessage({ type: 'error', text: 'Please enter a valid 6-digit code' });
    return;
  }
  try {
    setLoading(true);
    const r = await apiPost('/auth/2fa/verify', {
      userId: user?.id,
      token: verificationCode,
    });
    setTwoFactorEnabled(true);
    setQrCode('');
    setBackupCodes(r.backupCodes || []);
    setShowBackupCodes(true);
    setMessage({ type: 'success', text: 'Two-factor authentication enabled. Save your backup codes!' });
  } catch (err) {
    setMessage({ type: 'error', text: err.message });
  } finally {
    setLoading(false);
  }
};
  
const handleDisable2FA = async () => {
  if (!window.confirm('Are you sure you want to disable two-factor authentication?')) return;
  try {
    setLoading(true);
    await apiPost('/auth/2fa/disable', { userId: user?.id });
    setTwoFactorEnabled(false);
    setQrCode('');
    setBackupCodes([]);
    setShowBackupCodes(false);
    setMessage({ type: 'success', text: 'Two-factor authentication disabled' });
  } catch (err) {
    setMessage({ type: 'error', text: err.message });
  } finally {
    setLoading(false);
  }
};

const handleRegenBackup = async () => {
  try {
    setLoading(true);
    const r = await apiPost('/auth/2fa/backup/regenerate', { userId: user?.id });
    setBackupCodes(r.backupCodes || []);
    setShowBackupCodes(true);
    setMessage({ type: 'success', text: 'New backup codes generated. Save them now.' });
  } catch (err) {
    setMessage({ type: 'error', text: err.message });
  } finally {
    setLoading(false);
  }
};
  
  return (
    <div className="security-container">
      {/* Header */}
      <div className="security-header">
        <div className="header-left">
          <h1>Security Settings</h1>
          <p className="subtitle">Manage passwords and authentication for your organization</p>
        </div>
        <div className="header-right">
            <div className="user-badge">
              <div className="user-avatar">{initials}</div>
            <div className="user-info">
                <div className="user-name">{currentUserName || currentUser.email}</div>
              <div className="user-role">{currentUser.role}</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="tabs-container">
        <button 
          className={`tab ${activeTab === 'password' ? 'active' : ''}`}
          onClick={() => setActiveTab('password')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2"/>
          </svg>
          My Password
        </button>
        <button 
          className={`tab ${activeTab === 'reset' ? 'active' : ''}`}
          onClick={() => setActiveTab('reset')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2"/>
            <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
          </svg>
          Reset User Password
        </button>
        <button 
          className={`tab ${activeTab === '2fa' ? 'active' : ''}`}
          onClick={() => setActiveTab('2fa')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7v10c0 5.5 3.8 10.7 10 12 6.2-1.3 10-6.5 10-12V7l-10-5z" stroke="currentColor" strokeWidth="2"/>
            <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2"/>
          </svg>
          Two-Factor Auth
        </button>
      </div>
      
      {/* Message */}
      {message.text && (
        <div className={`message ${message.type}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            {message.type === 'success' ? (
              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2"/>
            ) : (
              <path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="2"/>
            )}
          </svg>
          {message.text}
        </div>
      )}
      
      {/* Tab Content */}
      <div className="tab-content">
        {/* My Password Tab */}
        {activeTab === 'password' && (
          <div className="password-section">
            <div className="section-card">
              <h2>Change Your Password</h2>
              <p className="section-desc">Ensure your account stays secure by using a strong password</p>
              
              <div className="form-group">
                <label>Current Password</label>
                <div className="input-wrapper">
                  <input

                    className="input"
                    placeholder="Enter your current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="input-icon"
                    aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  >
                    <i className={`fa-solid ${showCurrentPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                  </button>
                </div>
              </div>
              
              <div className="form-group">
                <label>New Password</label>
                <div className="input-wrapper">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    className="input"
                    placeholder="Enter your new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="input-icon"
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    <i className={`fa-solid ${showNewPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                  </button>
                </div>
                
                {/* Password Strength Indicator */}
                {newPassword && (
                  <div className="strength-indicator">
                    <div className="strength-bar">
                      <div 
                        className="strength-fill"
                        style={{
                          width: `${passwordStrength.score}%`,
                          backgroundColor: passwordStrength.color
                        }}
                      />
                    </div>
                    <div className="strength-text" style={{ color: passwordStrength.color }}>
                      {passwordStrength.text}
                    </div>
                    <div className="strength-requirements">
                      <div className={`req ${newPassword.length >= 8 ? 'met' : ''}`}>
                        ✓ At least 8 characters
                      </div>
                      <div className={`req ${/[A-Z]/.test(newPassword) ? 'met' : ''}`}>
                        ✓ One uppercase letter
                      </div>
                      <div className={`req ${/[a-z]/.test(newPassword) ? 'met' : ''}`}>
                        ✓ One lowercase letter
                      </div>
                      <div className={`req ${/[0-9]/.test(newPassword) ? 'met' : ''}`}>
                        ✓ One number
                      </div>
                      <div className={`req ${/[!@#$%^&*(),.?":{}|<>]/.test(newPassword) ? 'met' : ''}`}>
                        ✓ One special character
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="form-group">
                <label>Confirm New Password</label>
                <div className="input-wrapper">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    className="input"
                    placeholder="Confirm your new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="input-icon"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    <i className={`fa-solid ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                  </button>
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <div className="field-error">Passwords do not match</div>
                )}
                {confirmPassword && newPassword === confirmPassword && confirmPassword.length > 0 && (
                  <div className="field-success">✓ Passwords match</div>
                )}
              </div>
              
              <button 
                className="btn primary"
                onClick={handlePasswordChange}
                disabled={loading || !currentPassword || !newPassword || !confirmPassword}
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </div>
        )}
        
        {/* Reset User Password Tab */}
        {activeTab === 'reset' && (
          <div className="reset-section">
            <div className="section-card">
              <h2>Reset User Password</h2>
              <p className="section-desc">Send a password reset link to any user in your organization</p>
              
              <div className="form-group">
                <label>User Email Address</label>
                <div className="search-wrapper">
                  <input
                    type="email"
                    className="input"
                    placeholder="Enter user's email address"
                    value={lookupEmail}
                    onChange={(e) => setLookupEmail(e.target.value)}
                    disabled={loading}
                    list="user-emails"
                  />
                  <datalist id="user-emails">
                    {(Array.isArray(data?.users) ? data.users : []).slice(0, 100).map((u) => {
                      const em = String(u?.email || '');
                      return em ? <option key={u.id || em} value={em}>{u.name || u.fullName || em}</option> : null;
                    })}
                  </datalist>
                  <button 
                    className="btn secondary"
                    onClick={handleUserLookup}
                    disabled={loading || !lookupEmail}
                  >
                    {loading ? 'Searching...' : 'Search User'}
                  </button>
                </div>
              </div>
              
              {foundUser && (
                <div className="user-found">
                  <div className="user-card">
                    <div className="user-details">
                      <h3>{foundUser.name || foundUser.fullName || foundUser.username || foundUser.email}</h3>
                      <p>{foundUser.email}</p>
                      {foundUser.status && (
                        <span className="status-badge">{foundUser.status}</span>
                      )}
                    </div>
                    <div className="reset-actions">
                      <div className="reset-link">
                        <label>Reset Link</label>
                        <div className="link-display">
                          <code>{`${window.location.origin}/password-reset/${resetToken}`}</code>
                          <button 
                            className="copy-btn"
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/password-reset/${resetToken}`);
                              setMessage({ type: 'success', text: 'Link copied to clipboard!' });
                            }}
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                      <button className="btn primary" onClick={sendResetEmail} disabled={loading}>
                        {loading ? 'Sending…' : 'Send Reset Email'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}
        
        {/* 2FA Tab */}
        {activeTab === '2fa' && (
          <div className="twofa-section">
            <div className="section-card">
              <h2>Two-Factor Authentication</h2>
              <p className="section-desc">Add an extra layer of security to your account</p>
              
              {!twoFactorEnabled && !qrCode && (
                <div className="twofa-intro">
                  <div className="feature-list">
                    <div className="feature">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M9 12l2 2 4-4" stroke="var(--green)" strokeWidth="2"/>
                      </svg>
                      Protects against unauthorized access
                    </div>
                    <div className="feature">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M9 12l2 2 4-4" stroke="var(--green)" strokeWidth="2"/>
                      </svg>
                      Works with Google Authenticator or Authy
                    </div>
                    <div className="feature">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M9 12l2 2 4-4" stroke="var(--green)" strokeWidth="2"/>
                      </svg>
                      Backup codes for emergency access
                    </div>
                  </div>
                  <button 
                    className="btn primary"
                    onClick={handleEnable2FA}
                    disabled={loading}
                  >
                    {loading ? 'Setting up...' : 'Enable Two-Factor Authentication'}
                  </button>
                </div>
              )}
              
              {qrCode && !twoFactorEnabled && (
                <div className="twofa-setup">
                  <div className="setup-steps">
                    <div className="step">
                      <div className="step-number">1</div>
                      <div className="step-content">
                        <h3>Scan QR Code</h3>
                        <p>Use Google Authenticator or Authy to scan this code</p>
                        <div className="qr-container">
<div className="qr-placeholder">
  {qrCode ? (
    <img src={qrCode} alt="2FA QR Code" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
  ) : (
    '[QR Code]'
  )}
</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="step">
                      <div className="step-number">2</div>
                      <div className="step-content">
                        <h3>Enter Verification Code</h3>
                        <p>Enter the 6-digit code from your authenticator app</p>
                        <div className="code-input">
                          <input
                            type="text"
                            className="input"
                            placeholder="000000"
                            maxLength="6"
                            value={verificationCode}
                            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                          />
                          <button 
                            className="btn primary"
                            onClick={handleVerify2FA}
                            disabled={loading || verificationCode.length !== 6}
                          >
                            Verify & Enable
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    <div className="step">
                      <div className="step-number">3</div>
                      <div className="step-content">
                        <h3>Save Backup Codes</h3>
                        <p>Store these codes safely - you'll need them if you lose your device</p>
                        <button 
                          className="btn secondary"
                          onClick={() => setShowBackupCodes(!showBackupCodes)}
                        >
                          {showBackupCodes ? 'Hide' : 'Show'} Backup Codes
                        </button>
                        {showBackupCodes && (
                          <div className="backup-codes">
                            {backupCodes.map((code, i) => (
                              <div key={i} className="backup-code">{code}</div>
                            ))}
                            <button 
                              className="btn secondary"
                              onClick={() => {
                                const codesText = backupCodes.join('\n');
                                navigator.clipboard.writeText(codesText);
                                setMessage({ type: 'success', text: 'Backup codes copied!' });
                              }}
                            >
                              Copy All Codes
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {twoFactorEnabled && (
                <div className="twofa-enabled">
                  <div className="status-card success">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2L2 7v10c0 5.5 3.8 10.7 10 12 6.2-1.3 10-6.5 10-12V7l-10-5z" stroke="var(--green)" strokeWidth="2"/>
                      <path d="M9 12l2 2 4-4" stroke="var(--green)" strokeWidth="2"/>
                    </svg>
                    <h3>Two-Factor Authentication is Active</h3>
                    <p>Your account is protected with an additional layer of security</p>
                  </div>
                  
                  <div className="twofa-options">
<button className="btn secondary" onClick={handleRegenBackup} disabled={loading}>
  Generate New Backup Codes
</button>
                    <button 
                      className="btn danger"
                      onClick={handleDisable2FA}
                      disabled={loading}
                    >
                      Disable Two-Factor Authentication
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSecurityPage;

// Load Font Awesome (once)
if (!document.getElementById('fa-icons')) {
  const faLink = document.createElement('link');
  faLink.id = 'fa-icons';
  faLink.rel = 'stylesheet';
  faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css';
  faLink.crossOrigin = 'anonymous';
  faLink.referrerPolicy = 'no-referrer';
  document.head.appendChild(faLink);
}

// CSS
const style = document.createElement('style');
style.textContent = `
  /* Variables */
  :root {
    --blue: #1e88ff;
    --bg: #0f1220;
    --panel: #0f162b;
    --panel-2: #101a34;
    --text: #e8ecf3;
    --text-dim: #a9b3c9;
    --green: #1db954;
    --red: #ff5c5c;
    --amber: #ffb020;
    --shadow: 0 14px 40px rgba(0,0,0,.35);
  }
  
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
  
  /* Container */
  .security-container {
    min-height: 100vh;
    color: var(--text);
    padding: 24px;
  }
  
  /* Header */
  .security-header {
    max-width: 1200px;
    margin: 0 auto 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .security-header h1 {
    margin: 0 0 8px;
    font-size: 32px;
    font-weight: 800;
  }
  
  .subtitle {
    color: var(--text-dim);
    margin: 0;
  }
  
  .user-badge {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--panel);
    border: 1px solid #1f294a;
    border-radius: 12px;
    padding: 8px 16px;
  }
  
  .user-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--blue);
    color: white;
    display: grid;
    place-items: center;
    font-weight: 700;
  }
  
  .user-name {
    font-weight: 600;
    font-size: 14px;
  }
  
  .user-role {
    font-size: 12px;
    color: var(--text-dim);
  }
  
  /* Tabs */
  .tabs-container {
    max-width: 1200px;
    margin: 0 auto 24px;
    display: flex;
    gap: 8px;
    padding: 8px;
    background: var(--panel);
    border: 1px solid #1f294a;
    border-radius: 14px;
  }
  
  .tab {
    flex: 1;
    padding: 12px 16px;
    background: transparent;
    border: none;
    color: var(--text-dim);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
  }
  
  .tab:hover {
    background: #141e3a;
  }
  
  .tab.active {
    background: #142043;
    color: var(--text);
  }
  
  /* Message */
  .message {
    max-width: 1200px;
    margin: 0 auto 24px;
    padding: 12px 16px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    animation: slideIn 0.3s ease;
  }
  
  .message.success {
    background: rgba(29,185,84,.12);
    border: 1px solid rgba(29,185,84,.35);
    color: #7ae2b9;
  }
  
  .message.error {
    background: rgba(255,92,92,.12);
    border: 1px solid rgba(255,92,92,.35);
    color: #ff9d9d;
  }
  
  @keyframes slideIn {
    from { transform: translateY(-10px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  
  /* Tab Content */
  .tab-content {
    max-width: 1200px;
    margin: 0 auto;
  }
  
  .section-card {
    background: var(--panel);
    border: 1px solid #1f294a;
    border-radius: 16px;
    padding: 32px;
    box-shadow: var(--shadow);
  }
  
  .section-card h2 {
    margin: 0 0 8px;
    font-size: 24px;
    font-weight: 700;
  }
  
  .section-desc {
    color: var(--text-dim);
    margin: 0 0 32px;
  }
  
  /* Form Elements */
  .form-group {
    margin-bottom: 24px;
  }
  
  .form-group label {
    display: block;
    margin-bottom: 8px;
    color: #cfe0ff;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.3px;
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
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    cursor: pointer;
    font-size: 20px;
    opacity: 0.6;
    transition: opacity 0.15s;
  }
  
  .input-icon:hover {
    opacity: 1;
  }
  
  /* Password Strength */
  .strength-indicator {
    margin-top: 12px;
  }
  
  .strength-bar {
    width: 100%;
    height: 6px;
    background: #1a2344;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 8px;
  }
  
  .strength-fill {
    height: 100%;
    transition: width 0.3s ease;
  }
  
  .strength-text {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 12px;
  }
  
  .strength-requirements {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 8px;
  }
  
  .req {
    font-size: 12px;
    color: #7785ab;
    transition: color 0.15s;
  }
  
  .req.met {
    color: var(--green);
  }
  
  .field-error {
    color: var(--red);
    font-size: 12px;
    margin-top: 6px;
  }
  
  .field-success {
    color: var(--green);
    font-size: 12px;
    margin-top: 6px;
  }
  
  /* Buttons */
  .btn {
    padding: 12px 24px;
    border-radius: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    border: none;
    font-size: 14px;
  }
  
  .btn.primary {
    background: linear-gradient(180deg, #3f76ff, #315bff);
    color: white;
  }
  
  .btn.primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(30,136,255,.35);
  }
  
  .btn.secondary {
    background: #111a34;
    color: var(--text);
    border: 1px solid #2a3763;
  }
  
  .btn.secondary:hover:not(:disabled) {
    background: #141e3a;
  }
  
  .btn.danger {
    background: rgba(255,92,92,.12);
    color: #ff9d9d;
    border: 1px solid rgba(255,92,92,.35);
  }
  
  .btn.danger:hover:not(:disabled) {
    background: rgba(255,92,92,.18);
  }
  
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  /* Reset Section */
  .search-wrapper {
    display: flex;
    gap: 12px;
  }
  
  .search-wrapper .input {
    flex: 1;
  }
  
  .user-found {
    margin: 24px 0;
  }
  
  .user-card {
    background: #0a1228;
    border: 1px solid #1f294a;
    border-radius: 12px;
    padding: 20px;
  }
  
  .user-details h3 {
    margin: 0 0 4px;
    font-size: 18px;
  }
  
  .user-details p {
    margin: 0 0 8px;
    color: var(--text-dim);
    font-size: 14px;
  }
  
  .status-badge {
    display: inline-block;
    padding: 4px 10px;
    background: rgba(29,185,84,.12);
    border: 1px solid rgba(29,185,84,.35);
    color: #7ae2b9;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
  }
  
  .reset-actions {
    margin-top: 20px;
  }
  
  .reset-link {
    margin-bottom: 16px;
  }
  
  .reset-link label {
    display: block;
    margin-bottom: 8px;
    color: #cfe0ff;
    font-size: 13px;
    font-weight: 600;
  }
  
  .link-display {
    display: flex;
    gap: 12px;
    align-items: center;
    background: #0f162b;
    border: 1px solid #27325a;
    border-radius: 10px;
    padding: 12px;
  }
  
  .link-display code {
    flex: 1;
    font-family: monospace;
    color: #8fb4ff;
    font-size: 13px;
  }
  
  .copy-btn {
    padding: 6px 12px;
    background: #1a2344;
    border: 1px solid #2a3763;
    color: var(--text);
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.15s;
  }
  
  .copy-btn:hover {
    background: #1f2a4d;
  }
  
  .recent-resets {
    margin-top: 32px;
  }
  
  .recent-resets h3 {
    margin: 0 0 16px;
    font-size: 18px;
  }
  
  .reset-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .reset-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: #0a1228;
    border: 1px solid #1f294a;
    border-radius: 10px;
  }
  
  .reset-info strong {
    display: block;
    margin-bottom: 4px;
  }
  
  .reset-info span {
    font-size: 13px;
    color: var(--text-dim);
  }
  
  .reset-meta {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  .reset-date {
    font-size: 13px;
    color: var(--text-dim);
  }
  
  .reset-status {
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
  }
  
  .reset-status.completed {
    background: rgba(29,185,84,.12);
    color: #7ae2b9;
  }
  
  .reset-status.pending {
    background: rgba(255,176,32,.12);
    color: #ffd28a;
  }
  
  /* 2FA Section */
  .feature-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 24px;
  }
  
  .feature {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-dim);
  }
  
  .setup-steps {
    display: flex;
    flex-direction: column;
    gap: 32px;
  }
  
  .step {
    display: flex;
    gap: 20px;
  }
  
  .step-number {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--blue);
    color: white;
    display: grid;
    place-items: center;
    font-weight: 700;
    flex-shrink: 0;
  }
  
  .step-content {
    flex: 1;
  }
  
  .step-content h3 {
    margin: 0 0 8px;
    font-size: 18px;
  }
  
  .step-content p {
    margin: 0 0 16px;
    color: var(--text-dim);
    font-size: 14px;
  }
  
  .qr-container {
    margin: 16px 0;
  }
  
  .qr-placeholder {
    width: 200px;
    height: 200px;
    background: #0a1228;
    border: 1px solid #27325a;
    border-radius: 12px;
    display: grid;
    place-items: center;
    color: var(--text-dim);
  }
  
  .code-input {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  
  .code-input .input {
    width: 150px;
    font-size: 20px;
    text-align: center;
    letter-spacing: 8px;
    font-weight: 700;
  }
  
  .backup-codes {
    margin-top: 16px;
    padding: 16px;
    background: #0a1228;
    border: 1px solid #27325a;
    border-radius: 12px;
  }
  
  .backup-code {
    font-family: monospace;
    font-size: 14px;
    padding: 8px;
    margin-bottom: 8px;
    background: #0f162b;
    border-radius: 6px;
    color: #8fb4ff;
  }
  
  .status-card {
    padding: 32px;
    background: #0a1228;
    border: 1px solid #1f294a;
    border-radius: 12px;
    text-align: center;
    margin-bottom: 24px;
  }
  
  .status-card.success {
    border-color: rgba(29,185,84,.35);
    background: rgba(29,185,84,.08);
  }
  
  .status-card h3 {
    margin: 16px 0 8px;
    font-size: 20px;
  }
  
  .status-card p {
    margin: 0;
    color: var(--text-dim);
  }
  
  .twofa-options {
    display: flex;
    gap: 12px;
    justify-content: center;
  }
  
  /* Responsive */
  @media (max-width: 768px) {
    .security-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 16px;
    }
    
    .tabs-container {
      flex-direction: column;
    }
    
    .search-wrapper {
      flex-direction: column;
    }
    
    .twofa-options {
      flex-direction: column;
    }
    
    .twofa-options .btn {
      width: 100%;
    }
  }
`;
document.head.appendChild(style);