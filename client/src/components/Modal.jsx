import React from "react";
import { useApp } from "../context/AppContext";
import StudentForm from "../pages/StudentForm";

import { FaTimes, FaUserPlus, FaUnlockAlt, FaShieldAlt, FaKey } from "react-icons/fa";

function AdminCreateModal({ onClose, onSuccess }) {
  const { api } = useApp();
  const [form, setForm] = React.useState({ name: "", email: "", username: "", password: "", role: "Admin" });
  const [loading, setLoading] = React.useState(false);

  const save = async () => {
    if (!form.name || !form.email || !form.username || !form.password) return alert("Please fill all fields");
    setLoading(true);
    try {
      await api.post("users", form);
      onSuccess?.();
      onClose();
    } catch (err) {
      alert("Failed to create admin");
    } finally { setLoading(false); }
  };

  return (
    <div className="admin-modal-form">
      <div className="form-group">
        <label>Full Name</label>
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Alice Johnson" />
      </div>
      <div className="form-group">
        <label>Email Address</label>
        <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="alice@dsm.com" />
      </div>
      <div className="form-group">
        <label>Username</label>
        <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="alice_admin" />
      </div>
      <div className="form-group">
        <label>Initial Password</label>
        <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
      </div>
      <div className="modal-actions">
        <button className="pro-btn" onClick={onClose}>Cancel</button>
        <button className="pro-btn primary" onClick={save} disabled={loading}>{loading ? "Provisioning..." : "Create Administrator"}</button>
      </div>
    </div>
  );
}

function AdminRecoverModal({ user, onClose }) {
  const { api, setToast } = useApp();
  const [pass, setPass] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const recover = async () => {
    if (!pass) return alert("Please enter a new password");
    setLoading(true);
    try {
      await api.put("users", { ...user, password: pass });
      setToast({ type: "success", text: `Credentials reset for ${user.name}` });
      onClose();
    } catch (err) {
      alert("Recovery failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="admin-modal-form">
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
        You are resetting the credentials for <strong>{user?.name}</strong> ({user?.username}). 
        They will be required to use this password on their next login.
      </p>
      <div className="form-group">
        <label>New Master Password</label>
        <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Enter new password" />
      </div>
      <div className="modal-actions">
        <button className="pro-btn" onClick={onClose}>Cancel</button>
        <button className="pro-btn primary" onClick={recover} disabled={loading}>{loading ? "Resetting..." : "Confirm Recovery"}</button>
      </div>
    </div>
  );
}

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

    case "admin_create":
      title = modal.title || "Create Admin Account";
      body = <AdminCreateModal onClose={close} onSuccess={modal.props?.onSuccess} />;
      break;

    case "admin_recover":
      title = modal.title || "Recover Admin Account";
      body = <AdminRecoverModal user={modal.props?.user} onClose={close} />;
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
