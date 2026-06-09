import { FRAME_SIZE } from "../../../state/constants.ts";
import { DIRECTIONS } from "../pixel-editor-tools.ts";
import { clamp } from "../../../utils/helpers.ts";
import { debugWarn } from "../../../utils/debug.ts";
import { getMultiRecolors } from "../../../state/palettes.ts";
import {
  ANIMATION_CONFIGS,
  ANIMATION_OFFSETS,
  ANIMATIONS,
} from "../../../state/constants.ts";
import { loadImage } from "../../../canvas/load-image.ts";
import { getSpritePath } from "../../../state/path.ts";
import { get2DContext } from "../../../canvas/canvas-utils.ts";
import { defaultCatalog } from "../../../state/catalog.ts";
import type { ItemMerged } from "../../../state/catalog.ts";
import { supportsAnimation } from "../../../state/meta.ts";
import { state } from "../../../state/state.ts";
import { DIRECTION_ROWS } from "./types.ts";
import type {
  PartEditorState,
  EditorContextSnapshot,
  Direction,
} from "./types.ts";
import {
  createDirectionCanvases,
  copyDirectionCanvases,
  applyCanvasDiff,
  loadDataUrlIntoCanvas,
  recomposeCanvases,
} from "./canvas.ts";
import {
  createLayerFromSnapshot,
  saveHistory,
  createEditorContextSnapshot,
} from "./history.ts";
import { resetEditLayers } from "./layers.ts";
import { clearSelectionState } from "./selection.ts";
import { createCanvasesFromContext } from "./save.ts";
import { getFrameContextKey } from "./types.ts";
import m from "mithril";

export function getAvailableFrameAnimations(meta: ItemMerged): string[] {
  return Object.keys(ANIMATION_OFFSETS).filter(
    (animation) =>
      supportsAnimation(meta, animation) &&
      getAnimationFrameCount(animation) > 0,
  );
}

export function getAnimationConfigName(animation: string): string {
  if (animation === "combat_idle") return "combat";
  if (animation === "backslash") return "1h_backslash";
  if (animation === "halfslash") return "1h_halfslash";
  return animation;
}

export function getAnimationFrameCount(animation: string): number {
  const configs = ANIMATION_CONFIGS as Record<
    string,
    { cycle: number[] } | undefined
  >;
  const config = configs[getAnimationConfigName(animation)];
  if (!config || config.cycle.length === 0) return 1;
  return Math.max(...config.cycle) + 1;
}

export function getAnimationLabel(animation: string): string {
  const animationEntry = ANIMATIONS.find(
    (entry) =>
      entry.value === animation ||
      (entry.folderName === animation && !entry.noExport),
  );
  if (animationEntry) return animationEntry.label;
  return animation
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function saveActiveEditorContext(stateObj: PartEditorState): void {
  const context = createEditorContextSnapshot(stateObj);
  if (stateObj.frameMode) {
    stateObj.frameEditorContexts[
      getFrameContextKey(stateObj.frameAnimation, stateObj.frameIndex)
    ] = context;
  } else {
    stateObj.globalEditorContext = context;
  }
}

export async function switchEditorContext(
  stateObj: PartEditorState,
  frameMode: boolean,
  animation = stateObj.frameAnimation,
  frameIndex = stateObj.frameIndex,
): Promise<void> {
  const nextAnimation = stateObj.availableFrameAnimations.includes(animation)
    ? animation
    : (stateObj.availableFrameAnimations[0] ?? "walk");
  const frameCount = getAnimationFrameCount(nextAnimation);
  const nextFrameIndex = Math.min(
    frameCount - 1,
    Math.max(0, Math.round(frameIndex)),
  );

  if (
    stateObj.frameMode === frameMode &&
    (!frameMode ||
      (stateObj.frameAnimation === nextAnimation &&
        stateObj.frameIndex === nextFrameIndex))
  ) {
    return;
  }

  saveActiveEditorContext(stateObj);
  clearSelectionState(stateObj, true);

  if (!frameMode) {
    if (stateObj.globalEditorContext) {
      await restoreEditorContext(stateObj, stateObj.globalEditorContext);
    }
    stateObj.frameMode = false;
    stateObj.onionCanvases = null;
    m.redraw();
    return;
  }

  const contextKey = getFrameContextKey(nextAnimation, nextFrameIndex);
  const existingContext = stateObj.frameEditorContexts[contextKey];
  if (existingContext) {
    await restoreEditorContext(stateObj, existingContext);
  } else {
    const frameCanvases = await loadFrameCanvasesWithGlobalEdits(
      stateObj,
      nextAnimation,
      nextFrameIndex,
    );
    copyDirectionCanvases(frameCanvases, stateObj.originalCanvases);
    resetEditLayers(stateObj);
    recomposeCanvases(stateObj);
    stateObj.history = [];
    stateObj.historyIndex = -1;
    saveHistory(stateObj);
  }

  stateObj.frameMode = true;
  stateObj.activeEditorTab = "animation";
  stateObj.frameAnimation = nextAnimation;
  stateObj.frameIndex = nextFrameIndex;
  await updateOnionCanvases(stateObj);
  m.redraw();
}

export async function restoreEditorContext(
  stateObj: PartEditorState,
  context: EditorContextSnapshot,
): Promise<void> {
  await Promise.all(
    DIRECTIONS.map((direction) =>
      loadDataUrlIntoCanvas(
        context.originalCanvases[direction],
        stateObj.originalCanvases[direction],
      ),
    ),
  );

  const layers = await Promise.all(
    context.layers.map((layerSnapshot) =>
      createLayerFromSnapshot(layerSnapshot),
    ),
  );
  if (layers.length === 0) {
    resetEditLayers(stateObj);
  } else {
    stateObj.editLayers = layers;
    stateObj.activeLayerId =
      layers.find((layer) => layer.id === context.activeLayerId)?.id ??
      layers[layers.length - 1]!.id;
    stateObj.nextLayerNumber = Math.max(context.nextLayerNumber, 1);
  }
  stateObj.history = [...context.history];
  stateObj.historyIndex = Math.min(
    stateObj.history.length - 1,
    Math.max(-1, context.historyIndex),
  );
  recomposeCanvases(stateObj);
}

export async function updateOnionCanvases(
  stateObj: PartEditorState,
): Promise<void> {
  if (!stateObj.frameMode || !stateObj.onionSkin) {
    stateObj.onionCanvases = null;
    m.redraw();
    return;
  }

  try {
    const frameCount = getAnimationFrameCount(stateObj.frameAnimation);
    const previous =
      stateObj.frameIndex > 0
        ? await loadFrameCanvasesWithGlobalEdits(
            stateObj,
            stateObj.frameAnimation,
            stateObj.frameIndex - 1,
          )
        : null;
    const next =
      stateObj.frameIndex < frameCount - 1
        ? await loadFrameCanvasesWithGlobalEdits(
            stateObj,
            stateObj.frameAnimation,
            stateObj.frameIndex + 1,
          )
        : null;
    stateObj.onionCanvases = { previous, next };
    m.redraw();
  } catch (err) {
    debugWarn("Failed to load onion skin frames:", err);
    stateObj.onionCanvases = null;
  }
}

export async function loadFrameCanvasesWithGlobalEdits(
  stateObj: PartEditorState,
  animation: string,
  frameIndex: number,
): Promise<Record<Direction, HTMLCanvasElement>> {
  const frameCanvases = await loadAnimationFrameCanvases(
    stateObj,
    animation,
    frameIndex,
  );

  if (stateObj.globalEditorContext) {
    const globalCanvases = await createCanvasesFromContext(
      stateObj.globalEditorContext,
    );
    for (const direction of DIRECTIONS) {
      applyCanvasDiff(
        globalCanvases.originalCanvases[direction],
        globalCanvases.editedCanvases[direction],
        frameCanvases[direction],
      );
    }
  }

  return frameCanvases;
}

export async function loadAnimationFrameCanvases(
  stateObj: PartEditorState,
  animation: string,
  frameIndex: number,
): Promise<Record<Direction, HTMLCanvasElement>> {
  const canvases = createDirectionCanvases();
  const baseId = stateObj.baseItemId;
  if (!baseId) return canvases;

  const meta = defaultCatalog.getItemMerged(baseId).unwrapOr(null);
  if (!meta) return canvases;

  const selection = state.selections[meta.type_name];
  const recolors = getMultiRecolors(baseId, state.selections);
  const pathResult = getSpritePath(
    baseId,
    selection?.variant ?? null,
    recolors,
    state.bodyType,
    animation,
    1,
    state.selections,
    meta,
  );
  if (pathResult.isErr()) return canvases;

  const img = await loadImage(pathResult.value);
  const rowCount = Math.max(1, Math.floor(img.height / FRAME_SIZE));
  const frameCount = Math.max(1, Math.floor(img.width / FRAME_SIZE));
  const clampedFrame = clamp(frameIndex, 0, frameCount - 1);
  for (const direction of DIRECTIONS) {
    const row = rowCount >= 4 ? DIRECTION_ROWS[direction] : 0;
    const ctx = get2DContext(canvases[direction]);
    ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
    ctx.drawImage(
      img,
      clampedFrame * FRAME_SIZE,
      row * FRAME_SIZE,
      FRAME_SIZE,
      FRAME_SIZE,
      0,
      0,
      FRAME_SIZE,
      FRAME_SIZE,
    );
  }
  return canvases;
}

export function isFrameDirty(
  stateObj: PartEditorState,
  frameIndex: number,
): boolean {
  const key = getFrameContextKey(stateObj.frameAnimation, frameIndex);
  const frameContext = stateObj.frameEditorContexts[key];
  if (!frameContext) return false;
  if (!stateObj.globalEditorContext) return true;
  return (
    JSON.stringify(frameContext) !==
    JSON.stringify(stateObj.globalEditorContext)
  );
}

export async function applyGlobalToFrame(
  stateObj: PartEditorState,
): Promise<void> {
  if (!stateObj.frameMode || !stateObj.globalEditorContext) return;
  const globalContext = stateObj.globalEditorContext;
  await restoreEditorContext(stateObj, globalContext);
  saveActiveEditorContext(stateObj);
  stateObj.frameEditorContexts[
    getFrameContextKey(stateObj.frameAnimation, stateObj.frameIndex)
  ] = createEditorContextSnapshot(stateObj);
  recomposeCanvases(stateObj);
  m.redraw();
}

export function startPlayback(stateObj: PartEditorState): void {
  stateObj.isPlaying = true;
  stateObj.playbackTimer = window.setInterval(() => {
    advancePlayback(stateObj);
  }, 200);
  m.redraw();
}

export function stopPlayback(stateObj: PartEditorState): void {
  stateObj.isPlaying = false;
  if (stateObj.playbackTimer) {
    window.clearInterval(stateObj.playbackTimer);
    stateObj.playbackTimer = null;
  }
  m.redraw();
}

export function advancePlayback(stateObj: PartEditorState): void {
  const frameCount = getAnimationFrameCount(stateObj.frameAnimation);
  const nextIndex =
    stateObj.frameIndex + 1 >= frameCount ? 0 : stateObj.frameIndex + 1;
  void switchEditorContext(stateObj, true, stateObj.frameAnimation, nextIndex);
}
