// Part editor header: title, fullscreen toggle, and close button
import m from "mithril";
import { state } from "../../../../state/state.ts";
import type { PartEditorState } from "../types.ts";

export function renderEditorHeader(
  stateObj: PartEditorState,
): m.Children {
  return m("div.part-editor-header", [
    m("h3", "Sprite Part Editor"),
    m("div.part-editor-header-actions", [
      m(
        "button.part-editor-header-button",
        {
          type: "button",
          title: stateObj.isFullscreen
            ? "Exit fullscreen editor (F or Esc)"
            : "Fullscreen editor (F)",
          onclick: () => {
            stateObj.isFullscreen = !stateObj.isFullscreen;
          },
        },
        stateObj.isFullscreen ? "⤢" : "⛶",
      ),
      m(
        "button.part-editor-close",
        {
          type: "button",
          title: "Close editor",
          onclick: () => {
            if (stateObj.unsavedChanges && stateObj.baseItemId) {
              const confirmed = window.confirm(
                "You have unsaved changes. Discard them?",
              );
              if (!confirmed) return;
            }
            state.editingPart = null;
          },
        },
        "✕",
      ),
    ]),
  ]);
}
