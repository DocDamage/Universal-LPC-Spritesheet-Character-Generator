import m from "mithril";
import type { PartEditorState } from "../types.ts";
import {
  clampBrushSize,
  MAX_BRUSH_SIZE,
  MIN_BRUSH_SIZE,
} from "../../pixel-editor-tools.ts";

export function renderBrushSection(stateObj: PartEditorState): m.Children {
  return m("div.part-editor-pro-section", [
    m("h4", "Brush"),
    m("label.part-editor-pro-field", [
      m("span", "Size"),
      m("input", {
        type: "range",
        min: String(MIN_BRUSH_SIZE),
        max: String(MAX_BRUSH_SIZE),
        step: "1",
        value: String(stateObj.brushSize),
        title: "Brush size ([ or ])",
        oninput: (e: Event) => {
          stateObj.brushSize = clampBrushSize(
            Number((e.target as HTMLInputElement).value),
          );
        },
      }),
      m("b", `${stateObj.brushSize}px`),
    ]),
    m(
      "label.part-editor-pro-toggle",
      {
        title: "Fill rectangle and ellipse tools",
      },
      [
        m("input", {
          type: "checkbox",
          checked: stateObj.shapeFilled,
          onchange: (e: Event) => {
            stateObj.shapeFilled = (e.target as HTMLInputElement).checked;
          },
        }),
        "Fill shapes",
      ],
    ),
  ]);
}
