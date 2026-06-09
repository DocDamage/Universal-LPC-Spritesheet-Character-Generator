import {
  ANIMATIONS,
  DIRECTIONS,
  FRAME_SIZE,
  ANIMATION_CONFIGS,
} from "../constants.ts";
import {
  canvas,
  extractAnimationFromCanvas,
  SHEET_HEIGHT,
} from "../../canvas/renderer.ts";
import { canvasToBlob } from "../../canvas/canvas-utils.ts";
import { newAnimationFromSheet } from "../../utils/zip-helpers.ts";
import {
  extractFramesFromAnimation,
  extractFramesFromCustomAnimation,
  expandExtractedFramesWithTweens,
} from "../../utils/zip-helpers.ts";
import {
  customAnimations,
  customAnimationSize,
} from "../../custom-animations.ts";
import { renderState } from "../render-state.ts";
import { debugLog, debugWarn } from "../../utils/debug.ts";
import {
  getGlobalTweenSettings,
  estimateTweenExportFrames,
  getTweenSettingsForAnimation,
} from "../tween-settings.ts";
import {
  applyNamingTemplate,
  makeUniqueFileName,
} from "../../utils/fileName.ts";
import { runZipExport, type ZipExportContext } from "./run.ts";
import {
  type ExportIndividualFramesDeps,
  type BlobTask,
  type BlobTaskResult,
} from "./types.ts";

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
    async ({ zip, timestamp, state, bodyType, profiler }: ZipExportContext) => {
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
      const zipFileNamesByFolder = new Map<string, Set<string>>();
      const uniqueName = (folderKey: string, fileName: string): string => {
        const usedFileNames = zipFileNamesByFolder.get(folderKey);
        if (usedFileNames) {
          return makeUniqueFileName(fileName, usedFileNames);
        }
        const nextUsedFileNames = new Set<string>();
        zipFileNamesByFolder.set(folderKey, nextUsedFileNames);
        return makeUniqueFileName(fileName, nextUsedFileNames);
      };

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

                const { loadProSettings } =
                  await import("../../components/desktop/workflow-tools/workflow-helpers.ts");
                const proSettings = loadProSettings();

                for (const [direction, frameList] of Object.entries(frames)) {
                  if (frameList.length > 0) {
                    const directionFolder = animFolder.folder(direction)!;

                    for (const {
                      canvas: frameCanvas,
                      frameNumber,
                    } of frameList) {
                      const filenameVal = uniqueName(
                        `standard/${animationName}/${direction}`,
                        proSettings.namingTemplate
                          ? `${applyNamingTemplate(proSettings.namingTemplate, {
                              character: "character",
                              animation: animationName,
                              direction,
                              frame: frameNumber,
                            })}.png`
                          : `${frameNumber}.png`,
                      );
                      blobTasks.push({
                        encode: () => canvasToBlobFn(frameCanvas),
                        folder: directionFolder,
                        filename: filenameVal,
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
            const { loadProSettings } =
              await import("../../components/desktop/workflow-tools/workflow-helpers.ts");
            const proSettings = loadProSettings();

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
                      const filenameVal = uniqueName(
                        `custom/${animName}/${direction}`,
                        proSettings.namingTemplate
                          ? `${applyNamingTemplate(proSettings.namingTemplate, {
                              character: "character",
                              animation: animName,
                              direction,
                              frame: frameNumber,
                            })}.png`
                          : `${frameNumber}.png`,
                      );
                      blobTasks.push({
                        encode: () => canvasToBlobFn(frameCanvas),
                        folder: directionFolder,
                        filename: filenameVal,
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
