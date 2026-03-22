"use client"
import Placeholder from "@tiptap/extension-placeholder"
import { useEffect, useRef, useState, lazy, Suspense } from "react"
import { EditorContent, EditorContext, useEditor } from "@tiptap/react"

// Core Tiptap extensions only — NO tiptap-ui imports here (causes circular deps)
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

// Collaboration-specific imports
import { CollaborationCursorV3 } from "../lib/CollaborationCursorV3"
import { useCursorSync } from "../hooks/useCursorSync"
import { useCollaboration } from "../hooks/useCollaboration"
import { CollaborationStatus } from "./CollaborationStatus"
import "./CollaborationStatus.scss"

// Toolbar is lazy-loaded in its own chunk to break circular dependency
// All tiptap-ui/* imports live in SimpleEditorToolbar, never in this file
const SimpleEditorToolbar = lazy(() =>
  import("./SimpleEditorToolbar").then(m => ({ default: m.SimpleEditorToolbar }))
)

export function CollaborativeEditor({
  documentId,
  onUpdate,
  editorRef: externalRef,
  initialContent = "",
}) {
  const [mobileView, setMobileView] = useState("main")

  const { ydoc, awareness, status, peers, provider, needsSeed, initialContentRef } =
    useCollaboration(documentId)

  // Keep initialContent ref updated on every render (no effect needed, no dep issues)
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
        ...(ydoc ? [
          Collaboration.configure({ document: ydoc }),
          CollaborationCursorV3.configure({ awareness }),
        ] : []),
      ],
      onUpdate: ({ editor }) => {
        if (externalRef) externalRef.current = editor
        onUpdate?.({ editor })
        // Send HTML via WebSocket for DB persistence — skip empty content
        const html = editor.getHTML()
        if (provider && html && html !== "<p></p>") {
          provider.sendHtml(html)
        }
      },
    },
    [ydoc]
  )

  // Seed editor with saved DB content when Y.Doc was empty after server sync
  // Uses editor.commands.setContent — the only reliable way to parse HTML into Y.Doc
  useEffect(() => {
    if (!editor || !needsSeed || !initialContent || !initialContent.trim()) return
    const t = setTimeout(() => {
      try {
        editor.commands.setContent(initialContent, false)
      } catch (e) {
        console.warn("[collab] seed setContent failed:", e)
      }
    }, 100)
    return () => clearTimeout(t)
  }, [editor, needsSeed, initialContent])

  // Keep externalRef in sync
  useEffect(() => {
    if (editor && externalRef) externalRef.current = editor
  }, [editor, externalRef])

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