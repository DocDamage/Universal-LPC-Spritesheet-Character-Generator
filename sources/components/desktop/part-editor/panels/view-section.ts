import m from "mithril";
import type { PartEditorState } from "../types.ts";
import { DEFAULT_EDITOR_ZOOM } from "../types.ts";

export function renderViewSection(stateObj: PartEditorState): m.Children {
  return m("div.part-editor-pro-section", [
    m("h4", "View"),

    m(
      "label.part-editor-pro-toggle",
      {
        title: "Toggle pixel grid",
      },
      [
        m("input", {
          type: "checkbox",
          checked: stateObj.showGrid,
          onchange: (e: Event) => {
            stateObj.showGrid = (e.target as HTMLInputElement).checked;
          },
        }),
        "Pixel Grid",
      ],
    ),

    m(
      "button.part-editor-pro-button",
      {
        type: "button",
        title: "Reset editor zoom (Ctrl+0)",
        onclick: () => {
          stateObj.zoom = DEFAULT_EDITOR_ZOOM;
        },
      },
      "Reset Zoom",
    ),
  ]);
}
