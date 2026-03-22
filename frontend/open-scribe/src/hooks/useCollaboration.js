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
    // null = not checked yet, true = empty after sync, false = has server content
    isEmpty: null,
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
      session.isEmpty = xmlFrag.length === 0;

      // If server had no state AND we have saved HTML content,
      // inject it into Y.Doc NOW before the editor mounts.
      // We parse HTML to plain text and build minimal Y.js XML structure.
      if (session.isEmpty && initialContentRef.current?.trim()) {
        try {
          injectHtmlIntoYDoc(session.ydoc, initialContentRef.current);
          // After injection, mark as not empty so editor gets the content
          session.isEmpty = false;
        } catch (e) {
          console.warn("[yjs] inject failed:", e);
          session.isEmpty = true;
        }
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
  };
}

/**
 * Parse HTML string and inject into Y.Doc's "default" XmlFragment.
 * Uses the browser DOM to parse, then builds Y.js XML nodes to match
 * Tiptap's ProseMirror schema structure.
 */
function injectHtmlIntoYDoc(ydoc, html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const body = doc.body;
  const frag = ydoc.getXmlFragment("default");

  if (frag.length > 0) return; // safety check

  ydoc.transact(() => {
    const nodes = [];

    for (const child of body.childNodes) {
      const yNode = domNodeToYNode(ydoc, child);
      if (yNode) nodes.push(yNode);
    }

    if (nodes.length === 0) {
      // Fallback: single paragraph with text
      const p = new Y.XmlElement("paragraph");
      const text = new Y.XmlText();
      const plain = body.textContent?.trim() || "";
      if (plain) text.insert(0, plain);
      nodes.push(p);
      p.insert(0, [text]);
    }

    frag.insert(0, nodes);
  });
}

function domNodeToYNode(ydoc, node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent;
    if (!text) return null;
    const yText = new Y.XmlText();
    yText.insert(0, text);
    return yText;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const tag = node.tagName.toLowerCase();

  // Map HTML tags to Tiptap/ProseMirror node names
  const tagMap = {
    p: "paragraph",
    h1: "heading", h2: "heading", h3: "heading", h4: "heading",
    blockquote: "blockquote",
    pre: "codeBlock",
    ul: "bulletList", ol: "orderedList",
    li: "listItem",
    hr: "horizontalRule",
  };

  const nodeName = tagMap[tag] || "paragraph";
  const yEl = new Y.XmlElement(nodeName);

  // Add heading level attribute
  if (tag.match(/^h[1-4]$/)) {
    yEl.setAttribute("level", parseInt(tag[1]));
  }

  // Process children
  const children = [];
  for (const child of node.childNodes) {
    const yChild = domNodeToYNode(ydoc, child);
    if (yChild) children.push(yChild);
  }

  // For elements with only text, wrap in XmlText with marks
  if (children.length === 0 && node.textContent) {
    const yText = new Y.XmlText();
    yText.insert(0, node.textContent);
    children.push(yText);
  }

  if (children.length > 0) {
    yEl.insert(0, children);
  }

  return yEl;
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