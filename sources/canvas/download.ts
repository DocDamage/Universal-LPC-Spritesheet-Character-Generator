import type { ResultAsync } from "neverthrow";
import { canvasToBlob } from "./canvas-utils.ts";
import { getCanvas, type CanvasNotInitialized } from "./renderer.ts";
import { withExportLayerVisibility } from "../state/export-layer-visibility.ts";

type GetCanvasBlobFn = () => ResultAsync<Blob, CanvasNotInitialized>;

type TexturePackerFrame = {
  frame: { x: number; y: number; w: number; h: number };
  rotated: boolean;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
};

/**
 * Download canvas as PNG (exports the offscreen canvas directly).
 * `getCanvasBlobFunc` defaults to the real renderer canvas; tests inject a stub.
 */
export async function downloadAsPNG(
  filename: string = "character-spritesheet.png",
  getCanvasBlobFunc: GetCanvasBlobFn = () => getCanvas().asyncMap(canvasToBlob),
): Promise<void> {
  const blobResult = await withExportLayerVisibility(getCanvasBlobFunc);
  if (blobResult.isErr()) {
    console.error("Error downloading PNG:", blobResult.error);
    return;
  }
  const url = URL.createObjectURL(blobResult.value);
  triggerDownload(url, filename);
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadFile(
  content: string,
  filename: string,
  type: string = "text/plain",
): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
}

export function generateGameEngineMetadata(): string {
  const animationsList = [
    { name: "spellcast", startRow: 0, dirs: 4, cols: 7 },
    { name: "thrust", startRow: 4, dirs: 4, cols: 8 },
    { name: "walk", startRow: 8, dirs: 4, cols: 9 },
    { name: "slash", startRow: 12, dirs: 4, cols: 6 },
    { name: "shoot", startRow: 16, dirs: 4, cols: 13 },
    { name: "hurt", startRow: 20, dirs: 1, cols: 6 },
    { name: "climb", startRow: 21, dirs: 1, cols: 6 },
    { name: "idle", startRow: 22, dirs: 4, cols: 3 },
    { name: "jump", startRow: 26, dirs: 4, cols: 6 },
    { name: "sit", startRow: 30, dirs: 4, cols: 3 },
    { name: "emote", startRow: 34, dirs: 4, cols: 3 },
    { name: "run", startRow: 38, dirs: 4, cols: 8 },
    { name: "combat_idle", startRow: 42, dirs: 4, cols: 3 },
    { name: "backslash", startRow: 46, dirs: 4, cols: 7 },
    { name: "halfslash", startRow: 50, dirs: 4, cols: 7 },
  ];

  const directionsList = ["up", "left", "down", "right"];
  const frames: Record<string, TexturePackerFrame> = {};

  for (const anim of animationsList) {
    const numDirs = anim.dirs;
    for (let d = 0; d < numDirs; d++) {
      const dirName = numDirs === 1 ? "all" : directionsList[d];
      const row = anim.startRow + d;
      for (let c = 0; c < anim.cols; c++) {
        const frameKey = `${anim.name}_${dirName}_${c}`;
        frames[frameKey] = {
          frame: { x: c * 64, y: row * 64, w: 64, h: 64 },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 64, h: 64 },
          sourceSize: { w: 64, h: 64 },
        };
      }
    }
  }

  const result = {
    frames,
    meta: {
      app: "Universal LPC Spritesheet Character Generator",
      version: "1.0.0",
      image: "character-spritesheet.png",
      format: "RGBA8888",
      size: { w: 832, h: 3456 },
      scale: "1",
    },
  };

  return JSON.stringify(result, null, 2);
}

export function downloadGameEngineMetadata(): void {
  const jsonContent = generateGameEngineMetadata();
  downloadFile(jsonContent, "character-spritesheet.json", "application/json");
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
}
