import { ok, err, type Result } from "neverthrow";
import { drawFramesToCustomAnimation } from "../canvas/draw-frames.ts";
import {
  customAnimationSize,
  type CustomAnimationDefinition,
} from "../custom-animations.ts";
import {
  canvasToBlob,
  createCanvas,
  get2DContext,
  hasContentInRegion,
} from "../canvas/canvas-utils.ts";
import { debugLog } from "../utils/debug.ts";
import { getAllCredits, creditsToTxt, creditsToCsv } from "./credits.ts";
import { exportStateAsJSON, serializeLayersForJson } from "../state/json.ts";
import { showToast } from "../state/notifications.ts";
import type { ZipExportProfiler } from "../performance-profiler.ts";
import type { State } from "../state/state.ts";
import type { DrawCall } from "../state/render-state.ts";

export {
  checkFrameContentFromImageData,
  composeFrameRowsToSpritesheet,
  CUSTOM_ANIM_DIRECTION_TO_ROW,
  expandExtractedFramesWithTweens,
  extractFramesFromAnimation,
  extractFramesFromCustomAnimation,
} from "./zip-frame-extraction.ts";
export type { ExtractedFrames } from "./zip-frame-extraction.ts";

/**
 * Subset of the JSZip folder API consumed by these helpers and downstream
 * `zip.ts`. `window.JSZip` is provided by the runtime bundle. Pinning the
 * shape here lets the consumer reuse it via a single import.
 */
export type ZipFolder = {
  /** Present on JSZip folder instances; used in debug logging. */
  root?: string;
  folder: (name: string) => ZipFolder;
  file: (name: string, data: Blob | string) => void;
  generateAsync: (options: { type: "blob" }) => Promise<Blob>;
};

type RectLike = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function normalizeAnimationSrcRect(
  src: HTMLCanvasElement,
  srcRect: DOMRect | RectLike | undefined,
): RectLike {
  return srcRect
    ? {
        x: srcRect.x,
        y: srcRect.y,
        width: srcRect.width,
        height: srcRect.height,
      }
    : {
        x: 0,
        y: 0,
        width: src.width,
        height: src.height,
      };
}

function animationSubregionHasContent(
  src: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  const fromSubregion =
    x !== 0 || y !== 0 || width !== src.width || height !== src.height;
  if (fromSubregion) {
    const srcCtx = get2DContext(src, true);
    if (!hasContentInRegion(srcCtx, x, y, width, height)) {
      return false;
    }
  }
  return true;
}

/** Draws the slice from `src` onto `animCanvas` (must already match width/height). */
function drawAnimationSliceOntoCanvas(
  src: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  animCanvas: HTMLCanvasElement,
): void {
  const animCtx = get2DContext(animCanvas, true);
  if (!animCtx) {
    throw new Error("Failed to get canvas context");
  }
  animCtx.drawImage(src, x, y, width, height, 0, 0, width, height);
}

/** Why a slice operation produced no canvas (vs. the caller misusing the API). */
export type AnimationSliceError = { kind: "empty-subregion" };

/**
 * Carve a subregion out of `src` onto a fresh canvas. Errs with
 * `empty-subregion` when the region has no non-transparent pixels (callers
 * route this to "skip the export" without conflating it with a load error).
 * Use {@link addCanvasToZip} for the "encode the whole source" case.
 */
export function newAnimationFromSheet(
  src: HTMLCanvasElement,
  srcRect: DOMRect | RectLike,
): Result<HTMLCanvasElement, AnimationSliceError> {
  const { x, y, width, height } = normalizeAnimationSrcRect(src, srcRect);
  if (!animationSubregionHasContent(src, x, y, width, height)) {
    return err({ kind: "empty-subregion" });
  }

  const animCanvas = document.createElement("canvas");
  animCanvas.width = width;
  animCanvas.height = height;
  drawAnimationSliceOntoCanvas(src, x, y, width, height, animCanvas);

  return ok(animCanvas);
}

/** Subset of `ZipExportProfiler` used by this module's instrumentation hooks. */
type ZipHelpersProfiler = Pick<
  ZipExportProfiler,
  "phase" | "incrementCounter" | "addCounter"
>;

async function runZipProfilerPhase(
  profiler: ZipHelpersProfiler | null | undefined,
  name: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  if (profiler && typeof profiler.phase === "function") {
    return profiler.phase(name, fn);
  }
  await fn();
}

function zipProfilerNotePngEncode(
  profiler: ZipHelpersProfiler | null | undefined,
  blob: Blob | undefined,
): void {
  if (!profiler || !blob) return;
  if (typeof profiler.incrementCounter === "function") {
    profiler.incrementCounter("pngEncodeCount");
  }
  if (typeof profiler.addCounter === "function") {
    profiler.addCounter("totalPngBytes", blob.size);
  }
}

function zipProfilerNoteDrawAndSlice(
  profiler: ZipHelpersProfiler | null | undefined,
): void {
  if (!profiler || typeof profiler.incrementCounter !== "function") return;
  profiler.incrementCounter("drawAndSliceCount");
}

function zipProfilerNoteZipEntry(
  profiler: ZipHelpersProfiler | null | undefined,
): void {
  if (!profiler || typeof profiler.incrementCounter !== "function") return;
  profiler.incrementCounter("zipFileEntryCount");
}

type ZipPhaseOptions = { profiler?: ZipHelpersProfiler };

function ensureZipEntryName(fileName: string): string {
  return fileName.endsWith(".png") ? fileName : `${fileName}.png`;
}

async function encodeAndAddToZip(
  folder: ZipFolder,
  fileName: string,
  canvas: HTMLCanvasElement,
  profiler: ZipHelpersProfiler | null,
): Promise<void> {
  let blob: Blob | undefined;
  await runZipProfilerPhase(profiler, "pngEncode", async () => {
    blob = await canvasToBlob(canvas);
  });
  if (!blob) return;
  zipProfilerNotePngEncode(profiler, blob);

  const zipEntryName = ensureZipEntryName(fileName);
  debugLog(
    `Adding to ZIP: `,
    `${folder.root ?? ""}${zipEntryName}`,
    "size: ",
    blob.size,
  );
  const sealedBlob: Blob = blob;
  await runZipProfilerPhase(profiler, "zipFile", async () => {
    folder.file(zipEntryName, sealedBlob);
  });
  zipProfilerNoteZipEntry(profiler);
}

/** Why an "add to zip" operation produced no entry. */
export type ZipAddError = { kind: "missing-src" } | { kind: "empty-subregion" };

/**
 * Carve a subregion out of `srcCanvas` and add it as a PNG entry under
 * `fileName`. Errs with `empty-subregion` when the subregion is fully
 * transparent (no entry written), or `missing-src` when `srcCanvas` is
 * falsy. Returns the new sliced canvas on success.
 */
export async function addAnimationSliceToZip(
  folder: ZipFolder,
  fileName: string,
  srcCanvas: HTMLCanvasElement,
  srcRect: DOMRect | RectLike,
  options: ZipPhaseOptions = {},
): Promise<Result<HTMLCanvasElement, ZipAddError>> {
  if (!srcCanvas) return err({ kind: "missing-src" });

  const profiler = options.profiler ?? null;
  let sliceResult: Result<HTMLCanvasElement, AnimationSliceError> | undefined;
  await runZipProfilerPhase(profiler, "drawAndSlice", async () => {
    sliceResult = newAnimationFromSheet(srcCanvas, srcRect);
  });
  // `runZipProfilerPhase` runs `fn` synchronously enough for `sliceResult`
  // to be set before this line; the `!` documents that contract.
  const sliced = sliceResult!;
  if (sliced.isErr()) return err(sliced.error);

  zipProfilerNoteDrawAndSlice(profiler);
  await encodeAndAddToZip(folder, fileName, sliced.value, profiler);
  return ok(sliced.value);
}

/**
 * Add the whole `srcCanvas` as a PNG entry under `fileName`. No slicing, no
 * subregion-content check. Errs with `missing-src` when `srcCanvas` is
 * falsy.
 */
export async function addCanvasToZip(
  folder: ZipFolder,
  fileName: string,
  srcCanvas: HTMLCanvasElement,
  options: ZipPhaseOptions = {},
): Promise<Result<HTMLCanvasElement, ZipAddError>> {
  if (!srcCanvas) return err({ kind: "missing-src" });

  const profiler = options.profiler ?? null;
  await encodeAndAddToZip(folder, fileName, srcCanvas, profiler);
  return ok(srcCanvas);
}

/**
 * Renders the full custom animation layout from drawable `src` (e.g. a layer
 * sprite) onto a new canvas sized to that animation via `customAnimationSize`.
 */
export function newStandardAnimationForCustomAnimation(
  src: HTMLCanvasElement | HTMLImageElement,
  custAnim: CustomAnimationDefinition,
): HTMLCanvasElement {
  const { width: custWidth, height: custHeight } =
    customAnimationSize(custAnim);
  const { canvas: custCanvas } = createCanvas(custWidth, custHeight);
  const custCtx = get2DContext(custCanvas, true);
  if (!custCtx) {
    throw new Error("Failed to get canvas context");
  }
  drawFramesToCustomAnimation(custCtx, custAnim, 0, src);
  return custCanvas;
}

/**
 * Encodes the standard-animation slice for a custom animation as PNG and adds
 * it to a JSZip subfolder under the given filename.
 */
export async function addStandardAnimationToZipCustomFolder(
  custAnimFolder: ZipFolder,
  itemFileName: string,
  src: HTMLCanvasElement | HTMLImageElement,
  custAnim: CustomAnimationDefinition,
  options: ZipPhaseOptions = {},
): Promise<HTMLCanvasElement | undefined> {
  const profiler = options.profiler ?? null;
  let custCanvas: HTMLCanvasElement | undefined;
  await runZipProfilerPhase(profiler, "drawAndSlice", async () => {
    custCanvas = newStandardAnimationForCustomAnimation(src, custAnim);
  });
  if (!custCanvas) {
    return undefined;
  }
  zipProfilerNoteDrawAndSlice(profiler);
  let custBlob: Blob | undefined;
  await runZipProfilerPhase(profiler, "pngEncode", async () => {
    custBlob = await canvasToBlob(custCanvas as HTMLCanvasElement);
  });
  if (custBlob) {
    zipProfilerNotePngEncode(profiler, custBlob);
  }
  await runZipProfilerPhase(profiler, "zipFile", async () => {
    if (custBlob) custAnimFolder.file(itemFileName, custBlob);
  });
  zipProfilerNoteZipEntry(profiler);
  return custCanvas;
}

/** ISO-like filename token for ZIP names (no colons). */
export function zipExportTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
}

/** Globals required for ZIP export at runtime. */
type WindowWithZipDeps = Window & {
  canvasRenderer?: unknown;
  JSZip?: new () => ZipFolder;
};

export function guardZipExportEnvironment(): boolean {
  const w = window as WindowWithZipDeps;
  if (!w.canvasRenderer || !w.JSZip) {
    showToast("JSZip library not loaded", { kind: "warning" });
    return false;
  }
  return true;
}

/**
 * Writes `character.json` at zip root and `credits.txt` / `credits.csv` under `creditsFolder`.
 */
export function addCharacterJsonAndCredits(
  zip: ZipFolder,
  creditsFolder: ZipFolder,
  state: State,
  drawCalls: readonly DrawCall[],
): void {
  zip.file(
    "character.json",
    exportStateAsJSON(state, serializeLayersForJson(drawCalls)),
  );
  const allCredits = getAllCredits(state.selections, state.bodyType);
  creditsFolder.file("credits.txt", creditsToTxt(allCredits));
  creditsFolder.file("credits.csv", creditsToCsv(allCredits));
}

/** Exposes a snapshot of the last completed export's profile for debugging. */
type WindowWithProfileSnapshot = Window & {
  __lastZipExportProfile?: ReturnType<ZipExportProfiler["toMetadata"]>;
  __zipExportProfiles?: Record<
    string,
    ReturnType<ZipExportProfiler["toMetadata"]>
  >;
};

/** Runs the `generateZip` profiler phase, `generateAsync({ type: "blob" })`, and `logReport()`. */
export async function zipGenerateBlobWithProfiler(
  profiler: ZipExportProfiler,
  zip: ZipFolder,
): Promise<Blob> {
  let zipBlob: Blob | undefined;
  await profiler.phase("generateZip", async () => {
    zipBlob = await zip.generateAsync({ type: "blob" });
  });
  profiler.logReport();
  if (
    typeof window !== "undefined" &&
    typeof profiler.toMetadata === "function"
  ) {
    const meta = profiler.toMetadata();
    const w = window as WindowWithProfileSnapshot;
    w.__lastZipExportProfile = meta;
    w.__zipExportProfiles = w.__zipExportProfiles || {};
    w.__zipExportProfiles[meta.exportKind] = meta;
  }
  // `zipBlob` is set inside the profiler.phase callback above.
  return zipBlob as Blob;
}

export function downloadZipBlob(zipBlob: Blob, filename: string): void {
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
