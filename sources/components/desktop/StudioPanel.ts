import m from "mithril";
import { downloadBlob, downloadFile } from "../../canvas/download.ts";
import { triggerRender } from "../render-effect.ts";
import { canUseFeature, requireFeature } from "../../state/feature-gates.ts";
import { showToast } from "../../state/notifications.ts";
import {
  applyStudioProjectSnapshot,
  deleteStudioProject,
  exportStudioProjectLibrary,
  importStudioProjectLibrary,
  listStudioProjects,
  saveStudioProject,
  updateStudioProject,
  type StudioProject,
} from "../../state/studio-projects.ts";
import type { ZipFolder } from "../../utils/zip-helpers.ts";

type StudioPanelState = {
  projects: StudioProject[];
  projectName: string;
  isExporting: boolean;
};

type WindowWithJSZip = Window & {
  JSZip?: new () => ZipFolder;
};

function refreshProjects(vnodeState: StudioPanelState): void {
  vnodeState.projects = listStudioProjects();
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

async function exportBatchZip(projects: StudioProject[]): Promise<void> {
  const w = window as WindowWithJSZip;
  if (!w.JSZip) {
    throw new Error("JSZip library not loaded");
  }

  const zip = new w.JSZip();
  const manifest = projects.map((project) => ({
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    file: `projects/${safeFileName(project.name)}-${project.id}.json`,
  }));

  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        projectCount: projects.length,
        projects: manifest,
      },
      null,
      2,
    ),
  );

  const folder = zip.folder("projects");
  for (const project of projects) {
    folder.file(
      `${safeFileName(project.name)}-${project.id}.json`,
      JSON.stringify(project, null, 2),
    );
  }

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, "lpc-studio-project-batch.zip");
}

export const StudioPanel: m.Component<unknown, StudioPanelState> = {
  oninit(vnode) {
    vnode.state.projects = listStudioProjects();
    vnode.state.projectName = "";
    vnode.state.isExporting = false;
  },

  view(vnode) {
    const hasStudio = canUseFeature("studio-tools");
    const projects = vnode.state.projects ?? [];

    if (!hasStudio) {
      return m("section.studio-panel.studio-panel-locked", [
        m("div.studio-panel-header", [
          m("h3", "Studio"),
          m("span.studio-panel-pill", "Studio"),
        ]),
        m(
          "p",
          "Project libraries, saved character sets, library import/export, and batch project ZIPs unlock in Studio mode.",
        ),
      ]);
    }

    return m("section.studio-panel", [
      m("div.studio-panel-header", [
        m("h3", "Studio Projects"),
        m("span.studio-panel-pill", `${projects.length} saved`),
      ]),
      m("div.studio-project-save", [
        m("input.input.is-small", {
          type: "text",
          placeholder: "Project name",
          value: vnode.state.projectName,
          oninput: (event: Event) => {
            vnode.state.projectName = (event.target as HTMLInputElement).value;
          },
        }),
        m(
          "button.button.is-small.is-info",
          {
            type: "button",
            onclick: () => {
              if (!requireFeature("studio-tools")) return;
              const project = saveStudioProject(vnode.state.projectName);
              vnode.state.projectName = "";
              refreshProjects(vnode.state);
              showToast(`Saved "${project.name}" to Studio projects.`, {
                kind: "success",
              });
            },
          },
          "Save",
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
        m(
          "button.button.is-small",
          {
            type: "button",
            disabled: projects.length === 0 || vnode.state.isExporting,
            onclick: async () => {
              if (!requireFeature("studio-tools")) return;
              vnode.state.isExporting = true;
              try {
                await exportBatchZip(projects);
                showToast("Studio batch ZIP exported.", { kind: "success" });
              } catch (err) {
                showToast(
                  err instanceof Error ? err.message : "Batch export failed.",
                  { kind: "error" },
                );
              } finally {
                vnode.state.isExporting = false;
                m.redraw();
              }
            },
          },
          vnode.state.isExporting ? "Exporting..." : "Batch ZIP",
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
      ]),
      projects.length === 0
        ? m("p.studio-empty", "No Studio projects saved yet.")
        : m(
            "div.studio-project-list",
            projects.map((project) =>
              m("article.studio-project-row", { key: project.id }, [
                m("div.studio-project-meta", [
                  m("strong", project.name),
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
                      onclick: () => {
                        updateStudioProject(project.id);
                        refreshProjects(vnode.state);
                        showToast(`Updated "${project.name}".`, {
                          kind: "success",
                        });
                      },
                    },
                    "Update",
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
