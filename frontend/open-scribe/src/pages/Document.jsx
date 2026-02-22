import { useEditor, EditorContent } from "@tiptap/react";
import { FloatingMenu, BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";

export default function Document() {
  const MyEditor = useEditor({
    extensions: [StarterKit],
    content: "<p></p>",
  });
  return (
    <>
      <EditorContent editor={MyEditor} />
      <FloatingMenu editor={MyEditor}>🪿</FloatingMenu>
      <BubbleMenu editor={MyEditor}>Bubble</BubbleMenu>
    </>
  );
}
