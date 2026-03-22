import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { YjsWebSocketProvider } from "../lib/YjsWebSocketProvider";

const WS_BASE = import.meta.env.VITE_WS_URL ?? "ws://localhost:8000";

const sessions = new Map();

function getOrCreateSession(documentId, onStatusChange, onPeersChange) {
  if (sessions.has(documentId)) {
    const s = sessions.get(documentId);
    s.refCount++;
    s.provider._onStatusChange = onStatusChange;
    s.provider._onPeersChange = onPeersChange;
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
    onStatusChange,
    onPeersChange,
  });

  const session = { ydoc, awareness, provider, refCount: 1, synced: false };
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

export function useCollaboration(documentId, { enabled = true, initialContent = "" } = {}) {
  const [status, setStatus] = useState("disconnected");
  const [peers, setPeers] = useState(0);
  // synced = true means Y.Doc is ready for the editor to mount
  const [synced, setSynced] = useState(false);

  const setStatusRef = useRef(setStatus);
  const setPeersRef = useRef(setPeers);
  setStatusRef.current = setStatus;
  setPeersRef.current = setPeers;

  useEffect(() => {
    if (!documentId || !enabled) return;
    if (!localStorage.getItem("access_token")) return;

    const onStatusChange = (s) => setStatusRef.current(s);
    const onPeersChange = (p) => setPeersRef.current(p);

    const session = getOrCreateSession(documentId, onStatusChange, onPeersChange);

    // If already synced (e.g. switching back to same doc), use existing state
    if (session.synced) {
      setSynced(true);
      return () => {
        if (sessions.has(documentId)) {
          const s = sessions.get(documentId);
          s.provider._onStatusChange = () => {};
          s.provider._onPeersChange = () => {};
        }
        releaseSession(documentId);
      };
    }

    // Wait for either:
    // 1. Server sends MSG_SYNC_STEP_2 (has existing state) — onSynced fires
    // 2. Connection opens but server has no state — we seed with initialContent
    const onSynced = () => {
      session.synced = true;

      // Check if Y.Doc is still empty after server sync
      // If so, seed with HTML from DB
      const xmlFragment = session.ydoc.getXmlFragment("default");
      if (xmlFragment.length === 0 && initialContent) {
        // Use Y.js transaction to insert initial content as a text node
        // This is the only reliable way to seed an empty Y.Doc
        session.ydoc.transact(() => {
          // Parse HTML into ProseMirror-compatible Y.js XML
          // We insert a raw text node that Tiptap will parse
          const fragment = session.ydoc.getXmlFragment("default");
          // Build a minimal paragraph with the content
          // Tiptap's Collaboration extension reads from "default" fragment
          const paragraph = new Y.XmlElement("paragraph");
          const text = new Y.XmlText();
          // Strip HTML tags for plain text fallback
          const plainText = initialContent.replace(/<[^>]+>/g, "");
          if (plainText.trim()) {
            text.insert(0, plainText);
            paragraph.insert(0, [text]);
            fragment.insert(0, [paragraph]);
          }
        });
      }

      setSynced(true);
    };

    // Hook into the provider's onStatusChange to detect first "connected" event
    // and use a one-time Y.Doc observer to detect when sync-step-2 is applied
    let syncTimer = null;

    // Observer fires when Y.Doc receives any update (including sync-step-2)
    const onYDocUpdate = () => {
      clearTimeout(syncTimer);
      session.ydoc.off("update", onYDocUpdate);
      onSynced();
    };

    const origStatusChange = session.provider._onStatusChange;
    session.provider._onStatusChange = (s) => {
      origStatusChange(s);
      setStatusRef.current(s);

      if (s === "connected") {
        // Give the server 800ms to send sync-step-2
        // If no update arrives, assume empty doc and seed
        syncTimer = setTimeout(() => {
          session.ydoc.off("update", onYDocUpdate);
          onSynced();
        }, 800);

        // Also listen for any incoming Y.Doc update
        session.ydoc.on("update", onYDocUpdate);
      }
    };

    return () => {
      clearTimeout(syncTimer);
      session.ydoc.off("update", onYDocUpdate);
      if (sessions.has(documentId)) {
        const s = sessions.get(documentId);
        s.provider._onStatusChange = () => {};
        s.provider._onPeersChange = () => {};
      }
      releaseSession(documentId);
    };
  }, [documentId, enabled, initialContent]);

  const session = documentId ? sessions.get(documentId) : null;

  return {
    ydoc: synced ? (session?.ydoc ?? null) : null, // null until synced — editor waits
    awareness: session?.awareness ?? null,
    provider: session?.provider ?? null,
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