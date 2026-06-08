import { debugWarn } from "../../../utils/debug.ts";
import { clamp } from "../../../utils/helpers.ts";
import { DIRECTIONS } from "../pixel-editor-tools.ts";
import type {
  PartEditorState,
  EditorSnapshot,
  EditorLayerSnapshot,
  EditorContextSnapshot,
  EditorLayer,
  Direction,
} from "./types.ts";
import { debouncedAutosave } from "./autosave.ts";
import { clearSelectionState } from "./selection.ts";
import {
  createDirectionCanvases,
  loadDataUrlIntoCanvas,
  recomposeCanvases,
} from "./canvas.ts";
import { createEditorLayer, resetEditLayers } from "./layers.ts";
import m from "mithril";

export function saveHistory(stateObj: PartEditorState): void {
  stateObj.history = stateObj.history.slice(0, stateObj.historyIndex + 1);
  stateObj.history.push(JSON.stringify(createHistorySnapshot(stateObj)));
  stateObj.historyIndex = stateObj.history.length - 1;
  stateObj.unsavedChanges = true;
  debouncedAutosave(stateObj);
}

export function createHistorySnapshot(stateObj: PartEditorState): EditorSnapshot {
  return {
    activeLayerId: stateObj.activeLayerId,
    nextLayerNumber: stateObj.nextLayerNumber,
    layers: stateObj.editLayers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      locked: layer.locked,
      alphaLocked: layer.alphaLocked,
      blendMode: layer.blendMode || "source-over",
      canvases: {
        front: layer.canvases.front.toDataURL(),
        back: layer.canvases.back.toDataURL(),
        left: layer.canvases.left.toDataURL(),
        right: layer.canvases.right.toDataURL(),
      },
    })),
  };
}

export function createEditorContextSnapshot(
  stateObj: PartEditorState,
): EditorContextSnapshot {
  const layerSnapshot = createHistorySnapshot(stateObj);
  return {
    ...layerSnapshot,
    originalCanvases: {
      front: stateObj.originalCanvases.front.toDataURL(),
      back: stateObj.originalCanvases.back.toDataURL(),
      left: stateObj.originalCanvases.left.toDataURL(),
      right: stateObj.originalCanvases.right.toDataURL(),
    },
    history: [...stateObj.history],
    historyIndex: stateObj.historyIndex,
  };
}

export function undo(stateObj: PartEditorState): void {
  if (stateObj.historyIndex <= 0) return;
  stateObj.historyIndex--;
  const snapshot = JSON.parse(stateObj.history[stateObj.historyIndex]!) as
    | EditorSnapshot
    | Partial<Record<Direction, string>>;
  void loadSnapshot(stateObj, snapshot);
}

export function redo(stateObj: PartEditorState): void {
  if (stateObj.historyIndex >= stateObj.history.length - 1) return;
  stateObj.historyIndex++;
  const snapshot = JSON.parse(stateObj.history[stateObj.historyIndex]!) as
    | EditorSnapshot
    | Partial<Record<Direction, string>>;
  void loadSnapshot(stateObj, snapshot);
}

export async function loadSnapshot(
  stateObj: PartEditorState,
  snapshot: EditorSnapshot | Partial<Record<Direction, string>>,
): Promise<void> {
  try {
    if (isEditorSnapshot(snapshot)) {
      const layers = await Promise.all(
        snapshot.layers.map((layerSnapshot) =>
          createLayerFromSnapshot(layerSnapshot),
        ),
      );
      if (layers.length === 0) {
        resetEditLayers(stateObj);
      } else {
        stateObj.editLayers = layers;
        stateObj.activeLayerId =
          layers.find((layer) => layer.id === snapshot.activeLayerId)?.id ??
          layers[layers.length - 1]!.id;
        stateObj.nextLayerNumber = Math.max(snapshot.nextLayerNumber, 1);
      }
    } else {
      await loadLegacyCanvasSnapshot(stateObj, snapshot);
    }

    clearSelectionState(stateObj, true);
    recomposeCanvases(stateObj);
    m.redraw();
  } catch (err) {
    debugWarn("Failed to restore editor history snapshot:", err);
  }
}

export function isEditorSnapshot(snapshot: unknown): snapshot is EditorSnapshot {
  return (
    typeof snapshot === "object" &&
    snapshot !== null &&
    Array.isArray((snapshot as { layers?: unknown }).layers)
  );
}

export async function createLayerFromSnapshot(
  snapshot: EditorLayerSnapshot,
): Promise<EditorLayer> {
  const canvases = createDirectionCanvases();
  await Promise.all(
    DIRECTIONS.map((direction) =>
      loadDataUrlIntoCanvas(snapshot.canvases[direction], canvases[direction]),
    ),
  );

  return {
    id: snapshot.id,
    name: snapshot.name || "Layer",
    visible: snapshot.visible,
    opacity: clamp(snapshot.opacity, 0, 1),
    locked: snapshot.locked ?? false,
    alphaLocked: snapshot.alphaLocked ?? false,
    blendMode:
      (snapshot.blendMode as GlobalCompositeOperation) || "source-over",
    canvases,
  };
}

export async function loadLegacyCanvasSnapshot(
  stateObj: PartEditorState,
  snapshot: Partial<Record<Direction, string>>,
): Promise<void> {
  stateObj.nextLayerNumber = 1;
  const layer = createEditorLayer(stateObj, "Base");
  await Promise.all(
    DIRECTIONS.map((direction) =>
      loadDataUrlIntoCanvas(snapshot[direction], layer.canvases[direction]),
    ),
  );
  stateObj.editLayers = [layer];
  stateObj.activeLayerId = layer.id;
}

export function resetCanvases(stateObj: PartEditorState): void {
  if (stateObj.history.length > 0) {
    // Reset to index 0 of history (original standing frames)
    const snapshot = JSON.parse(stateObj.history[0]!) as
      | EditorSnapshot
      | Partial<Record<Direction, string>>;
    void loadSnapshot(stateObj, snapshot);
    stateObj.history = stateObj.history.slice(0, 1);
    stateObj.historyIndex = 0;
  }
}

