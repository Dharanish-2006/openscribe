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
  const hasSeeded = useRef(false)
  // Tracks whether user has typed since mount — if so, cancel pending seed
  const userHasTyped = useRef(false)

  const { ydoc, awareness, status, peers, needsSeed, initialContentRef } =
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
        // Mark that user has typed — prevents seeding from overwriting their input
        userHasTyped.current = true
        onUpdate?.({ editor })
      },
    },
    [ydoc]
  )

  // Seed editor with DB content when Y.Doc is empty after server sync.
  // Only runs if user hasn't typed yet.
  useEffect(() => {
    if (!editor || !needsSeed || !initialContent || !initialContent.trim()) return
    if (hasSeeded.current) return

    const t = setTimeout(() => {
      // Abort if user typed during the 150ms delay
      if (userHasTyped.current) return

      hasSeeded.current = true
      try {
        // Temporarily disconnect onUpdate so seeding doesn't trigger a save
        // by calling setContent with emitUpdate=false
        editor.commands.setContent(initialContent, false)
        // Notify parent of the seeded content so pendingContentRef is correct
        onUpdate?.({ editor })
      } catch (e) {
        console.warn("[collab] seed failed:", e)
      }
    }, 150)

    return () => clearTimeout(t)
  }, [editor, needsSeed, initialContent])

  // Reset on document switch
  useEffect(() => {
    hasSeeded.current = false
    userHasTyped.current = false
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