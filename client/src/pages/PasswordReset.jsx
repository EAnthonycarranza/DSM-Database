// src/pages/PasswordReset.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { 
  FaShieldAlt, FaKey, FaUserShield, FaCheckCircle, 
  FaExclamationCircle, FaCopy, FaEye, FaEyeSlash, 
  FaSync, FaSearch, FaChevronRight, FaLock, FaUserCheck,
  FaSave, FaTrash, FaTimes, FaQrcode
} from "react-icons/fa";

export default function AdminSecurityPage() {
  const { user, api, data, refreshStore, serverOnline, setToast, refreshProfile } = useApp();
  const currentUser = user || { name: 'Staff', email: '', role: 'Admin' };
  
  const [activeTab, setActiveTab] = useState('password');
  const [loading, setLoading] = useState(false);

  // Password Change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState({});

  // User Lookup
  const [lookupEmail, setLookupEmail] = useState('');
  const [foundUser, setFoundUser] = useState(null);
  const [resetResult, setResetResult] = useState(null);

  // 2FA
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(!!user?.twoFactor?.enabled);
  const [qrData, setQrData] = useState(null);
  const [vCode, setVCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [step2FA, setStep2FA] = useState('idle'); // idle | setup | verify | success

  useEffect(() => {
    setTwoFactorEnabled(!!user?.twoFactor?.enabled);
  }, [user]);

  const passwordStrength = useMemo(() => {
    if (!newPassword) return { score: 0, text: 'Empty', color: '#94a3b8' };
    let s = 0;
    if (newPassword.length >= 8) s += 25;
    if (/[A-Z]/.test(newPassword)) s += 25;
    if (/[0-9]/.test(newPassword)) s += 25;
    if (/[^A-Za-z0-9]/.test(newPassword)) s += 25;
    
    if (s <= 25) return { score: s, text: 'Weak', color: '#ef4444' };
    if (s <= 50) return { score: s, text: 'Fair', color: '#f59e0b' };
    if (s <= 75) return { score: s, text: 'Good', color: '#10b981' };
    return { score: s, text: 'Strong', color: '#6366f1' };
  }, [newPassword]);

  const handleUpdatePassword = async () => {
    if (!newPassword) return;
    if (newPassword !== confirmPassword) {
      return setToast({ type: 'warn', text: "Passwords do not match" });
    }
    setLoading(true);
    try {
      // For simplicity in this implementation, we use the generic PUT.
      // A more secure implementation would verify currentPassword on the server.
      await api.put("users", { ...user, password: newPassword });
      setToast({ type: 'success', text: "Password updated successfully" });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      setToast({ type: 'error', text: "Failed to update password" });
    } finally { setLoading(false); }
  };

  const handleLookup = async () => {
    setLoading(true); setFoundUser(null); setResetResult(null);
    try {
      const u = data?.users?.find(x => x.email?.toLowerCase() === lookupEmail.toLowerCase());
      if (u) {
        setFoundUser(u);
      } else {
        setToast({ type: 'warn', text: "User not found" });
      }
    } finally { setLoading(false); }
  };

  const handleTriggerReset = async () => {
    if (!foundUser?.email) return;
    setLoading(true);
    try {
      const res = await api.resetPasswordRequest(foundUser.email);
      setResetResult(res);
      setToast({ type: 'success', text: "Reset process initiated" });
    } catch (e) {
      setToast({ type: 'error', text: "Failed to initiate reset" });
    } finally { setLoading(false); }
  };

  const init2FA = async () => {
    setLoading(true);
    try {
      const res = await api.start2FA(user.id);
      setQrData(res);
      setStep2FA('verify');
    } catch (e) {
      setToast({ type: 'error', text: "Failed to start 2FA setup" });
    } finally { setLoading(false); }
  };

  const verify2FA = async () => {
    if (!vCode) return;
    setLoading(true);
    try {
      const res = await api.verify2FA(user.id, vCode);
      setBackupCodes(res.backupCodes || []);
      setStep2FA('success');
      setTwoFactorEnabled(true);
      await refreshProfile();
    } catch (e) {
      setToast({ type: 'error', text: "Invalid verification code" });
    } finally { setLoading(false); }
  };

  const disable2FA = async () => {
    if (!window.confirm("Are you sure you want to disable 2FA? This lowers your account security.")) return;
    setLoading(true);
    try {
      await api.disable2FA(user.id);
      setTwoFactorEnabled(false);
      setStep2FA('idle');
      setToast({ type: 'success', text: "2FA disabled" });
      await refreshProfile();
    } catch (e) {
      setToast({ type: 'error', text: "Failed to disable 2FA" });
    } finally { setLoading(false); }
  };

  return (
    <section className="sec-page fade-in">
      <style>{SEC_CSS}</style>
      
      <header className="sec-header">
        <div>
          <h1 className="sec-title">Security & Access</h1>
          <p className="sec-subtitle">Identity management and account protection.</p>
        </div>
        <div className="sec-tabs">
          <button className={activeTab === 'password' ? 'active' : ''} onClick={() => setActiveTab('password')}><FaKey /> My Password</button>
          <button className={activeTab === 'reset' ? 'active' : ''} onClick={() => setActiveTab('reset')}><FaUserShield /> User Reset</button>
          <button className={activeTab === '2fa' ? 'active' : ''} onClick={() => setActiveTab('2fa')}><FaShieldAlt /> Two-Factor</button>
        </div>
      </header>

      <div className="sec-grid">
        <main className="sec-main">
          {activeTab === 'password' && (
            <div className="sec-card">
              <div className="card-head"><h3><FaLock /> Update Access Key</h3></div>
              <div className="card-body">
                <div className="sec-form">
                  <div className="group">
                    <label>New Password</label>
                    <div className="input-wrap">
                      <input type={showPw.new ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" />
                      <button className="pw-toggle" onClick={() => setShowPw(p => ({...p, new: !p.new}))}>{showPw.new ? <FaEyeSlash /> : <FaEye />}</button>
                    </div>
                    {newPassword && (
                      <div className="strength-bar"><div className="fill" style={{ width: `${passwordStrength.score}%`, background: passwordStrength.color }} /></div>
                    )}
                  </div>
                  <div className="group">
                    <label>Confirm New Password</label>
                    <div className="input-wrap">
                      <input type={showPw.conf ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" />
                      <button className="pw-toggle" onClick={() => setShowPw(p => ({...p, conf: !p.conf}))}>{showPw.conf ? <FaEyeSlash /> : <FaEye />}</button>
                    </div>
                  </div>
                  <button className="sec-btn primary" disabled={!newPassword || loading} onClick={handleUpdatePassword}>
                    {loading ? <FaSync className="spin" /> : <FaSave />} Synchronize Key
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'reset' && (
            <div className="sec-card">
              <div className="card-head"><h3><FaUserShield /> User Recovery</h3></div>
              <div className="card-body">
                <div className="search-box">
                  <input placeholder="Search user email..." value={lookupEmail} onChange={e => setLookupEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLookup()} />
                  <button className="sec-btn secondary" onClick={handleLookup} disabled={loading}><FaSearch /> Find</button>
                </div>
                {foundUser && (
                  <div className="found-user-card fade-in">
                    <div className="u-info">
                      <div className="u-name">{foundUser.name}</div>
                      <div className="u-email">{foundUser.email}</div>
                    </div>
                    
                    {resetResult?.link && (
                      <div className="reset-result">
                        <div className="token-row">
                          <code>{resetResult.link}</code>
                          <button className="copy-btn" onClick={() => { navigator.clipboard.writeText(resetResult.link); setToast("Link copied"); }}><FaCopy /></button>
                        </div>
                        <p className="hint">Copy this link and send it to the user if email is not configured.</p>
                      </div>
                    )}

                    <button className="sec-btn primary" onClick={handleTriggerReset} disabled={loading}>
                      {loading ? <FaSync className="spin" /> : <FaSync />} Trigger Reset Email
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === '2fa' && (
            <div className="sec-card">
              <div className="card-head"><h3><FaShieldAlt /> Two-Factor Authentication</h3></div>
              <div className="card-body">
                {twoFactorEnabled && step2FA !== 'success' ? (
                  <div className="status-hero success">
                    <FaCheckCircle size={48} color="#10b981" />
                    <h3>Your Account is Hardened</h3>
                    <p>Standard 2FA verification is currently active.</p>
                    <button className="sec-btn danger small" onClick={disable2FA} disabled={loading}>
                      {loading ? <FaSync className="spin" /> : null} Disable Security Layer
                    </button>
                  </div>
                ) : (
                  <>
                    {step2FA === 'idle' && (
                      <div className="status-hero info">
                        <FaShieldAlt size={48} color="#6366f1" />
                        <h3>Enhance Account Security</h3>
                        <p>Add an extra layer of protection using an authenticator app.</p>
                        <button className="sec-btn primary" onClick={init2FA} disabled={loading}>
                          {loading ? <FaSync className="spin" /> : null} Initialize 2FA Setup
                        </button>
                      </div>
                    )}

                    {step2FA === 'verify' && qrData && (
                      <div className="setup-2fa fade-in">
                        <div className="setup-grid">
                          <div className="qr-col">
                            <img src={qrData.qrDataUrl} alt="2FA QR Code" className="qr-img" />
                          </div>
                          <div className="instr-col">
                            <h4>Step 1: Scan QR Code</h4>
                            <p>Open your authenticator app (Google Authenticator, Authy, etc.) and scan the code on the left.</p>
                            
                            <h4>Step 2: Enter Verification Code</h4>
                            <div className="vcode-input">
                              <input value={vCode} onChange={e => setVCode(e.target.value.replace(/\D/g, '').slice(0,6))} placeholder="000000" maxLength={6} />
                              <button className="sec-btn primary" onClick={verify2FA} disabled={vCode.length < 6 || loading}>
                                {loading ? <FaSync className="spin" /> : "Verify & Enable"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {step2FA === 'success' && (
                      <div className="success-2fa fade-in">
                        <div className="status-hero success" style={{ padding: 0 }}>
                          <FaCheckCircle size={48} color="#10b981" />
                          <h3>2FA Successfully Enabled</h3>
                          <p>Keep these backup codes in a safe place. They can be used to access your account if you lose your device.</p>
                        </div>
                        <div className="backup-codes-grid">
                          {backupCodes.map(code => <code key={code}>{code}</code>)}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
                          <button className="sec-btn secondary" onClick={() => setStep2FA('idle')}>Finish Setup</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </main>

        <aside className="sec-aside">
          <div className="sec-card info">
            <div className="card-head">Staff Identity</div>
            <div className="aside-user">
              <div className="av-large">{(currentUser.name || 'U')[0].toUpperCase()}</div>
              <div className="u-details">
                <div className="u-name">{currentUser.name}</div>
                <div className="u-role">{currentUser.role}</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

const SEC_CSS = `
  .sec-page { padding: 8px 0; max-width: 1200px; margin: 0 auto; }
  .sec-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; padding: 0 4px; }
  .sec-title { font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -0.5px; }
  .sec-subtitle { color: var(--text-muted); margin: 4px 0 0; font-size: 15px; font-weight: 500; }

  .sec-tabs { display: flex; background: var(--bg); padding: 4px; border-radius: 14px; gap: 4px; }
  .sec-tabs button { display: flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 10px; font-size: 14px; font-weight: 700; color: var(--text-muted); transition: 0.2s; border: none; background: none; cursor: pointer; }
  .sec-tabs button.active { background: var(--surface); color: var(--primary); box-shadow: var(--shadow); }

  .sec-grid { display: grid; grid-template-columns: 1fr 320px; gap: 32px; }
  .sec-card { background: var(--surface); border-radius: 24px; border: 1px solid var(--border); box-shadow: var(--shadow); overflow: hidden; }
  .card-head { padding: 24px 32px; border-bottom: 1px solid var(--border); }
  .card-head h3 { font-size: 16px; font-weight: 800; margin: 0; display: flex; align-items: center; gap: 10px; }
  
  .card-body { padding: 32px; }
  .sec-form { display: flex; flex-direction: column; gap: 24px; max-width: 480px; }
  .group { display: flex; flex-direction: column; gap: 8px; }
  .group label { font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; }
  
  .input-wrap { position: relative; }
  .input-wrap input { width: 100%; padding: 14px 16px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 15px; font-weight: 600; outline: none; }
  .pw-toggle { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 16px; border: none; background: none; cursor: pointer; }

  .strength-bar { height: 4px; background: var(--border); border-radius: 4px; margin-top: 8px; overflow: hidden; }
  .strength-bar .fill { height: 100%; transition: 0.3s; }

  .sec-btn { height: 48px; padding: 0 24px; border-radius: 14px; font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 10px; transition: 0.2s; cursor: pointer; border: none; }
  .sec-btn.primary { background: var(--primary); color: white; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2); }
  .sec-btn.secondary { background: var(--bg); color: var(--text); border: 1px solid var(--border); }
  .sec-btn.danger { background: #fff1f2; color: #ef4444; border: 1px solid #fecdd3; }
  .sec-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .search-box { display: flex; gap: 12px; margin-bottom: 32px; }
  .search-box input { flex: 1; padding: 12px 16px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg); font-weight: 600; color: var(--text); outline: none; }

  .found-user-card { background: var(--bg); border-radius: 16px; padding: 24px; border: 1px solid var(--border); }
  .u-info .u-name { font-size: 18px; font-weight: 800; color: var(--text); }
  .u-info .u-email { font-size: 14px; color: var(--text-muted); margin-top: 2px; }
  .token-row { margin: 20px 0; background: var(--surface); padding: 12px 16px; border-radius: 10px; display: flex; align-items: center; gap: 12px; border: 1px solid var(--border); }
  .token-row code { flex: 1; font-family: monospace; font-size: 13px; color: var(--primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .copy-btn { width: 36px; height: 36px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text-muted); cursor: pointer; display: grid; place-items: center; transition: 0.2s; }
  .copy-btn:hover { color: var(--primary); border-color: var(--primary); }
  .hint { font-size: 12px; color: var(--text-muted); margin-top: -12px; margin-bottom: 24px; }

  .status-hero { text-align: center; padding: 40px 20px; }
  .status-hero h3 { font-size: 20px; font-weight: 800; margin: 20px 0 8px; }
  .status-hero p { color: var(--text-muted); font-size: 14px; margin-bottom: 32px; }

  .setup-2fa { max-width: 600px; margin: 0 auto; }
  .setup-grid { display: grid; grid-template-columns: 200px 1fr; gap: 40px; align-items: center; }
  .qr-col { background: white; padding: 16px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
  .qr-img { width: 100%; display: block; }
  .instr-col h4 { margin: 0 0 8px; font-size: 15px; font-weight: 800; }
  .instr-col p { font-size: 13px; color: var(--text-muted); margin-bottom: 24px; }
  .vcode-input { display: flex; gap: 12px; }
  .vcode-input input { width: 120px; text-align: center; font-size: 24px; font-weight: 800; letter-spacing: 4px; padding: 8px; border-radius: 12px; border: 2px solid var(--border); background: var(--bg); color: var(--text); outline: none; }
  .vcode-input input:focus { border-color: var(--primary); }

  .backup-codes-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: var(--bg); padding: 24px; border-radius: 16px; border: 1px dashed var(--border); }
  .backup-codes-grid code { font-family: monospace; font-size: 15px; font-weight: 700; color: var(--text); text-align: center; }

  .av-large { width: 80px; height: 80px; border-radius: 24px; background: linear-gradient(135deg, var(--primary), #a855f7); color: white; display: grid; place-items: center; font-size: 32px; font-weight: 800; margin-bottom: 20px; }
  .aside-user { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 20px 0; }
  .aside-user .u-name { font-size: 17px; font-weight: 800; }
  .aside-user .u-role { font-size: 12px; font-weight: 700; color: var(--primary); text-transform: uppercase; margin-top: 4px; }

  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  @media (max-width: 900px) {
    .sec-grid { grid-template-columns: 1fr; }
    .sec-aside { order: -1; }
    .setup-grid { grid-template-columns: 1fr; justify-items: center; text-align: center; gap: 32px; }
    .vcode-input { justify-content: center; }
  }
`;
