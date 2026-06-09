import m from "mithril";
import { showToast } from "../../../state/notifications.ts";
import {
  applyStudioProjectSnapshot,
  deleteStudioProject,
  duplicateStudioProject,
  updateStudioProject,
  type StudioExportPreset,
  type StudioProject,
  type StudioProjectStatus,
} from "../../../state/studio-projects.ts";
import { triggerRender } from "../../render-effect.ts";
import type { StudioPanelState } from "./types.ts";
import {
  parseTags,
  refreshProjects,
  updateProjectField,
} from "./studio-utils.ts";

type StudioProjectListAttrs = {
  panelState: StudioPanelState;
  visibleProjects: StudioProject[];
};

const statuses: StudioProjectStatus[] = ["draft", "approved", "final"];
const engines: StudioExportPreset["engine"][] = [
  "generic",
  "godot",
  "phaser",
  "rpg-maker",
];

export const StudioProjectList: m.Component<StudioProjectListAttrs> = {
  view(vnode) {
    const panelState = vnode.attrs.panelState;
    const visibleProjects = vnode.attrs.visibleProjects;

    if (visibleProjects.length === 0) {
      return m("p.studio-empty", "No Studio projects saved yet.");
    }

    return m(
      "div.studio-project-list",
      visibleProjects.map((project) =>
        m("article.studio-project-row", { key: project.id }, [
          m("div.studio-project-meta", [
            m("input.input.is-small", {
              value: project.name,
              title: "Rename project",
              onchange: (event: Event) => {
                updateProjectField(panelState, project, {
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
                  updateProjectField(panelState, project, {
                    collection: (event.target as HTMLInputElement).value,
                  });
                },
              }),
              m("input.input.is-small", {
                placeholder: "Role",
                value: project.metadata.role,
                onchange: (event: Event) => {
                  updateProjectField(panelState, project, {
                    role: (event.target as HTMLInputElement).value,
                  });
                },
              }),
              renderStatusSelect(panelState, project),
              renderEngineSelect(panelState, project),
            ]),
            renderExportToggles(panelState, project),
            m("input.input.is-small", {
              placeholder: "Tags",
              value: project.metadata.tags.join(", "),
              onchange: (event: Event) => {
                updateProjectField(panelState, project, {
                  tags: parseTags((event.target as HTMLInputElement).value),
                });
              },
            }),
            m("textarea.textarea.is-small", {
              placeholder: "Notes",
              rows: 2,
              value: project.metadata.notes,
              onchange: (event: Event) => {
                updateProjectField(panelState, project, {
                  notes: (event.target as HTMLTextAreaElement).value,
                });
              },
            }),
            m(
              "span",
              `Updated ${new Date(project.updatedAt).toLocaleDateString()}`,
            ),
          ]),
          renderProjectRowActions(panelState, project),
        ]),
      ),
    );
  },
};

function renderStatusSelect(
  panelState: StudioPanelState,
  project: StudioProject,
): m.Children {
  return m(
    "select.select.is-small",
    {
      value: project.metadata.status,
      onchange: (event: Event) => {
        updateProjectField(panelState, project, {
          status: (event.target as HTMLSelectElement)
            .value as StudioProjectStatus,
        });
      },
    },
    statuses.map((status) => m("option", { value: status }, status)),
  );
}

function renderEngineSelect(
  panelState: StudioPanelState,
  project: StudioProject,
): m.Children {
  return m(
    "select.select.is-small",
    {
      value: project.metadata.exportPreset.engine,
      onchange: (event: Event) => {
        updateProjectField(panelState, project, {
          exportPreset: {
            ...project.metadata.exportPreset,
            engine: (event.target as HTMLSelectElement)
              .value as StudioExportPreset["engine"],
          },
        });
      },
    },
    engines.map((engine) => m("option", { value: engine }, engine)),
  );
}

function renderExportToggles(
  panelState: StudioPanelState,
  project: StudioProject,
): m.Children {
  return m("div.studio-project-toggles", [
    renderExportToggle(panelState, project, "includePng", " PNG"),
    renderExportToggle(panelState, project, "includeJson", " JSON"),
    renderExportToggle(panelState, project, "includeCredits", " Credits"),
  ]);
}

function renderExportToggle(
  panelState: StudioPanelState,
  project: StudioProject,
  key: "includePng" | "includeJson" | "includeCredits",
  label: string,
): m.Children {
  return m("label.checkbox", [
    m("input", {
      type: "checkbox",
      checked: project.metadata.exportPreset[key],
      onchange: (event: Event) => {
        updateProjectField(panelState, project, {
          exportPreset: {
            ...project.metadata.exportPreset,
            [key]: (event.target as HTMLInputElement).checked,
          },
        });
      },
    }),
    label,
  ]);
}

function renderProjectRowActions(
  panelState: StudioPanelState,
  project: StudioProject,
): m.Children {
  return m("div.studio-project-row-actions", [
    m(
      "button.button.is-small",
      {
        type: "button",
        onclick: async () => {
          applyStudioProjectSnapshot(project.snapshot);
          await triggerRender();
          showToast(`Loaded "${project.name}".`, { kind: "success" });
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
          refreshProjects(panelState);
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
          refreshProjects(panelState);
        },
      },
      "Duplicate",
    ),
    m(
      "button.button.is-small",
      {
        type: "button",
        onclick: () => {
          updateProjectField(panelState, project, {
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
          refreshProjects(panelState);
        },
      },
      "Delete",
    ),
  ]);
}
