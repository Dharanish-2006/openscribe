"use client"
import Placeholder from "@tiptap/extension-placeholder"
import { useEffect, useRef, useState, lazy, Suspense } from "react"
import { EditorContent, EditorContext, useEditor } from "@tiptap/react"
import { isChangeOrigin } from "@tiptap/extension-collaboration"

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
      onUpdate: ({ editor, transaction }) => {
        // isChangeOrigin is exported by @tiptap/extension-collaboration
        // It returns true for ALL Y.js sync/update transactions (not user edits)
        // This is the official Tiptap v3 way to detect Y.js vs user transactions
        if (isChangeOrigin(transaction)) return
        onUpdate?.({ editor })
      },
    },
    [ydoc]
  )

  // Seed editor with DB content when Y.Doc was empty after sync
  useEffect(() => {
    if (!editor || !pendingHtml || seededRef.current) return
    seededRef.current = true
    editor.commands.setContent(pendingHtml, true)
    clearPendingHtml()
  }, [editor, pendingHtml])

  useEffect(() => {
    seededRef.current = false
  }, [documentId])

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