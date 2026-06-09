import { loadImage } from "./load-image.ts";
import { getImageToDraw } from "./palette-recolor.ts";
import { debugWarn } from "../utils/debug.ts";
import type { DrawCall } from "../state/render-state.ts";

type LoadedDrawCall = {
  item: DrawCall;
  img: HTMLCanvasElement | HTMLImageElement | null;
  success: boolean;
};

async function loadDrawCallImage(item: DrawCall): Promise<LoadedDrawCall> {
  if (item.source.kind === "custom") {
    return { item, img: item.source.image, success: true };
  }

  const { spritePath } = item.source;
  return loadImage(spritePath)
    .then((img) => ({ item, img, success: true }))
    .catch(() => {
      debugWarn(`Failed to load sprite: ${spritePath}`);
      return {
        item,
        img: null,
        success: false,
      };
    });
}

export async function drawStandardDrawCalls(
  renderCtx: CanvasRenderingContext2D,
  drawCalls: DrawCall[],
): Promise<void> {
  const loadedItems = await Promise.all(drawCalls.map(loadDrawCallImage));

  for (const { item, img, success } of loadedItems) {
    if (success && img) {
      const imageToDraw = await getImageToDraw(
        img,
        item.itemId,
        item.recolors,
        item.source.kind === "catalog" ? item.source.spritePath : null,
      );
      renderCtx.drawImage(imageToDraw, 0, item.yPos);
    }
  }
}
