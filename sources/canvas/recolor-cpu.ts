// CPU palette recoloring implementation

import { createCanvas } from "./canvas-utils.ts";
import type { PaletteMapping } from "./webgl-palette-recolor.ts";

type Rgb = { r: number; g: number; b: number };
type ColorPair = { source: Rgb; target: Rgb };

/** Convert hex color string to RGB object. */
function hexToRgb(hex: string): Rgb | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1]!, 16),
        g: parseInt(result[2]!, 16),
        b: parseInt(result[3]!, 16),
      }
    : null;
}

/**
 * Build color mapping from source palette to target palette.
 * Returns array of {source, target} pairs for tolerance-based matching.
 */
function buildColorMap(
  sourcePalette: string[],
  targetPalette: string[],
): ColorPair[] {
  const colorPairs: ColorPair[] = [];

  for (let i = 0; i < sourcePalette.length; i++) {
    const sourceRgb = hexToRgb(sourcePalette[i]!);
    const targetRgb = hexToRgb(targetPalette[i]!);

    if (sourceRgb && targetRgb) {
      colorPairs.push({ source: sourceRgb, target: targetRgb });
    }
  }

  return colorPairs;
}

/**
 * Find matching color in palette with tolerance (like WebGL shader).
 * `tolerance` default 1, matching WebGL's ~0.004 * 255.
 */
function findMatchingColor(
  r: number,
  g: number,
  b: number,
  colorPairs: ColorPair[],
  tolerance: number = 1,
): Rgb | null {
  for (const pair of colorPairs) {
    const dr = Math.abs(r - pair.source.r);
    const dg = Math.abs(g - pair.source.g);
    const db = Math.abs(b - pair.source.b);

    if (dr <= tolerance && dg <= tolerance && db <= tolerance) {
      return pair.target;
    }
  }
  return null;
}

/**
 * Recolor an image using palette mapping (CPU implementation).
 * Accepts a list of (source, target) palette mappings; all mappings are
 * flattened into a single list of color pairs, then each pixel is tested
 * against every pair in one pass.
 */
export function recolorImageCPU(
  sourceImage: HTMLImageElement | HTMLCanvasElement,
  paletteMappings: PaletteMapping[],
): HTMLCanvasElement {
  // Create offscreen canvas
  const { canvas, ctx } = createCanvas(sourceImage.width, sourceImage.height);

  // Draw source image
  ctx.drawImage(sourceImage, 0, 0);

  // Get pixel data
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  // Flatten all mappings into a single color pair list
  const colorPairs: ColorPair[] = [];
  for (const { source, target } of paletteMappings) {
    const pairs = buildColorMap(source, target);
    for (const p of pairs) colorPairs.push(p);
  }

  // Recolor pixels with tolerance matching (like WebGL)
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    const a = pixels[i + 3]!;

    // Skip transparent pixels
    if (a === 0) continue;

    // Find matching color with tolerance
    const newColor = findMatchingColor(r, g, b, colorPairs);

    if (newColor) {
      pixels[i] = newColor.r;
      pixels[i + 1] = newColor.g;
      pixels[i + 2] = newColor.b;
      // Keep alpha unchanged
    }
  }

  // Write back
  ctx.putImageData(imageData, 0, 0);

  return canvas;
}
