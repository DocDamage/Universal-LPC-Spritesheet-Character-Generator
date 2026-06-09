import m from "mithril";
import type { PartEditorState } from "../types.ts";
import { renderAnimationEditorPanel } from "./animation-editor.ts";
import { renderSpriteEditorPanel } from "./sprite-editor.ts";

export function renderProPanel(stateObj: PartEditorState): m.Children {
  return m("aside.part-editor-pro-panel", [
    m("div.part-editor-pro-tabs", [
      m(
        "button.part-editor-pro-tab",
        {
          type: "button",
          class: stateObj.activeEditorTab === "edit" ? "active" : "",
          title: "Show sprite editing tools (1)",
          onclick: () => {
            stateObj.activeEditorTab = "edit";
          },
        },
        "Edit",
      ),
      m(
        "button.part-editor-pro-tab",
        {
          type: "button",
          class: stateObj.activeEditorTab === "animation" ? "active" : "",
          title: "Show animation frame editor (2)",
          onclick: () => {
            stateObj.activeEditorTab = "animation";
          },
        },
        "Animation",
      ),
    ]),
    m(
      "div.part-editor-pro-content",
      stateObj.activeEditorTab === "animation"
        ? renderAnimationEditorPanel(stateObj)
        : renderSpriteEditorPanel(stateObj),
    ),
  ]);
}
