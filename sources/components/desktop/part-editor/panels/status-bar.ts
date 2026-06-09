import m from "mithril";
import type { PartEditorState } from "../types.ts";
import { getActiveLayer } from "../layers.ts";

export function renderStatusBar(stateObj: PartEditorState): m.Children {
  const cursor = stateObj.cursorPosition;
  const cursorText = cursor ? `${cursor.x},${cursor.y}` : "—";
  const activeLayer = getActiveLayer(stateObj);
  const layerName = activeLayer?.name ?? "—";
  const frameText = stateObj.frameMode
    ? `F${stateObj.frameIndex + 1}`
    : "Global";

  return m("div.part-editor-status-bar", [
    m("span.part-editor-status-item", `Pos: ${cursorText}`),
    m(
      "span.part-editor-status-item",
      `Dir: ${stateObj.activeDirection.toUpperCase()}`,
    ),
    m("span.part-editor-status-item", `Zoom: ${stateObj.zoom}x`),
    m("span.part-editor-status-item", `Layer: ${layerName}`),
    m("span.part-editor-status-item", `Brush: ${stateObj.brushSize}px`),
    m("span.part-editor-status-item", frameText),
  ]);
}
