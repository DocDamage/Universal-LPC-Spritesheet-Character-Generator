// Custom weapon import — main orchestration functions

import { get2DContext } from "../../../canvas/canvas-utils.ts";
import type { CatalogReader } from "../../../state/catalog.ts";
import type { Selections } from "../../../state/state.ts";
import { customAnimations } from "../../../custom-animations.ts";
import { MAINHAND_IMPORT_TYPE_NAMES } from "./constants.ts";
import type { ImportWeaponOptions, ImportAdjustment, Rect } from "./types.ts";
import {
  loadImageFromFile,
  canvasFromImage,
  getContentBounds,
  getSourceMode,
  getStandardImportAnimations,
  getCustomImportAnimations,
  getCustomAnimationSourceMode,
  getWeaponImportDrawLayerNum,
  getLayerZPos,
  sheetHasContent,
} from "./utils.ts";
import {
  buildReferenceAnimationSheet,
  buildReferenceCustomAnimationSheet,
} from "./reference.ts";
import { alignSourceToReferenceSheet } from "./alignment.ts";
import type { CustomPart } from "../../../state/catalog.ts";

// ─── Public API ───────────────────────────────────────────────────────

export function canUseWeaponImportReference(
  catalog: CatalogReader,
  itemId: string,
): boolean {
  const meta = catalog.getItemMerged(itemId).unwrapOr(null);
  if (!meta || !MAINHAND_IMPORT_TYPE_NAMES.has(meta.type_name)) return false;
  return (
    getStandardImportAnimations(meta).length > 0 ||
    getCustomImportAnimations(meta).length > 0
  );
}

export function getCustomWeaponImportName(file: File): string {
  return file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

// ─── Import orchestration ─────────────────────────────────────────────

export async function buildImportedWeaponPart(
  options: ImportWeaponOptions,
): Promise<CustomPart> {
  const meta = options.catalog
    .getItemMerged(options.referenceItemId)
    .unwrapOr(null);
  if (!meta) {
    throw new Error("Reference weapon metadata is not available.");
  }

  const sourceImage = await loadImageFromFile(options.file);
  const sourceCanvas = canvasFromImage(sourceImage);
  const sourceMode = getSourceMode(sourceCanvas);
  const adjustment = getImportAdjustment(options);
  const sourceBounds = getContentBounds(
    get2DContext(sourceCanvas, true),
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
  );
  if (!sourceBounds) {
    throw new Error("Imported image has no visible pixels.");
  }

  const referenceVariant =
    options.referenceVariant ?? meta.variants?.[0] ?? null;
  const sheets: Record<string, HTMLCanvasElement> = {};
  for (const animation of getStandardImportAnimations(meta)) {
    const referenceSheet = await buildReferenceAnimationSheet(
      options.catalog,
      meta,
      options.referenceItemId,
      referenceVariant,
      options.bodyType,
      animation,
      options.selections,
    );
    if (!referenceSheet) continue;

    const sheet = alignSourceToReferenceSheet(
      sourceCanvas,
      sourceBounds,
      sourceMode,
      referenceSheet,
      animation,
      adjustment,
    );
    if (sheetHasContent(sheet)) {
      sheets[animation] = sheet;
    }
  }

  for (const animation of getCustomImportAnimations(meta)) {
    const referenceSheet = await buildReferenceCustomAnimationSheet(
      options.catalog,
      meta,
      options.referenceItemId,
      referenceVariant,
      options.bodyType,
      animation,
    );
    if (!referenceSheet) continue;

    const customAnimation = customAnimations[animation];
    if (!customAnimation) continue;

    const sheet = alignSourceToReferenceSheet(
      sourceCanvas,
      sourceBounds,
      getCustomAnimationSourceMode(sourceMode, sourceCanvas, referenceSheet),
      referenceSheet,
      animation,
      adjustment,
      {
        frameSize: customAnimation.frameSize,
        sourceAnimationY: 0,
      },
    );
    if (sheetHasContent(sheet)) {
      sheets[animation] = sheet;
    }
  }

  if (Object.keys(sheets).length === 0) {
    throw new Error(
      "No importable weapon or tool animations could be aligned.",
    );
  }

  const drawLayerNum = getWeaponImportDrawLayerNum(
    options.catalog,
    options.referenceItemId,
  );

  return {
    itemId: `custom_${meta.type_name}_${Date.now()}`,
    name: options.name,
    type_name: meta.type_name,
    baseItemId: options.referenceItemId,
    sheets,
    image: sheets["walk"] ?? Object.values(sheets)[0],
    drawLayerNum,
    drawZPos: getLayerZPos(
      options.catalog,
      options.referenceItemId,
      drawLayerNum,
    ),
  };
}

export async function buildImportPreview(
  file: File,
  referenceItemId: string,
  referenceVariant: string | null,
  bodyType: string,
  selections: Selections,
  catalog: CatalogReader,
): Promise<{
  referenceCanvas: HTMLCanvasElement;
  sourceCanvas: HTMLCanvasElement;
  sourceBounds: Rect;
  referenceBounds: Rect | null;
} | null> {
  const meta = catalog.getItemMerged(referenceItemId).unwrapOr(null);
  if (!meta) return null;

  const sourceImage = await loadImageFromFile(file);
  const sourceCanvas = canvasFromImage(sourceImage);
  const sourceBounds = getContentBounds(
    get2DContext(sourceCanvas, true),
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
  );
  if (!sourceBounds) return null;

  const variant = referenceVariant ?? meta.variants?.[0] ?? null;
  const standardAnimations = getStandardImportAnimations(meta);
  const customAnimationsList = getCustomImportAnimations(meta);

  let referenceCanvas: HTMLCanvasElement | null = null;
  for (const animation of standardAnimations) {
    referenceCanvas = await buildReferenceAnimationSheet(
      catalog,
      meta,
      referenceItemId,
      variant,
      bodyType,
      animation,
      selections,
    );
    if (referenceCanvas) break;
  }
  if (!referenceCanvas) {
    for (const animation of customAnimationsList) {
      referenceCanvas = await buildReferenceCustomAnimationSheet(
        catalog,
        meta,
        referenceItemId,
        variant,
        bodyType,
        animation,
      );
      if (referenceCanvas) break;
    }
  }
  if (!referenceCanvas) return null;

  const refCtx = get2DContext(referenceCanvas, true);
  const referenceBounds = getContentBounds(
    refCtx,
    0,
    0,
    referenceCanvas.width,
    referenceCanvas.height,
  );

  return { referenceCanvas, sourceCanvas, sourceBounds, referenceBounds };
}

// ─── Internal helpers ─────────────────────────────────────────────────

function getImportAdjustment(options: ImportWeaponOptions): ImportAdjustment {
  const scalePercent = Number.isFinite(options.scalePercent)
    ? options.scalePercent!
    : 100;

  return {
    offsetX: Number.isFinite(options.offsetX) ? options.offsetX! : 0,
    offsetY: Number.isFinite(options.offsetY) ? options.offsetY! : 0,
    scale: Math.max(0.1, Math.min(8, scalePercent / 100)),
  };
}
