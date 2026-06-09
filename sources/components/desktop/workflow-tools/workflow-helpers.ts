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

export type CharacterPreset = {
  name: string;
  role: string;
  plan: "Free" | "Pro" | "Studio";
  description: string;
  tags: string[];
};

export type ReadinessCheck = {
  label: string;
  status: "ready" | "warning" | "blocked";
  detail: string;
};

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

export const characterPresets: CharacterPreset[] = [
  {
    name: "RPG Hero",
    role: "Playable lead",
    plan: "Free",
    description: "Balanced starter for a general fantasy protagonist.",
    tags: ["starter", "fantasy", "balanced"],
  },
  {
    name: "Town NPC",
    role: "Background cast",
    plan: "Free",
    description:
      "Readable silhouette for vendors, villagers, and quest givers.",
    tags: ["npc", "village", "low-risk"],
  },
  {
    name: "Enemy Bandit",
    role: "Combat enemy",
    plan: "Pro",
    description: "Checks animation support and naming before export.",
    tags: ["enemy", "combat", "batch"],
  },
  {
    name: "Engine Ready Hero",
    role: "Godot/Unity handoff",
    plan: "Pro",
    description:
      "Designed for engine presets, JSON handoff, and credits export.",
    tags: ["engine", "json", "credits"],
  },
  {
    name: "Studio Cast Set",
    role: "Production library",
    plan: "Studio",
    description:
      "Best for collections, roles, notes, locks, and contact sheets.",
    tags: ["collection", "qa", "handoff"],
  },
];

export const productRoadmap = [
  "First-run guided creator",
  "Preset character gallery with thumbnails",
  "Project library with version history",
  "Export validation checklist",
  "Engine presets and production reports",
  "Packaged desktop app with icon, version, changelog, and About screen",
];

export const licensePrinciples = [
  "Included assets stay free/open.",
  "Paid plans unlock workflow features only.",
  "Credits and licenses remain exportable.",
  "Project reports should make attribution easy to verify.",
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

export function buildExportReadinessChecks(): ReadinessCheck[] {
  const selectedCount = Object.keys(state.selections).length;
  const enabledAnimationCount = Object.values(state.enabledAnimations).filter(
    Boolean,
  ).length;
  const enabledLicenseCount = Object.values(state.enabledLicenses).filter(
    Boolean,
  ).length;
  const warnings = animationWarnings();

  return [
    {
      label: "Character selections",
      status: selectedCount > 0 ? "ready" : "blocked",
      detail:
        selectedCount > 0
          ? `${selectedCount} selected part${selectedCount === 1 ? "" : "s"}`
          : "Choose at least one visible part before export.",
    },
    {
      label: "Animation compatibility",
      status: warnings.length === 0 ? "ready" : "warning",
      detail:
        warnings.length === 0
          ? "Current selection matches the active animation."
          : `${warnings.length} possible compatibility warning${warnings.length === 1 ? "" : "s"}.`,
    },
    {
      label: "License filters",
      status: enabledLicenseCount > 0 ? "ready" : "blocked",
      detail:
        enabledLicenseCount > 0
          ? `${enabledLicenseCount} license filter${enabledLicenseCount === 1 ? "" : "s"} enabled`
          : "Enable at least one license source.",
    },
    {
      label: "Animation export scope",
      status: enabledAnimationCount > 0 ? "ready" : "warning",
      detail:
        enabledAnimationCount > 0
          ? `${enabledAnimationCount} animation${enabledAnimationCount === 1 ? "" : "s"} selected for batch export`
          : "No batch animation filters selected; single-preview exports still work.",
    },
    {
      label: "Attribution",
      status: "ready",
      detail: "Credits TXT/CSV and character JSON are available from exports.",
    },
  ];
}

export function readinessScore(checks: readonly ReadinessCheck[]): number {
  if (checks.length === 0) return 0;
  const points = checks.reduce((total, check) => {
    if (check.status === "ready") return total + 1;
    if (check.status === "warning") return total + 0.5;
    return total;
  }, 0);
  return Math.round((points / checks.length) * 100);
}

export function exportDiagnosticReport(
  checks: readonly ReadinessCheck[],
  projects: readonly StudioProject[] = [],
): string {
  const selected = Object.values(state.selections).map(
    (selection) => `- ${selection.name} (${selection.itemId})`,
  );
  const checkRows = checks.map(
    (check) =>
      `- [${check.status.toUpperCase()}] ${check.label}: ${check.detail}`,
  );
  const projectRows = projects.slice(0, 20).map((project) => {
    return `- ${project.name}: ${project.metadata.status}, ${project.metadata.role || "no role"}`;
  });

  return [
    "# LPC Character Generator Diagnostic Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Plan: ${state.appPlan}`,
    `Body type: ${state.bodyType}`,
    `Selected animation: ${state.selectedAnimation}`,
    "",
    "## Export Readiness",
    ...checkRows,
    "",
    "## Current Selection",
    ...(selected.length > 0 ? selected : ["- No selected parts"]),
    "",
    "## Studio Projects",
    ...(projectRows.length > 0 ? projectRows : ["- No saved studio projects"]),
    "",
    "## Roadmap",
    ...productRoadmap.map((item) => `- ${item}`),
    "",
    "## License Position",
    ...licensePrinciples.map((item) => `- ${item}`),
  ].join("\n");
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
