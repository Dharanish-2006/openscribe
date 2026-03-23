import { useEffect, useRef, useState } from "react";
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
  const provider = new YjsWebSocketProvider(
    `${WS_BASE}/ws/documents/${documentId}/`,
    ydoc, awareness,
    { onStatusChange: () => {}, onPeersChange: () => {} }
  );
  const session = {
    ydoc, awareness, provider,
    refCount: 1,
    synced: false,
    // null = pending seed html (Y.Doc was empty after sync)
    // undefined = no seed needed (Y.Doc had server content)
    pendingHtml: undefined,
  };
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
  const [synced, setSynced] = useState(false);

  const cbRef = useRef({ setStatus, setPeers, setSynced });
  cbRef.current = { setStatus, setPeers, setSynced };
  const initialContentRef = useRef("");

  useEffect(() => {
    if (!documentId || !enabled) return;
    if (!localStorage.getItem("access_token")) return;

    const session = getOrCreateSession(documentId);
    session.provider._onStatusChange = (s) => cbRef.current.setStatus(s);
    session.provider._onPeersChange = (p) => cbRef.current.setPeers(p);

    if (session.synced) {
      cbRef.current.setSynced(true);
      return () => cleanup(documentId, session);
    }

    let syncTimer = null;

    const finishSync = () => {
      if (session.synced) return;
      session.synced = true;

      const xmlFrag = session.ydoc.getXmlFragment("default");
      const html = initialContentRef.current;

      console.log("[collab] finishSync — xmlFrag.length:", xmlFrag.length, "| html:", html?.substring(0, 60));

      if (xmlFrag.length === 0 && html && html.trim() && html !== "<p></p>") {
        // Y.Doc is empty AND we have DB content → need to seed
        session.pendingHtml = html;
        console.log("[collab] pendingHtml set for seeding:", html.substring(0, 40));
      } else {
        // Y.Doc already has content from server — DO NOT seed
        session.pendingHtml = undefined;
        console.log("[collab] Y.Doc has server content, no seeding needed");
      }

      cbRef.current.setSynced(true);
    };

    const onYDocUpdate = () => {
      clearTimeout(syncTimer);
      session.ydoc.off("update", onYDocUpdate);
      setTimeout(finishSync, 0);
    };

    session.provider._onStatusChange = (s) => {
      cbRef.current.setStatus(s);
      if (s === "connected" && !session.synced) {
        session.ydoc.on("update", onYDocUpdate);
        syncTimer = setTimeout(() => {
          session.ydoc.off("update", onYDocUpdate);
          finishSync();
        }, 2000);
      }
    };

    return () => {
      clearTimeout(syncTimer);
      session.ydoc.off("update", onYDocUpdate);
      cleanup(documentId, session);
    };
  }, [documentId, enabled]);

  const session = documentId ? sessions.get(documentId) : null;
  return {
    ydoc: synced ? (session?.ydoc ?? null) : null,
    awareness: session?.awareness ?? null,
    provider: session?.provider ?? null,
    status,
    peers,
    initialContentRef,
    // Only non-undefined when Y.Doc was empty and needs seeding from DB
    pendingHtml: synced ? (session?.pendingHtml ?? null) : null,
    clearPendingHtml: () => { if (session) session.pendingHtml = undefined; },
  };
}

function cleanup(documentId, session) {
  if (sessions.has(documentId)) {
    session.provider._onStatusChange = () => {};
    session.provider._onPeersChange = () => {};
  }
  releaseSession(documentId);
}

function randomColor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 70%, 60%)`;
}