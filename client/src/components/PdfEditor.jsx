// src/components/PdfEditor.jsx
import React, { useEffect, useState } from "react";
import AdminPdfEditor from "./AdminPdfEditor";
import UserPdfSigner from "./UserPdfSigner";
import { FaUserShield, FaUser, FaExchangeAlt } from "react-icons/fa";

export default function PdfEditor({ mode: initialMode = "admin" }) {
  const [mode, setMode] = useState(() => {
    try {
      const saved = window.localStorage.getItem("pdfMode");
      if (saved === "admin" || saved === "user") return saved;
    } catch (_) {}
    return initialMode === "user" ? "user" : "admin";
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("pdfMode", mode);
    } catch (_) {}
  }, [mode]);

  return (
    <div className="pdf-editor-wrapper">
      <style>{CSS}</style>
      
      {/* Floating Mode Switcher */}
      <div className="mode-switcher-container">
        <div className="mode-switcher">
          <button 
            className={`mode-btn ${mode === 'admin' ? 'active' : ''}`}
            onClick={() => setMode("admin")}
            title="Administrator Editor"
          >
            <FaUserShield />
            <span>Admin</span>
          </button>
          <div className="mode-divider" />
          <button 
            className={`mode-btn ${mode === 'user' ? 'active' : ''}`}
            onClick={() => setMode("user")}
            title="User Signing View"
          >
            <FaUser />
            <span>User</span>
          </button>
        </div>
      </div>

      <main className="pdf-view-content fade-in">
        {mode === "user" ? <UserPdfSigner /> : <AdminPdfEditor />}
      </main>
    </div>
  );
}

const CSS = `
  .pdf-editor-wrapper { position: relative; min-height: 100%; }
  
  .mode-switcher-container {
    position: fixed;
    right: 32px;
    bottom: 32px;
    z-index: 4000;
    animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .mode-switcher {
    display: flex;
    align-items: center;
    background: #fff;
    padding: 6px;
    border-radius: 16px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
    backdrop-filter: blur(8px);
  }

  .mode-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 18px;
    border-radius: 12px;
    border: none;
    background: transparent;
    color: #64748b;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .mode-btn svg { font-size: 14px; opacity: 0.7; }

  .mode-btn:hover {
    color: #0f172a;
    background: #f1f5f9;
  }

  .mode-btn.active {
    background: #4f46e5;
    color: #ffffff;
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
  }

  .mode-btn.active svg { opacity: 1; }

  .mode-divider {
    width: 1px;
    height: 20px;
    background: #e2e8f0;
    margin: 0 4px;
  }

  .pdf-view-content { height: 100%; }

  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  @media (max-width: 640px) {
    .mode-switcher-container { right: 16px; bottom: 16px; }
    .mode-btn span { display: none; }
    .mode-btn { padding: 12px; }
  }
`;

export { AdminPdfEditor, UserPdfSigner };
