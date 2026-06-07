import { get2DContext } from "../../canvas/canvas-utils.ts";
import { loadImage } from "../../canvas/load-image.ts";
import { ANIMATION_OFFSETS, FRAME_SIZE } from "../../state/constants.ts";
import { getSpritePath } from "../../state/path.ts";
import type {
  CatalogReader,
  CustomPart,
  ItemMerged,
} from "../../state/catalog.ts";
import type { Selections } from "../../state/state.ts";

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SourceMode = "fullSheet" | "singleImage";

type ImportWeaponOptions = {
  file: File;
  name: string;
  referenceItemId: string;
  referenceVariant: string | null;
  bodyType: string;
  selections: Selections;
  catalog: CatalogReader;
  offsetX?: number;
  offsetY?: number;
  scalePercent?: number;
};

type ReferenceSprite = {
  img: HTMLImageElement;
  zPos: number;
};

type ImportAdjustment = {
  offsetX: number;
  offsetY: number;
  scale: number;
};

const STANDARD_SHEET_WIDTH = 13 * FRAME_SIZE;
const STANDARD_SHEET_HEIGHT =
  Math.max(...Object.values(ANIMATION_OFFSETS)) + 4 * FRAME_SIZE;
const ANIMATION_OFFSET_BY_NAME = ANIMATION_OFFSETS as Record<string, number>;
const FRAMES_PER_ROW = Math.floor(STANDARD_SHEET_WIDTH / FRAME_SIZE);

export function canUseWeaponImportReference(
  catalog: CatalogReader,
  itemId: string,
): boolean {
  const meta = catalog.getItemMerged(itemId).unwrapOr(null);
  if (!meta || meta.type_name !== "weapon") return false;
  return Object.keys(ANIMATION_OFFSETS).some((animation) =>
    supportsStandardAnimation(meta, animation),
  );
}

export function getCustomWeaponImportName(file: File): string {
  return file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
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
  for (const animation of Object.keys(ANIMATION_OFFSETS)) {
    if (!supportsStandardAnimation(meta, animation)) continue;

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

  if (Object.keys(sheets).length === 0) {
    throw new Error("No standard weapon animations could be aligned.");
  }

  const drawLayerNum = getWeaponImportDrawLayerNum(
    options.catalog,
    options.referenceItemId,
  );

  return {
    itemId: `custom_weapon_${Date.now()}`,
    name: options.name,
    type_name: "weapon",
    baseItemId: options.referenceItemId,
    sheets,
    image: sheets.walk ?? Object.values(sheets)[0],
    drawLayerNum,
    drawZPos: getLayerZPos(
      options.catalog,
      options.referenceItemId,
      drawLayerNum,
    ),
  };
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

async function buildReferenceAnimationSheet(
  catalog: CatalogReader,
  meta: ItemMerged,
  itemId: string,
  variant: string | null,
  bodyType: string,
  animation: string,
  selections: Selections,
): Promise<HTMLCanvasElement | null> {
  const sprites: ReferenceSprite[] = [];
  for (let layerNum = 1; layerNum < 10; layerNum += 1) {
    const layer = meta.layers?.[`layer_${layerNum}`];
    if (!layer) break;
    if (layer.custom_animation) continue;

    const pathResult = getSpritePath(
      itemId,
      variant,
      null,
      bodyType,
      animation,
      layerNum,
      selections,
      meta,
    );
    if (pathResult.isErr()) continue;

    try {
      const img = await loadImage(pathResult.value);
      sprites.push({ img, zPos: getLayerZPos(catalog, itemId, layerNum) });
    } catch {
      // Missing variants are common in the generated catalog; simply omit them.
    }
  }
  if (sprites.length === 0) return null;

  const width = Math.max(...sprites.map((sprite) => sprite.img.width));
  const height = Math.max(...sprites.map((sprite) => sprite.img.height));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = get2DContext(canvas, true);
  sprites
    .sort((a, b) => a.zPos - b.zPos)
    .forEach((sprite) => ctx.drawImage(sprite.img, 0, 0));
  return canvas;
}

function getLayerZPos(
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

function alignSourceToReferenceSheet(
  sourceCanvas: HTMLCanvasElement,
  sourceBounds: Rect,
  sourceMode: SourceMode,
  referenceSheet: HTMLCanvasElement,
  animation: string,
  adjustment: ImportAdjustment,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = referenceSheet.width;
  out.height = referenceSheet.height;
  const outCtx = get2DContext(out, true);
  const refCtx = get2DContext(referenceSheet, true);
  const sourceCtx = get2DContext(sourceCanvas, true);
  const rowCount = Math.floor(referenceSheet.height / FRAME_SIZE);
  const colCount = Math.min(
    FRAMES_PER_ROW,
    Math.floor(referenceSheet.width / FRAME_SIZE),
  );
  const sourceAnimationY = ANIMATION_OFFSET_BY_NAME[animation] ?? 0;

  for (let row = 0; row < rowCount; row += 1) {
    for (let col = 0; col < colCount; col += 1) {
      const frameX = col * FRAME_SIZE;
      const frameY = row * FRAME_SIZE;
      const referenceBounds = getContentBounds(
        refCtx,
        frameX,
        frameY,
        FRAME_SIZE,
        FRAME_SIZE,
      );
      if (!referenceBounds) continue;

      const sourceFrameBounds =
        sourceMode === "fullSheet"
          ? getContentBounds(
              sourceCtx,
              frameX,
              sourceAnimationY + frameY,
              FRAME_SIZE,
              FRAME_SIZE,
            )
          : sourceBounds;
      if (!sourceFrameBounds) continue;

      drawAlignedFrame(
        outCtx,
        sourceCanvas,
        sourceFrameBounds,
        referenceBounds,
        sourceMode,
        adjustment,
        row === 3,
      );
    }
  }

  return out;
}

function drawAlignedFrame(
  targetCtx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  sourceBounds: Rect,
  referenceBounds: Rect,
  sourceMode: SourceMode,
  adjustment: ImportAdjustment,
  mirrorX: boolean,
): void {
  const referenceCenterX = referenceBounds.x + referenceBounds.width / 2;
  const referenceCenterY = referenceBounds.y + referenceBounds.height / 2;
  const baseScale =
    sourceMode === "singleImage"
      ? Math.min(
          referenceBounds.width / sourceBounds.width,
          referenceBounds.height / sourceBounds.height,
        )
      : 1;
  const scale = baseScale * adjustment.scale;
  const width = Math.max(1, Math.round(sourceBounds.width * scale));
  const height = Math.max(1, Math.round(sourceBounds.height * scale));
  const directionalOffsetX = mirrorX ? -adjustment.offsetX : adjustment.offsetX;
  const targetX = Math.round(referenceCenterX - width / 2 + directionalOffsetX);
  const targetY = Math.round(
    referenceCenterY - height / 2 + adjustment.offsetY,
  );

  if (mirrorX) {
    targetCtx.save();
    targetCtx.translate(targetX + width, targetY);
    targetCtx.scale(-1, 1);
    targetCtx.drawImage(
      sourceCanvas,
      sourceBounds.x,
      sourceBounds.y,
      sourceBounds.width,
      sourceBounds.height,
      0,
      0,
      width,
      height,
    );
    targetCtx.restore();
    return;
  }

  targetCtx.drawImage(
    sourceCanvas,
    sourceBounds.x,
    sourceBounds.y,
    sourceBounds.width,
    sourceBounds.height,
    targetX,
    targetY,
    width,
    height,
  );
}

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

function getSourceMode(sourceCanvas: HTMLCanvasElement): SourceMode {
  return sourceCanvas.width >= STANDARD_SHEET_WIDTH &&
    sourceCanvas.height >= STANDARD_SHEET_HEIGHT
    ? "fullSheet"
    : "singleImage";
}

function sheetHasContent(canvas: HTMLCanvasElement): boolean {
  const ctx = get2DContext(canvas, true);
  return !!getContentBounds(ctx, 0, 0, canvas.width, canvas.height);
}

function getContentBounds(
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

function canvasFromImage(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  get2DContext(canvas, true).drawImage(img, 0, 0);
  return canvas;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
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
