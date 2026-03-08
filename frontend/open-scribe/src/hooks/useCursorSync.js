import { useEffect } from "react";

export function useCursorSync(editor, awareness) {
  useEffect(() => {
    if (!editor || !awareness || editor.isDestroyed || !editor.view) return;

    const publishCursor = () => {
      try {
        const { from, to } = editor.state.selection;
        awareness.setLocalStateField("cursor", { anchor: from, head: to });
      } catch (_) {
      }
    };

    editor.on("selectionUpdate", publishCursor);
    editor.on("update", publishCursor);
    publishCursor();

    return () => {
      editor.off("selectionUpdate", publishCursor);
      editor.off("update", publishCursor);
      try {
        awareness.setLocalStateField("cursor", null);
      } catch (_) {}
    };
  }, [editor, awareness]);
}