import { canvasToBlob, createCanvas } from "../../../canvas/canvas-utils.ts";
import { downloadBlob } from "../../../canvas/download.ts";
import { getCanvas, renderCharacter } from "../../../canvas/renderer.ts";
import {
  applyStudioProjectSnapshot,
  createStudioProjectSnapshot,
  type StudioProject,
} from "../../../state/studio-projects.ts";
import { getItemMerged } from "../../../state/catalog.ts";
import { state } from "../../../state/state.ts";
import { triggerRender } from "../../render-effect.ts";
import type { SavedSnapshot, WorkflowToolsState } from "./types.ts";

const FAVORITES_KEY = "lpc-free-favorite-builds";
const PRO_SETTINGS_KEY = "lpc-pro-workflow-settings";

export const starterTemplates = [
  "Villager",
  "Knight",
  "Mage",
  "Rogue",
  "Merchant",
  "Guard",
];

export const themeRandomizers = [
  "Fantasy town",
  "Enemy bandit",
  "Royal guard",
  "Undead",
  "Forest scout",
];

export function loadFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function saveFavorites(favorites: string[]): void {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

export function pushUndo(vnodeState: WorkflowToolsState): void {
  vnodeState.undoStack.push(createStudioProjectSnapshot());
  vnodeState.redoStack = [];
  if (vnodeState.undoStack.length > 25) vnodeState.undoStack.shift();
}

export async function restoreSnapshot(snapshot: SavedSnapshot): Promise<void> {
  applyStudioProjectSnapshot(snapshot);
  await triggerRender();
}

export function selectionSummary(): string {
  return Object.values(state.selections)
    .map((selection) => selection.name)
    .filter(Boolean)
    .slice(0, 10)
    .join(", ");
}

export function animationWarnings(): string[] {
  const warnings: string[] = [];
  for (const selection of Object.values(state.selections)) {
    const meta = getItemMerged(selection.itemId).unwrapOr(null);
    if (!meta) continue;
    if (
      Array.isArray(meta.animations) &&
      meta.animations.length > 0 &&
      !meta.animations.includes(state.selectedAnimation)
    ) {
      warnings.push(
        `${selection.name} may not support ${state.selectedAnimation}`,
      );
    }
  }
  return warnings;
}

export function layerInspectorRows(): string[] {
  return Object.values(state.selections)
    .map((selection) => {
      const meta = getItemMerged(selection.itemId).unwrapOr(null);
      return `${selection.name} - ${meta?.type_name ?? selection.itemId}`;
    })
    .sort((a, b) => a.localeCompare(b));
}

export function exportProductionChecklist(projects: StudioProject[]): string {
  const rows = projects.map((project) => {
    const missing: string[] = [];
    if (!project.metadata.role) missing.push("role");
    if (!project.metadata.notes) missing.push("notes");
    if (!project.metadata.locked && project.metadata.status === "final") {
      missing.push("final lock");
    }
    if (Object.keys(project.snapshot.selections).length === 0) {
      missing.push("selections");
    }
    return `- ${project.name}: ${missing.length === 0 ? "ready" : `missing ${missing.join(", ")}`}`;
  });
  return ["# Studio Production Checklist", "", ...rows].join("\n");
}

export async function exportContactSheet(
  projects: StudioProject[],
): Promise<void> {
  if (projects.length === 0) return;
  const restore = createStudioProjectSnapshot();
  const cell = 128;
  const columns = Math.min(4, projects.length);
  const rows = Math.ceil(projects.length / columns);
  const { canvas, ctx } = createCanvas(columns * cell, rows * (cell + 22));

  try {
    for (let index = 0; index < projects.length; index++) {
      const project = projects[index]!;
      applyStudioProjectSnapshot(project.snapshot);
      await renderCharacter(state.selections, state.bodyType);
      const rendered = getCanvas();
      if (rendered.isErr()) continue;
      const x = (index % columns) * cell;
      const y = Math.floor(index / columns) * (cell + 22);
      ctx.clearRect(x, y, cell, cell + 22);
      ctx.drawImage(rendered.value, 0, 0, 64, 64, x + 32, y + 8, 64, 64);
      ctx.fillStyle = "#ffffff";
      ctx.font = "10px sans-serif";
      ctx.fillText(project.name.slice(0, 18), x + 6, y + cell + 12);
    }
  } finally {
    applyStudioProjectSnapshot(restore);
    await triggerRender();
  }

  downloadBlob(await canvasToBlob(canvas), "studio-contact-sheet.png");
}

export function persistProSettings(vnodeState: WorkflowToolsState): void {
  localStorage.setItem(
    PRO_SETTINGS_KEY,
    JSON.stringify({
      paletteName: vnodeState.paletteName,
      namingTemplate: vnodeState.namingTemplate,
      alignmentPreset: vnodeState.alignmentPreset,
      styleGuide: vnodeState.styleGuide,
    }),
  );
}

export function loadProSettings(): Partial<WorkflowToolsState> {
  try {
    return JSON.parse(
      localStorage.getItem(PRO_SETTINGS_KEY) ?? "{}",
    ) as Partial<WorkflowToolsState>;
  } catch {
    return {};
  }
}
