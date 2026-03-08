import { useWindowSize } from "@/hooks/use-window-size"
import { useBodyRect } from "@/hooks/use-element-rect"
import { useEffect } from "react"

export function useCursorVisibility({
  editor,
  overlayHeight = 0
}) {
  const { height: windowHeight } = useWindowSize()
  const rect = useBodyRect({
    enabled: true,
    throttleMs: 100,
    useResizeObserver: true,
  })

  useEffect(() => {
    const ensureCursorVisibility = () => {
      if (!editor || editor.isDestroyed) return

      try {
        const { state, view } = editor
        if (!view || !view.hasFocus()) return

        const { from } = state.selection
        const cursorCoords = view.coordsAtPos(from)

        if (windowHeight < rect.height && cursorCoords) {
          const availableSpace = windowHeight - cursorCoords.top
          if (availableSpace < overlayHeight) {
            const targetCursorY = Math.max(windowHeight / 2, overlayHeight)
            const currentScrollY = window.scrollY
            const cursorAbsoluteY = cursorCoords.top + currentScrollY
            const newScrollY = cursorAbsoluteY - targetCursorY
            window.scrollTo({ top: Math.max(0, newScrollY), behavior: "smooth" })
          }
        }
      } catch (_) {
        // Editor view not reaady— safe to ignore
      }
    }

    ensureCursorVisibility()
  }, [editor, overlayHeight, windowHeight, rect.height])

  return rect
}