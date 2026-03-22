import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { YjsWebSocketProvider } from "../lib/YjsWebSocketProvider";

const WS_BASE = import.meta.env.VITE_WS_URL ?? "ws://localhost:8000";

// Module-level map — one session per documentId, never recreated on re-render
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

  // Create provider with no-op callbacks — wired in useCollaboration
  const provider = new YjsWebSocketProvider(wsUrl, ydoc, awareness, {
    onStatusChange: () => {},
    onPeersChange: () => {},
  });

  const session = {
    ydoc,
    awareness,
    provider,
    refCount: 1,
    synced: false,      // true once we've resolved initial state
    seedDone: false,    // true once seeding from DB has been attempted
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

  // Stable ref — always points to latest setter without causing effect re-runs
  const cbRef = useRef({ setStatus, setPeers, setSynced });
  cbRef.current = { setStatus, setPeers, setSynced };

  // initialContentRef lets us read initialContent inside the effect
  // without it being a dependency (avoids reconnect loop)
  const initialContentRef = useRef("");

  useEffect(() => {
    if (!documentId || !enabled) return;
    if (!localStorage.getItem("access_token")) return;

    const session = getOrCreateSession(documentId);

    // Wire status/peers callbacks into the provider
    session.provider._onStatusChange = (s) => cbRef.current.setStatus(s);
    session.provider._onPeersChange = (p) => cbRef.current.setPeers(p);

    // If already synced from a previous mount, just restore state
    if (session.synced) {
      setSynced(true);
      return () => cleanup(documentId, session);
    }

    let syncTimer = null;

    const doSync = () => {
      if (session.synced) return;
      session.synced = true;

      // Only seed if Y.Doc is empty AND we haven't seeded yet AND we have content
      if (!session.seedDone) {
        session.seedDone = true;
        const xmlFragment = session.ydoc.getXmlFragment("default");
        const initialContent = initialContentRef.current;

        if (xmlFragment.length === 0 && initialContent && initialContent.trim()) {
          // Seed Y.Doc with saved HTML via Y.js transaction
          // We store as XML text — Tiptap Collaboration reads "default" fragment
          try {
            session.ydoc.transact(() => {
              const frag = session.ydoc.getXmlFragment("default");
              const paragraph = new Y.XmlElement("paragraph");
              // Strip HTML tags to plain text for safety
              const div = document.createElement("div");
              div.innerHTML = initialContent;
              const text = new Y.XmlText(div.textContent || "");
              paragraph.insert(0, [text]);
              frag.insert(0, [paragraph]);
            });
          } catch (e) {
            console.warn("[yjs] seed failed:", e);
          }
        }
      }

      cbRef.current.setSynced(true);
    };

    // Listen for Y.Doc update = server sent sync-step-2 with content
    const onYDocUpdate = () => {
      clearTimeout(syncTimer);
      session.ydoc.off("update", onYDocUpdate);
      doSync();
    };

    // When connected, give server 1s to send state, then proceed either way
    const origStatusChange = session.provider._onStatusChange;
    session.provider._onStatusChange = (s) => {
      cbRef.current.setStatus(s);
      if (s === "connected" && !session.synced) {
        session.ydoc.on("update", onYDocUpdate);
        syncTimer = setTimeout(() => {
          session.ydoc.off("update", onYDocUpdate);
          doSync();
        }, 1000);
      }
    };

    return () => {
      clearTimeout(syncTimer);
      session.ydoc.off("update", onYDocUpdate);
      cleanup(documentId, session);
    };
  // IMPORTANT: only depend on documentId and enabled — NOT initialContent
  // initialContent is read via ref to avoid triggering reconnects
  }, [documentId, enabled]);

  const session = documentId ? sessions.get(documentId) : null;

  return {
    ydoc: synced ? (session?.ydoc ?? null) : null,
    awareness: session?.awareness ?? null,
    provider: session?.provider ?? null,
    status,
    peers,
    needsSeed: synced && (session?.needsSeed ?? false),
    initialContentRef,
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