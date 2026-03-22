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

  const editorRef = useRef(null);
  const activeDocRef = useRef(null);
  const titleRef = useRef("");
  const debounceTimer = useRef(null);
  const abortRef = useRef(null); // AbortController for in-flight PATCH

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
      }
    } catch (err) {
      console.error("Failed to load documents", err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Save immediately — cancels any in-flight request before sending a new one.
   * This ensures only the latest content reaches the DB.
   */
  const handleSave = useCallback(async () => {
    const doc = activeDocRef.current;
    if (!doc) return;

    const html = editorRef.current?.getHTML?.() ?? "";
    const content = html && html !== "<p></p>" ? html : doc.content ?? "";
    const title = titleRef.current;

    // Cancel the previous in-flight request if still pending
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    setSaving(true);
    try {
      const { data } = await documentsAPI.update(
        doc.id,
        { title, content },
        { signal: abortRef.current.signal }
      );
      setDocs(prev => prev.map(d => d.id === data.id ? data : d));
      setActiveDoc(data);
      activeDocRef.current = data;
      setSaved(true);
    } catch (err) {
      if (err.name === "CanceledError" || err.code === "ERR_CANCELED") {
        // Request was superseded by a newer one — not an error
        return;
      }
      console.error("Save failed", err);
    } finally {
      setSaving(false);
    }
  }, []);

  /**
   * Schedule a debounced save. Any rapid keystrokes reset the timer.
   * Only the save that fires after the user pauses for 1.5s actually runs.
   */
  const scheduleAutoSave = useCallback(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(handleSave, 1500);
  }, [handleSave]);

  const cancelPendingSave = useCallback(() => {
    clearTimeout(debounceTimer.current);
  }, []);

  const handleNew = async () => {
    cancelPendingSave();
    if (!saved) await handleSave();
    try {
      const { data } = await documentsAPI.create({ title: "Untitled", content: "" });
      setDocs(prev => [data, ...prev]);
      setActiveDoc(data);
      setTitle(data.title);
      setSaved(true);
    } catch (err) {
      console.error("Failed to create document", err);
    }
  };

  const handleSwitch = async (doc) => {
    if (doc.id === activeDocRef.current?.id) return;
    cancelPendingSave();
    if (!saved) await handleSave();
    setActiveDoc(doc);
    setTitle(doc.title);
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
                  scheduleAutoSave();
                }}
                placeholder="Document title..."
              />
              <div className="doc-actions">
                <span className={`save-status ${saved ? "saved" : "unsaved"}`}>
                  {saving ? "Saving..." : saved ? "✓ Saved" : "● Unsaved"}
                </span>
                <button className="btn-save" onClick={handleSave} disabled={saving}>Save</button>
                <button className="btn-new" onClick={handleNew}>＋ New</button>
              </div>
            </div>

            <CollaborativeEditor
              key={activeDoc.id}
              documentId={activeDoc.id}
              initialContent={activeDoc.content || ""}
              editorRef={editorRef}
              onUpdate={({ editor }) => {
                // editorRef is updated here so handleSave always reads latest HTML
                editorRef.current = editor;
                setSaved(false);
                scheduleAutoSave();
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