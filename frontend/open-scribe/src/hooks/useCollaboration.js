import { useEffect, useState } from "react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { YjsWebSocketProvider } from "../lib/YjsWebSocketProvider";

const WS_BASE = import.meta.env.VITE_WS_URL ?? "ws://localhost:8000";
const sessions = new Map();

function getOrCreateSession(documentId) {
  if (sessions.has(documentId)) {
    const s = sessions.get(documentId);
    s.refCount++;
    return s;
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

  const wsUrl = `${WS_BASE}/ws/documents/${documentId}/`;
  const provider = new YjsWebSocketProvider(wsUrl, ydoc, awareness, {
  });

  const session = { ydoc, awareness, provider, refCount: 1, listeners: new Set() };
  sessions.set(documentId, session);
  return session;
}

function releaseSession(documentId) {
  const s = sessions.get(documentId);
  if (!s) return;
  s.refCount--;
  if (s.refCount <= 0) {
    s.provider.destroy();
    s.ydoc.destroy();
    sessions.delete(documentId);
  }
}

export function useCollaboration(documentId, { enabled = true } = {}) {
  const [status, setStatus] = useState("disconnected");
  const [peers, setPeers] = useState(0);

  useEffect(() => {
    if (!documentId || !enabled) return;
    if (!localStorage.getItem("access_token")) return;
    const session = getOrCreateSession(documentId);
    const origStatusChange = session.provider._onStatusChange;
    const origPeersChange = session.provider._onPeersChange;
    session.provider._onStatusChange = (s) => {
      origStatusChange(s);
      setStatus(s);
    };
    session.provider._onPeersChange = (p) => {
      origPeersChange(p);
      setPeers(p);
    };

    return () => {
      session.provider._onStatusChange = () => {};
      session.provider._onPeersChange = () => {};
      releaseSession(documentId);
    };
  }, [documentId, enabled]);

  const session = documentId ? sessions.get(documentId) : null;

  return {
    ydoc: session?.ydoc ?? null,
    awareness: session?.awareness ?? null,
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