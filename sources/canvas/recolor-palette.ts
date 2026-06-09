// Palette loading and high-level recolor helpers

import { ok, err, type Result } from "neverthrow";
import { recolorImage } from "./recolor-config.ts";
import { getTargetPalette } from "../state/palettes.ts";
import type { PaletteForItem } from "../state/palettes.ts";
import type { PaletteMapping } from "./webgl-palette-recolor.ts";

export type LoadPaletteError =
  | { kind: "fetch-failed"; status: number; statusText: string }
  | { kind: "parse-failed"; cause: unknown };

/** Load palette JSON file. */
export async function loadPalette(
  url: string,
): Promise<Result<unknown, LoadPaletteError>> {
  const response = await fetch(url);
  if (!response.ok) {
    return err({
      kind: "fetch-failed",
      status: response.status,
      statusText: response.statusText,
    });
  }
  try {
    return ok(await response.json());
  } catch (cause) {
    return err({ kind: "parse-failed", cause });
  }
}

/**
 * Recolor an image using a specified palette type.
 * Automatically loads the palette on first use (lazy loading).
 */
export async function recolorWithPalette(
  sourceImage: HTMLImageElement | HTMLCanvasElement,
  targetColors: Record<string, string>,
  sourcePalettes: Record<string, PaletteForItem>,
): Promise<HTMLCanvasElement | HTMLImageElement> {
  // Gather all (source, target) palette mappings so they can be applied
  // in a single shader pass.
  const mappings: PaletteMapping[] = [];
  for (const [typeName, palette] of Object.entries(sourcePalettes)) {
    const targetColor = targetColors[typeName];
    if (targetColor === undefined) {
      continue;
    }
    const targetColorKey = targetColor.includes(".")
      ? targetColor
      : `${palette.version}.${targetColor}`;
    const targetPalette = getTargetPalette(
      palette.material,
      targetColorKey,
    ).unwrapOr(null);
    if (!targetPalette) {
      throw new Error(
        `Unknown target palette color: ${JSON.stringify(targetColors)}`,
      );
    }
    mappings.push({ source: palette.colors, target: targetPalette });
  }

  return mappings.length > 0
    ? recolorImage(sourceImage, mappings)
    : sourceImage;
}
