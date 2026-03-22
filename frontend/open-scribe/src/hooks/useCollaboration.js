import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { YjsWebSocketProvider } from "../lib/YjsWebSocketProvider";

const WS_BASE = import.meta.env.VITE_WS_URL ?? "ws://localhost:8000";

export function useCollaboration(documentId, { enabled = true } = {}) {
  const ydocRef = useRef(null);
  const awarenessRef = useRef(null);
  const providerRef = useRef(null);
  const initializedRef = useRef(null);

  const [status, setStatus] = useState("disconnected");
  const [peers, setPeers] = useState(0);

  if (documentId && enabled && initializedRef.current !== documentId) {
    if (providerRef.current) {
      providerRef.current.destroy();
      ydocRef.current?.destroy();
    }

    const ydoc = new Y.Doc();
    const awareness = new Awareness(ydoc);

    const username = (() => {
      try { return JSON.parse(localStorage.getItem("user") || "{}").username; }
      catch { return null; }
    })();
    awareness.setLocalStateField("user", {
      name: username || "Anonymous",
      color: randomColor(username || "anon"),
    });

    const token = localStorage.getItem("access_token") || "";
    const wsUrl = `${WS_BASE}/ws/documents/${documentId}/`;

    providerRef.current = new YjsWebSocketProvider(wsUrl, ydoc, awareness, {
      onStatusChange: setStatus,
      onPeersChange: setPeers,
    });
    ydocRef.current = ydoc;
    awarenessRef.current = awareness;
    initializedRef.current = documentId;
  }

  useEffect(() => {
    return () => {
      providerRef.current?.destroy();
      ydocRef.current?.destroy();
      providerRef.current = null;
      ydocRef.current = null;
      awarenessRef.current = null;
      initializedRef.current = null;
    };
  }, []); 
  return {
    ydoc: ydocRef.current,
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