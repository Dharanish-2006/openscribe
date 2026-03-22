"use client"
import Placeholder from "@tiptap/extension-placeholder"
import { useEffect, useRef, useState, lazy, Suspense } from "react"
import { EditorContent, EditorContext, useEditor } from "@tiptap/react"

import { StarterKit } from "@tiptap/starter-kit"
import { Image } from "@tiptap/extension-image"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { TextAlign } from "@tiptap/extension-text-align"
import { Typography } from "@tiptap/extension-typography"
import { Highlight } from "@tiptap/extension-highlight"
import { Subscript } from "@tiptap/extension-subscript"
import { Superscript } from "@tiptap/extension-superscript"
import { Selection } from "@tiptap/extensions"
import Collaboration from "@tiptap/extension-collaboration"
import { ImageUploadNode } from "@/components/tiptap-node/image-upload-node/image-upload-node-extension"
import { HorizontalRule } from "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension"
import { handleImageUpload, MAX_FILE_SIZE } from "@/lib/tiptap-utils"

import { CollaborationCursorV3 } from "../lib/CollaborationCursorV3"
import { useCursorSync } from "../hooks/useCursorSync"
import { useCollaboration } from "../hooks/useCollaboration"
import { CollaborationStatus } from "./CollaborationStatus"
import "./CollaborationStatus.scss"

const SimpleEditorToolbar = lazy(() =>
  import("./SimpleEditorToolbar").then(m => ({ default: m.SimpleEditorToolbar }))
)

export function CollaborativeEditor({
  documentId,
  onUpdate,
  initialContent = "",
}) {
  const [mobileView, setMobileView] = useState("main")
  const seededRef = useRef(false)
  const readyRef = useRef(false) // true only after first real user edit

  const { ydoc, awareness, status, peers, initialContentRef, pendingHtml, clearPendingHtml } =
    useCollaboration(documentId)

  if (initialContentRef) initialContentRef.current = initialContent

  const editor = useEditor(
    {
      immediatelyRender: false,
      editorProps: {
        attributes: {
          autocomplete: "off",
          autocorrect: "off",
          autocapitalize: "off",
          "aria-label": "Main content area, start typing to enter text.",
          class: "simple-editor",
        },
      },
      extensions: [
        StarterKit.configure({
          horizontalRule: false,
          history: false,
          undoRedo: false,
          link: { openOnClick: false, enableClickSelection: true },
        }),
        Placeholder.configure({ placeholder: "Start writing..." }),
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Highlight.configure({ multicolor: true }),
        Image,
        Typography,
        Superscript,
        Subscript,
        Selection,
        HorizontalRule,
        ImageUploadNode.configure({
          accept: "image/*",
          maxSize: MAX_FILE_SIZE,
          limit: 3,
          upload: handleImageUpload,
          onError: (error) => console.error("Upload failed:", error),
        }),
        ...(ydoc ? [
          Collaboration.configure({ document: ydoc }),
          CollaborationCursorV3.configure({ awareness }),
        ] : []),
      ],
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        console.log("[editor] onUpdate html:", html?.substring(0, 60));
        // Only propagate updates after user has made an intentional edit
        // The first onUpdate after mount comes from Y.js sync, not user input
        if (!readyRef.current) return;
        onUpdate?.({ editor });
      },
      onTransaction: ({ transaction }) => {
        // Mark editor as ready only after the first user-initiated transaction
        // (transactions with steps = actual content changes by the user)
        if (!readyRef.current && transaction.docChanged && transaction.steps.length > 0) {
          // Check it's not from Y.js sync (those have a 'y-sync$' meta)
          const isYjsUpdate = transaction.getMeta('y-sync$') !== undefined;
          if (!isYjsUpdate) {
            readyRef.current = true;
          }
        }
      },
    },
    [ydoc]
  )

  // When editor mounts with an empty Y.Doc and we have saved content,
  // use editor.commands.setContent — the ONLY reliable way to parse HTML into Y.Doc
  useEffect(() => {
    if (!editor || !pendingHtml || seededRef.current) return;

    console.log("[editor] seeding with pendingHtml:", pendingHtml.substring(0, 60));
    seededRef.current = true;

    // setContent with emitUpdate:true so Y.Doc gets the data
    // but we need to NOT trigger a save — onUpdate will fire but
    // Document.jsx scheduleAutoSave with the correct content is fine
    editor.commands.setContent(pendingHtml, true);
    clearPendingHtml();
    console.log("[editor] seed complete. editor.getHTML():", editor.getHTML()?.substring(0, 60));
  }, [editor, pendingHtml]);

  // Reset on doc switch
  useEffect(() => {
    seededRef.current = false;
    readyRef.current = false;
  }, [documentId]);

  useCursorSync(editor, awareness)

  return (
    <div className="simple-editor-wrapper">
      <EditorContext.Provider value={{ editor }}>
        <Suspense fallback={<div style={{ height: "40px" }} />}>
          <SimpleEditorToolbar
            mobileView={mobileView}
            setMobileView={setMobileView}
            collabStatus={
              <CollaborationStatus status={status} peers={peers} awareness={awareness} />
            }
          />
        </Suspense>
        <EditorContent
          editor={editor}
          role="presentation"
          className="simple-editor-content"
        />
      </EditorContext.Provider>
    </div>
  )
}