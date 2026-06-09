// Preview drawing for recolorable assets

import { getImageToDraw } from "./recolor-cache.ts";
import { getLayersToLoad } from "../state/meta.ts";
import { COMPACT_FRAME_SIZE, FRAME_SIZE } from "../state/constants.ts";
import { debugWarn } from "../utils/debug.ts";
import type { ItemMerged } from "../state/catalog.ts";
import type { Selections } from "../state/app-state.ts";

/**
 * Draw preview for recolorable asset.
 *
 * `signal` is an optional caller-owned `AbortSignal`. Callers abort the prior
 * signal before starting a new preview render, which prevents older async
 * image loads/recolors from drawing after fresher selected colors arrive. See
 * `components/tree/ItemWithRecolors.ts` and `PaletteSelectModal.ts`.
 *
 * `canvas.isConnected` is always also checked (callers don't need to handle
 * "canvas was removed from DOM" themselves).
 *
 * Returns count of images drawn, or 0 when the render is skipped.
 *
 * Aborted image loads resolve as `{ img: null }` so the public return contract
 * stays "number of drawn images" rather than throwing for normal cancellation.
 */
export async function drawRecolorPreview(
  itemId: string,
  meta: ItemMerged,
  canvas: HTMLCanvasElement,
  selectedColors: Record<string, string>,
  compactDisplay: boolean,
  bodyType: string,
  selections: Selections,
  signal?: AbortSignal,
): Promise<number> {
  if (!canvas.isConnected) {
    return 0;
  }

  const isAborted = (): boolean => !canvas.isConnected || !!signal?.aborted;

  // Skip if canvas is not connected or stale
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || isAborted()) {
    return 0;
  }

  // Only show the idle preview for the asset
  const previewRow = meta.preview_row ?? 2;
  const previewCol = (meta as { preview_column?: number }).preview_column ?? 0;
  const previewXOffset =
    (meta as { preview_x_offset?: number }).preview_x_offset ?? 0;
  const previewYOffset =
    (meta as { preview_y_offset?: number }).preview_y_offset ?? 0;
  const layersToLoad = getLayersToLoad(meta, bodyType, selections);

  // Load and draw all layers
  let imagesLoaded = 0;
  const loadedLayers = await Promise.all(
    layersToLoad.map((layer) => loadPreviewLayerImage(layer, signal)),
  );
  if (isAborted()) {
    return 0;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Draw each layer in zPos order
  imagesLoaded = 0;
  for (const { img, layer } of loadedLayers) {
    if (isAborted()) {
      return 0;
    }

    if (img) {
      const imageToDraw = await getImageToDraw(
        img,
        itemId,
        selectedColors,
        layer.path,
      );
      if (isAborted()) {
        return 0;
      }
      const size = compactDisplay ? COMPACT_FRAME_SIZE : FRAME_SIZE;
      const srcX = previewCol * FRAME_SIZE + previewXOffset;
      const srcY = previewRow * FRAME_SIZE + previewYOffset;
      ctx.drawImage(
        imageToDraw,
        srcX,
        srcY,
        FRAME_SIZE,
        FRAME_SIZE,
        0,
        0,
        size,
        size,
      );
      imagesLoaded++;
    }
  }
  return imagesLoaded;
}

function loadPreviewLayerImage(
  layer: { path: string },
  signal?: AbortSignal,
): Promise<{ img: HTMLImageElement | null; layer: { path: string } }> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ img: null, layer });
      return;
    }

    const img = new Image();
    let settled = false;

    const finish = (loadedImage: HTMLImageElement | null): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve({ img: loadedImage, layer });
    };

    const onAbort = (): void => {
      img.onload = null;
      img.onerror = null;
      img.src = "";
      finish(null);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    img.onload = () => finish(img);
    img.onerror = () => {
      debugWarn(`Failed to load image for layer ${layer.path}`);
      finish(null);
    };
    img.src = layer.path;
  });
}
