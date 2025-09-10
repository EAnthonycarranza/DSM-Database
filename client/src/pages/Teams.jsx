import React from "react";
import { useApp } from "../context/AppContext";

export default function Teams() {
  const { data, user, presenceFor } = useApp();
  const allUsers = Array.isArray(data?.users) ? data.users : [];
  // Only show admins on Teams
  const users = allUsers.filter((u) => String(u?.role || "").toLowerCase() === "admin");

  // Local tick to age presence labels (no network)
  const [tick, forceTick] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => forceTick(v => v + 1), 60000); // 60s
    return () => clearInterval(t);
  }, []);

  // --- Socket.IO debug wiring (client-side only) ---
  // Logs when the socket connects/disconnects and when presence events arrive.
  React.useEffect(() => {
    const s = typeof window !== "undefined" ? window.__DSM_SOCKET__ : null;
    if (!s) {
      if (typeof window !== "undefined" && window.__DSM_DEBUG_SOCKET__) {
        console.log("[Teams] No window.__DSM_SOCKET__ found. AppContext should create it when authenticated.");
      }
      return;
    }

    const onConnect = () => console.log("[Teams] socket connected", s.id);
    const onDisconnect = (reason) => console.log("[Teams] socket disconnected", reason);
    const onError = (err) => console.log("[Teams] socket connect_error", err?.message || err);
    const onPresence = (payload) => console.log("[Teams] presence:user", payload);
    const onBulk = (list) => console.log("[Teams] presence:bulk", list);

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onError);
    s.on("presence:user", onPresence);
    s.on("presence:bulk", onBulk);

    // Ask server to send a snapshot and announce myself
    try {
      s.emit("presence:hello", { id: user?.id, role: user?.role });
    } catch {}

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("connect_error", onError);
      s.off("presence:user", onPresence);
      s.off("presence:bulk", onBulk);
    };
  }, [user?.id, user?.role]);

  // --- Log derived status changes for the grid (even without socket) ---
  const lastStatusesRef = React.useRef(new Map());
  React.useEffect(() => {
  users.forEach((u) => {
      const raw = presenceFor(u);
      const status = String(raw || "").toLowerCase() === "away" ? "online" : (raw || "offline");
      const prev = lastStatusesRef.current.get(u.id);
      if (prev !== status) {
        console.log("[Teams] status change", { id: u.id, name: u.name, prev, next: status });
        lastStatusesRef.current.set(u.id, status);
      }
    });
  }, [users, presenceFor, tick]);

const presenceColor = (p) => {
  const v = String(p).toLowerCase();
  if (v === "online" || v === "away") return "#10B981"; // treat "away" like "online"
  return "#9CA3AF";
};
  const initials = (u) =>
    (u.initials ||
      (u.name || "")
        .split(" ")
        .map((n) => n[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
    ).toUpperCase();

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Team</h1>
      <p style={{ color: "#6B7280", marginBottom: 24 }}>
        Team members and their current status.
      </p>

      {!users.length ? (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid #E5E7EB",
            color: "#6B7280",
          }}
        >
          No team members found.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          {users.map((u) => {
            const rawStatus = presenceFor(u);
            const status = String(rawStatus || "").toLowerCase() === "away" ? "online" : rawStatus;
            return (
            <div
              key={u.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 16,
                border: "1px solid #E5E7EB",
                borderRadius: 12,
              }}
            >
              <div
                aria-label={`${u.name} avatar`}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: "#0EA5E9",
                  color: "#FFF",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 700,
                }}
              >
                {initials(u)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {u.name}
                  </strong>
                  {u.id === user?.id && (
                    <span
                      style={{
                        fontSize: 12,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "#DBEAFE",
                        color: "#1E40AF",
                      }}
                    >
                      You
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "#F3F4F6",
                      color: "#374151",
                    }}
                  >
                    {u.role || "—"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#6B7280", marginTop: 4 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: presenceColor(status),
                    }}
                  />
                  <span style={{ fontSize: 12 }}>{status}</span>
                </div>
              </div>
            </div>
          ); })}
        </div>
      )}
    </div>
  );
}
