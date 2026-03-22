"use client"
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useRef, useState } from "react"
import { EditorContent, EditorContext, useEditor, useCurrentEditor } from "@tiptap/react"

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

import { Button } from "@/components/tiptap-ui-primitive/button"
import { Spacer } from "@/components/tiptap-ui-primitive/spacer"
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/components/tiptap-ui-primitive/toolbar"

import { ImageUploadNode } from "@/components/tiptap-node/image-upload-node/image-upload-node-extension"
import { HorizontalRule } from "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension"
import "@/components/tiptap-node/blockquote-node/blockquote-node.scss"
import "@/components/tiptap-node/code-block-node/code-block-node.scss"
import "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss"
import "@/components/tiptap-node/list-node/list-node.scss"
import "@/components/tiptap-node/image-node/image-node.scss"
import "@/components/tiptap-node/heading-node/heading-node.scss"
import "@/components/tiptap-node/paragraph-node/paragraph-node.scss"

import { HeadingDropdownMenu } from "@/components/tiptap-ui/heading-dropdown-menu"
import { ImageUploadButton } from "@/components/tiptap-ui/image-upload-button"
import { ListDropdownMenu } from "@/components/tiptap-ui/list-dropdown-menu"
import { BlockquoteButton } from "@/components/tiptap-ui/blockquote-button"
import { CodeBlockButton } from "@/components/tiptap-ui/code-block-button"
import {
  ColorHighlightPopover,
  ColorHighlightPopoverContent,
  ColorHighlightPopoverButton,
} from "@/components/tiptap-ui/color-highlight-popover"
import {
  LinkPopover,
  LinkContent,
  LinkButton,
} from "@/components/tiptap-ui/link-popover"
import { MarkButton } from "@/components/tiptap-ui/mark-button"
import { TextAlignButton } from "@/components/tiptap-ui/text-align-button"
// UndoRedoButton replaced with Y.js-compatible version below

import { ArrowLeftIcon } from "@/components/tiptap-icons/arrow-left-icon"
import { HighlighterIcon } from "@/components/tiptap-icons/highlighter-icon"
import { LinkIcon } from "@/components/tiptap-icons/link-icon"

import { useIsBreakpoint } from "@/hooks/use-is-breakpoint"
import { useWindowSize } from "@/hooks/use-window-size"
import { useCursorVisibility } from "@/hooks/use-cursor-visibility"

import { ThemeToggle } from "@/components/tiptap-templates/simple/theme-toggle"
import { handleImageUpload, MAX_FILE_SIZE } from "@/lib/tiptap-utils"
import "@/components/tiptap-templates/simple/simple-editor.scss"
import "./CollaborationStatus.scss"

import { CollaborationCursorV3 } from "../lib/CollaborationCursorV3"
import { useCursorSync } from "../hooks/useCursorSync"
import { useCollaboration } from "../hooks/useCollaboration"
import { CollaborationStatus } from "./CollaborationStatus"


// ─── Y.js undo/redo (replaces UndoRedoButton which uses history API) ─────────

function YjsUndoButton({ action }) {
  const { editor } = useCurrentEditor()
  const isUndo = action === "undo"

  const handleClick = () => {
    if (!editor) return
    if (isUndo) {
      editor.chain().focus().undo().run()
    } else {
      editor.chain().focus().redo().run()
    }
  }

  const canDo = () => {
    if (!editor) return false
    try {
      return isUndo ? editor.can().undo() : editor.can().redo()
    } catch {
      return false
    }
  }

  return (
    <Button
      variant="ghost"
      onClick={handleClick}
      disabled={!canDo()}
      title={isUndo ? "Undo" : "Redo"}
    >
      <span className="tiptap-button-icon">{isUndo ? "↩" : "↪"}</span>
    </Button>
  )
}

// ─── Toolbar ────────────────────────────────────────────────────────────────

const MainToolbarContent = ({ onHighlighterClick, onLinkClick, isMobile, collabStatus }) => (
  <>
    <Spacer />
    <ToolbarGroup>
      <YjsUndoButton action="undo" />
      <YjsUndoButton action="redo" />
    </ToolbarGroup>
    <ToolbarSeparator />
    <ToolbarGroup>
      <HeadingDropdownMenu levels={[1, 2, 3, 4]} portal={isMobile} />
      <ListDropdownMenu types={["bulletList", "orderedList", "taskList"]} portal={isMobile} />
      <BlockquoteButton />
      <CodeBlockButton />
    </ToolbarGroup>
    <ToolbarSeparator />
    <ToolbarGroup>
      <MarkButton type="bold" />
      <MarkButton type="italic" />
      <MarkButton type="strike" />
      <MarkButton type="code" />
      <MarkButton type="underline" />
      {!isMobile ? <ColorHighlightPopover /> : <ColorHighlightPopoverButton onClick={onHighlighterClick} />}
      {!isMobile ? <LinkPopover /> : <LinkButton onClick={onLinkClick} />}
    </ToolbarGroup>
    <ToolbarSeparator />
    <ToolbarGroup>
      <MarkButton type="superscript" />
      <MarkButton type="subscript" />
    </ToolbarGroup>
    <ToolbarSeparator />
    <ToolbarGroup>
      <TextAlignButton align="left" />
      <TextAlignButton align="center" />
      <TextAlignButton align="right" />
      <TextAlignButton align="justify" />
    </ToolbarGroup>
    <ToolbarSeparator />
    <ToolbarGroup>
      <ImageUploadButton text="Add" />
    </ToolbarGroup>
    <Spacer />
    {isMobile && <ToolbarSeparator />}
    {collabStatus && <ToolbarGroup>{collabStatus}</ToolbarGroup>}
    <ToolbarGroup><ThemeToggle /></ToolbarGroup>
  </>
)

const MobileToolbarContent = ({ type, onBack }) => (
  <>
    <ToolbarGroup>
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeftIcon className="tiptap-button-icon" />
        {type === "highlighter"
          ? <HighlighterIcon className="tiptap-button-icon" />
          : <LinkIcon className="tiptap-button-icon" />}
      </Button>
    </ToolbarGroup>
    <ToolbarSeparator />
    {type === "highlighter" ? <ColorHighlightPopoverContent /> : <LinkContent />}
  </>
)

// ─── Main component ──────────────────────────────────────────────────────────

export function CollaborativeEditor({
  documentId,
  onUpdate,
  editorRef: externalRef,
  initialContent = "",   // ← HTML from DB, used to seed Y.Doc when memory is empty
}) {
  const isMobile = useIsBreakpoint()
  const { height } = useWindowSize()
  const [mobileView, setMobileView] = useState("main")
  const toolbarRef = useRef(null)
  const { ydoc, awareness, status, peers, provider, needsSeed, initialContentRef } = useCollaboration(documentId)
  // Store initialContent in ref so the hook can read it without it being a dependency
  if (initialContentRef) initialContentRef.current = initialContent

  // Seed editor with saved DB content when Y.Doc is empty after sync
  // Using editor.commands.setContent ensures Tiptap parses HTML correctly
  // into the Y.Doc with proper schema structure
  useEffect(() => {
    if (!editor || !needsSeed || !initialContent) return
    // Small delay to ensure editor is fully mounted
    const t = setTimeout(() => {
      try {
        editor.commands.setContent(initialContent, false)
      } catch (e) {
        console.warn("[collab] seed setContent failed:", e)
      }
    }, 50)
    return () => clearTimeout(t)
  }, [editor, needsSeed, initialContent])



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
        HorizontalRule,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Highlight.configure({ multicolor: true }),
        Image,
        Typography,
        Superscript,
        Subscript,
        Selection,
        ImageUploadNode.configure({
          accept: "image/*",
          maxSize: MAX_FILE_SIZE,
          limit: 3,
          upload: handleImageUpload,
          onError: (error) => console.error("Upload failed:", error),
        }),
        ...(ydoc ? [
          Collaboration.configure({
            document: ydoc,
            // Do NOT pass content here — seeding is handled by useCollaboration
            // to ensure it only happens after sync-step-2 is received
          }),
          CollaborationCursorV3.configure({ awareness }),
        ] : []),
      ],
      onUpdate: ({ editor }) => {
        if (externalRef) externalRef.current = editor
        onUpdate?.({ editor })
        // Send HTML to backend for DB persistence (survives server restart)
        if (provider) provider.sendHtml(editor.getHTML())
      },
    },
    [ydoc]
  )

  useEffect(() => {
    if (editor && externalRef) {
      externalRef.current = editor
    }
  }, [editor, externalRef])

  useCursorSync(editor, awareness)

  const rect = useCursorVisibility({
    editor,
    overlayHeight: toolbarRef.current?.getBoundingClientRect().height ?? 0,
  })

  useEffect(() => {
    if (!isMobile && mobileView !== "main") setMobileView("main")
  }, [isMobile, mobileView])

  return (
    <div className="simple-editor-wrapper">
      <EditorContext.Provider value={{ editor }}>
        <Toolbar
          ref={toolbarRef}
          style={isMobile ? { bottom: `calc(100% - ${height - rect.y}px)` } : {}}
        >
          {mobileView === "main" ? (
            <MainToolbarContent
              onHighlighterClick={() => setMobileView("highlighter")}
              onLinkClick={() => setMobileView("link")}
              isMobile={isMobile}
              collabStatus={
                <CollaborationStatus status={status} peers={peers} awareness={awareness} />
              }
            />
          ) : (
            <MobileToolbarContent
              type={mobileView === "highlighter" ? "highlighter" : "link"}
              onBack={() => setMobileView("main")}
            />
          )}
        </Toolbar>

        <EditorContent
          editor={editor}
          role="presentation"
          className="simple-editor-content"
        />
      </EditorContext.Provider>
    </div>
  )
}