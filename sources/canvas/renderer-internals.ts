import { loadImage } from "./load-image.ts";
import { createCanvas } from "./canvas-utils.ts";
import { formatLoadError, getCustomPart } from "../state/catalog.ts";
import type { PathError } from "../state/path.ts";
import type { ZipExportProfiler } from "../performance-profiler.ts";
import type { CustomAreaItem } from "../state/render-state.ts";
import { debugWarn } from "../utils/debug.ts";

export const SHEET_HEIGHT = 3456; // Full universal sheet height
export const SHEET_WIDTH = 832; // 13 frames * 64px

export let canvas: HTMLCanvasElement | null = null;
export let ctx: CanvasRenderingContext2D | null = null;

/** True after `initCanvas()` — offscreen buffer exists (main bootstrap runs this after S1∧S2). */
let offscreenCanvasInitialized = false;

export function formatPathError(itemId: string, e: PathError): string {
  switch (e.kind) {
    case "loading":
    case "not-found":
      return `getSpritePath: ${formatLoadError(e)} (item ${itemId})`;
    case "missing-layer":
      return `getSpritePath: item ${itemId} has no layer ${e.layerNum}`;
    case "missing-bodytype-path":
      return `getSpritePath: item ${itemId} has no path for bodyType ${e.bodyType}`;
  }
}

export function getRuntimeCustomPart(itemId: string) {
  return (
    getCustomPart(itemId) ??
    (
      globalThis as typeof globalThis & {
        __LPC_customParts?: Record<string, ReturnType<typeof getCustomPart>>;
      }
    ).__LPC_customParts?.[itemId]
  );
}

export function initCanvas(): void {
  const created = createCanvas(SHEET_WIDTH, SHEET_HEIGHT);
  canvas = created.canvas;
  ctx = created.ctx;
  offscreenCanvasInitialized = true;
}

export function isOffscreenCanvasInitialized(): boolean {
  return offscreenCanvasInitialized;
}

export function resetOffscreenCanvasStateForTests(): void {
  offscreenCanvasInitialized = false;
  canvas = null;
  ctx = null;
}

export function setOffscreenCanvasInitializedForTests(value: boolean): void {
  offscreenCanvasInitialized = value;
}

/**
 * When `zipProfiler` is set, records separate load/decode vs compositing phases;
 * otherwise runs load then composite.
 */
export async function zipExportProfiledLoadComposite(
  zipProfiler: ZipExportProfiler | null | undefined,
  loadPhaseName: string,
  compositePhaseName: string,
  loadFn: () => void | Promise<void>,
  compositeFn: () => void | Promise<void>,
): Promise<void> {
  if (zipProfiler && typeof zipProfiler.phase === "function") {
    await zipProfiler.phase(loadPhaseName, loadFn);
    await zipProfiler.phase(compositePhaseName, compositeFn);
  } else {
    await loadFn();
    await compositeFn();
  }
}

export type LoadedCustomAreaImage = {
  item: CustomAreaItem;
  img: HTMLImageElement | HTMLCanvasElement | null;
  success: boolean;
};

export async function loadCustomAreaImages(
  items: CustomAreaItem[],
): Promise<LoadedCustomAreaImage[]> {
  const promises = items.map(async (item): Promise<LoadedCustomAreaImage> => {
    const source = item.source;
    if (source.kind === "custom") {
      return { item, img: source.image, success: true };
    }

    return loadImage(source.spritePath)
      .then((img) => ({ item, img, success: true }))
      .catch(() => {
        debugWarn(`Failed to load sprite: ${source.spritePath}`);
        return { item, img: null, success: false };
      });
  });

  return Promise.all(promises);
}
