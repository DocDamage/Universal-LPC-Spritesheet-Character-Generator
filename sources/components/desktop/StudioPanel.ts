import m from "mithril";
import { canUseFeature } from "../../state/feature-gates.ts";
import { listStudioProjects } from "../../state/studio-projects.ts";
import { StudioProjectActions } from "./studio-panel/StudioProjectActions.ts";
import { StudioProjectForm } from "./studio-panel/StudioProjectForm.ts";
import { StudioProjectList } from "./studio-panel/StudioProjectList.ts";
import type { StudioPanelState } from "./studio-panel/types.ts";
import { selectedProjects } from "./studio-panel/studio-utils.ts";

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
      m(StudioProjectForm, { panelState: vnode.state }),
      m(StudioProjectActions, {
        panelState: vnode.state,
        visibleProjects,
      }),
      m(StudioProjectList, {
        panelState: vnode.state,
        visibleProjects,
      }),
    ]);
  },
};
