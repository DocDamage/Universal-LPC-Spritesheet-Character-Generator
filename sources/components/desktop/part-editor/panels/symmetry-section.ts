import m from "mithril";
import type { PartEditorState } from "../types.ts";

export function renderSymmetrySection(stateObj: PartEditorState): m.Children {
  return m("div.part-editor-pro-section", [
    m("h4", "Symmetry"),

    m(
      "label.part-editor-pro-toggle",
      {
        title: "Mirror strokes across the horizontal axis (X)",
      },
      [
        m("input", {
          type: "checkbox",
          checked: stateObj.mirrorX,
          onchange: (e: Event) => {
            stateObj.mirrorX = (e.target as HTMLInputElement).checked;
          },
        }),
        "Mirror X",
      ],
    ),

    m(
      "label.part-editor-pro-toggle",
      {
        title: "Mirror strokes across the vertical axis (Y)",
      },
      [
        m("input", {
          type: "checkbox",
          checked: stateObj.mirrorY,
          onchange: (e: Event) => {
            stateObj.mirrorY = (e.target as HTMLInputElement).checked;
          },
        }),
        "Mirror Y",
      ],
    ),
  ]);
}
