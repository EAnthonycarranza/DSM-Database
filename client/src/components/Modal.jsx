import React from "react";
import { useApp } from "../context/AppContext";
import StudentForm from "../pages/StudentForm";

import { FaTimes } from "react-icons/fa";

function TaskPlaceholder({ onClose }) {
  return (
    <div style={{ padding: 10 }}>
      <p style={{ marginTop: 0 }}>Task form (placeholder)</p>
      <button className="dsm-btn-ghost" onClick={onClose}>Close</button>
    </div>
  );
}

export default function Modal() {
  const { modal, setModal } = useApp();
  if (!modal?.open) return null;

  const close = () => setModal((m) => ({ ...m, open: false }));

  let title = modal.title || "Modal";
  let body = null;

  switch (modal.type) {
    case "student":
      title = modal.title || (modal.props?.existing?.id ? "Edit Student" : "Add Student");
      body = (
        <StudentForm
          existing={modal.props?.existing || null}
          cardStyle={{ width: "min(1100px, 95vw)" }}
          embedded
          onClose={close}
          onSaved={modal.props?.onSaved}
        />
      );
      break;

    case "task":
      title = modal.title || "Add Task";
      body = <TaskPlaceholder onClose={close} />;
      break;

    case "node":
      // render a provided React element safely
      body = modal.node || null;
      break;

    case "pdf":
      title = modal.title || "PDF Viewer";
      body = (
        <div className="pdf-viewer-container">
          <iframe
            src={modal.props?.url}
            title={title}
            width="100%"
            height="100%"
            style={{ border: "none", borderRadius: "12px" }}
          />
        </div>
      );
      break;

    case "image":
      title = modal.title || "Image Preview";
      body = (
        <div className="image-viewer-container">
          <img
            src={modal.props?.url}
            alt={title}
            style={{ maxWidth: "100%", maxHeight: "80vh", display: "block", margin: "0 auto", borderRadius: "12px" }}
          />
        </div>
      );
      break;

    case "text":
      body = <div>{String(modal.content ?? "")}</div>;
      break;

    case "confirm":
      title = modal.title || "Confirm Action";
      body = (
        <div style={{ padding: "8px 0" }}>
          <p style={{ margin: "0 0 24px 0", lineHeight: 1.6, color: "var(--text)" }}>
            {modal.props?.message || "Are you sure you want to proceed?"}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button className="dsm-btn-ghost" onClick={close}>Cancel</button>
            <button 
              className="dsm-btn-primary" 
              style={{ background: "#ef4444" }} 
              onClick={() => {
                modal.props?.onConfirm?.();
                close();
              }}
            >
              {modal.props?.confirmText || "Confirm"}
            </button>
          </div>
        </div>
      );
      break;

    default: {
      // HARDEN: if someone stuffs a non-element object into `content`, don't crash
      if (React.isValidElement(modal.content)) {
        body = modal.content;
      } else if (modal.content != null) {
        const text = typeof modal.content === "string"
          ? modal.content
          : JSON.stringify(modal.content, null, 2);
        body = <pre style={{ whiteSpace: "pre-wrap" }}>{text}</pre>;
      } else {
        body = null;
      }
      break;
    }
  }

  return (
    <div className="dsm-modal-overlay">
      <div className="dsm-modal-card" style={modal.props?.cardStyle}>
        <div className="dsm-modal-header">
          <h3>{title}</h3>
          <button className="dsm-close-btn" onClick={close}><FaTimes /></button>
        </div>
        <div className="dsm-modal-body">{body}</div>
      </div>
    </div>
  );
}
