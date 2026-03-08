import { useEffect, useState } from "react";

export function CollaborationStatus({ status, peers, awareness }) {
  const [remoteUsers, setRemoteUsers] = useState([]);

  useEffect(() => {
    if (!awareness) return;

    const update = () => {
      const states = awareness.getStates();
      const users = [];
      states.forEach((state, clientId) => {
        if (clientId !== awareness.doc.clientID && state.user) {
          users.push({ clientId, ...state.user });
        }
      });
      setRemoteUsers(users);
    };

    awareness.on("change", update);
    update();
    return () => awareness.off("change", update);
  }, [awareness]);

  const dotColor = {
    connected: "#e8ff47",
    connecting: "#888",
    disconnected: "#ff4444",
  }[status] ?? "#888";

  const label = {
    connected: peers > 0 ? `${peers} editing` : "Connected",
    connecting: "Connecting…",
    disconnected: "Offline",
  }[status] ?? status;

  return (
    <div className="collab-status" aria-label={`Collaboration: ${label}`}>
      {/* Status dot */}
      <span
        className="collab-status__dot"
        style={{ background: dotColor }}
        title={label}
      />

      {/* Peer avatars */}
      {remoteUsers.length > 0 && (
        <span className="collab-status__avatars">
          {remoteUsers.slice(0, 5).map((u) => (
            <AvatarDot key={u.clientId} user={u} />
          ))}
          {remoteUsers.length > 5 && (
            <span className="collab-status__overflow">
              +{remoteUsers.length - 5}
            </span>
          )}
        </span>
      )}

      {/* Text label */}
      <span className="collab-status__label">{label}</span>
    </div>
  );
}

function AvatarDot({ user }) {
  const initials = (user.name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      className="collab-status__avatar"
      style={{ background: user.color || "#888" }}
      title={user.name}
      aria-label={user.name}
    >
      {initials}
    </span>
  );
}
