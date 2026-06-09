import m from "mithril";
import type { PartEditorState } from "../types.ts";
import { getActiveLayer } from "../layers.ts";
import { transformActivePixels } from "../transform.ts";

export function renderTransformSection(stateObj: PartEditorState): m.Children {
  const activeLayer = getActiveLayer(stateObj);
  const activeLayerLocked = activeLayer?.locked ?? false;

  return m("div.part-editor-pro-section.part-editor-transform-section", [
    m("h4", "Transform"),

    m(
      "label.part-editor-pro-toggle",
      {
        title: "Apply transforms to every direction",
      },
      [
        m("input", {
          type: "checkbox",
          checked: stateObj.transformAllDirections,
          onchange: (e: Event) => {
            stateObj.transformAllDirections = (
              e.target as HTMLInputElement
            ).checked;
          },
        }),
        "All dirs",
      ],
    ),

    m("div.part-editor-transform-actions", [
      m(
        "button.part-editor-pro-button",
        {
          type: "button",
          title: "Flip selection or active layer horizontally (H)",
          disabled: activeLayerLocked,
          onclick: () => transformActivePixels(stateObj, "flipHorizontal"),
        },
        "Flip H",
      ),

      m(
        "button.part-editor-pro-button",
        {
          type: "button",
          title: "Flip selection or active layer vertically (V)",
          disabled: activeLayerLocked,
          onclick: () => transformActivePixels(stateObj, "flipVertical"),
        },
        "Flip V",
      ),

      m(
        "button.part-editor-pro-button",
        {
          type: "button",
          title: "Rotate selection or active layer clockwise (T)",
          disabled: activeLayerLocked,
          onclick: () => transformActivePixels(stateObj, "rotateClockwise"),
        },
        "Rot CW",
      ),

      m(
        "button.part-editor-pro-button",
        {
          type: "button",
          title: "Rotate selection or active layer counterclockwise (Shift+T)",
          disabled: activeLayerLocked,
          onclick: () =>
            transformActivePixels(stateObj, "rotateCounterClockwise"),
        },
        "Rot CCW",
      ),

      m(
        "button.part-editor-pro-button.part-editor-transform-clear",
        {
          type: "button",
          title: "Clear selection or active layer",
          disabled: activeLayerLocked,
          onclick: () => transformActivePixels(stateObj, "clear"),
        },
        "Clear",
      ),
    ]),
  ]);
}
