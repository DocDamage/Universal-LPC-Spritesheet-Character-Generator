import { state } from "../../../state/state.ts";
import type { PartEditorState } from "./types.ts";
import { clampEditorZoom } from "./state.ts";
import { DEFAULT_EDITOR_ZOOM } from "./types.ts";
import { isSelectionNudgeKey } from "./selection.ts";
import { clampBrushSize } from "../pixel-editor-tools.ts";
import { undo, redo } from "./history.ts";
import {
  addEditLayer,
  duplicateActiveLayer,
  flattenVisibleLayers,
  mergeActiveLayerDown,
  toggleActiveLayerAlphaLock,
  toggleActiveLayerPixelLock,
} from "./layers.ts";
import { replaceColorOnActiveLayer } from "./color.ts";
import {
  copySelection,
  clearSelectionState,
  pasteClipboard,
  nudgeSelection,
  clearSelectedPixels,
} from "./selection.ts";
import { transformActivePixels } from "./transform.ts";
import { switchEditorContext } from "./animation.ts";
import m from "mithril";

export function handleEditorShortcut(
  e: KeyboardEvent,
  stateObj: PartEditorState,
): void {
  if (!state.editingPart) return;
  if (e.defaultPrevented) return;

  const key = e.key.toLowerCase();
  const isCommand = e.ctrlKey || e.metaKey;
  if (isTypingTarget(e.target)) {
    if (key === "escape" && stateObj.isFullscreen) {
      e.preventDefault();
      stateObj.isFullscreen = false;
      m.redraw();
    }
    return;
  }

  if (isCommand && key === "z" && e.shiftKey) {
    e.preventDefault();
    redo(stateObj);
    return;
  }
  if (isCommand && key === "z") {
    e.preventDefault();
    undo(stateObj);
    return;
  }
  if (isCommand && key === "y") {
    e.preventDefault();
    redo(stateObj);
    return;
  }
  if (isCommand && key === "n" && e.shiftKey && stateObj.isFullscreen) {
    e.preventDefault();
    addEditLayer(stateObj);
    m.redraw();
    return;
  }
  if (isCommand && key === "j" && stateObj.isFullscreen) {
    e.preventDefault();
    duplicateActiveLayer(stateObj);
    m.redraw();
    return;
  }
  if (isCommand && key === "e" && stateObj.isFullscreen) {
    e.preventDefault();
    if (e.shiftKey) {
      flattenVisibleLayers(stateObj);
    } else {
      mergeActiveLayerDown(stateObj);
    }
    m.redraw();
    return;
  }
  if (isCommand && key === "r" && e.shiftKey && stateObj.isFullscreen) {
    e.preventDefault();
    replaceColorOnActiveLayer(stateObj);
    m.redraw();
    return;
  }
  if (isCommand && key === "c") {
    if (copySelection(stateObj)) {
      e.preventDefault();
    }
    return;
  }
  if (isCommand && key === "v") {
    if (pasteClipboard(stateObj)) {
      e.preventDefault();
      m.redraw();
    }
    return;
  }
  if (isCommand && key === "d") {
    if (clearSelectionState(stateObj, true)) {
      e.preventDefault();
      m.redraw();
    }
    return;
  }
  if (isCommand && (key === "=" || key === "+")) {
    e.preventDefault();
    stateObj.zoom = clampEditorZoom(stateObj.zoom + 1);
    m.redraw();
    return;
  }
  if (isCommand && key === "-") {
    e.preventDefault();
    stateObj.zoom = clampEditorZoom(stateObj.zoom - 1);
    m.redraw();
    return;
  }
  if (isCommand && key === "0") {
    e.preventDefault();
    stateObj.zoom = DEFAULT_EDITOR_ZOOM;
    m.redraw();
    return;
  }

  if (isSelectionNudgeKey(key) && stateObj.selectionRect) {
    e.preventDefault();
    nudgeSelection(stateObj, key, e.shiftKey ? 10 : 1);
  } else if (
    (key === "backspace" || key === "delete") &&
    stateObj.selectionRect
  ) {
    e.preventDefault();
    clearSelectedPixels(stateObj);
  } else if (key === "escape" && stateObj.selectionRect) {
    e.preventDefault();
    clearSelectionState(stateObj, true);
  } else if (key === "escape" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.isFullscreen = false;
  } else if (key === "f") {
    e.preventDefault();
    stateObj.isFullscreen = !stateObj.isFullscreen;
  } else if (key === "1" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.activeEditorTab = "edit";
  } else if (key === "2" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.activeEditorTab = "animation";
  } else if (key === "b" || key === "p") {
    e.preventDefault();
    stateObj.tool = "pen";
  } else if (key === "e") {
    e.preventDefault();
    stateObj.tool = "eraser";
  } else if (key === "i") {
    e.preventDefault();
    stateObj.tool = "picker";
  } else if (key === "m" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.tool = "select";
  } else if (key === "l" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.tool = "line";
  } else if (key === "r" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.tool = "rect";
  } else if (key === "o" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.tool = "ellipse";
  } else if (key === "g" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.tool = "fill";
  } else if (key === "h" && stateObj.isFullscreen) {
    e.preventDefault();
    transformActivePixels(stateObj, "flipHorizontal");
  } else if (key === "v" && stateObj.isFullscreen) {
    e.preventDefault();
    transformActivePixels(stateObj, "flipVertical");
  } else if (key === "t" && stateObj.isFullscreen) {
    e.preventDefault();
    transformActivePixels(
      stateObj,
      e.shiftKey ? "rotateCounterClockwise" : "rotateClockwise",
    );
  } else if ((key === "/" || key === "?") && stateObj.isFullscreen) {
    e.preventDefault();
    if (e.shiftKey || key === "?") {
      toggleActiveLayerAlphaLock(stateObj);
    } else {
      toggleActiveLayerPixelLock(stateObj);
    }
  } else if (key === "," && stateObj.isFullscreen && stateObj.frameMode) {
    e.preventDefault();
    void switchEditorContext(
      stateObj,
      true,
      stateObj.frameAnimation,
      stateObj.frameIndex - 1,
    );
    return;
  } else if (key === "." && stateObj.isFullscreen && stateObj.frameMode) {
    e.preventDefault();
    void switchEditorContext(
      stateObj,
      true,
      stateObj.frameAnimation,
      stateObj.frameIndex + 1,
    );
    return;
  } else if (key === "[") {
    e.preventDefault();
    stateObj.brushSize = clampBrushSize(stateObj.brushSize - 1);
  } else if (key === "]") {
    e.preventDefault();
    stateObj.brushSize = clampBrushSize(stateObj.brushSize + 1);
  } else if (key === "x" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.mirrorX = !stateObj.mirrorX;
  } else if (key === "y" && stateObj.isFullscreen) {
    e.preventDefault();
    stateObj.mirrorY = !stateObj.mirrorY;
  } else {
    return;
  }

  m.redraw();
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "select" ||
    tagName === "textarea" ||
    target.isContentEditable
  );
}
