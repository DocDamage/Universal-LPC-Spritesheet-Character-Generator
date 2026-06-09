import { get2DContext } from "../../../canvas/canvas-utils.ts";
import type { Rect } from "../custom-weapon-import.ts";

export function drawPreviewWithCrosshair(
  targetCanvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
  bounds: Rect | null,
): void {
  const ctx = get2DContext(targetCanvas, true);
  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);

  // Draw checkerboard background
  const checkSize = 8;
  for (let y = 0; y < targetCanvas.height; y += checkSize) {
    for (let x = 0; x < targetCanvas.width; x += checkSize) {
      ctx.fillStyle =
        (x / checkSize + y / checkSize) % 2 === 0 ? "#1a1a2e" : "#252540";
      ctx.fillRect(x, y, checkSize, checkSize);
    }
  }

  // Scale and center the source image in the preview
  const previewW = targetCanvas.width;
  const previewH = targetCanvas.height;
  const scaleFactor = Math.min(
    previewW / sourceCanvas.width,
    previewH / sourceCanvas.height,
    1,
  );
  const drawW = sourceCanvas.width * scaleFactor;
  const drawH = sourceCanvas.height * scaleFactor;
  const drawX = (previewW - drawW) / 2;
  const drawY = (previewH - drawH) / 2;

  ctx.drawImage(sourceCanvas, drawX, drawY, drawW, drawH);

  // Draw crosshair at center-of-content
  if (bounds) {
    const cx = drawX + (bounds.x + bounds.width / 2) * scaleFactor;
    const cy = drawY + (bounds.y + bounds.height / 2) * scaleFactor;
    ctx.strokeStyle = "#f43f5e";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy);
    ctx.lineTo(cx + 8, cy);
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx, cy + 8);
    ctx.stroke();
  }
}
