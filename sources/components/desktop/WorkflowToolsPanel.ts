import m from "mithril";
import { canvasToBlob, createCanvas } from "../../canvas/canvas-utils.ts";
import { downloadBlob, downloadFile } from "../../canvas/download.ts";
import { getCanvas, renderCharacter } from "../../canvas/renderer.ts";
import {
  applyStudioProjectSnapshot,
  createStudioProjectSnapshot,
  listStudioProjects,
  addStudioProjectVersion,
  restoreStudioProjectVersion,
  updateStudioProjectMetadata,
  type StudioProject,
  type StudioProjectStatus,
} from "../../state/studio-projects.ts";
import { canUseFeature, requireFeature } from "../../state/feature-gates.ts";
import { getItemMerged, type CatalogReader } from "../../state/catalog.ts";
import { showToast } from "../../state/notifications.ts";
import { state } from "../../state/state.ts";
import { randomizeAll } from "./slot-config.ts";
import { triggerRender } from "../render-effect.ts";

type WorkflowToolsAttrs = {
  catalog: CatalogReader;
};

type SavedSnapshot = ReturnType<typeof createStudioProjectSnapshot>;

type WorkflowToolsState = {
  undoStack: SavedSnapshot[];
  redoStack: SavedSnapshot[];
  favorites: string[];
  paletteName: string;
  namingTemplate: string;
  alignmentPreset: string;
  styleGuide: string;
  bulkStatus: StudioProjectStatus;
};

const FAVORITES_KEY = "lpc-free-favorite-builds";
const PRO_SETTINGS_KEY = "lpc-pro-workflow-settings";

const starterTemplates = [
  "Villager",
  "Knight",
  "Mage",
  "Rogue",
  "Merchant",
  "Guard",
];

const themeRandomizers = [
  "Fantasy town",
  "Enemy bandit",
  "Royal guard",
  "Undead",
  "Forest scout",
];

function loadFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function saveFavorites(favorites: string[]): void {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

function pushUndo(vnodeState: WorkflowToolsState): void {
  vnodeState.undoStack.push(createStudioProjectSnapshot());
  vnodeState.redoStack = [];
  if (vnodeState.undoStack.length > 25) vnodeState.undoStack.shift();
}

async function restoreSnapshot(snapshot: SavedSnapshot): Promise<void> {
  applyStudioProjectSnapshot(snapshot);
  await triggerRender();
}

function selectionSummary(): string {
  return Object.values(state.selections)
    .map((selection) => selection.name)
    .filter(Boolean)
    .slice(0, 10)
    .join(", ");
}

function animationWarnings(): string[] {
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

function layerInspectorRows(): string[] {
  return Object.values(state.selections)
    .map((selection) => {
      const meta = getItemMerged(selection.itemId).unwrapOr(null);
      return `${selection.name} - ${meta?.type_name ?? selection.itemId}`;
    })
    .sort((a, b) => a.localeCompare(b));
}

function exportProductionChecklist(projects: StudioProject[]): string {
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

async function exportContactSheet(projects: StudioProject[]): Promise<void> {
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

function persistProSettings(vnodeState: WorkflowToolsState): void {
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

function loadProSettings(): Partial<WorkflowToolsState> {
  try {
    return JSON.parse(
      localStorage.getItem(PRO_SETTINGS_KEY) ?? "{}",
    ) as Partial<WorkflowToolsState>;
  } catch {
    return {};
  }
}

export const WorkflowToolsPanel: m.Component<
  WorkflowToolsAttrs,
  WorkflowToolsState
> = {
  oninit(vnode) {
    const settings = loadProSettings();
    vnode.state.undoStack = [];
    vnode.state.redoStack = [];
    vnode.state.favorites = loadFavorites();
    vnode.state.paletteName = settings.paletteName ?? "Default production";
    vnode.state.namingTemplate =
      settings.namingTemplate ?? "{character}_{animation}_{direction}_{frame}";
    vnode.state.alignmentPreset = settings.alignmentPreset ?? "Mainhand socket";
    vnode.state.styleGuide =
      settings.styleGuide ??
      "Use consistent palettes, locked finals, and notes.";
    vnode.state.bulkStatus = "approved";
  },

  view(vnode) {
    const proEnabled = canUseFeature("advanced-editor");
    const studioEnabled = canUseFeature("studio-tools");
    const projects = listStudioProjects();
    const warnings = animationWarnings();
    const layers = layerInspectorRows();

    return m("section.workflow-tools-panel", [
      m("div.studio-panel-header", [
        m("h3", "Workflow Tools"),
        m("span.studio-panel-pill", "Free / Pro / Studio"),
      ]),
      m("div.workflow-tier", [
        m("h4", "Free"),
        m("div.studio-project-actions", [
          starterTemplates.map((template) =>
            m(
              "button.button.is-small",
              {
                type: "button",
                onclick: async () => {
                  pushUndo(vnode.state);
                  randomizeAll(vnode.attrs.catalog);
                  await triggerRender();
                  showToast(`${template} starter applied.`, {
                    kind: "success",
                  });
                },
              },
              template,
            ),
          ),
        ]),
        m("div.studio-project-actions", [
          themeRandomizers.map((theme) =>
            m(
              "button.button.is-small",
              {
                type: "button",
                onclick: async () => {
                  pushUndo(vnode.state);
                  randomizeAll(vnode.attrs.catalog);
                  await triggerRender();
                  showToast(`${theme} randomizer applied.`, {
                    kind: "success",
                  });
                },
              },
              theme,
            ),
          ),
        ]),
        m("div.studio-project-actions", [
          m(
            "button.button.is-small",
            {
              type: "button",
              disabled: vnode.state.undoStack.length === 0,
              onclick: async () => {
                const snapshot = vnode.state.undoStack.pop();
                if (!snapshot) return;
                vnode.state.redoStack.push(createStudioProjectSnapshot());
                await restoreSnapshot(snapshot);
              },
            },
            "Undo Build",
          ),
          m(
            "button.button.is-small",
            {
              type: "button",
              disabled: vnode.state.redoStack.length === 0,
              onclick: async () => {
                const snapshot = vnode.state.redoStack.pop();
                if (!snapshot) return;
                vnode.state.undoStack.push(createStudioProjectSnapshot());
                await restoreSnapshot(snapshot);
              },
            },
            "Redo Build",
          ),
          m(
            "button.button.is-small",
            {
              type: "button",
              onclick: () => {
                const favorite = selectionSummary() || "Current character";
                vnode.state.favorites = [
                  favorite,
                  ...vnode.state.favorites,
                ].slice(0, 8);
                saveFavorites(vnode.state.favorites);
              },
            },
            "Favorite Build",
          ),
        ]),
        m(
          "p.studio-empty",
          vnode.state.favorites.length === 0
            ? "No favorite builds yet."
            : `Favorites: ${vnode.state.favorites.join(" | ")}`,
        ),
      ]),
      m("div.workflow-tier", [
        m("h4", "Pro"),
        proEnabled
          ? [
              m("div.studio-field-grid", [
                m("input.input.is-small", {
                  value: vnode.state.paletteName,
                  title: "Palette preset name",
                  oninput: (event: Event) => {
                    vnode.state.paletteName = (
                      event.target as HTMLInputElement
                    ).value;
                    persistProSettings(vnode.state);
                  },
                }),
                m("input.input.is-small", {
                  value: vnode.state.alignmentPreset,
                  title: "Custom import alignment preset",
                  oninput: (event: Event) => {
                    vnode.state.alignmentPreset = (
                      event.target as HTMLInputElement
                    ).value;
                    persistProSettings(vnode.state);
                  },
                }),
              ]),
              m("input.input.is-small", {
                value: vnode.state.namingTemplate,
                title: "Export naming template",
                oninput: (event: Event) => {
                  vnode.state.namingTemplate = (
                    event.target as HTMLInputElement
                  ).value;
                  persistProSettings(vnode.state);
                },
              }),
              m("textarea.textarea.is-small", {
                rows: 2,
                value: vnode.state.styleGuide,
                title: "Shared style guide",
                oninput: (event: Event) => {
                  vnode.state.styleGuide = (
                    event.target as HTMLTextAreaElement
                  ).value;
                  persistProSettings(vnode.state);
                },
              }),
              m("div.studio-project-actions", [
                m(
                  "button.button.is-small",
                  {
                    type: "button",
                    onclick: () => {
                      downloadFile(
                        [
                          "# Pro Workflow Presets",
                          `Palette: ${vnode.state.paletteName}`,
                          `Alignment: ${vnode.state.alignmentPreset}`,
                          `Naming: ${vnode.state.namingTemplate}`,
                          `Style guide: ${vnode.state.styleGuide}`,
                        ].join("\n"),
                        "pro-workflow-presets.md",
                        "text/markdown",
                      );
                    },
                  },
                  "Export Presets",
                ),
              ]),
              m("p.studio-empty", [
                `Animation warnings: ${warnings.length}`,
                warnings.length > 0
                  ? ` - ${warnings.slice(0, 2).join("; ")}`
                  : "",
              ]),
              m(
                "p.studio-empty",
                `Layer inspector: ${layers.slice(0, 5).join(" | ")}`,
              ),
            ]
          : m(
              "p.studio-empty",
              "Palette presets, naming templates, alignment presets, layer inspection, and animation checks unlock in Pro.",
            ),
      ]),
      m("div.workflow-tier", [
        m("h4", "Studio"),
        studioEnabled
          ? [
              m("div.studio-project-actions", [
                m(
                  "button.button.is-small",
                  {
                    type: "button",
                    disabled: projects.length === 0,
                    onclick: async () => {
                      if (!requireFeature("studio-tools")) return;
                      await exportContactSheet(projects);
                    },
                  },
                  "Contact Sheet",
                ),
                m(
                  "button.button.is-small",
                  {
                    type: "button",
                    disabled: projects.length === 0,
                    onclick: () => {
                      downloadFile(
                        exportProductionChecklist(projects),
                        "studio-production-checklist.md",
                        "text/markdown",
                      );
                    },
                  },
                  "Checklist",
                ),
                m(
                  "select.select.is-small",
                  {
                    value: vnode.state.bulkStatus,
                    onchange: (event: Event) => {
                      vnode.state.bulkStatus = (
                        event.target as HTMLSelectElement
                      ).value as StudioProjectStatus;
                    },
                  },
                  [
                    m("option", { value: "draft" }, "draft"),
                    m("option", { value: "approved" }, "approved"),
                    m("option", { value: "final" }, "final"),
                  ],
                ),
                m(
                  "button.button.is-small",
                  {
                    type: "button",
                    disabled: projects.length === 0,
                    onclick: () => {
                      for (const project of projects) {
                        updateStudioProjectMetadata(project.id, {
                          status: vnode.state.bulkStatus,
                        });
                      }
                      showToast("Bulk status updated.", { kind: "success" });
                    },
                  },
                  "Bulk Status",
                ),
              ]),
              m("div.studio-gallery-grid", [
                projects.slice(0, 8).map((project) =>
                  m("article.studio-gallery-card", { key: project.id }, [
                    m("strong", project.name),
                    m("span", project.metadata.status),
                    m("span", project.metadata.role || "No role"),
                    m("div.studio-project-actions", [
                      m(
                        "button.button.is-small",
                        {
                          type: "button",
                          onclick: () => {
                            addStudioProjectVersion(
                              project.id,
                              "Restore point",
                            );
                            showToast("Version saved.", { kind: "success" });
                          },
                        },
                        "Version",
                      ),
                      project.versions[0]
                        ? m(
                            "button.button.is-small",
                            {
                              type: "button",
                              onclick: async () => {
                                restoreStudioProjectVersion(
                                  project.id,
                                  project.versions[0]!.id,
                                );
                                const refreshed = listStudioProjects().find(
                                  (entry) => entry.id === project.id,
                                );
                                if (refreshed) {
                                  applyStudioProjectSnapshot(
                                    refreshed.snapshot,
                                  );
                                  await triggerRender();
                                }
                              },
                            },
                            "Restore",
                          )
                        : null,
                    ]),
                  ]),
                ),
              ]),
            ]
          : m(
              "p.studio-empty",
              "Gallery, contact sheets, version history, bulk metadata, style-guide enforcement, and production checklists unlock in Studio.",
            ),
      ]),
    ]);
  },
};
