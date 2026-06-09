import { ANIMATIONS, DIRECTIONS, FRAME_SIZE } from "../constants.ts";
import { canvas, extractAnimationFromCanvas } from "../../canvas/renderer.ts";
import { SHEET_HEIGHT } from "../../canvas/renderer.ts";
import {
  customAnimations,
  customAnimationSize,
} from "../../custom-animations.ts";
import { renderState } from "../render-state.ts";
import { runZipExport, makeZipAdders, type ZipExportContext } from "./run.ts";
import { type ExportSplitAnimationsDeps } from "./types.ts";
import {
  composeFrameRowsToSpritesheet,
  extractFramesFromAnimation,
  extractFramesFromCustomAnimation,
  expandExtractedFramesWithTweens,
} from "../../utils/zip-helpers.ts";
import {
  getGlobalTweenSettings,
  estimateTweenExportFrames,
  getTweenSettingsForAnimation,
} from "../tween-settings.ts";
import {
  applyNamingTemplate,
  makeUniqueFileName,
} from "../../utils/fileName.ts";

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
    async ({ zip, timestamp, state, bodyType, profiler }: ZipExportContext) => {
      const { addCanvas, addSlice } = makeZipAdders(profiler, deps);

      const { loadProSettings } =
        await import("../../components/desktop/workflow-tools/workflow-helpers.ts");
      const proSettings = loadProSettings();
      const standardFileNames = new Set<string>();
      const tweenedStandardFileNames = new Set<string>();
      const customFileNames = new Set<string>();
      const tweenedCustomFileNames = new Set<string>();

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
          const exportFilename = makeUniqueFileName(
            proSettings.namingTemplate
              ? `${applyNamingTemplate(proSettings.namingTemplate, {
                  character: "character",
                  animation: anim.value,
                  direction: "all",
                  frame: "spritesheet",
                })}.png`
              : `${anim.value}.png`,
            standardFileNames,
          );

          const result = await addCanvas(
            standardFolder,
            exportFilename,
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
                const tweenedFilename = makeUniqueFileName(
                  proSettings.namingTemplate
                    ? `${applyNamingTemplate(proSettings.namingTemplate, {
                        character: "character",
                        animation: anim.value,
                        direction: "all",
                        frame: "tweened",
                      })}.png`
                    : `${anim.value}.png`,
                  tweenedStandardFileNames,
                );
                const tweenedResult = await addCanvas(
                  tweenedStandardFolder,
                  tweenedFilename,
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
          const customExportFilename = makeUniqueFileName(
            proSettings.namingTemplate
              ? `${applyNamingTemplate(proSettings.namingTemplate, {
                  character: "character",
                  animation: animName,
                  direction: "all",
                  frame: "spritesheet",
                })}.png`
              : `${animName}.png`,
            customFileNames,
          );
          const result = await addSlice(
            customFolder,
            customExportFilename,
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
                  const customTweenedFilename = makeUniqueFileName(
                    proSettings.namingTemplate
                      ? `${applyNamingTemplate(proSettings.namingTemplate, {
                          character: "character",
                          animation: animName,
                          direction: "all",
                          frame: "tweened",
                        })}.png`
                      : `${animName}.png`,
                    tweenedCustomFileNames,
                  );
                  const tweenedResult = await addCanvas(
                    tweenedCustomFolder,
                    customTweenedFilename,
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
