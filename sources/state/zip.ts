import {
  ANIMATIONS,
  ANIMATION_CONFIGS,
  FRAME_SIZE,
  DIRECTIONS,
} from "./constants.ts";
import { defaultCatalog, getItemMerged } from "./catalog.ts";
import {
  extractAnimationFromCanvas,
  renderSingleItem,
  renderSingleItemAnimation,
  SHEET_HEIGHT,
  canvas,
} from "../canvas/renderer.ts";
import { renderState } from "./render-state.ts";
import { getMultiRecolors } from "./palettes.ts";
import { getItemFileName } from "../utils/fileName.ts";
import { loadImage } from "../canvas/load-image.ts";
import { getImageToDraw } from "../canvas/palette-recolor.ts";
import { customAnimations, customAnimationSize } from "../custom-animations.ts";
import { getSortedLayersWithCustomFallback } from "./meta.ts";
import { canvasToBlob } from "../canvas/canvas-utils.ts";
import {
  addAnimationSliceToZip,
  addCanvasToZip,
  addStandardAnimationToZipCustomFolder,
  composeFrameRowsToSpritesheet,
  addCharacterJsonAndCredits,
  downloadZipBlob,
  extractFramesFromAnimation,
  extractFramesFromCustomAnimation,
  expandExtractedFramesWithTweens,
  guardZipExportEnvironment,
  newAnimationFromSheet,
  zipExportTimestamp,
  zipGenerateBlobWithProfiler,
} from "../utils/zip-helpers.ts";
import type { ZipFolder } from "../utils/zip-helpers.ts";
import m from "mithril";
import { debugLog, debugWarn } from "../utils/debug.ts";
import { createZipExportProfiler } from "../performance-profiler.ts";
import {
  beginZipExportUiSuspend,
  endZipExportUiSuspend,
} from "../utils/zip-export-ui-suspend.ts";
import type { State } from "./state.ts";
import { showToast } from "./notifications.ts";
import {
  buildTweenExportReadme,
  buildTweenEnginePresets,
  estimateTweenExportFrames,
  getGlobalTweenSettings,
  getTweenSettingsForAnimation,
} from "./tween-settings.ts";

declare global {
  interface Window {
    /** JSZip constructor attached at runtime by `vendor-globals.js`. */
    JSZip?: new () => ZipFolder;
  }
}

/**
 * ZIP download pack exports. Each flow uses `createZipExportProfiler` (see
 * `performance-profiler.ts`) for `credits/metadata.json` timings where applicable,
 * suspends UI redraw/preview during export (`zip-export-ui-suspend.ts`), and uses
 * `zipGenerateBlobWithProfiler` for the final blob.
 *
 * Reviewer map: `PERFORMANCE_PROFILING.md` → "Reviewing ZIP performance changes (PR)".
 */

type ExportSplitAnimationsDeps = {
  addAnimationSliceToZip: typeof addAnimationSliceToZip;
  addCanvasToZip: typeof addCanvasToZip;
  composeFrameRowsToSpritesheet: typeof composeFrameRowsToSpritesheet;
  expandExtractedFramesWithTweens: typeof expandExtractedFramesWithTweens;
  extractFramesFromAnimation: typeof extractFramesFromAnimation;
  extractFramesFromCustomAnimation: typeof extractFramesFromCustomAnimation;
};

type ExportSplitItemSheetsDeps = {
  addCanvasToZip: typeof addCanvasToZip;
  renderSingleItem: typeof renderSingleItem;
};

type ExportSplitItemAnimationsDeps = {
  addAnimationSliceToZip: typeof addAnimationSliceToZip;
  addCanvasToZip: typeof addCanvasToZip;
  renderSingleItemAnimation: typeof renderSingleItemAnimation;
  loadImage: typeof loadImage;
  addStandardAnimationToZipCustomFolder: typeof addStandardAnimationToZipCustomFolder;
  getImageToDraw: typeof getImageToDraw;
};

type ExportIndividualFramesDeps = {
  extractAnimationFromCanvas: typeof extractAnimationFromCanvas;
  extractFramesFromAnimation: typeof extractFramesFromAnimation;
  expandExtractedFramesWithTweens: typeof expandExtractedFramesWithTweens;
  canvasToBlob: typeof canvasToBlob;
  newAnimationFromSheet: typeof newAnimationFromSheet;
  extractFramesFromCustomAnimation: typeof extractFramesFromCustomAnimation;
};

type BlobTask = {
  encode: () => Promise<Blob>;
  folder: ZipFolder;
  filename: string;
  debugPath: string;
};

type BlobTaskResult = BlobTask & {
  blob: Blob | null;
  success: boolean;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function showZipSuccess(message = "Export complete!"): void {
  showToast(message, { kind: "success", timeoutMs: 7000 });
}

function showZipWarning(message: string): void {
  showToast(message.trim(), { kind: "warning", timeoutMs: 9000 });
}

function showZipFailure(err: unknown): void {
  showToast(`Export failed: ${errorMessage(err)}`, {
    kind: "error",
    timeoutMs: 9000,
  });
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Create profiler-injected zip adder functions. */
function makeZipAdders(
  profiler: ReturnType<typeof createZipExportProfiler>,
  deps?: Partial<{
    addAnimationSliceToZip: typeof addAnimationSliceToZip;
    addCanvasToZip: typeof addCanvasToZip;
    addStandardAnimationToZipCustomFolder: typeof addStandardAnimationToZipCustomFolder;
  }>,
) {
  const baseAddCanvasToZip = deps?.addCanvasToZip ?? addCanvasToZip;
  const baseAddSlice = deps?.addAnimationSliceToZip ?? addAnimationSliceToZip;
  const baseAddStandard =
    deps?.addStandardAnimationToZipCustomFolder ??
    addStandardAnimationToZipCustomFolder;

  const addCanvas: typeof baseAddCanvasToZip = (folder, fileName, srcCanvas) =>
    baseAddCanvasToZip(folder, fileName, srcCanvas, { profiler });
  const addSlice: typeof baseAddSlice = (
    folder,
    fileName,
    srcCanvas,
    srcRect,
  ) => baseAddSlice(folder, fileName, srcCanvas, srcRect, { profiler });
  const addStandardAnimation: typeof baseAddStandard = (
    custAnimFolder,
    itemFileName,
    src,
    custAnim,
  ) =>
    baseAddStandard(custAnimFolder, itemFileName, src, custAnim, { profiler });

  return { addCanvas, addSlice, addStandardAnimation };
}

/** Append tween-export README and engine presets to the ZIP when enabled. */
function addTweenExportFiles(
  zip: ZipFolder,
  creditsFolder: ZipFolder,
  exportKind: Parameters<typeof buildTweenExportReadme>[0],
): void {
  creditsFolder.file(
    "TWEEN_EXPORT_README.txt",
    buildTweenExportReadme(exportKind),
  );
  const presetFolder = zip.folder("engine-presets")!;
  for (const preset of buildTweenEnginePresets(exportKind, FRAME_SIZE)) {
    presetFolder.file(`${preset.engine}.json`, JSON.stringify(preset, null, 2));
  }
}

type ZipExportContext = {
  zip: ZipFolder;
  timestamp: string;
  state: State;
  bodyType: string;
  profiler: ReturnType<typeof createZipExportProfiler>;
  creditsFolder: ZipFolder;
};

type ZipExportResult = {
  metadata?: object;
  warningMessage?: string;
  successMessage?: string;
  includeTweenFiles?: boolean;
  tweenExportKind?: Parameters<typeof buildTweenExportReadme>[0];
  beforeGenerateZip?: () => void;
};

type ZipExportStateKey =
  | "zipByAnimation"
  | "zipByItem"
  | "zipByAnimationAndItem"
  | "zipIndividualFrames";

/** Shared lifecycle wrapper for all ZIP export flows. */
async function runZipExport(
  profilerName: string,
  stateKey: ZipExportStateKey,
  buildFilename: (bodyType: string, timestamp: string) => string,
  execute: (ctx: ZipExportContext) => Promise<ZipExportResult>,
  errorPrefix = "Export failed:",
): Promise<void> {
  if (!guardZipExportEnvironment()) return;
  let state: State | undefined;
  const profiler = createZipExportProfiler(profilerName);
  try {
    const zip = new window.JSZip!();
    const timestamp = zipExportTimestamp();
    state = (await import("./state.ts")).state;
    state[stateKey].isRunning = true;
    m.redraw();
    beginZipExportUiSuspend();
    const bodyType = state.bodyType;
    const creditsFolder = zip.folder("credits")!;

    const result = await execute({
      zip,
      timestamp,
      state,
      bodyType,
      profiler,
      creditsFolder,
    });

    await profiler.phase("staticFiles", async () => {
      addCharacterJsonAndCredits(
        zip,
        creditsFolder,
        state!,
        renderState.drawCalls,
      );
    });

    if (result.metadata) {
      creditsFolder.file(
        "metadata.json",
        JSON.stringify(result.metadata, null, 2),
      );
    }

    if (result.includeTweenFiles && result.tweenExportKind) {
      addTweenExportFiles(zip, creditsFolder, result.tweenExportKind);
    }

    result.beforeGenerateZip?.();
    const zipBlob = await zipGenerateBlobWithProfiler(profiler, zip);
    downloadZipBlob(zipBlob, buildFilename(bodyType, timestamp));

    if (result.warningMessage) {
      showZipWarning(result.warningMessage);
    } else {
      showZipSuccess(result.successMessage);
    }
  } catch (err) {
    console.error(errorPrefix, err);
    showZipFailure(err);
  } finally {
    endZipExportUiSuspend();
    if (state) {
      state[stateKey].isRunning = false;
    }
    m.redraw();
  }
}

// ---------------------------------------------------------------------------
// Export flows
// ---------------------------------------------------------------------------

// Export ZIP - Split by animation
export const exportSplitAnimations = async (
  deps: Partial<ExportSplitAnimationsDeps> = {},
): Promise<void> => {
  const composeFrameRowsToSpritesheetFn =
    deps.composeFrameRowsToSpritesheet ?? composeFrameRowsToSpritesheet;
  const expandExtractedFramesWithTweensFn =
    deps.expandExtractedFramesWithTweens ?? expandExtractedFramesWithTweens;
  const extractFramesFromAnimationFn =
    deps.extractFramesFromAnimation ?? extractFramesFromAnimation;
  const extractFramesFromCustomAnimationFn =
    deps.extractFramesFromCustomAnimation ?? extractFramesFromCustomAnimation;

  await runZipExport(
    "splitAnimations",
    "zipByAnimation",
    (bodyType, timestamp) => `lpc_${bodyType}_animations_${timestamp}.zip`,
    async ({ zip, timestamp, state, bodyType, profiler }) => {
      const { addCanvas, addSlice } = makeZipAdders(profiler, deps);

      const standardFolder = zip.folder("standard")!;
      const customFolder = zip.folder("custom")!;
      const tweenedFolder = zip.folder("tweened")!;
      const tweenedStandardFolder = tweenedFolder.folder("standard")!;
      const tweenedCustomFolder = tweenedFolder.folder("custom")!;

      const animationList = ANIMATIONS;
      const exportedStandard: string[] = [];
      const failedStandard: string[] = [];
      const exportedTweenedStandard: string[] = [];
      const failedTweenedStandard: string[] = [];
      const globalTweenSettings = getGlobalTweenSettings();
      const tweenEstimate = estimateTweenExportFrames();
      const shouldExportTweenedSheets = tweenEstimate.enabled;

      for (const anim of animationList) {
        try {
          const animCanvas = profiler.syncPhase(
            "render_composite_extractAnimationFromCanvas",
            () => extractAnimationFromCanvas(anim.value),
          );
          profiler.incrementCounter("renderExtractAnimationFromCanvasCalls");
          if (!animCanvas) {
            failedStandard.push(anim.value);
            continue;
          }
          const result = await addCanvas(
            standardFolder,
            `${anim.value}.png`,
            animCanvas,
          );
          if (result.isOk()) {
            exportedStandard.push(anim.value);
          }

          if (shouldExportTweenedSheets) {
            try {
              const extractedFrames = extractFramesFromAnimationFn(
                animCanvas,
                anim.value,
                DIRECTIONS,
              );
              const tweenSettings = getTweenSettingsForAnimation(anim.value);
              const tweenedFrames = expandExtractedFramesWithTweensFn(
                extractedFrames,
                tweenSettings,
              );
              const tweenedCanvas = composeFrameRowsToSpritesheetFn(
                tweenedFrames,
                DIRECTIONS,
              );
              if (tweenedCanvas) {
                const tweenedResult = await addCanvas(
                  tweenedStandardFolder,
                  `${anim.value}.png`,
                  tweenedCanvas,
                );
                if (tweenedResult.isOk()) {
                  exportedTweenedStandard.push(anim.value);
                }
              }
            } catch (err) {
              console.error(
                `Failed to export tweened animation ${anim.value}:`,
                err,
              );
              failedTweenedStandard.push(anim.value);
            }
          }
        } catch (err) {
          console.error(`Failed to export animation ${anim.value}:`, err);
          failedStandard.push(anim.value);
        }
      }

      const exportedCustom: string[] = [];
      const failedCustom: string[] = [];
      const exportedTweenedCustom: string[] = [];
      const failedTweenedCustom: string[] = [];
      let y = SHEET_HEIGHT;

      for (const animName of renderState.addedCustomAnimations) {
        try {
          const anim = customAnimations[animName];
          if (!anim) {
            throw new Error("Animation definition not found");
          }

          const srcRect = { x: 0, y, ...customAnimationSize(anim) };
          if (!canvas) {
            throw new Error("Canvas not initialized");
          }
          const result = await addSlice(
            customFolder,
            `${animName}.png`,
            canvas,
            srcRect,
          );

          if (result.isOk()) {
            exportedCustom.push(animName);
          }

          if (shouldExportTweenedSheets) {
            try {
              const customAnimCanvas = result.isOk() ? result.value : null;
              if (customAnimCanvas) {
                const extractedFrames = extractFramesFromCustomAnimationFn(
                  customAnimCanvas,
                  anim,
                  DIRECTIONS,
                );
                const tweenSettings = getTweenSettingsForAnimation(animName);
                const tweenedFrames = expandExtractedFramesWithTweensFn(
                  extractedFrames,
                  tweenSettings,
                );
                const tweenedCanvas = composeFrameRowsToSpritesheetFn(
                  tweenedFrames,
                  DIRECTIONS,
                );
                if (tweenedCanvas) {
                  const tweenedResult = await addCanvas(
                    tweenedCustomFolder,
                    `${animName}.png`,
                    tweenedCanvas,
                  );
                  if (tweenedResult.isOk()) {
                    exportedTweenedCustom.push(animName);
                  }
                }
              }
            } catch (err) {
              console.error(
                `Failed to export tweened custom animation ${animName}:`,
                err,
              );
              failedTweenedCustom.push(animName);
            }
          }

          y += srcRect.height;
        } catch (err) {
          console.error(`Failed to export custom animation ${animName}:`, err);
          failedCustom.push(animName);
        }
      }

      const metadata = {
        exportTimestamp: timestamp,
        bodyType: bodyType,
        standardAnimations: {
          exported: exportedStandard,
          failed: failedStandard,
        },
        customAnimations: {
          exported: exportedCustom,
          failed: failedCustom,
        },
        tweenedAnimations: {
          settings: globalTweenSettings,
          overrides: state.previewTweenOverrides,
          estimate: tweenEstimate,
          standard: {
            exported: exportedTweenedStandard,
            failed: failedTweenedStandard,
          },
          custom: {
            exported: exportedTweenedCustom,
            failed: failedTweenedCustom,
          },
        },
        frameSize: FRAME_SIZE,
        frameCounts: {},
        performance: profiler.toMetadata(),
      };

      const warningMessage =
        failedStandard.length > 0 || failedCustom.length > 0
          ? `Export completed with some issues:\nFailed to export animations: ${failedStandard.join(
              ", ",
            )}`
          : undefined;

      return {
        metadata,
        warningMessage,
        includeTweenFiles: tweenEstimate.enabled,
        tweenExportKind: "split-by-animation",
      };
    },
  );
};

// Export ZIP - Split by item
export const exportSplitItemSheets = async (
  deps: Partial<ExportSplitItemSheetsDeps> = {},
): Promise<void> => {
  const renderSingleItemFn = deps.renderSingleItem ?? renderSingleItem;

  await runZipExport(
    "splitItemSheets",
    "zipByItem",
    (bodyType, timestamp) =>
      `lpc_${bodyType}_item_spritesheets_${timestamp}.zip`,
    async ({ zip, state, bodyType, profiler }) => {
      const { addCanvas } = makeZipAdders(profiler, deps);

      const itemsFolder = zip.folder("items")!;
      const exportedItems: string[] = [];
      const failedItems: string[] = [];

      for (const [, selection] of Object.entries(state.selections)) {
        const { itemId, variant, name } = selection;
        const itemLayers = getSortedLayersWithCustomFallback(
          defaultCatalog,
          itemId,
        ).unwrapOr([]);

        const recolors = getMultiRecolors(itemId, state.selections);

        for (const layer of itemLayers) {
          const fileName = getItemFileName(
            itemId,
            String(variant),
            name,
            layer.layerNum,
          );
          try {
            const itemCanvas = await renderSingleItemFn(
              itemId,
              variant ?? null,
              recolors,
              bodyType,
              state.selections,
              layer.layerNum,
              profiler,
            );
            profiler.incrementCounter("renderSingleItemCalls");

            if (itemCanvas) {
              await addCanvas(itemsFolder, fileName, itemCanvas);
              exportedItems.push(fileName);
            }
          } catch (err) {
            console.error(`Failed to export item ${fileName}:`, err);
            failedItems.push(fileName);
          }
        }
      }

      const warningMessage =
        failedItems.length > 0
          ? `Export completed with some issues:\nFailed items: ${failedItems.join(
              ", ",
            )}`
          : undefined;

      return { warningMessage };
    },
  );
};

// Export ZIP - Split by animation and item
export const exportSplitItemAnimations = async (
  deps: Partial<ExportSplitItemAnimationsDeps> = {},
): Promise<void> => {
  const renderSingleItemAnimationFn =
    deps.renderSingleItemAnimation ?? renderSingleItemAnimation;
  const loadImageFn = deps.loadImage ?? loadImage;
  const getImageToDrawFn = deps.getImageToDraw ?? getImageToDraw;

  await runZipExport(
    "splitItemAnimations",
    "zipByAnimationAndItem",
    (bodyType, timestamp) => `lpc_${bodyType}_item_animations_${timestamp}.zip`,
    async ({ zip, timestamp, state, bodyType, profiler }) => {
      const { addCanvas, addSlice, addStandardAnimation } = makeZipAdders(
        profiler,
        deps,
      );

      const standardFolder = zip.folder("standard")!;
      const customFolder = zip.folder("custom")!;

      const animationList = ANIMATIONS;
      const exportedStandard: Record<string, string[]> = {};
      const failedStandard: Record<string, string[]> = {};
      const exportedCustom: Record<string, string[]> = {};
      const failedCustom: Record<string, string[]> = {};

      for (const anim of animationList) {
        if (anim.noExport) continue;
        const animFolder = standardFolder.folder(anim.value)!;

        exportedStandard[anim.value] = [];
        failedStandard[anim.value] = [];

        for (const [, selection] of Object.entries(state.selections)) {
          const { itemId, variant, name } = selection;
          const metaResult = getItemMerged(itemId);
          if (
            metaResult.isErr() ||
            !metaResult.value.animations.includes(anim.value)
          ) {
            debugLog(
              "Skipping item ",
              itemId,
              " without the animation: ",
              anim.value,
            );
            continue;
          }

          const recolors = getMultiRecolors(itemId, state.selections);

          const itemLayers = getSortedLayersWithCustomFallback(
            defaultCatalog,
            itemId,
          ).unwrapOr([]);
          for (const layer of itemLayers) {
            const fileName = getItemFileName(
              itemId,
              String(variant),
              name,
              layer.layerNum,
            );

            try {
              const animCanvas = await renderSingleItemAnimationFn(
                itemId,
                variant ?? null,
                recolors,
                bodyType,
                anim.value,
                state.selections,
                layer.layerNum,
                profiler,
              );
              profiler.incrementCounter("renderSingleItemAnimationCalls");

              if (animCanvas) {
                await addCanvas(animFolder, fileName, animCanvas);
                exportedStandard[anim.value]!.push(fileName);
              }
            } catch (err) {
              console.error(
                `Failed to export ${fileName} for ${anim.value}:`,
                err,
              );
              failedStandard[anim.value]!.push(fileName);
            }
          }
        }
      }

      debugLog(renderState.customAreaItems);

      for (const customAnimName of Object.keys(renderState.customAreaItems)) {
        for (const layer of renderState.customAreaItems[customAnimName]!) {
          debugLog("Processing layer for custom animation only export:", layer);

          const itemFileName = getItemFileName(
            layer.itemId,
            String(layer.variant),
            layer.name ?? "",
            1,
            layer.zPos,
          );
          const custExportedItems = exportedCustom[customAnimName] ?? [];
          exportedCustom[customAnimName] = custExportedItems;
          const custFailedItems = failedCustom[customAnimName] ?? [];
          failedCustom[customAnimName] = custFailedItems;

          try {
            debugLog(
              `Exporting item ${itemFileName} for custom animation ${customAnimName}`,
            );
            let img: HTMLImageElement | HTMLCanvasElement | undefined;
            let imgCanvas: HTMLImageElement | HTMLCanvasElement | undefined;
            const source = layer.source;
            if (source.kind === "custom") {
              img = source.image;
            } else {
              await profiler.phase(
                "render_imageLoadDecode_customItemSprite",
                async () => {
                  img = await loadImageFn(source.spritePath);
                },
              );
            }
            if (!img) continue;
            await profiler.phase(
              "render_composite_customItemSprite",
              async () => {
                imgCanvas = await getImageToDrawFn(
                  img!,
                  layer.itemId,
                  layer.recolors,
                );
              },
            );
            if (!imgCanvas) continue;

            const custAnim = customAnimations[customAnimName];
            if (!custAnim)
              throw new Error(
                "Custom animation not found for item: " + layer.itemId,
              );
            const custSize = customAnimationSize(custAnim);
            const srcRect = { x: 0, y: 0, ...custSize };
            const animFolder = customFolder.folder(customAnimName)!;
            let succeeded = false;
            if (layer.type === "extracted_frames") {
              const fromExtracted = await addStandardAnimation(
                animFolder,
                itemFileName,
                imgCanvas,
                custAnim,
              );
              if (fromExtracted) succeeded = true;
            }
            if (!succeeded) {
              const sliceResult = await addSlice(
                animFolder,
                itemFileName,
                imgCanvas as HTMLCanvasElement,
                srcRect,
              );
              if (sliceResult.isOk()) succeeded = true;
            }

            if (succeeded) custExportedItems.push(itemFileName);
          } catch (err) {
            console.error(
              `Failed to export item ${itemFileName} in custom animation ${customAnimName}:`,
              err,
            );
            custFailedItems.push(itemFileName);
            failedCustom[customAnimName] = custFailedItems;
          }
        }
      }

      const metadata = {
        exportTimestamp: timestamp,
        bodyType: bodyType,
        standardAnimations: {
          exported: exportedStandard,
          failed: failedStandard,
        },
        customAnimations: {
          exported: exportedCustom,
          failed: failedCustom,
        },
        frameSize: FRAME_SIZE,
        frameCounts: {},
        performance: profiler.toMetadata(),
      };

      const failedCount = Object.values(failedStandard).reduce(
        (sum, arr) => sum + arr.length,
        0,
      );
      const warningMessage =
        failedCount > 0
          ? (() => {
              let msg = "Export completed with some issues:\n";
              for (const [anim, items] of Object.entries(failedStandard)) {
                if (items.length > 0) {
                  msg += `${anim}: ${items.join(", ")}\n`;
                }
              }
              return msg;
            })()
          : undefined;

      return { metadata, warningMessage };
    },
  );
};

// Export ZIP - Individual animation frames
export const exportIndividualFrames = async (
  deps: Partial<ExportIndividualFramesDeps> = {},
): Promise<void> => {
  const extractAnimationFromCanvasFn =
    deps.extractAnimationFromCanvas ?? extractAnimationFromCanvas;
  const extractFramesFromAnimationFn =
    deps.extractFramesFromAnimation ?? extractFramesFromAnimation;
  const expandExtractedFramesWithTweensFn =
    deps.expandExtractedFramesWithTweens ?? expandExtractedFramesWithTweens;
  const canvasToBlobFn = deps.canvasToBlob ?? canvasToBlob;
  const extractFramesFromCustomAnimationFn =
    deps.extractFramesFromCustomAnimation ?? extractFramesFromCustomAnimation;

  const sliceCanvasForCustomAnim: typeof newAnimationFromSheet = (
    src,
    rect,
  ) => {
    if (deps.newAnimationFromSheet) {
      return deps.newAnimationFromSheet(src, rect);
    }
    return newAnimationFromSheet(src, rect);
  };

  await runZipExport(
    "individualFrames",
    "zipIndividualFrames",
    (bodyType, timestamp) =>
      `lpc_${bodyType}_individual_frames_${timestamp}.zip`,
    async ({ zip, timestamp, state, bodyType, profiler }) => {
      const standardFolder = zip.folder("standard")!;
      const customFolder = zip.folder("custom")!;

      const exportedAnimations: string[] = [];
      const failedAnimations: string[] = [];
      const directions = DIRECTIONS;

      const animationCanvases = new Map<string, HTMLCanvasElement>();
      const blobTasks: BlobTask[] = [];
      const exportedCustom: string[] = [];
      const failedCustom: string[] = [];
      let y = SHEET_HEIGHT;
      const globalTweenSettings = getGlobalTweenSettings();
      const tweenEstimate = estimateTweenExportFrames();

      for (const anim of ANIMATIONS) {
        try {
          const animationName = anim.value;
          profiler.syncPhase(
            "render_composite_extractAnimationFromCanvas",
            () => {
              const animCanvas = extractAnimationFromCanvasFn(animationName);
              if (animCanvas) {
                animationCanvases.set(animationName, animCanvas);
              }
            },
          );
          profiler.incrementCounter("renderExtractAnimationFromCanvasCalls");
        } catch (err) {
          console.error(`Failed to extract animation ${anim.value}:`, err);
          failedAnimations.push(anim.value);
        }
      }

      for (const anim of ANIMATIONS) {
        try {
          const animationName = anim.value;
          const animCanvas = animationCanvases.get(animationName);

          if (animCanvas) {
            await profiler.phase(
              "render_composite_extractFramesFromAnimation",
              async () => {
                const animFolder = standardFolder.folder(animationName)!;
                const extractedFrames = extractFramesFromAnimationFn(
                  animCanvas,
                  animationName,
                  directions,
                );
                const tweenSettings =
                  getTweenSettingsForAnimation(animationName);
                const frames = expandExtractedFramesWithTweensFn(
                  extractedFrames,
                  tweenSettings,
                );

                for (const [direction, frameList] of Object.entries(frames)) {
                  if (frameList.length > 0) {
                    const directionFolder = animFolder.folder(direction)!;

                    for (const {
                      canvas: frameCanvas,
                      frameNumber,
                    } of frameList) {
                      blobTasks.push({
                        encode: () => canvasToBlobFn(frameCanvas),
                        folder: directionFolder,
                        filename: `${frameNumber}.png`,
                        debugPath: `standard/${animationName}/${direction}/${frameNumber}.png`,
                      });
                    }
                  }
                }
                exportedAnimations.push(animationName);
              },
            );
            profiler.incrementCounter("extractFramesFromAnimationBatchCount");
          }
        } catch (err) {
          console.error(
            `Failed to process frames for animation ${anim.value}:`,
            err,
          );
          failedAnimations.push(anim.value);
        }
      }

      for (const animName of renderState.addedCustomAnimations) {
        try {
          const customAnimDef = customAnimations[animName];
          if (!customAnimDef) {
            throw new Error("Custom animation definition not found");
          }

          const custSize = customAnimationSize(customAnimDef);
          const srcRect = { x: 0, y, ...custSize };

          debugLog(`Processing custom animation: ${animName}`, {
            frameSize: customAnimDef.frameSize,
            frames: customAnimDef.frames,
            srcRect: srcRect,
          });

          if (!canvas) {
            throw new Error("Canvas not initialized");
          }
          const rendererCanvas = canvas;
          let custAnimCanvas: HTMLCanvasElement | null = null;
          profiler.syncPhase(
            "render_composite_sliceCanvasForCustomAnim",
            () => {
              custAnimCanvas = sliceCanvasForCustomAnim(
                rendererCanvas,
                srcRect,
              ).unwrapOr(null);
            },
          );
          if (custAnimCanvas) {
            profiler.syncPhase(
              "render_composite_extractFramesFromCustomAnimation",
              () => {
                const animFolder = customFolder.folder(animName)!;
                const extractedFrames = extractFramesFromCustomAnimationFn(
                  custAnimCanvas!,
                  customAnimDef,
                  directions,
                );
                const tweenSettings = getTweenSettingsForAnimation(animName);
                const frames = expandExtractedFramesWithTweensFn(
                  extractedFrames,
                  tweenSettings,
                );

                debugLog(`Extracted frames for ${animName}:`, frames);

                for (const [direction, frameList] of Object.entries(frames)) {
                  if (frameList.length > 0) {
                    const directionFolder = animFolder.folder(direction)!;

                    for (const {
                      canvas: frameCanvas,
                      frameNumber,
                    } of frameList) {
                      blobTasks.push({
                        encode: () => canvasToBlobFn(frameCanvas),
                        folder: directionFolder,
                        filename: `${frameNumber}.png`,
                        debugPath: `custom/${animName}/${direction}/${frameNumber}.png`,
                      });
                    }
                  }
                }
                exportedCustom.push(animName);
              },
            );
            profiler.incrementCounter("renderSliceCanvasForCustomAnimCalls");
          } else {
            debugWarn(`No canvas generated for custom animation: ${animName}`);
          }

          y += srcRect.height;
        } catch (err) {
          console.error(
            `Failed to export frames for custom animation ${animName}:`,
            err,
          );
          failedCustom.push(animName);
        }
      }

      debugLog(`Converting ${blobTasks.length} frames to blobs...`);
      let blobResults: BlobTaskResult[] = [];
      await profiler.phase("pngEncode", async () => {
        blobResults = await Promise.all(
          blobTasks.map(async (task): Promise<BlobTaskResult> => {
            try {
              const blob = await task.encode();
              if (blob) {
                profiler.incrementCounter("pngEncodeCount");
                profiler.addCounter("totalPngBytes", blob.size);
              }
              return { ...task, blob, success: true };
            } catch (err) {
              console.error(
                `Failed to create blob for ${task.debugPath}:`,
                err,
              );
              return { ...task, blob: null, success: false };
            }
          }),
        );
      });

      let successCount = 0;
      await profiler.phase("zipFile", async () => {
        for (const result of blobResults) {
          if (result.success && result.blob) {
            result.folder.file(result.filename, result.blob);
            profiler.incrementCounter("zipFileEntryCount");
            successCount++;
            debugLog(`Added frame: ${result.debugPath}`);
          }
        }
      });

      debugLog(
        `Successfully processed ${successCount}/${blobTasks.length} frames`,
      );

      const metadata = {
        exportTimestamp: timestamp,
        bodyType: bodyType,
        frameSize: FRAME_SIZE,
        structure: {
          standard: {
            exported: exportedAnimations,
            failed: failedAnimations,
          },
          custom: {
            exported: exportedCustom,
            failed: failedCustom,
          },
        },
        animationConfigs: ANIMATION_CONFIGS,
        directions: directions,
        tweening: {
          settings: globalTweenSettings,
          overrides: state.previewTweenOverrides,
          estimate: tweenEstimate,
        },
        note: "Individual animation frames organized by standard/custom > animation > direction > frame number",
        performance: profiler.toMetadata(),
      };

      const totalFailed = failedAnimations.length + failedCustom.length;
      const warningMessage =
        totalFailed > 0
          ? (() => {
              let msg = "Export completed with some issues:\n";
              if (failedAnimations.length > 0) {
                msg += `Failed standard animations: ${failedAnimations.join(", ")}\n`;
              }
              if (failedCustom.length > 0) {
                msg += `Failed custom animations: ${failedCustom.join(", ")}\n`;
              }
              return msg;
            })()
          : undefined;

      return {
        metadata,
        warningMessage,
        successMessage: "Individual frames export complete!",
        includeTweenFiles: tweenEstimate.enabled,
        tweenExportKind: "individual-frames",
        beforeGenerateZip: () => debugLog("Generating ZIP file..."),
      };
    },
    "Individual frames export failed:",
  );
};
