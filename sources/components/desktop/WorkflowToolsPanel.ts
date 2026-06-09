import m from "mithril";
import { canUseFeature } from "../../state/feature-gates.ts";
import { listStudioProjects } from "../../state/studio-projects.ts";
import { FreeWorkflowTools } from "./workflow-tools/FreeWorkflowTools.ts";
import { ProWorkflowTools } from "./workflow-tools/ProWorkflowTools.ts";
import { StudioWorkflowTools } from "./workflow-tools/StudioWorkflowTools.ts";
import type {
  WorkflowToolsAttrs,
  WorkflowToolsState,
} from "./workflow-tools/types.ts";
import {
  animationWarnings,
  layerInspectorRows,
  loadFavorites,
  loadProSettings,
} from "./workflow-tools/workflow-helpers.ts";

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

    return m("section.workflow-tools-panel", [
      m("div.studio-panel-header", [
        m("h3", "Workflow Tools"),
        m("span.studio-panel-pill", "Free / Pro / Studio"),
      ]),
      m(FreeWorkflowTools, {
        catalog: vnode.attrs.catalog,
        panelState: vnode.state,
      }),
      m(ProWorkflowTools, {
        enabled: proEnabled,
        panelState: vnode.state,
        warnings: animationWarnings(),
        layers: layerInspectorRows(),
      }),
      m(StudioWorkflowTools, {
        enabled: studioEnabled,
        panelState: vnode.state,
        projects,
      }),
    ]);
  },
};
