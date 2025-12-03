import React from "react";
import { useApp } from "../context/AppContext";
import StudentForm from "../pages/StudentForm";

function TaskPlaceholder({ onClose }) {
  return (
    <div style={{ padding: 10 }}>
      <p style={{ marginTop: 0 }}>Task form (placeholder)</p>
      <button className="btn" onClick={onClose}>Close</button>
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

    case "text":
      body = <div>{String(modal.content ?? "")}</div>;
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
    <div className="modal show" role="dialog" aria-modal="true">
      <div className="modal-backdrop" onClick={close} />
      <div className="modal-card">
        <div className="modal-header">
          <strong>{title}</strong>
          <button className="btn small" onClick={close}>✖</button>
        </div>
        <div className="modal-body">{body}</div>
      </div>
    </div>
  );
}
