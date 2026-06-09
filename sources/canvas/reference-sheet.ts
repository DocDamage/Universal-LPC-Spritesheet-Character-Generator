import { createCanvas, canvasToBlob } from "./canvas-utils.ts";
import { getCanvas, renderCharacter } from "./renderer.ts";
import { applyStudioProjectSnapshot, createStudioProjectSnapshot } from "../state/studio-projects.ts";
import { state } from "../state/state.ts";
import { triggerRender } from "../components/render-effect.ts";
import { getAllCredits, creditsToTxt } from "../utils/credits.ts";
import { downloadBlob } from "./download.ts";
import { renderDirectionalPreviewCanvases } from "./preview-animation.ts";

export async function exportReferenceSheet(characterName: string, bodyType: string): Promise<void> {
  const originalState = createStudioProjectSnapshot();
  const cell = 128;
  const cols = 4;
  const rows = 3;
  const { canvas, ctx } = createCanvas(cols * cell, rows * cell + 150);

  // Background style
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Row 1: Render character at scales 1x, 2x, 3x, 4x
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText(`Reference Sheet: ${characterName} (${bodyType})`, 16, 28);

  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1;

  await renderCharacter(state.selections, bodyType);
  const mainCanvasRes = getCanvas();
  if (mainCanvasRes.isErr()) {
    throw new Error("Renderer canvas not initialized");
  }
  const mainCanvas = mainCanvasRes.value;

  // Draw 1x, 2x, 3x, 4x previews
  for (let i = 0; i < 4; i++) {
    const scale = i + 1;
    const x = i * cell + (cell - 64 * scale) / 2;
    const y = 50 + (cell - 64 * scale) / 2;
    
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mainCanvas, 0, 0, 64, 64, x, y, 64 * scale, 64 * scale);
    
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px sans-serif";
    ctx.fillText(`${scale}x`, i * cell + 8, 50 + cell - 8);
  }

  // Row 2: Directional previews
  const directionalFrames = renderDirectionalPreviewCanvases(0);
  directionalFrames.forEach((frame, index) => {
    const x = index * cell + (cell - 64) / 2;
    const y = 200 + (cell - 64) / 2;
    ctx.drawImage(frame.canvas, x, y);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px sans-serif";
    ctx.fillText(frame.direction, index * cell + 8, 200 + cell - 8);
  });

  // Row 3: Credits Text Area
  const credits = getAllCredits(state.selections, bodyType);
  const creditsText = creditsToTxt(credits);

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(16, 350, canvas.width - 32, 130);

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "10px monospace";
  const lines = creditsText.split("\n").slice(0, 10);
  lines.forEach((line, idx) => {
    ctx.fillText(line, 24, 365 + idx * 12);
  });

  // Revert state
  applyStudioProjectSnapshot(originalState);
  await triggerRender();

  downloadBlob(await canvasToBlob(canvas), `${characterName}-reference-sheet.png`);
}
