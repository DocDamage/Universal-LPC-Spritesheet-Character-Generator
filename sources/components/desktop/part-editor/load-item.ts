import m from "mithril";
import { loadImage } from "../../../canvas/load-image.ts";
import { get2DContext } from "../../../canvas/canvas-utils.ts";
import { customAnimations } from "../../../custom-animations.ts";
import { FRAME_SIZE } from "../../../state/constants.ts";
import { defaultCatalog } from "../../../state/catalog.ts";
import { getSpritePath } from "../../../state/path.ts";
import { state } from "../../../state/state.ts";
import { getMultiRecolors } from "../../../state/palettes.ts";
import { variantToFilename } from "../../../utils/helpers.ts";
import { debugWarn } from "../../../utils/debug.ts";
import { DIRECTIONS } from "../pixel-editor-tools.ts";
import type { PartEditorState } from "./types.ts";
import { cropFrame, recomposeCanvases } from "./canvas.ts";
import { resetEditLayers } from "./layers.ts";
import { getAvailableFrameAnimations } from "./animation.ts";
import { createEditorContextSnapshot, saveHistory } from "./history.ts";
import { checkForDraftRecovery } from "./autosave.ts";
import { clearSelectionState } from "./selection.ts";

type EditingPart = { slotLabel: string; itemId: string };

function startBlankEditorCanvases(stateObj: PartEditorState): void {
  for (const key of DIRECTIONS) {
    get2DContext(stateObj.originalCanvases[key]).clearRect(
      0,
      0,
      FRAME_SIZE,
      FRAME_SIZE,
    );
  }
  resetEditLayers(stateObj);
  recomposeCanvases(stateObj);
  stateObj.loading = false;
  saveHistory(stateObj);
  stateObj.globalEditorContext = createEditorContextSnapshot(stateObj);
}

function finishLoadedImage(
  stateObj: PartEditorState,
  editing: EditingPart,
  img: HTMLImageElement,
): void {
  const frames = {
    back: cropFrame(img, 0, 0),
    left: cropFrame(img, 1, 0),
    front: cropFrame(img, 2, 0),
    right: cropFrame(img, 3, 0),
  };
  for (const key of DIRECTIONS) {
    const originalCtx = get2DContext(stateObj.originalCanvases[key]);
    originalCtx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
    originalCtx.drawImage(frames[key], 0, 0);
  }
  resetEditLayers(stateObj);
  recomposeCanvases(stateObj);
  stateObj.loading = false;
  saveHistory(stateObj);
  stateObj.globalEditorContext = createEditorContextSnapshot(stateObj);
  void checkForDraftRecovery(stateObj, editing.itemId);
  m.redraw();
}

export function loadPartEditorItemIfNeeded(
  stateObj: PartEditorState,
  editing: EditingPart,
): void {
  if (stateObj.baseItemId === editing.itemId) return;

  stateObj.baseItemId = editing.itemId;
  stateObj.loading = true;
  stateObj.history = [];
  stateObj.historyIndex = -1;
  stateObj.frameMode = false;
  stateObj.frameIndex = 0;
  stateObj.frameEditorContexts = {};
  stateObj.globalEditorContext = null;
  stateObj.onionCanvases = null;
  clearSelectionState(stateObj, false);

  const meta = defaultCatalog.getItemMerged(editing.itemId).unwrapOr(null);
  if (!meta) {
    stateObj.loading = false;
    return;
  }

  stateObj.name = `Custom ${meta.name}`;
  stateObj.availableFrameAnimations = getAvailableFrameAnimations(meta);
  stateObj.frameAnimation = stateObj.availableFrameAnimations[0] ?? "walk";

  const firstAnim = meta.animations?.[0] ?? "walk";
  const isCustomOnly = !!(
    firstAnim &&
    customAnimations &&
    (customAnimations as Record<string, unknown>)[firstAnim]
  );

  let imagePromise: Promise<HTMLImageElement> | null = null;
  const selection = state.selections[meta.type_name];
  const itemVariant = selection?.variant ?? "";
  const recolors = getMultiRecolors(editing.itemId, state.selections);

  if (isCustomOnly) {
    const layer = meta.layers?.["layer_1"];
    const basePath = layer?.[state.bodyType] as string | undefined;
    if (basePath) {
      const spritePath = `spritesheets/${basePath}${variantToFilename(itemVariant || (meta.variants?.[0] ?? ""))}.png`;
      imagePromise = loadImage(spritePath);
    }
  }

  if (!imagePromise) {
    const pathResult = getSpritePath(
      editing.itemId,
      itemVariant || null,
      recolors,
      state.bodyType,
      "walk",
      1,
      state.selections,
      meta,
    );
    if (pathResult.isOk()) {
      imagePromise = loadImage(pathResult.value);
    }
  }

  if (imagePromise) {
    imagePromise
      .then((img) => finishLoadedImage(stateObj, editing, img))
      .catch((err) => {
        debugWarn(
          "Failed to load spritesheet for editing, starting with blank canvas:",
          err,
        );
        startBlankEditorCanvases(stateObj);
        void checkForDraftRecovery(stateObj, editing.itemId);
        m.redraw();
      });
    return;
  }

  startBlankEditorCanvases(stateObj);
  void checkForDraftRecovery(stateObj, editing.itemId);
}
