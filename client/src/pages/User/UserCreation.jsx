import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import {
  FaUserPlus, FaUser, FaEnvelope, FaLock,
  FaCheckCircle, FaArrowLeft, FaSignInAlt, FaExclamationTriangle
} from "react-icons/fa";
import dsmLogo from "../../assets/images/DSM LOGO.png";

export default function UserCreation() {
  const { ready, authenticated, user } = useApp();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  const isStudent = String(user?.role || "").toLowerCase() === "student";

  useEffect(() => {
    if (ready && authenticated && isStudent) navigate("/dashboard", { replace: true });
  }, [ready, authenticated, isStudent, navigate]);

  const validate = () => {
    if (!firstName.trim() || !lastName.trim()) return "Full name is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Valid email is required.";
    if (username.trim().length < 3) return "Username too short.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    if (password !== confirm) return "Passwords do not match.";
    return null;
  };

  const onSubmit = async (e) => {
    e?.preventDefault?.();
    const v = validate();
    if (v) return setError(v);
    setError(""); setLoading(true);

    try {
      // 1) Student Record
      const stdRes = await fetch("/api/students", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, status: "Current", phase: "1" })
      });
      const student = await stdRes.json();
      if (!stdRes.ok) throw new Error(student.error || "Failed to create student profile");

      // 2) User Account
      const usrRes = await fetch("/api/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${firstName} ${lastName}`, username, email, password, role: "student", studentId: student.id })
      });
      const newUser = await usrRes.json();
      if (!usrRes.ok) {
        await fetch(`/api/students/${student.id}`, { method: "DELETE" }); // Rollback
        throw new Error(newUser.error || "Failed to create user account");
      }

      setSuccess({ student, user: newUser });
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  if (!ready) return <div className="auth-loading">Initializing Registry...</div>;

  return (
    <section className="auth-page fade-in">
      <style>{AUTH_CSS}</style>
      
      <div className="auth-card wide">
        <header className="auth-header">
          <div className="auth-logo">
            <img src={dsmLogo} alt="Discipleship School of Ministry" />
          </div>
          <div className="auth-divider"><span /></div>
          <h1>Create Account</h1>
          <p>Discipleship School of Ministry</p>
        </header>

        {error && (
          <div className="auth-alert">
            <FaExclamationTriangle />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="auth-success-view">
            <FaCheckCircle size={48} color="#10b981" />
            <h3>Registration Complete</h3>
            <p>Welcome, <strong>{firstName}</strong>. Your student profile and portal access have been provisioned.</p>
            <button className="auth-btn" onClick={() => navigate("/login")}>Proceed to Sign In <FaSignInAlt /></button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={onSubmit}>
            <div className="form-row">
              <div className="auth-group">
                <label><FaUser /> First Name</label>
                <div className="input-wrap">
                  <input value={firstName} onChange={e => setFirstName(e.target.value)} required placeholder="Jane" />
                </div>
              </div>
              <div className="auth-group">
                <label>Last Name</label>
                <div className="input-wrap">
                  <input value={lastName} onChange={e => setLastName(e.target.value)} required placeholder="Doe" />
                </div>
              </div>
            </div>

            <div className="auth-group">
              <label><FaEnvelope /> Email Address</label>
              <div className="input-wrap">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="jane@example.com" />
              </div>
            </div>

            <div className="auth-group">
              <label><FaUser /> Desired Username</label>
              <div className="input-wrap">
                <input value={username} onChange={e => setUsername(e.target.value)} required placeholder="janedoe24" />
              </div>
            </div>

            <div className="form-row">
              <div className="auth-group">
                <label><FaLock /> Password</label>
                <div className="input-wrap">
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
                </div>
              </div>
              <div className="auth-group">
                <label>Confirm</label>
                <div className="input-wrap">
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="••••••••" />
                </div>
              </div>
            </div>

            <button className="auth-btn success" type="submit" disabled={loading}>
              {loading ? 'Provisioning Account...' : 'Create My Account'} <FaUserPlus />
            </button>

            <button type="button" className="text-btn" onClick={() => navigate("/login")}>
              Already registered? <span className="link">Sign in here</span>
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

const AUTH_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');

  .auth-page {
    min-height: 100vh; display: grid; place-items: center; padding: 40px 20px;
    font-family: 'Inter', sans-serif;
    background:
      radial-gradient(circle at 15% 20%, rgba(201, 169, 97, 0.18), transparent 45%),
      radial-gradient(circle at 85% 80%, rgba(123, 31, 44, 0.12), transparent 45%),
      linear-gradient(180deg, #FAF6EE 0%, #F4ECDC 100%);
  }
  .auth-card {
    width: 100%; max-width: 440px; background: #FFFCF7; border-radius: 24px;
    padding: 48px 40px;
    box-shadow: 0 25px 50px -12px rgba(91, 38, 31, 0.18), 0 0 0 1px rgba(201, 169, 97, 0.25);
    border: 1px solid #E8DDC8;
    position: relative;
  }
  .auth-card.wide { max-width: 540px; }
  .auth-card::before {
    content: ""; position: absolute; top: 0; left: 24px; right: 24px;
    height: 3px; background: linear-gradient(90deg, transparent, #C9A961, #7B1F2C, #C9A961, transparent);
    border-radius: 3px;
  }

  .auth-header { text-align: center; margin-bottom: 28px; }
  .auth-logo {
    width: 88px; height: 88px; background: #FFFCF7; border-radius: 50%;
    display: grid; place-items: center; margin: 0 auto 18px;
    box-shadow: 0 8px 24px rgba(123, 31, 44, 0.25), 0 0 0 3px #C9A961, 0 0 0 5px rgba(201, 169, 97, 0.2);
    overflow: hidden; padding: 4px;
  }
  .auth-logo img { width: 100%; height: 100%; object-fit: contain; }
  .auth-divider { display: flex; align-items: center; gap: 8px; margin: 14px auto 16px; max-width: 200px; }
  .auth-divider::before, .auth-divider::after { content: ""; flex: 1; height: 1px; background: linear-gradient(90deg, transparent, rgba(123, 31, 44, 0.3), transparent); }
  .auth-divider span { width: 7px; height: 7px; border-radius: 50%; background: #C9A961; box-shadow: 0 0 8px rgba(201, 169, 97, 0.5); }

  .auth-header h1 { font-family: 'Playfair Display', Georgia, serif; font-size: 28px; font-weight: 800; margin: 0; color: #7B1F2C; letter-spacing: 0.3px; }
  .auth-header p { font-size: 12px; color: #6F5E5E; margin: 8px 0 0; letter-spacing: 1.4px; text-transform: uppercase; font-weight: 700; }

  .auth-alert { display: flex; align-items: center; gap: 12px; background: rgba(176, 38, 60, 0.08); color: #B0263C; padding: 12px 16px; border-radius: 12px; margin-bottom: 24px; font-size: 13px; font-weight: 600; border: 1px solid rgba(176, 38, 60, 0.2); }

  .auth-form { display: flex; flex-direction: column; gap: 18px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

  .auth-group { display: flex; flex-direction: column; gap: 8px; }
  .auth-group label { font-size: 11px; font-weight: 800; color: #7B1F2C; text-transform: uppercase; letter-spacing: 1.2px; display: flex; align-items: center; gap: 6px; }

  .input-wrap input { width: 100%; padding: 13px 16px; border-radius: 12px; border: 1.5px solid #E8DDC8; background: #FAF6EE; color: #2A1A1F; font-size: 15px; font-weight: 600; outline: none; transition: 0.2s; font-family: inherit; }
  .input-wrap input:focus { border-color: #7B1F2C; background: #FFFCF7; box-shadow: 0 0 0 4px rgba(123, 31, 44, 0.1); }

  .auth-btn { height: 52px; background: linear-gradient(135deg, #7B1F2C, #9B3041); color: #FFFCF7; border-radius: 14px; border: 1px solid rgba(201, 169, 97, 0.4); font-weight: 800; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; transition: 0.2s; box-shadow: 0 8px 20px rgba(123, 31, 44, 0.28); margin-top: 6px; letter-spacing: 1px; text-transform: uppercase; font-family: inherit; }
  .auth-btn:hover { background: linear-gradient(135deg, #5A1620, #7B1F2C); transform: translateY(-1px); }
  .auth-btn.success { background: linear-gradient(135deg, #2D5F3F, #3D7E55); border-color: rgba(201, 169, 97, 0.4); box-shadow: 0 8px 20px rgba(45, 95, 63, 0.28); }
  .auth-btn.success:hover { background: linear-gradient(135deg, #25543A, #2D5F3F); }
  .auth-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

  .auth-success-view { text-align: center; display: flex; flex-direction: column; gap: 20px; align-items: center; }
  .auth-success-view h3 { font-family: 'Playfair Display', Georgia, serif; font-size: 22px; font-weight: 800; margin: 0; color: #7B1F2C; }
  .auth-success-view p { font-size: 14px; color: #6F5E5E; line-height: 1.6; }
  .auth-success-view svg { color: #2D5F3F !important; }

  .text-btn { background: none; border: none; color: #6F5E5E; font-weight: 700; font-size: 13px; cursor: pointer; margin-top: 8px; transition: 0.2s; }
  .text-btn:hover { color: #7B1F2C; }
  .text-btn .link { color: #7B1F2C; font-weight: 800; }

  .auth-loading { height: 100vh; display: grid; place-items: center; background: #FAF6EE; color: #7B1F2C; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }

  @media (max-width: 640px) {
    .auth-page { padding: 16px 12px; }
    .form-row { grid-template-columns: 1fr; gap: 14px; }
    .auth-card { padding: 32px 22px; border-radius: 20px; }
    .auth-logo { width: 72px; height: 72px; }
    .auth-header { margin-bottom: 22px; }
    .auth-header h1 { font-size: 23px; }
    .auth-header p { font-size: 11px; }

    /* 16px+ to prevent iOS zoom */
    .input-wrap input { padding: 14px 16px; font-size: 16px; min-height: 50px; }
    .auth-btn { height: 54px; font-size: 14px; }
  }

  @media (max-width: 380px) {
    .auth-card { padding: 26px 16px; }
    .auth-logo { width: 64px; height: 64px; }
    .auth-header h1 { font-size: 20px; }
  }
`;
