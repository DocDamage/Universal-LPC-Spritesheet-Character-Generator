import { renderSingleItem } from "../../canvas/renderer.ts";
import { defaultCatalog } from "../catalog.ts";
import { getSortedLayersWithCustomFallback } from "../meta.ts";
import { getMultiRecolors } from "../palettes.ts";
import { getItemFileName } from "../../utils/fileName.ts";
import { runZipExport, makeZipAdders, type ZipExportContext } from "./run.ts";
import { type ExportSplitItemSheetsDeps } from "./types.ts";

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
    async ({ zip, state, bodyType, profiler }: ZipExportContext) => {
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
