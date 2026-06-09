import m from "mithril";
import {
  downloadBlob,
  downloadFile,
  generateGameEngineMetadata,
} from "../../canvas/download.ts";
import { canvasToBlob } from "../../canvas/canvas-utils.ts";
import {
  drawCalls,
  getCanvas,
  renderCharacter,
} from "../../canvas/renderer.ts";
import { exportStateAsJSON, serializeLayersForJson } from "../../state/json.ts";
import { triggerRender } from "../render-effect.ts";
import { canUseFeature, requireFeature } from "../../state/feature-gates.ts";
import { showToast } from "../../state/notifications.ts";
import { state } from "../../state/state.ts";
import {
  getAllCredits,
  creditsToCsv,
  creditsToTxt,
} from "../../utils/credits.ts";
import {
  applyStudioProjectSnapshot,
  createStudioProjectSnapshot,
  deleteStudioProject,
  duplicateStudioProject,
  exportStudioProjectLibrary,
  importStudioProjectLibrary,
  listStudioProjects,
  saveStudioProject,
  updateStudioProject,
  updateStudioProjectMetadata,
  type StudioExportPreset,
  type StudioProject,
  type StudioProjectMetadata,
  type StudioProjectStatus,
} from "../../state/studio-projects.ts";
import type { ZipFolder } from "../../utils/zip-helpers.ts";

type StudioPanelState = {
  projects: StudioProject[];
  projectName: string;
  collection: string;
  role: string;
  tags: string;
  notes: string;
  activeCollection: string;
  selectedProjectId: string | null;
  isExporting: boolean;
};

type WindowWithJSZip = Window & {
  JSZip?: new () => ZipFolder;
};

const statuses: StudioProjectStatus[] = ["draft", "approved", "final"];
const engines: StudioExportPreset["engine"][] = [
  "generic",
  "godot",
  "phaser",
  "rpg-maker",
];

function refreshProjects(vnodeState: StudioPanelState): void {
  vnodeState.projects = listStudioProjects();
}

function parseTags(tags: string): string[] {
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function safeFileName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "project";
}

async function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsText(file);
  });
}

function selectedProjects(
  projects: StudioProject[],
  activeCollection: string,
): StudioProject[] {
  if (!activeCollection) return projects;
  return projects.filter(
    (project) => project.metadata.collection === activeCollection,
  );
}

function uniqueCollections(projects: StudioProject[]): string[] {
  return Array.from(
    new Set(
      projects
        .map((project) => project.metadata.collection)
        .filter((collection) => collection.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function buildCombinedCredits(
  projects: StudioProject[],
): ReturnType<typeof getAllCredits> {
  const byFile = new Map<string, ReturnType<typeof getAllCredits>[number]>();
  for (const project of projects) {
    for (const credit of getAllCredits(
      project.snapshot.selections,
      project.snapshot.bodyType,
    )) {
      byFile.set(credit.fileName, credit);
    }
  }
  return Array.from(byFile.values()).sort((a, b) =>
    a.fileName.localeCompare(b.fileName),
  );
}

function buildStudioReport(projects: StudioProject[]): string {
  const lines = [
    "# LPC Studio QA Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Projects: ${projects.length}`,
    "",
  ];

  const byStatus = new Map<StudioProjectStatus, number>();
  for (const status of statuses) byStatus.set(status, 0);
  for (const project of projects) {
    byStatus.set(
      project.metadata.status,
      (byStatus.get(project.metadata.status) ?? 0) + 1,
    );
  }

  lines.push("## Status Summary", "");
  for (const status of statuses) {
    lines.push(`- ${status}: ${byStatus.get(status) ?? 0}`);
  }

  lines.push("", "## Projects", "");
  for (const project of projects) {
    const enabledAnimations = Object.entries(project.snapshot.enabledAnimations)
      .filter(([, enabled]) => enabled)
      .map(([animation]) => animation);
    const selectedCount = Object.keys(project.snapshot.selections).length;
    const tags = project.metadata.tags.join(", ") || "none";
    lines.push(`### ${project.name}`);
    lines.push(`- Collection: ${project.metadata.collection || "none"}`);
    lines.push(`- Role: ${project.metadata.role || "none"}`);
    lines.push(`- Status: ${project.metadata.status}`);
    lines.push(`- Locked: ${project.metadata.locked ? "yes" : "no"}`);
    lines.push(`- Tags: ${tags}`);
    lines.push(`- Selected parts: ${selectedCount}`);
    lines.push(
      `- Enabled animations: ${enabledAnimations.length > 0 ? enabledAnimations.join(", ") : "default/current only"}`,
    );
    lines.push(`- Export engine: ${project.metadata.exportPreset.engine}`);
    if (project.metadata.notes) {
      lines.push(`- Notes: ${project.metadata.notes}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function renderProjectPng(project: StudioProject): Promise<Blob> {
  applyStudioProjectSnapshot(project.snapshot);
  await renderCharacter(state.selections, state.bodyType);
  const canvasResult = getCanvas();
  if (canvasResult.isErr()) {
    throw new Error("Canvas renderer is not ready yet.");
  }
  return canvasToBlob(canvasResult.value);
}

async function exportHandoffZip(projects: StudioProject[]): Promise<void> {
  const w = window as WindowWithJSZip;
  if (!w.JSZip) {
    throw new Error("JSZip library not loaded");
  }

  const restoreSnapshot = createStudioProjectSnapshot();
  const zip = new w.JSZip();
  const manifest = {
    version: 2,
    generatedAt: new Date().toISOString(),
    projectCount: projects.length,
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      collection: project.metadata.collection,
      status: project.metadata.status,
      engine: project.metadata.exportPreset.engine,
    })),
  };

  zip.file("README.txt", buildHandoffReadme(projects));
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("reports/studio-qa-report.md", buildStudioReport(projects));

  const combinedCredits = buildCombinedCredits(projects);
  zip.file("credits/combined-credits.txt", creditsToTxt(combinedCredits));
  zip.file("credits/combined-credits.csv", creditsToCsv(combinedCredits));

  try {
    for (const project of projects) {
      const baseName = safeFileName(project.name);
      const basePath = `projects/${baseName}-${project.id}`;
      const preset = project.metadata.exportPreset;
      zip.file(`${basePath}/project.json`, JSON.stringify(project, null, 2));
      if (preset.includeCredits) {
        zip.file(
          `${basePath}/credits.txt`,
          creditsToTxt(
            getAllCredits(
              project.snapshot.selections,
              project.snapshot.bodyType,
            ),
          ),
        );
      }

      if (preset.includePng) {
        const png = await renderProjectPng(project);
        zip.file(`${basePath}/spritesheet.png`, png);
      }

      if (preset.includeJson) {
        zip.file(
          `${basePath}/character.json`,
          exportStateAsJSON(state, serializeLayersForJson(drawCalls)),
        );
        zip.file(
          `${basePath}/engine-preset.json`,
          generateGameEngineMetadata(),
        );
      }
    }
  } finally {
    applyStudioProjectSnapshot(restoreSnapshot);
    await triggerRender();
  }

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, "lpc-studio-handoff-pack.zip");
}

async function exportPngZip(projects: StudioProject[]): Promise<void> {
  const w = window as WindowWithJSZip;
  if (!w.JSZip) {
    throw new Error("JSZip library not loaded");
  }

  const restoreSnapshot = createStudioProjectSnapshot();
  const zip = new w.JSZip();
  try {
    for (const project of projects) {
      const png = await renderProjectPng(project);
      zip.file(`${safeFileName(project.name)}-${project.id}.png`, png);
    }
  } finally {
    applyStudioProjectSnapshot(restoreSnapshot);
    await triggerRender();
  }

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, "lpc-studio-spritesheets.zip");
}

function buildHandoffReadme(projects: StudioProject[]): string {
  return [
    "LPC Studio Handoff Pack",
    "",
    "Contents:",
    "- manifest.json: project index and export metadata",
    "- reports/studio-qa-report.md: production QA summary",
    "- credits/: combined attribution files",
    "- projects/: per-project JSON, spritesheet PNGs, credits, and engine metadata",
    "",
    `Projects included: ${projects.length}`,
    "",
    "All LPC art remains governed by its original free/open licenses. This pack is a production workflow export only.",
  ].join("\n");
}

function metadataFromInputs(
  vnodeState: StudioPanelState,
): Partial<StudioProjectMetadata> {
  return {
    collection: vnodeState.collection.trim(),
    role: vnodeState.role.trim(),
    tags: parseTags(vnodeState.tags),
    notes: vnodeState.notes.trim(),
  };
}

function updateProjectField(
  vnodeState: StudioPanelState,
  project: StudioProject,
  patch: Partial<StudioProjectMetadata> & { name?: string },
): void {
  updateStudioProjectMetadata(project.id, patch);
  refreshProjects(vnodeState);
}

export const StudioPanel: m.Component<unknown, StudioPanelState> = {
  oninit(vnode) {
    vnode.state.projects = listStudioProjects();
    vnode.state.projectName = "";
    vnode.state.collection = "";
    vnode.state.role = "";
    vnode.state.tags = "";
    vnode.state.notes = "";
    vnode.state.activeCollection = "";
    vnode.state.selectedProjectId = null;
    vnode.state.isExporting = false;
  },

  view(vnode) {
    const hasStudio = canUseFeature("studio-tools");
    const projects = vnode.state.projects ?? [];
    const collections = uniqueCollections(projects);
    const visibleProjects = selectedProjects(
      projects,
      vnode.state.activeCollection,
    );

    if (!hasStudio) {
      return m("section.studio-panel.studio-panel-locked", [
        m("div.studio-panel-header", [
          m("h3", "Studio"),
          m("span.studio-panel-pill", "Studio"),
        ]),
        m(
          "p",
          "Project libraries, collections, notes, locks, QA reports, combined credits, PNG batch export, and handoff ZIPs unlock in Studio mode.",
        ),
      ]);
    }

    return m("section.studio-panel", [
      m("div.studio-panel-header", [
        m("h3", "Studio Projects"),
        m("span.studio-panel-pill", `${projects.length} saved`),
      ]),
      m("div.studio-field-grid", [
        m("input.input.is-small", {
          type: "text",
          placeholder: "Project name",
          value: vnode.state.projectName,
          oninput: (event: Event) => {
            vnode.state.projectName = (event.target as HTMLInputElement).value;
          },
        }),
        m("input.input.is-small", {
          type: "text",
          placeholder: "Collection",
          value: vnode.state.collection,
          oninput: (event: Event) => {
            vnode.state.collection = (event.target as HTMLInputElement).value;
          },
        }),
        m("input.input.is-small", {
          type: "text",
          placeholder: "Role / class",
          value: vnode.state.role,
          oninput: (event: Event) => {
            vnode.state.role = (event.target as HTMLInputElement).value;
          },
        }),
        m("input.input.is-small", {
          type: "text",
          placeholder: "Tags, comma separated",
          value: vnode.state.tags,
          oninput: (event: Event) => {
            vnode.state.tags = (event.target as HTMLInputElement).value;
          },
        }),
      ]),
      m("textarea.textarea.is-small.studio-notes-input", {
        placeholder: "Notes",
        rows: 2,
        value: vnode.state.notes,
        oninput: (event: Event) => {
          vnode.state.notes = (event.target as HTMLTextAreaElement).value;
        },
      }),
      m("div.studio-project-actions", [
        m(
          "button.button.is-small.is-info",
          {
            type: "button",
            onclick: () => {
              if (!requireFeature("studio-tools")) return;
              const project = saveStudioProject(
                vnode.state.projectName,
                state,
                metadataFromInputs(vnode.state),
              );
              vnode.state.projectName = "";
              refreshProjects(vnode.state);
              showToast(`Saved "${project.name}" to Studio projects.`, {
                kind: "success",
              });
            },
          },
          "Save Project",
        ),
        m(
          "select.select.is-small.studio-collection-filter",
          {
            value: vnode.state.activeCollection,
            onchange: (event: Event) => {
              vnode.state.activeCollection = (
                event.target as HTMLSelectElement
              ).value;
            },
          },
          [
            m("option", { value: "" }, "All collections"),
            collections.map((collection) =>
              m("option", { value: collection }, collection),
            ),
          ],
        ),
      ]),
      m("div.studio-project-actions", [
        m(
          "button.button.is-small",
          {
            type: "button",
            disabled: projects.length === 0,
            onclick: () => {
              downloadFile(
                exportStudioProjectLibrary(),
                "lpc-studio-projects.json",
                "application/json",
              );
            },
          },
          "Export Library",
        ),
        m("label.button.is-small.studio-import-button", [
          "Import",
          m("input", {
            type: "file",
            accept: "application/json,.json",
            onchange: async (event: Event) => {
              if (!requireFeature("studio-tools")) return;
              const input = event.target as HTMLInputElement;
              const file = input.files?.[0];
              if (!file) return;

              try {
                const importedCount = importStudioProjectLibrary(
                  await readFile(file),
                );
                refreshProjects(vnode.state);
                showToast(`Imported ${importedCount} Studio project(s).`, {
                  kind: importedCount > 0 ? "success" : "warning",
                });
              } catch (err) {
                showToast(
                  err instanceof Error
                    ? err.message
                    : "Studio library import failed.",
                  { kind: "error" },
                );
              } finally {
                input.value = "";
              }
            },
          }),
        ]),
        m(
          "button.button.is-small",
          {
            type: "button",
            disabled: visibleProjects.length === 0 || vnode.state.isExporting,
            onclick: async () => {
              if (!requireFeature("studio-tools")) return;
              vnode.state.isExporting = true;
              try {
                await exportHandoffZip(visibleProjects);
                showToast("Studio handoff ZIP exported.", { kind: "success" });
              } catch (err) {
                showToast(
                  err instanceof Error
                    ? err.message
                    : "Studio handoff export failed.",
                  { kind: "error" },
                );
              } finally {
                vnode.state.isExporting = false;
                m.redraw();
              }
            },
          },
          vnode.state.isExporting ? "Exporting..." : "Handoff ZIP",
        ),
        m(
          "button.button.is-small",
          {
            type: "button",
            disabled: visibleProjects.length === 0 || vnode.state.isExporting,
            onclick: async () => {
              if (!requireFeature("studio-tools")) return;
              vnode.state.isExporting = true;
              try {
                await exportPngZip(visibleProjects);
                showToast("Studio PNG ZIP exported.", { kind: "success" });
              } catch (err) {
                showToast(
                  err instanceof Error
                    ? err.message
                    : "PNG batch export failed.",
                  { kind: "error" },
                );
              } finally {
                vnode.state.isExporting = false;
                m.redraw();
              }
            },
          },
          "PNG ZIP",
        ),
        m(
          "button.button.is-small",
          {
            type: "button",
            disabled: visibleProjects.length === 0,
            onclick: () => {
              const credits = buildCombinedCredits(visibleProjects);
              downloadFile(creditsToTxt(credits), "studio-credits.txt");
              downloadFile(
                creditsToCsv(credits),
                "studio-credits.csv",
                "text/csv",
              );
            },
          },
          "Credits",
        ),
        m(
          "button.button.is-small",
          {
            type: "button",
            disabled: visibleProjects.length === 0,
            onclick: () => {
              downloadFile(
                buildStudioReport(visibleProjects),
                "studio-qa-report.md",
                "text/markdown",
              );
            },
          },
          "QA Report",
        ),
      ]),
      visibleProjects.length === 0
        ? m("p.studio-empty", "No Studio projects saved yet.")
        : m(
            "div.studio-project-list",
            visibleProjects.map((project) =>
              m("article.studio-project-row", { key: project.id }, [
                m("div.studio-project-meta", [
                  m("input.input.is-small", {
                    value: project.name,
                    title: "Rename project",
                    onchange: (event: Event) => {
                      updateProjectField(vnode.state, project, {
                        name: (event.target as HTMLInputElement).value,
                      });
                    },
                  }),
                  m("div.studio-project-badges", [
                    m("span.studio-panel-pill", project.metadata.status),
                    project.metadata.locked
                      ? m("span.studio-panel-pill", "locked")
                      : null,
                    project.metadata.collection
                      ? m("span.studio-panel-pill", project.metadata.collection)
                      : null,
                  ]),
                  m("div.studio-project-edit-grid", [
                    m("input.input.is-small", {
                      placeholder: "Collection",
                      value: project.metadata.collection,
                      onchange: (event: Event) => {
                        updateProjectField(vnode.state, project, {
                          collection: (event.target as HTMLInputElement).value,
                        });
                      },
                    }),
                    m("input.input.is-small", {
                      placeholder: "Role",
                      value: project.metadata.role,
                      onchange: (event: Event) => {
                        updateProjectField(vnode.state, project, {
                          role: (event.target as HTMLInputElement).value,
                        });
                      },
                    }),
                    m(
                      "select.select.is-small",
                      {
                        value: project.metadata.status,
                        onchange: (event: Event) => {
                          updateProjectField(vnode.state, project, {
                            status: (event.target as HTMLSelectElement)
                              .value as StudioProjectStatus,
                          });
                        },
                      },
                      statuses.map((status) =>
                        m("option", { value: status }, status),
                      ),
                    ),
                    m(
                      "select.select.is-small",
                      {
                        value: project.metadata.exportPreset.engine,
                        onchange: (event: Event) => {
                          updateProjectField(vnode.state, project, {
                            exportPreset: {
                              ...project.metadata.exportPreset,
                              engine: (event.target as HTMLSelectElement)
                                .value as StudioExportPreset["engine"],
                            },
                          });
                        },
                      },
                      engines.map((engine) =>
                        m("option", { value: engine }, engine),
                      ),
                    ),
                  ]),
                  m("div.studio-project-toggles", [
                    m("label.checkbox", [
                      m("input", {
                        type: "checkbox",
                        checked: project.metadata.exportPreset.includePng,
                        onchange: (event: Event) => {
                          updateProjectField(vnode.state, project, {
                            exportPreset: {
                              ...project.metadata.exportPreset,
                              includePng: (event.target as HTMLInputElement)
                                .checked,
                            },
                          });
                        },
                      }),
                      " PNG",
                    ]),
                    m("label.checkbox", [
                      m("input", {
                        type: "checkbox",
                        checked: project.metadata.exportPreset.includeJson,
                        onchange: (event: Event) => {
                          updateProjectField(vnode.state, project, {
                            exportPreset: {
                              ...project.metadata.exportPreset,
                              includeJson: (event.target as HTMLInputElement)
                                .checked,
                            },
                          });
                        },
                      }),
                      " JSON",
                    ]),
                    m("label.checkbox", [
                      m("input", {
                        type: "checkbox",
                        checked: project.metadata.exportPreset.includeCredits,
                        onchange: (event: Event) => {
                          updateProjectField(vnode.state, project, {
                            exportPreset: {
                              ...project.metadata.exportPreset,
                              includeCredits: (event.target as HTMLInputElement)
                                .checked,
                            },
                          });
                        },
                      }),
                      " Credits",
                    ]),
                  ]),
                  m("input.input.is-small", {
                    placeholder: "Tags",
                    value: project.metadata.tags.join(", "),
                    onchange: (event: Event) => {
                      updateProjectField(vnode.state, project, {
                        tags: parseTags(
                          (event.target as HTMLInputElement).value,
                        ),
                      });
                    },
                  }),
                  m("textarea.textarea.is-small", {
                    placeholder: "Notes",
                    rows: 2,
                    value: project.metadata.notes,
                    onchange: (event: Event) => {
                      updateProjectField(vnode.state, project, {
                        notes: (event.target as HTMLTextAreaElement).value,
                      });
                    },
                  }),
                  m(
                    "span",
                    `Updated ${new Date(project.updatedAt).toLocaleDateString()}`,
                  ),
                ]),
                m("div.studio-project-row-actions", [
                  m(
                    "button.button.is-small",
                    {
                      type: "button",
                      onclick: async () => {
                        applyStudioProjectSnapshot(project.snapshot);
                        await triggerRender();
                        showToast(`Loaded "${project.name}".`, {
                          kind: "success",
                        });
                      },
                    },
                    "Load",
                  ),
                  m(
                    "button.button.is-small",
                    {
                      type: "button",
                      disabled: project.metadata.locked,
                      title: project.metadata.locked
                        ? "Unlock before updating this approved project"
                        : "Update saved project from current character",
                      onclick: () => {
                        const updated = updateStudioProject(project.id);
                        refreshProjects(vnode.state);
                        showToast(
                          updated
                            ? `Updated "${project.name}".`
                            : `"${project.name}" is locked.`,
                          { kind: updated ? "success" : "warning" },
                        );
                      },
                    },
                    "Update",
                  ),
                  m(
                    "button.button.is-small",
                    {
                      type: "button",
                      onclick: () => {
                        duplicateStudioProject(project.id);
                        refreshProjects(vnode.state);
                      },
                    },
                    "Duplicate",
                  ),
                  m(
                    "button.button.is-small",
                    {
                      type: "button",
                      onclick: () => {
                        updateProjectField(vnode.state, project, {
                          locked: !project.metadata.locked,
                        });
                      },
                    },
                    project.metadata.locked ? "Unlock" : "Lock",
                  ),
                  m(
                    "button.button.is-small.is-danger.is-light",
                    {
                      type: "button",
                      onclick: () => {
                        deleteStudioProject(project.id);
                        refreshProjects(vnode.state);
                      },
                    },
                    "Delete",
                  ),
                ]),
              ]),
            ),
          ),
    ]);
  },
};
