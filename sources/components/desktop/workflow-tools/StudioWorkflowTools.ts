import m from "mithril";
import { downloadFile } from "../../../canvas/download.ts";
import { requireFeature } from "../../../state/feature-gates.ts";
import { showToast } from "../../../state/notifications.ts";
import {
  addStudioProjectVersion,
  applyStudioProjectSnapshot,
  listStudioProjects,
  restoreStudioProjectVersion,
  updateStudioProjectMetadata,
  type StudioProject,
  type StudioProjectStatus,
} from "../../../state/studio-projects.ts";
import { triggerRender } from "../../render-effect.ts";
import type { WorkflowToolsState } from "./types.ts";
import {
  exportContactSheet,
  exportProductionChecklist,
} from "./workflow-helpers.ts";

type StudioWorkflowToolsAttrs = {
  enabled: boolean;
  panelState: WorkflowToolsState;
  projects: StudioProject[];
};

export const StudioWorkflowTools: m.Component<StudioWorkflowToolsAttrs> = {
  view(vnode) {
    const panelState = vnode.attrs.panelState;
    const projects = vnode.attrs.projects;

    if (!vnode.attrs.enabled) {
      return m("div.workflow-tier", [
        m("h4", "Studio"),
        m(
          "p.studio-empty",
          "Gallery, contact sheets, version history, bulk metadata, style-guide enforcement, and production checklists unlock in Studio.",
        ),
      ]);
    }

    return m("div.workflow-tier", [
      m("h4", "Studio"),
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
            value: panelState.bulkStatus,
            onchange: (event: Event) => {
              panelState.bulkStatus = (event.target as HTMLSelectElement)
                .value as StudioProjectStatus;
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
                  status: panelState.bulkStatus,
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
                    addStudioProjectVersion(project.id, "Restore point");
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
                          applyStudioProjectSnapshot(refreshed.snapshot);
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
    ]);
  },
};
