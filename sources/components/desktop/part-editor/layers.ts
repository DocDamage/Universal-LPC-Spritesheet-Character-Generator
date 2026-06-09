import { clamp } from "../../../utils/helpers.ts";
import { DIRECTIONS } from "../pixel-editor-tools.ts";
import { get2DContext } from "../../../canvas/canvas-utils.ts";
import type { PartEditorState, EditorLayer } from "./types.ts";
import type { PixelEditorToolState } from "./types.ts";
import {
  createDirectionCanvases,
  cloneDirectionCanvases,
  recomposeCanvases,
} from "./canvas.ts";
import { saveHistory } from "./history.ts";
import { clearSelectionState } from "./selection.ts";

export function createEditorLayer(
  stateObj: PartEditorState,
  name?: string,
): EditorLayer {
  const layerNumber = stateObj.nextLayerNumber;
  stateObj.nextLayerNumber += 1;
  return {
    id: `layer_${layerNumber}_${Math.random().toString(36).slice(2, 9)}`,
    name: name ?? `Layer ${layerNumber}`,
    canvases: createDirectionCanvases(),
    visible: true,
    opacity: 1,
    locked: false,
    alphaLocked: false,
  };
}

export function resetEditLayers(stateObj: PartEditorState): void {
  stateObj.nextLayerNumber = 1;
  const firstLayer = createEditorLayer(stateObj, "Base");
  firstLayer.canvases = cloneDirectionCanvases(stateObj.originalCanvases);
  stateObj.editLayers = [firstLayer];
  stateObj.activeLayerId = firstLayer.id;
}

export function getActiveLayer(stateObj: PartEditorState): EditorLayer | null {
  return (
    stateObj.editLayers.find((layer) => layer.id === stateObj.activeLayerId) ??
    stateObj.editLayers[stateObj.editLayers.length - 1] ??
    null
  );
}

export function getActiveLayerIndex(stateObj: PartEditorState): number {
  return stateObj.editLayers.findIndex(
    (layer) => layer.id === stateObj.activeLayerId,
  );
}

export function toggleActiveLayerPixelLock(stateObj: PartEditorState): boolean {
  const activeLayer = getActiveLayer(stateObj);
  return activeLayer ? toggleLayerPixelLock(stateObj, activeLayer) : false;
}

export function toggleLayerPixelLock(
  stateObj: PartEditorState,
  layer: EditorLayer,
): boolean {
  layer.locked = !layer.locked;
  if (layer.locked && layer.id === stateObj.activeLayerId) {
    clearSelectionState(stateObj, true);
  }
  saveHistory(stateObj);
  return true;
}

export function toggleActiveLayerAlphaLock(stateObj: PartEditorState): boolean {
  const activeLayer = getActiveLayer(stateObj);
  return activeLayer ? toggleLayerAlphaLock(stateObj, activeLayer) : false;
}

export function toggleLayerAlphaLock(
  stateObj: PartEditorState,
  layer: EditorLayer,
): boolean {
  if (layer.locked) return false;
  layer.alphaLocked = !layer.alphaLocked;
  saveHistory(stateObj);
  return true;
}

export function getActiveLayerToolState(
  stateObj: PartEditorState,
): PixelEditorToolState | null {
  const activeLayer = getActiveLayer(stateObj);
  if (!activeLayer || activeLayer.locked) return null;

  return {
    activeDirection: stateObj.activeDirection,
    tool: stateObj.tool,
    activeColor: stateObj.activeColor,
    autoPropagate: stateObj.autoPropagate,
    canvases: activeLayer.canvases,
    brushSize: stateObj.brushSize,
    mirrorX: stateObj.mirrorX,
    mirrorY: stateObj.mirrorY,
    alphaLocked: activeLayer.alphaLocked,
  };
}

export function addEditLayer(stateObj: PartEditorState): void {
  const layer = createEditorLayer(stateObj);
  stateObj.editLayers.push(layer);
  stateObj.activeLayerId = layer.id;
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
}

export function duplicateActiveLayer(stateObj: PartEditorState): void {
  const activeIndex = getActiveLayerIndex(stateObj);
  if (activeIndex < 0) return;

  const activeLayer = stateObj.editLayers[activeIndex]!;
  const layer = createEditorLayer(stateObj, `${activeLayer.name} copy`);
  layer.visible = activeLayer.visible;
  layer.opacity = activeLayer.opacity;
  layer.locked = activeLayer.locked;
  layer.alphaLocked = activeLayer.alphaLocked;
  layer.canvases = cloneDirectionCanvases(activeLayer.canvases);

  stateObj.editLayers.splice(activeIndex + 1, 0, layer);
  stateObj.activeLayerId = layer.id;
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
}

export function moveActiveLayer(
  stateObj: PartEditorState,
  direction: -1 | 1,
): void {
  const activeIndex = getActiveLayerIndex(stateObj);
  const nextIndex = activeIndex + direction;
  if (
    activeIndex < 0 ||
    nextIndex < 0 ||
    nextIndex >= stateObj.editLayers.length
  ) {
    return;
  }

  const layer = stateObj.editLayers.splice(activeIndex, 1)[0]!;
  stateObj.editLayers.splice(nextIndex, 0, layer);
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
}

export function deleteActiveLayer(stateObj: PartEditorState): void {
  const activeIndex = getActiveLayerIndex(stateObj);
  if (activeIndex < 0 || stateObj.editLayers.length <= 1) return;
  if (stateObj.editLayers[activeIndex]?.locked) return;

  stateObj.editLayers.splice(activeIndex, 1);
  const nextActiveIndex = Math.min(activeIndex, stateObj.editLayers.length - 1);
  stateObj.activeLayerId = stateObj.editLayers[nextActiveIndex]?.id ?? null;
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
}

export function mergeActiveLayerDown(stateObj: PartEditorState): void {
  const activeIndex = getActiveLayerIndex(stateObj);
  if (activeIndex <= 0) return;

  const activeLayer = stateObj.editLayers[activeIndex]!;
  const targetLayer = stateObj.editLayers[activeIndex - 1]!;
  if (activeLayer.locked || targetLayer.locked) return;

  if (activeLayer.visible && activeLayer.opacity > 0) {
    for (const direction of DIRECTIONS) {
      const targetCtx = get2DContext(targetLayer.canvases[direction]);
      targetCtx.globalAlpha = clamp(activeLayer.opacity, 0, 1);
      targetCtx.drawImage(activeLayer.canvases[direction], 0, 0);
      targetCtx.globalAlpha = 1;
    }
  }

  stateObj.editLayers.splice(activeIndex, 1);
  stateObj.activeLayerId = targetLayer.id;
  clearSelectionState(stateObj, true);
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
}

export function flattenVisibleLayers(stateObj: PartEditorState): void {
  if (stateObj.editLayers.length <= 1) return;

  recomposeCanvases(stateObj);
  stateObj.nextLayerNumber = 1;
  const layer = createEditorLayer(stateObj, "Base");
  layer.canvases = cloneDirectionCanvases(stateObj.canvases);
  stateObj.editLayers = [layer];
  stateObj.activeLayerId = layer.id;
  clearSelectionState(stateObj, true);
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
}
