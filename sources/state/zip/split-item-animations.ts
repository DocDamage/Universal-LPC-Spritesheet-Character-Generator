import { ANIMATIONS, FRAME_SIZE } from "../constants.ts";
import { renderSingleItemAnimation } from "../../canvas/renderer.ts";
import { loadImage } from "../../canvas/load-image.ts";
import { getImageToDraw } from "../../canvas/palette-recolor.ts";
import { defaultCatalog } from "../catalog.ts";
import { getSortedLayersWithCustomFallback } from "../meta.ts";
import { getMultiRecolors } from "../palettes.ts";
import { getItemFileName } from "../../utils/fileName.ts";
import {
  customAnimations,
  customAnimationSize,
} from "../../custom-animations.ts";
import { renderState } from "../render-state.ts";
import { debugLog } from "../../utils/debug.ts";
import { runZipExport, makeZipAdders, type ZipExportContext } from "./run.ts";
import { type ExportSplitItemAnimationsDeps } from "./types.ts";

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
    async ({ zip, timestamp, state, bodyType, profiler }: ZipExportContext) => {
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
          if (state.excludeHiddenLayersFromExports && state.hiddenLayerIds.has(itemId)) {
            continue;
          }
          const metaResult = defaultCatalog.getItemMerged(itemId);
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
          const { loadProSettings } = await import("../../components/desktop/workflow-tools/workflow-helpers.ts");
          const { applyNamingTemplate } = await import("../../utils/fileName.ts");
          const proSettings = loadProSettings();

          for (const layer of itemLayers) {
            const defaultFileName = getItemFileName(
              itemId,
              String(variant),
              name,
              layer.layerNum,
            );
            const fileName = proSettings.namingTemplate
              ? applyNamingTemplate(proSettings.namingTemplate, { character: "character", animation: anim.value, direction: "all", frame: "spritesheet", zpos: layer.zPos, slot: itemId }) + ".png"
              : defaultFileName;

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
