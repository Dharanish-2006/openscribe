import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { YjsWebSocketProvider } from "../lib/YjsWebSocketProvider";
const WS_BASE = import.meta.env.VITE_WS_URL ?? "ws://localhost:8000";

export function useCollaboration(documentId, { enabled = true } = {}) {
  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const awarenessRef = useRef(null);

  const [status, setStatus] = useState("disconnected");
  const [peers, setPeers] = useState(0);

  useEffect(() => {
    if (!documentId || !enabled) return;

    const token = localStorage.getItem("access_token");
    if (!token) return;
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    const awareness = new Awareness(ydoc);
    awarenessRef.current = awareness;
    // Set local user 
    const username = JSON.parse(localStorage.getItem("user") || "{}").username;
    const color = randomColor(username || "anon");
    awareness.setLocalStateField("user", { name: username || "Anonymous", color });
    const wsUrl = `${WS_BASE}/ws/documents/${documentId}/`;
    const provider = new YjsWebSocketProvider(wsUrl, ydoc, awareness, {
      onStatusChange: setStatus,
      onPeersChange: setPeers,
    });
    providerRef.current = provider;

    return () => {
      provider.destroy();
      ydoc.destroy();
      providerRef.current = null;
      ydocRef.current = null;
      awarenessRef.current = null;
      setStatus("disconnected");
      setPeers(0);
    };
  }, [documentId, enabled]);

  return {
    ydoc: ydocRef.current,
    provider: providerRef.current,
    awareness: awarenessRef.current,
    status,
    peers,
  };
}

function randomColor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 60%)`;
}