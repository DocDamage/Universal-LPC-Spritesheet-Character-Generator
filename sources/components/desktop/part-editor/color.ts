import { FRAME_SIZE } from "../../../state/constants.ts";
import { DIRECTIONS } from "../pixel-editor-tools.ts";
import { get2DContext } from "../../../canvas/canvas-utils.ts";
import { MAX_EXTRACTED_PALETTE_COLORS } from "./types.ts";
import type { PartEditorState, RgbColor } from "./types.ts";
import { getActiveLayer } from "./layers.ts";
import { recomposeCanvases } from "./canvas.ts";
import { saveHistory } from "./history.ts";

export function getVisiblePaletteColors(stateObj: PartEditorState): string[] {
  const counts = new Map<string, number>();
  for (const direction of DIRECTIONS) {
    const imageData = get2DContext(stateObj.canvases[direction]).getImageData(
      0,
      0,
      FRAME_SIZE,
      FRAME_SIZE,
    );
    for (let i = 0; i < imageData.data.length; i += 4) {
      const alpha = imageData.data[i + 3];
      if (alpha === 0) continue;
      const color = rgbToHex(
        imageData.data[i]!,
        imageData.data[i + 1]!,
        imageData.data[i + 2]!,
      );
      counts.set(color, (counts.get(color) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_EXTRACTED_PALETTE_COLORS)
    .map(([color]) => color);
}

export function parsePaletteFile(fileName: string, text: string): string[] {
  const colors: string[] = [];
  const lines = text.split(/\r?\n/);

  if (
    fileName.toLowerCase().endsWith(".gpl") ||
    text.includes("GIMP Palette")
  ) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (
        trimmed === "#" ||
        trimmed.startsWith("GIMP Palette") ||
        trimmed.startsWith("Name:") ||
        trimmed.startsWith("Columns:")
      ) {
        continue;
      }
      // If we are reading colors, GPL format has: R G B description
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 3) {
        const r = parseInt(parts[0]!, 10);
        const g = parseInt(parts[1]!, 10);
        const b = parseInt(parts[2]!, 10);
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
          const hex = rgbToHex(r, g, b);
          if (!colors.includes(hex)) {
            colors.push(hex);
          }
        }
      }
    }
  } else {
    // HEX or simple plaintext color list
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const hexMatch = trimmed.match(/^#?([a-fA-F0-9]{6})/);
      if (hexMatch) {
        const hex = `#${hexMatch[1]!.toLowerCase()}`;
        if (!colors.includes(hex)) {
          colors.push(hex);
        }
      }
    }
  }
  return colors;
}

export function replaceColorOnActiveLayer(stateObj: PartEditorState): void {
  const activeLayer = getActiveLayer(stateObj);
  if (!activeLayer || activeLayer.locked) return;

  const from = hexToRgbColor(stateObj.replaceFromColor);
  const to = hexToRgbColor(stateObj.replaceToColor);
  const directions = stateObj.replaceAllDirections
    ? DIRECTIONS
    : [stateObj.activeDirection];
  let changedPixels = 0;

  for (const direction of directions) {
    changedPixels += replaceColorInCanvas(
      activeLayer.canvases[direction],
      from,
      to,
      stateObj.replaceTolerance,
    );
  }

  if (changedPixels === 0) return;
  stateObj.activeColor = stateObj.replaceToColor;
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
}

export function replaceColorInCanvas(
  canvas: HTMLCanvasElement,
  from: RgbColor,
  to: RgbColor,
  tolerance: number,
): number {
  const ctx = get2DContext(canvas);
  const imageData = ctx.getImageData(0, 0, FRAME_SIZE, FRAME_SIZE);
  const clampedTolerance = Math.max(0, tolerance);
  let changedPixels = 0;

  for (let i = 0; i < imageData.data.length; i += 4) {
    if (imageData.data[i + 3] === 0) continue;
    const matches =
      Math.abs(imageData.data[i]! - from.r) <= clampedTolerance &&
      Math.abs(imageData.data[i + 1]! - from.g) <= clampedTolerance &&
      Math.abs(imageData.data[i + 2]! - from.b) <= clampedTolerance;
    if (!matches) continue;

    imageData.data[i] = to.r;
    imageData.data[i + 1] = to.g;
    imageData.data[i + 2] = to.b;
    changedPixels += 1;
  }

  if (changedPixels > 0) {
    ctx.putImageData(imageData, 0, 0);
  }
  return changedPixels;
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function hexToRgbColor(hex: string): RgbColor {
  const clean = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

