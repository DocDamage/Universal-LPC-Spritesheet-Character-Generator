import m from "mithril";
import { createCanvas } from "../../../canvas/canvas-utils.ts";
import { renderCharacter } from "../../../canvas/renderer.ts";
import { ANIMATION_CONFIGS, FRAME_SIZE } from "../../../state/constants.ts";
import {
  defaultCatalog,
  deleteCustomPart,
  registerCustomPart,
} from "../../../state/catalog.ts";
import { state } from "../../../state/state.ts";
import type { Selection } from "../../../state/app-state.ts";
import type { Direction, PartEditorState } from "./types.ts";

const DRAFT_PREVIEW_PREFIX = "__part_editor_preview_";
let livePreviewTimer: number | null = null;
let livePreviewRenderSerial: Promise<void> = Promise.resolve();

type AnimationConfig = { row: number; num: number; cycle: number[] };
const animationConfigByName = ANIMATION_CONFIGS as Record<
  string,
  AnimationConfig | undefined
>;

const directionRows: Array<{ direction: Direction; row: number }> = [
  { direction: "back", row: 0 },
  { direction: "left", row: 1 },
  { direction: "front", row: 2 },
  { direction: "right", row: 3 },
];

export function schedulePartEditorLivePreview(
  editorState: PartEditorState,
): void {
  if (livePreviewTimer !== null) {
    window.clearTimeout(livePreviewTimer);
  }

  livePreviewTimer = window.setTimeout(() => {
    livePreviewTimer = null;
    updatePartEditorLivePreview(editorState);
  }, 120);
}

export function cleanupPartEditorLivePreview(
  editorState: PartEditorState,
  restoreOriginalSelection = true,
): void {
  if (livePreviewTimer !== null) {
    window.clearTimeout(livePreviewTimer);
    livePreviewTimer = null;
  }

  const draftPartId = editorState.draftPreviewPartId;
  const selectionGroup = editorState.draftPreviewSelectionGroup;
  if (draftPartId) {
    deleteCustomPart(draftPartId, { persist: false });
  }

  if (restoreOriginalSelection && selectionGroup) {
    if (editorState.draftPreviewOriginalSelection) {
      state.selections[selectionGroup] = {
        ...editorState.draftPreviewOriginalSelection,
      };
    } else {
      delete state.selections[selectionGroup];
    }
    void renderCharacter(state.selections, state.bodyType).then(() =>
      m.redraw(),
    );
  }

  editorState.draftPreviewPartId = null;
  editorState.draftPreviewSelectionGroup = null;
  editorState.draftPreviewOriginalSelection = null;
}

function updatePartEditorLivePreview(editorState: PartEditorState): void {
  if (
    !editorState.baseItemId ||
    state.editingPart?.itemId !== editorState.baseItemId
  ) {
    return;
  }

  const meta = defaultCatalog
    .getItemMerged(editorState.baseItemId)
    .unwrapOr(null);
  if (!meta) return;

  const selectionGroup = meta.type_name;
  if (!editorState.draftPreviewPartId) {
    const currentSelection = state.selections[selectionGroup];
    editorState.draftPreviewOriginalSelection = currentSelection
      ? { ...currentSelection }
      : null;
    editorState.draftPreviewSelectionGroup = selectionGroup;
    editorState.draftPreviewPartId = `${DRAFT_PREVIEW_PREFIX}${selectionGroup}_${Date.now()}`;
  }

  const draftPartId = editorState.draftPreviewPartId;
  const sheets = buildLivePreviewSheets(editorState);
  const firstSheet =
    sheets[getSheetAnimationName(state.selectedAnimation)] ??
    Object.values(sheets)[0];
  if (!firstSheet) return;

  registerCustomPart(
    {
      itemId: draftPartId,
      name: `${meta.name} live preview`,
      type_name: selectionGroup,
      baseItemId: editorState.baseItemId,
      sheets,
      image: firstSheet,
    },
    { persist: false },
  );

  const original = editorState.draftPreviewOriginalSelection;
  const nextSelection: Selection = {
    itemId: draftPartId,
    name: `${meta.name} live preview`,
    variant: original?.variant ?? null,
    recolor: original?.recolor ?? null,
    subId: original?.subId ?? null,
  };
  state.selections[selectionGroup] = nextSelection;

  livePreviewRenderSerial = livePreviewRenderSerial
    .then(() => renderCharacter(state.selections, state.bodyType))
    .then(() => m.redraw())
    .catch((err) => {
      console.error("Failed to update part editor live preview:", err);
    });
}

function buildLivePreviewSheets(
  editorState: PartEditorState,
): Record<string, HTMLCanvasElement> {
  const selectedAnimation = animationConfigByName[state.selectedAnimation]
    ? state.selectedAnimation
    : "walk";
  const animations = new Set(["walk", selectedAnimation]);
  const sheets: Record<string, HTMLCanvasElement> = {};

  for (const animationName of animations) {
    const config =
      animationConfigByName[animationName] ?? animationConfigByName["walk"];
    if (!config) continue;
    const { canvas, ctx } = createCanvas(
      FRAME_SIZE * 13,
      config.num * FRAME_SIZE,
      true,
    );
    ctx.imageSmoothingEnabled = false;
    const frameCount = Math.max(...config.cycle, 0) + 1;
    for (let frame = 0; frame < frameCount; frame++) {
      for (const { direction, row } of directionRows) {
        if (row >= config.num) continue;
        ctx.drawImage(
          editorState.canvases[direction],
          frame * FRAME_SIZE,
          row * FRAME_SIZE,
        );
      }
    }
    sheets[getSheetAnimationName(animationName)] = canvas;
  }

  return sheets;
}

function getSheetAnimationName(animationName: string): string {
  if (animationName === "combat") return "combat_idle";
  if (animationName === "1h_slash") return "backslash";
  if (animationName === "1h_backslash") return "backslash";
  if (animationName === "1h_halfslash") return "halfslash";
  return animationName;
}
