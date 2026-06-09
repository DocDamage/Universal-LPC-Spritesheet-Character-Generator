// Bounded LRU cache for recolored canvases

import { defaultCatalog } from "../state/catalog.ts";
import { getPalettesFromMeta } from "../state/palettes.ts";
import { recolorWithPalette } from "./recolor-palette.ts";

/**
 * Bounded LRU cache of recolored canvases, keyed by (spritePath, recolors).
 * A JS Map preserves insertion order; `get → delete → set` moves an entry to
 * the end (most-recently-used), and eviction always drops the head.
 *
 * We store the in-flight Promise rather than the resolved canvas so that
 * concurrent callers for the same key (e.g. main render + a tree preview)
 * share one recolor operation instead of starting duplicates.
 */
const RECOLOR_CACHE_CAP = 250;
const recolorCache = new Map<
  string,
  Promise<HTMLImageElement | HTMLCanvasElement>
>();

/**
 * Get image to draw - applies recoloring if needed based on palette configuration.
 * Async because palette loading is lazy (loads on first use). When `spritePath`
 * is supplied, the recolored result is memoized so repeated renders for the
 * same (spritePath, recolors) skip the entire recolor pipeline.
 */
export async function getImageToDraw(
  img: HTMLImageElement | HTMLCanvasElement,
  itemId: string,
  recolors: Record<string, string> | null | undefined,
  spritePath: string | null = null,
): Promise<HTMLImageElement | HTMLCanvasElement> {
  if (!recolors) {
    return img; // No recolor specified, return original image
  }
  const meta = defaultCatalog.getItemLite(itemId).unwrapOr(null);
  const paletteConfig = getPalettesFromMeta(meta).unwrapOr(null);
  if (!paletteConfig) {
    return img; // Item doesn't use palette recoloring
  }

  const cacheKey = spritePath
    ? `${spritePath}|${JSON.stringify(recolors)}`
    : null;
  if (cacheKey) {
    const hit = recolorCache.get(cacheKey);
    if (hit) {
      // LRU touch
      recolorCache.delete(cacheKey);
      recolorCache.set(cacheKey, hit);
      return hit;
    }
  }

  const promise = recolorWithPalette(img, recolors, paletteConfig);

  if (cacheKey) {
    recolorCache.set(cacheKey, promise);
    // On rejection, drop the entry so retries aren't poisoned by a stale failure.
    promise.catch(() => {
      if (recolorCache.get(cacheKey) === promise) {
        recolorCache.delete(cacheKey);
      }
    });
    while (recolorCache.size > RECOLOR_CACHE_CAP) {
      const oldestKey = recolorCache.keys().next().value;
      if (oldestKey === undefined) break;
      recolorCache.delete(oldestKey);
    }
  }

  try {
    return await promise;
  } catch (e) {
    console.error(
      `Failed to recolor ${paletteConfig[meta!.type_name]?.material} color ${JSON.stringify(recolors)}:`,
      e,
    );
    return img; // Fallback to original on error
  }
}

/** Clear the recolor cache. Mainly for tests; callable at runtime too. */
export function clearRecolorCache(): void {
  recolorCache.clear();
}
