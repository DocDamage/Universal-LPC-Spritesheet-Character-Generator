import m from "mithril";
import { showToast } from "../../../state/notifications.ts";
import { randomizeAll } from "../slot-config.ts";
import { triggerRender } from "../../render-effect.ts";
import type { WorkflowToolsAttrs, WorkflowToolsState } from "./types.ts";
import { createStudioProjectSnapshot } from "../../../state/studio-projects.ts";
import {
  pushUndo,
  restoreSnapshot,
  saveFavorites,
  selectionSummary,
  starterTemplates,
  themeRandomizers,
} from "./workflow-helpers.ts";

type FreeWorkflowToolsAttrs = WorkflowToolsAttrs & {
  panelState: WorkflowToolsState;
};

export const FreeWorkflowTools: m.Component<FreeWorkflowToolsAttrs> = {
  view(vnode) {
    const panelState = vnode.attrs.panelState;

    return m("div.workflow-tier", [
      m("h4", "Free"),
      m("div.studio-project-actions", [
        starterTemplates.map((template) =>
          m(
            "button.button.is-small",
            {
              type: "button",
              onclick: async () => {
                pushUndo(panelState);
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
                pushUndo(panelState);
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
            disabled: panelState.undoStack.length === 0,
            onclick: async () => {
              const snapshot = panelState.undoStack.pop();
              if (!snapshot) return;
              panelState.redoStack.push(createStudioProjectSnapshot());
              await restoreSnapshot(snapshot);
            },
          },
          "Undo Build",
        ),
        m(
          "button.button.is-small",
          {
            type: "button",
            disabled: panelState.redoStack.length === 0,
            onclick: async () => {
              const snapshot = panelState.redoStack.pop();
              if (!snapshot) return;
              panelState.undoStack.push(createStudioProjectSnapshot());
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
              panelState.favorites = [favorite, ...panelState.favorites].slice(
                0,
                8,
              );
              saveFavorites(panelState.favorites);
            },
          },
          "Favorite Build",
        ),
      ]),
      m(
        "p.studio-empty",
        panelState.favorites.length === 0
          ? "No favorite builds yet."
          : `Favorites: ${panelState.favorites.join(" | ")}`,
      ),
    ]);
  },
};
