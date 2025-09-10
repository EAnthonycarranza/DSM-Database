import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";

export default function AdminProfilePage({
  initialProfile = {},
  onSave,
  enableLocalPersistence = true,
  storageKey = "admin_profile_page.v1",
}) {
  // Pull current user and helpers from app context
  const { user: me, api, refreshProfile, setToast } = useApp?.() || {};

  // --------------------------- Helpers ------------------------------------
  const merge = (a, b) => ({ ...a, ...b });

  const defaults = useMemo(
    () => ({
      fullName: "",
      username: "",
      email: "",
      role: "Administrator",
      department: "",
      phone: "",
      dob: "",
      bio: "",
      avatarDataUrl: "",
      preferences: {
        theme: "system", // system | light | dark
        language: "en",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        dateFormat: "YYYY-MM-DD",
        privacy: { showEmail: true, showSocials: true, searchable: false },
        notifications: { product: true, security: true, marketing: false },
      },
    }),
    []
  );

  // Map a user object from context/server to our profile shape
  const fromUser = useMemo(() => {
    if (!me) return null;
    const name = me.fullName || me.name || [me.firstName, me.lastName].filter(Boolean).join(" ");
    return {
      fullName: name || "",
      username: me.username || "",
      email: me.email || "",
      role: me.role || "",
      department: me.department || "",
      phone: me.phone || "",
      dob: me.dob || "",
      bio: me.bio || "",
      avatarDataUrl: me.avatarDataUrl || me.avatarUrl || "",
      preferences: merge(defaults.preferences, me.preferences || {}),
    };
  }, [me, defaults.preferences]);

  // Hydrate from localStorage if allowed
  const persisted = useMemo(() => {
    if (!enableLocalPersistence) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, [enableLocalPersistence, storageKey]);

  const [profile, setProfile] = useState(
    merge(defaults, merge(initialProfile || {}, merge(persisted || {}, fromUser || {})))
  );

  // Simple dirty tracking
  const [dirty, setDirty] = useState(false);

  // If user changes (login/refresh), hydrate fields when not dirty
  useEffect(() => {
    if (!fromUser) return;
    setProfile((p) => (dirty ? p : merge(p, fromUser)));
    // don't mark dirty when hydrating from server
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromUser?.email, fromUser?.username, fromUser?.role]);

  // Persist changes
  useEffect(() => {
    if (!enableLocalPersistence) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(profile));
    } catch {}
  }, [profile, enableLocalPersistence, storageKey]);

  // ------------------------ Avatar Upload ----------------------------------
  const [uploadErr, setUploadErr] = useState("");
  const inputRef = useRef(null);
  const dropRef = useRef(null);
  const pasteRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

  const triggerFile = () => inputRef.current?.click();

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  async function centerSquare(dataURL, maxSide = 512) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(img.width, img.height);
        const sx = Math.floor((img.width - s) / 2);
        const sy = Math.floor((img.height - s) / 2);
        const side = Math.min(maxSide, s);

        // draw to canvas
        const canvas = document.createElement("canvas");
        canvas.width = side;
        canvas.height = side;
        const ctx = canvas.getContext("2d");
        // high-quality scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, sx, sy, s, s, 0, 0, side, side);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => resolve(dataURL); // fallback: original
      img.src = dataURL;
    });
  }

  async function handleImageFile(file) {
    setUploadErr("");
    if (!file || !file.type?.startsWith("image/")) {
      setUploadErr("Please choose an image file.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setUploadErr("Image is too large. Max 5MB.");
      return;
    }
    try {
      const raw = await readAsDataURL(file);
      const sq = await centerSquare(raw, 512);
      setProfile((p) => ({ ...p, avatarDataUrl: sq }));
      setDirty(true);
    } catch (e) {
      setUploadErr("Failed to read image.");
    }
  }

  const onDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleImageFile(f);
  };
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = (e) => { e.preventDefault(); setDragOver(false); };
  const onPaste = async (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (!item) return;
    handleImageFile(item.getAsFile());
  };

  useEffect(() => {
    const el = pasteRef.current;
    if (!el) return;
    el.addEventListener("paste", onPaste);
    return () => el.removeEventListener("paste", onPaste);
  }, []);

  // --------------------------- Save/Reset ----------------------------------
  const [saving, setSaving] = useState(false);
  const doSave = async () => {
    setSaving(true);
    try {
      if (onSave) {
        await onSave(profile);
      } else {
        // Default: save to current user's record
        const id = me?.id || me?._id;
        if (!id) throw new Error("No current user id");
        const patch = {
          // keep both name and fullName aligned
          name: profile.fullName || "",
          fullName: profile.fullName || "",
          username: profile.username || "",
          email: profile.email || "",
          department: profile.department || "",
          phone: profile.phone || "",
          dob: profile.dob || "",
          bio: profile.bio || "",
          avatarDataUrl: profile.avatarDataUrl || "",
          preferences: profile.preferences || defaults.preferences,
          // do not allow role edits here
        };
        if (api && typeof api.update === "function") {
          await api.update("users", id, patch);
        } else {
          // Fallback to direct fetch against /api
          const res = await fetch(`/api/users/${encodeURIComponent(id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(patch),
          });
          if (!res.ok) {
            const t = await res.text().catch(() => "");
            throw new Error(`Save failed: ${res.status} ${t}`);
          }
        }
        await refreshProfile?.();
        setToast?.({ type: "success", text: "Profile saved" });
      }
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };
  const resetToInitial = () => {
    const base = merge(initialProfile || {}, fromUser || {});
    setProfile(merge(defaults, base));
    setDirty(true);
  };

  // -------------------------- Form helpers ---------------------------------
  const setField = (path, value) => {
    setProfile((p) => {
      const next = { ...p };
      const parts = path.split(".");
      let cur = next;
      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        cur[key] = cur[key] ? { ...cur[key] } : {};
        cur = cur[key];
      }
      cur[parts[parts.length - 1]] = value;
      return next;
    });
    setDirty(true);
  };

  // ------------------------------ UI ---------------------------------------
  return (
    <div className="ap-wrap" ref={pasteRef}>
      <style>{CSS}</style>

      {/* Header */}
      <div className="ap-header">
        <div className="ap-title">
          <h1>My Profile</h1>
          <p>Your personal information. Only you control what is visible.</p>
        </div>
        <div className="ap-cta">
          <button
            className="btn ghost"
            type="button"
            onClick={resetToInitial}
            title="Reset to provided initial values"
          >
            Reset
          </button>
          <button
            className="btn primary"
            disabled={saving || !dirty}
            onClick={doSave}
            title={dirty ? "Save changes" : "No changes to save"}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <div className="ap-grid">
        {/* Left: Avatar + Quick card */}
        <aside className="ap-left">
          <div
            className={`avatar-card ${dragOver ? "drag" : ""}`}
            ref={dropRef}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
          >
            <div className="avatar-preview">
              {profile.avatarDataUrl ? (
                <img src={profile.avatarDataUrl} alt="Avatar preview" />
              ) : (
                <div className="avatar-empty" aria-label="No avatar">
                  <span>Upload your photo</span>
                </div>
              )}
            </div>

            <div className="avatar-actions">
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleImageFile(e.target.files?.[0])}
                hidden
              />
              <button className="btn" type="button" onClick={triggerFile}>
                Upload image
              </button>
              {profile.avatarDataUrl && (
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => setField("avatarDataUrl", "")}
                >
                  Remove
                </button>
              )}
            </div>

            <div className="avatar-hint">
              <p><strong>Tips:</strong> Drag & drop, click to browse, or paste an image. Max 5MB. We center-crop to a square for you.</p>
              {uploadErr && <p className="err">{uploadErr}</p>}
            </div>
          </div>

        </aside>

        {/* Right: Form */}
        <main className="ap-right">
          <section className="card">
            <h2>Profile</h2>
            <div className="grid two">
              <div className="profile-field">
                <label>Full name</label>
                <input
                  className="input"
                  value={profile.fullName}
                  onChange={(e) => setField("fullName", e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="profile-field">
                <label>Username</label>
                <input
                  className="input"
                  value={profile.username}
                  onChange={(e) => setField("username", e.target.value)}
                  placeholder="janedoe"
                />
              </div>
              <div className="profile-field">
                <label>Email</label>
                <input
                  className="input"
                  type="email"
                  value={profile.email}
                  onChange={(e) => setField("email", e.target.value)}
                  placeholder="jane@example.com"
                />
              </div>
              <div className="profile-field">
                <label>Phone</label>
                <input
                  className="input"
                  value={profile.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  placeholder="+1 555 0101"
                />
              </div>
              <div className="profile-field">
                <label>Role</label>
                <input
                  className="input"
                  value={profile.role}
                  readOnly
                  aria-readonly="true"
                />
              </div>
              <div className="profile-field">
                <label>Department</label>
                <input
                  className="input"
                  value={profile.department}
                  onChange={(e) => setField("department", e.target.value)}
                  placeholder="Operations"
                />
              </div>
              <div className="profile-field">
                <label>Date of birth</label>
                <input
                  className="input"
                  type="date"
                  value={profile.dob}
                  onChange={(e) => setField("dob", e.target.value)}
                />
              </div>
            </div>
            <div className="profile-field">
              <label>Bio</label>
              <textarea
                className="input"
                rows={4}
                value={profile.bio}
                onChange={(e) => setField("bio", e.target.value)}
                placeholder="A short description about you."
              />
            </div>
          </section>

          {/* Password Help ONLY (Security section removed) */}
          <section className="card">
            <h2>Password help</h2>
            <p className="help">
              Having password issues? <a href="/password-reset">Reset your password</a>.
            </p>
          </section>

          {/* Live JSON view (dev aid) */}
          <details className="card" style={{ opacity: 0.9 }}>
            <summary>Debug: Current profile JSON</summary>
            <pre className="json-view">{JSON.stringify(profile, null, 2)}</pre>
          </details>
        </main>
      </div>
    </div>
  );
}


// ------------------------------- CSS ---------------------------------------
const CSS = `
/* Scoped to the profile page; inherits global theme tokens from index.css */
.ap-wrap{max-width:1200px; margin:24px auto; padding:0 16px; color:var(--text)}

/* Header */
.ap-header{display:flex; align-items:center; gap:16px; border-bottom:1px solid var(--stroke); padding-bottom:16px; margin-bottom:16px}
.ap-title h1{margin:0 0 4px; font-size:22px}
.ap-title p{margin:0; color:var(--text-dim)}
.ap-cta{margin-left:auto; display:flex; gap:10px}

/* Buttons & inputs */
.btn{appearance:none; border:1px solid var(--stroke); background:var(--panel-2); color:var(--text); padding:8px 12px; border-radius:10px; cursor:pointer; font-weight:700}
.btn:hover{border-color:color-mix(in srgb, var(--stroke), #fff 15%); background:var(--panel)}
.btn.primary{background:var(--blue); border-color:transparent; color:#fff}
.btn.primary:disabled{opacity:.5; cursor:not-allowed}
.btn.ghost{background:transparent}
.input{width:100%; padding:10px 12px; border:1px solid var(--stroke); background:var(--panel-2); color:var(--text); border-radius:10px}
.input:focus{outline:none; border-color:var(--blue); box-shadow:0 0 0 3px color-mix(in srgb, var(--blue) 30%, transparent)}
label{font-weight:700; color:color-mix(in srgb, var(--text) 85%, #000); display:block; margin-bottom:6px}
.profile-field{margin-bottom:12px}
.help{color:var(--text-dim); margin:4px 0 0}
.err{color:#ff9b9b; margin:6px 0 0}

/* Grid */
.ap-grid{display:grid; grid-template-columns:320px 1fr; gap:16px}
@media (max-width: 980px){ .ap-grid{grid-template-columns:1fr} .ap-left{order:2} .ap-right{order:1} }

/* Cards */
.card{background:var(--panel); border:1px solid var(--stroke); padding:16px; border-radius:14px; box-shadow:var(--shadow)}
.card h2{margin:0 0 12px}
.subcard{margin-top:12px; padding-top:12px; border-top:1px dashed var(--stroke)}

/* Layout helpers */
.grid.two{display:grid; grid-template-columns:1fr 1fr; gap:12px}
.grid.three{display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px}
.row{display:flex; align-items:center; gap:10px}
.row.space{justify-content:space-between}

/* Avatar */
.avatar-card{position:sticky; top:16px; background:var(--panel); border:1px solid var(--stroke); padding:14px; border-radius:14px}
.avatar-card.drag{outline:2px dashed var(--blue); outline-offset:4px}
.avatar-preview{display:grid; place-items:center; width:100%;}
.avatar-preview img,.avatar-empty{width:180px; height:180px; border-radius:50%; border:3px solid var(--stroke); background:var(--panel-2); box-shadow:0 10px 30px rgba(0,0,0,.35); object-fit:cover}
.avatar-empty{display:grid; place-items:center; text-align:center; color:var(--text-dim); padding:12px}
.avatar-actions{display:flex; gap:8px; margin-top:12px}
.avatar-hint{font-size:12px; color:var(--text-dim)}

/* Switch (kept for potential future toggles) */
.switch{display:inline-flex; align-items:center; gap:10px}
.switch input{appearance:none; width:48px; height:28px; border-radius:20px; background:var(--panel-2); border:1px solid var(--stroke); position:relative; cursor:pointer}
.switch input:checked{background:color-mix(in srgb, var(--blue) 55%, var(--panel))}
.switch input+span{display:inline-block; width:20px; height:20px; border-radius:50%; background:#cfe0ff; transform:translateX(4px); transition:transform .20s ease}
.switch input:checked+span{transform:translateX(24px)}

/* JSON */
.json-view{max-height:260px; overflow:auto; background:var(--panel-2); border:1px solid var(--stroke); border-radius:10px; padding:12px}
`;