import React, { useEffect, useState } from "react";
import AdminPdfEditor from "./AdminPdfEditor";
import UserPdfSigner from "./UserPdfSigner";

// FILE: src/components/PdfEditor.jsx
// Wrapper with an in-app mode switch between Admin and User views.
// Persists last selection in localStorage under key "pdfMode".
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
    <>
      {/* Floating mode switch (bottom-right) */}
      <div
        style={{
          position: "fixed",
          right: 24,
          bottom: 24,
          zIndex: 4000,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            background: "#ffffff",
            borderRadius: 12,
            boxShadow: "0 10px 25px rgba(0,0,0,.15)",
            overflow: "hidden",
            border: "1px solid rgba(226,232,240,1)",
          }}
        >
          <button
            onClick={() => setMode("admin")}
            style={{
              padding: "10px 14px",
              border: "none",
              background: mode === "admin" ? "#4f46e5" : "transparent",
              color: mode === "admin" ? "#fff" : "#1e293b",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Admin
          </button>
          <button
            onClick={() => setMode("user")}
            style={{
              padding: "10px 14px",
              border: "none",
              background: mode === "user" ? "#4f46e5" : "transparent",
              color: mode === "user" ? "#fff" : "#1e293b",
              fontWeight: 600,
              cursor: "pointer",
              borderLeft: "1px solid rgba(226,232,240,1)",
            }}
          >
            User
          </button>
        </div>
      </div>

      {mode === "user" ? <UserPdfSigner /> : <AdminPdfEditor />}
    </>
  );
}

export { AdminPdfEditor, UserPdfSigner };