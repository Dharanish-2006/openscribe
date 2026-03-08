import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const PLUGIN_KEY = new PluginKey("collaborationCursorV3");

export const CollaborationCursorV3 = Extension.create({
  name: "collaborationCursorV3",

  addOptions() {
    return {
      awareness: null,
    };
  },

  addProseMirrorPlugins() {
    const { awareness } = this.options;
    if (!awareness) return [];

    return [
      new Plugin({
        key: PLUGIN_KEY,

        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, _old, _oldState, newState) {
            return buildDecorations(newState.doc, awareness);
          },
        },

        view(editorView) {
          const onAwarenessChange = () => {
            const { state } = editorView;
            const tr = state.tr.setMeta(PLUGIN_KEY, "awarenessUpdate");
            editorView.dispatch(tr);
          };

          awareness.on("change", onAwarenessChange);

          return {
            destroy() {
              awareness.off("change", onAwarenessChange);
            },
          };
        },

        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

// Helpers
function buildDecorations(doc, awareness) {
  const decorations = [];
  const localClientId = awareness.doc.clientID;

  awareness.getStates().forEach((state, clientId) => {
    if (clientId === localClientId) return;
    if (!state.user || !state.cursor) return;

    const { anchor, head } = state.cursor;
    const { name, color } = state.user;
    const docSize = doc.content.size;
    const safeAnchor = Math.max(0, Math.min(anchor, docSize));
    const safeHead = Math.max(0, Math.min(head, docSize));
    const caretEl = buildCaret(name, color);
    decorations.push(
      Decoration.widget(safeHead, caretEl, {
        key: `cursor-${clientId}`,
        side: safeHead >= safeAnchor ? 1 : -1,
      })
    );
    if (safeAnchor !== safeHead) {
      const from = Math.min(safeAnchor, safeHead);
      const to = Math.max(safeAnchor, safeHead);
      try {
        decorations.push(
          Decoration.inline(
            from,
            to,
            {
              style: `background-color: ${hexToRgba(color, 0.2)};`,
              class: "collab-selection",
            },
            { key: `selection-${clientId}` }
          )
        );
      } catch (_) {
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}

function buildCaret(name, color) {
  const wrapper = document.createElement("span");
  wrapper.setAttribute("class", "collaboration-cursor__caret");
  wrapper.setAttribute("style", `border-color: ${color};`);
  wrapper.setAttribute("data-user", name);

  const label = document.createElement("span");
  label.setAttribute("class", "collaboration-cursor__label");
  label.setAttribute("style", `background-color: ${color};`);
  label.textContent = name;

  wrapper.appendChild(label);
  return wrapper;
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  if (clean.length === 3) {
    const [r, g, b] = clean.split("").map((c) => parseInt(c + c, 16));
    return `rgba(${r},${g},${b},${alpha})`;
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
