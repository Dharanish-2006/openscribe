import { useState, useEffect, useRef, useCallback } from "react";
import { documentsAPI } from "../api/documents";
import { CollaborativeEditor } from "@/components/CollaborativeEditor";

export default function Document() {
  const [docs, setDocs] = useState([]);
  const [activeDoc, setActiveDoc] = useState(null);
  const [title, setTitle] = useState("");
  const [saved, setSaved] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const activeDocRef = useRef(null);
  const titleRef = useRef("");
  const debounceTimer = useRef(null);
  // Sequence number — incremented on every save attempt
  // Response is only applied if its seq matches the latest
  const saveSeqRef = useRef(0);
  // Latest captured HTML — set synchronously in onUpdate
  const pendingContentRef = useRef("");

  useEffect(() => { activeDocRef.current = activeDoc; }, [activeDoc]);
  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { fetchDocs(); }, []);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const { data } = await documentsAPI.list();
      const list = Array.isArray(data) ? data : (data.results ?? []);
      setDocs(list);
      if (list.length > 0) {
        setActiveDoc(list[0]);
        setTitle(list[0].title);
        pendingContentRef.current = list[0].content || "";
      }
    } catch (err) {
      console.error("Failed to load documents", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = useCallback(async () => {
    const doc = activeDocRef.current;
    if (!doc) return;

    const content = pendingContentRef.current || doc.content || "";
    console.log("[save] handleSave — pendingContent:", content?.substring(0, 60), "| doc.content:", doc.content?.substring(0, 40));
    if (!content || content === "<p></p>") return;

    // Stamp this save with a sequence number
    saveSeqRef.current += 1;
    const mySeq = saveSeqRef.current;

    setSaving(true);
    try {
      const { data } = await documentsAPI.update(doc.id, {
        title: titleRef.current,
        content,
      });

      // Only apply this response if no newer save has started
      if (mySeq === saveSeqRef.current) {
        setDocs(prev => prev.map(d => d.id === data.id ? data : d));
        setActiveDoc(data);
        activeDocRef.current = data;
        setSaved(true);
      }
    } catch (err) {
      console.error("Save failed", err);
    } finally {
      if (mySeq === saveSeqRef.current) {
        setSaving(false);
      }
    }
  }, []);

  const scheduleAutoSave = useCallback((html) => {
    console.log("[save] scheduleAutoSave called with html:", html?.substring(0, 60));
    // CRITICAL: if html is empty, ignore completely — do NOT reset timer or update pending
    // Empty onUpdate fires come from Y.js awareness/sync events, not real user edits
    if (!html || html === "<p></p>" || html.trim() === "") return;
    pendingContentRef.current = html;
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(handleSave, 1500);
  }, [handleSave]);

  const flushAndSave = useCallback(async (html) => {
    clearTimeout(debounceTimer.current);
    if (html && html !== "<p></p>") pendingContentRef.current = html;
    await handleSave();
  }, [handleSave]);

  const handleNew = async () => {
    clearTimeout(debounceTimer.current);
    if (!saved) await flushAndSave();
    try {
      const { data } = await documentsAPI.create({ title: "Untitled", content: "" });
      setDocs(prev => [data, ...prev]);
      setActiveDoc(data);
      setTitle(data.title);
      pendingContentRef.current = "";
      setSaved(true);
    } catch (err) {
      console.error("Failed to create document", err);
    }
  };

  const handleSwitch = async (doc) => {
    if (doc.id === activeDocRef.current?.id) return;
    clearTimeout(debounceTimer.current);
    if (!saved) await flushAndSave();
    setActiveDoc(doc);
    setTitle(doc.title);
    pendingContentRef.current = doc.content || "";  // prime with DB content
    setSaved(true);
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this document?")) return;
    try {
      await documentsAPI.delete(id);
      const updated = docs.filter(d => d.id !== id);
      setDocs(updated);
      if (activeDocRef.current?.id === id) {
        const next = updated[0] || null;
        setActiveDoc(next);
        setTitle(next?.title || "");
        pendingContentRef.current = next?.content || "";
        setSaved(true);
      }
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  if (loading) return <div className="doc-loading"><span className="spinner" /></div>;

  return (
    <div className="doc-layout">
      <aside className="doc-sidebar">
        <div className="doc-sidebar-header">
          <span className="doc-sidebar-title">Documents</span>
          <button className="new-doc-btn" onClick={handleNew} title="New Document">＋</button>
        </div>
        <div className="doc-list">
          {docs.length === 0 && (
            <div className="doc-empty">No documents yet.<br />Click ＋ to start.</div>
          )}
          {docs.map(doc => (
            <div
              key={doc.id}
              className={`doc-item ${doc.id === activeDoc?.id ? "active" : ""}`}
              onClick={() => handleSwitch(doc)}
            >
              <div className="doc-item-name">📄 {doc.title || "Untitled"}</div>
              <div className="doc-item-meta">{formatDate(doc.updated_at)}</div>
              <button className="doc-delete-btn" onClick={e => handleDelete(doc.id, e)}>✕</button>
            </div>
          ))}
        </div>
      </aside>

      <div className="doc-editor-area">
        {activeDoc ? (
          <>
            <div className="doc-toolbar">
              <input
                className="doc-title-input"
                value={title}
                onChange={e => {
                  setTitle(e.target.value);
                  setSaved(false);
                  scheduleAutoSave(pendingContentRef.current || activeDoc.content);
                }}
                placeholder="Document title..."
              />
              <div className="doc-actions">
                <span className={`save-status ${saved ? "saved" : "unsaved"}`}>
                  {saving ? "Saving..." : saved ? "✓ Saved" : "● Unsaved"}
                </span>
                <button className="btn-save" onClick={() => flushAndSave()} disabled={saving}>
                  Save
                </button>
                <button className="btn-new" onClick={handleNew}>＋ New</button>
              </div>
            </div>

            <CollaborativeEditor
              key={activeDoc.id}
              documentId={activeDoc.id}
              initialContent={activeDoc.content || ""}
              onUpdate={({ editor }) => {
                const html = editor.getHTML();
                setSaved(false);
                scheduleAutoSave(html);
              }}
            />
          </>
        ) : (
          <div className="doc-no-selection">
            <p>No document selected</p>
            <button className="btn-primary" onClick={handleNew}>
              Create your first document
            </button>
          </div>
        )}
      </div>
    </div>
  );
}