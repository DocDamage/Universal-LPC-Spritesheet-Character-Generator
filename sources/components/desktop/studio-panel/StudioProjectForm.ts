import m from "mithril";
import { requireFeature } from "../../../state/feature-gates.ts";
import { showToast } from "../../../state/notifications.ts";
import { state } from "../../../state/state.ts";
import { saveStudioProject } from "../../../state/studio-projects.ts";
import type { StudioPanelState } from "./types.ts";
import {
  metadataFromInputs,
  refreshProjects,
  uniqueCollections,
} from "./studio-utils.ts";

type StudioProjectFormAttrs = {
  panelState: StudioPanelState;
};

export const StudioProjectForm: m.Component<StudioProjectFormAttrs> = {
  view(vnode) {
    const panelState = vnode.attrs.panelState;
    const collections = uniqueCollections(panelState.projects ?? []);

    return [
      m("div.studio-field-grid", [
        m("input.input.is-small", {
          type: "text",
          placeholder: "Project name",
          value: panelState.projectName,
          oninput: (event: Event) => {
            panelState.projectName = (event.target as HTMLInputElement).value;
          },
        }),
        m("input.input.is-small", {
          type: "text",
          placeholder: "Collection",
          value: panelState.collection,
          oninput: (event: Event) => {
            panelState.collection = (event.target as HTMLInputElement).value;
          },
        }),
        m("input.input.is-small", {
          type: "text",
          placeholder: "Role / class",
          value: panelState.role,
          oninput: (event: Event) => {
            panelState.role = (event.target as HTMLInputElement).value;
          },
        }),
        m("input.input.is-small", {
          type: "text",
          placeholder: "Tags, comma separated",
          value: panelState.tags,
          oninput: (event: Event) => {
            panelState.tags = (event.target as HTMLInputElement).value;
          },
        }),
      ]),
      m("textarea.textarea.is-small.studio-notes-input", {
        placeholder: "Notes",
        rows: 2,
        value: panelState.notes,
        oninput: (event: Event) => {
          panelState.notes = (event.target as HTMLTextAreaElement).value;
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
                panelState.projectName,
                state,
                metadataFromInputs(panelState),
              );
              panelState.projectName = "";
              refreshProjects(panelState);
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
            value: panelState.activeCollection,
            onchange: (event: Event) => {
              panelState.activeCollection = (
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
    ];
  },
};
