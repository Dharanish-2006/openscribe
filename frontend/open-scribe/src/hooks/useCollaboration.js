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
  const [ydocReady, setYdocReady] = useState(null);
  useEffect(() => {
    if (!documentId || !enabled) return;
    const token = localStorage.getItem("access_token");
    if (!token) return;
    const ydoc = new Y.Doc();
    const awareness = new Awareness(ydoc);

    const username = (() => {
      try {
        return JSON.parse(localStorage.getItem("user") || "{}").username;
      } catch { return null; }
    })();
    const color = randomColor(username || "anon");
    awareness.setLocalStateField("user", {
      name: username || "Anonymous",
      color,
    });

    const wsUrl = `${WS_BASE}/ws/documents/${documentId}/`;

    const provider = new YjsWebSocketProvider(wsUrl, ydoc, awareness, {
      onStatusChange: setStatus,
      onPeersChange: setPeers,
    });

    ydocRef.current = ydoc;
    providerRef.current = provider;
    awarenessRef.current = awareness;
    setYdocReady(ydoc);

    return () => {
      provider.destroy();
      ydoc.destroy();
      ydocRef.current = null;
      providerRef.current = null;
      awarenessRef.current = null;
      setYdocReady(null);
      setStatus("disconnected");
      setPeers(0);
    };
  }, [documentId]);

  return {
    ydoc: ydocReady,
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
  return `hsl(${Math.abs(hash) % 360}, 70%, 60%)`;
}