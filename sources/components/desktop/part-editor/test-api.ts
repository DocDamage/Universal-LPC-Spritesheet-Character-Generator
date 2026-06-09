// Test API: exposes internal editor functions for testing
import {
  addEditLayer,
  duplicateActiveLayer,
  moveActiveLayer,
  deleteActiveLayer,
  mergeActiveLayerDown,
  flattenVisibleLayers,
  getActiveLayer,
  getActiveLayerIndex,
  resetEditLayers,
} from "./layers.ts";
import { applyGlobalToFrame, switchEditorContext } from "./animation.ts";
import {
  cloneDirectionCanvases,
  composeLayersIntoCanvases,
  createDirectionCanvases,
  recomposeCanvases,
} from "./canvas.ts";
import { copySelection, nudgeSelection, pasteClipboard } from "./selection.ts";
import { createEditorContextSnapshot } from "./history.ts";
import { isFrameDirty } from "./animation.ts";
import { getFrameContextKey } from "./types.ts";
import { transformActivePixels } from "./transform.ts";

export const partEditorTestApi = {
  addEditLayer,
  applyGlobalToFrame,
  cloneDirectionCanvases,
  composeLayersIntoCanvases,
  copySelection,
  createDirectionCanvases,
  createEditorContextSnapshot,
  deleteActiveLayer,
  duplicateActiveLayer,
  flattenVisibleLayers,
  getActiveLayer,
  getActiveLayerIndex,
  getFrameContextKey,
  isFrameDirty,
  mergeActiveLayerDown,
  moveActiveLayer,
  nudgeSelection,
  pasteClipboard,
  recomposeCanvases,
  resetEditLayers,
  switchEditorContext,
  transformActivePixels,
};
