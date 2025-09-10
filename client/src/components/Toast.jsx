import React, { useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";

// Accepts either a string or an object like { text, type } or { msg, kind }
export default function Toast() {
  const { toast, setToast } = useApp();

  // Normalize toast payloads coming from different parts of the app
  const { text, level } = useMemo(() => {
    if (!toast) return { text: "", level: "" };
    if (typeof toast === "string") return { text: toast, level: "" };
    if (typeof toast === "object") {
      const t = toast.text || toast.msg || toast.message || toast.body || toast.title || "";
      const lvl = (toast.type || toast.kind || toast.level || "").toString();
      return { text: t, level: lvl };
    }
    try { return { text: String(toast), level: "" }; } catch { return { text: "", level: "" }; }
  }, [toast]);

  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [text, setToast]);

  const show = !!text;
  const lvlCls = (level || "").toLowerCase(); // e.g., success | error | warn | info
  return (
    <div
      id="toast"
      className={`toast ${show ? "show" : ""} ${lvlCls}`}
      role="status"
      aria-live="polite"
    >
      {text}
    </div>
  );
}
