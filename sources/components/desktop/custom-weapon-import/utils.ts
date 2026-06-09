// Custom weapon import — canvas / IO utilities & animation helpers

import { createCanvas, get2DContext } from "../../../canvas/canvas-utils.ts";
import type { ItemMerged } from "../../../state/catalog.ts";
import type { CatalogReader } from "../../../state/catalog.ts";
import { ANIMATION_OFFSETS } from "../../../state/constants.ts";
import { customAnimations } from "../../../custom-animations.ts";
import {
  STANDARD_SHEET_WIDTH,
  STANDARD_SHEET_HEIGHT,
} from "./constants.ts";
import type { Rect, SourceMode } from "./types.ts";

// ─── Canvas / IO ───────────────────────────────────────────────────────

export function canvasFromImage(img: HTMLImageElement): HTMLCanvasElement {
  const { canvas } = createCanvas(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    true,
  );
  get2DContext(canvas, true).drawImage(img, 0, 0);
  return canvas;
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to load imported image."));
    };
    img.src = url;
  });
}

// ─── Bounds detection ─────────────────────────────────────────────────

export function getContentBounds(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): Rect | null {
  const imageData = ctx.getImageData(x, y, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const alpha = imageData.data[(py * width + px) * 4 + 3];
      if (alpha === 0) continue;
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return {
    x: x + minX,
    y: y + minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

// ─── Source mode ──────────────────────────────────────────────────────

export function getSourceMode(sourceCanvas: HTMLCanvasElement): SourceMode {
  return sourceCanvas.width >= STANDARD_SHEET_WIDTH &&
    sourceCanvas.height >= STANDARD_SHEET_HEIGHT
    ? "fullSheet"
    : "singleImage";
}

export function getCustomAnimationSourceMode(
  sourceMode: SourceMode,
  sourceCanvas: HTMLCanvasElement,
  referenceSheet: HTMLCanvasElement,
): SourceMode {
  if (sourceMode === "fullSheet") return "singleImage";
  return sourceCanvas.width >= referenceSheet.width &&
    sourceCanvas.height >= referenceSheet.height
    ? "fullSheet"
    : "singleImage";
}

export function sheetHasContent(canvas: HTMLCanvasElement): boolean {
  const ctx = get2DContext(canvas, true);
  return !!getContentBounds(ctx, 0, 0, canvas.width, canvas.height);
}

// ─── Animation helpers ────────────────────────────────────────────────

export function getStandardImportAnimations(meta: ItemMerged): string[] {
  return Object.keys(ANIMATION_OFFSETS).filter((animation) =>
    supportsStandardAnimation(meta, animation),
  );
}

export function getCustomImportAnimations(meta: ItemMerged): string[] {
  const animations: string[] = [];
  for (const layer of Object.values(meta.layers ?? {})) {
    const customAnimation = layer.custom_animation;
    if (
      customAnimation &&
      customAnimations[customAnimation] &&
      !animations.includes(customAnimation)
    ) {
      animations.push(customAnimation);
    }
  }
  return animations;
}

function supportsStandardAnimation(
  meta: ItemMerged,
  animation: string,
): boolean {
  if (!meta.animations || meta.animations.length === 0) return false;
  if (animation === "combat_idle") return meta.animations.includes("combat");
  if (animation === "backslash") {
    return (
      meta.animations.includes("1h_slash") ||
      meta.animations.includes("1h_backslash")
    );
  }
  if (animation === "halfslash") {
    return meta.animations.includes("1h_halfslash");
  }
  return meta.animations.includes(animation);
}

// ─── Layer helpers ────────────────────────────────────────────────────

export function getLayerZPos(
  catalog: CatalogReader,
  itemId: string,
  layerNum: number,
): number {
  const layers = catalog.getItemLayers(itemId).unwrapOr({}) as Record<
    string,
    { zPos?: number }
  >;
  return Number(layers[`layer_${layerNum}`]?.zPos ?? 0);
}

export function getWeaponImportDrawLayerNum(
  catalog: CatalogReader,
  itemId: string,
): number {
  const meta = catalog.getItemMerged(itemId).unwrapOr(null);
  if (!meta) return 1;

  let bestLayerNum = 1;
  let bestZPos = Number.NEGATIVE_INFINITY;
  for (const [layerKey, layer] of Object.entries(meta.layers ?? {})) {
    const match = /^layer_(\d+)$/.exec(layerKey);
    const zPos = Number(layer.zPos);
    if (!match || !Number.isFinite(zPos)) continue;
    if (zPos > bestZPos) {
      bestZPos = zPos;
      bestLayerNum = Number(match[1]);
    }
  }
  return bestLayerNum;
}
