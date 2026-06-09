import m from "mithril";
import { showToast } from "../../../state/notifications.ts";
import { randomizeAll } from "../slot-config.ts";
import { triggerRender } from "../../render-effect.ts";
import type { WorkflowToolsAttrs } from "./types.ts";
import { createStudioProjectSnapshot } from "../../../state/studio-projects.ts";
import { favoritesStore } from "../../../state/favorites-store.ts";
import { characterUndoStore } from "../../../state/character-undo-store.ts";
import { applyCharacterPreset } from "../../../state/character-presets-data.ts";
import { syncSelectionsToHash } from "../../../state/hash-selection.ts";
import {
  characterPresets,
  selectionSummary,
  starterTemplates,
  themeRandomizers,
} from "./workflow-helpers.ts";

export const FreeWorkflowTools: m.Component<WorkflowToolsAttrs> = {
  oninit() {
    favoritesStore.loadFavorites();
  },
  view(vnode) {
    const favorites = favoritesStore.favorites;

    return m("div.workflow-tier", [
      m("h4", "Free"),
      m("div.workflow-card-grid", [
        characterPresets
          .filter((preset) => preset.plan === "Free")
          .map((preset) =>
            m("article.workflow-mini-card", { key: preset.name }, [
              m("strong", preset.name),
              m("span", preset.role),
              m("p", preset.description),
              m("div.workflow-chip-row", [
                preset.tags.map((tag) => m("span.workflow-chip", tag)),
              ]),
              m(
                "button.button.is-small",
                {
                  type: "button",
                  onclick: async () => {
                    characterUndoStore.pushUndo();
                    // Custom preset logic
                    if (preset.name === "RPG Hero") {
                      applyCharacterPreset("Knight", vnode.attrs.catalog);
                    } else if (preset.name === "Town NPC") {
                      applyCharacterPreset("Villager", vnode.attrs.catalog);
                    } else {
                      randomizeAll(vnode.attrs.catalog);
                    }
                    await triggerRender();
                    syncSelectionsToHash();
                    showToast(`${preset.name} preset applied.`, {
                      kind: "success",
                    });
                  },
                },
                "Load Preset",
              ),
            ]),
          ),
      ]),
      m("div.studio-project-actions", [
        starterTemplates.map((template) =>
          m(
            "button.button.is-small",
            {
              type: "button",
              onclick: async () => {
                characterUndoStore.pushUndo();
                applyCharacterPreset(template, vnode.attrs.catalog);
                await triggerRender();
                syncSelectionsToHash();
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
                characterUndoStore.pushUndo();
                // Randomize with filters
                if (theme === "Enemy bandit") {
                  applyCharacterPreset("Rogue", vnode.attrs.catalog);
                } else if (theme === "Royal guard") {
                  applyCharacterPreset("Guard", vnode.attrs.catalog);
                } else {
                  randomizeAll(vnode.attrs.catalog);
                }
                await triggerRender();
                syncSelectionsToHash();
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
            disabled: !characterUndoStore.canUndo(),
            onclick: async () => {
              await characterUndoStore.undo();
              syncSelectionsToHash();
            },
          },
          "Undo Build",
        ),
        m(
          "button.button.is-small",
          {
            type: "button",
            disabled: !characterUndoStore.canRedo(),
            onclick: async () => {
              await characterUndoStore.redo();
              syncSelectionsToHash();
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
              favoritesStore.addFavorite(favorite, createStudioProjectSnapshot());
              showToast("Character saved to favorites.", { kind: "success" });
            },
          },
          "Favorite Build",
        ),
      ]),
      m("div.favorites-list", [
        m("h5", "Saved Favorites"),
        favorites.length === 0
          ? m("p.studio-empty", "No favorite builds yet.")
          : m("div.favorites-grid", [
              favorites.map((fav, index) =>
                m("div.favorite-item", { key: index }, [
                  m("span.favorite-label", fav.label),
                  m("div.favorite-buttons", [
                    m(
                      "button.button.is-small.is-primary",
                      {
                        type: "button",
                        onclick: async () => {
                          characterUndoStore.pushUndo();
                          await favoritesStore.loadFavorite(fav);
                          syncSelectionsToHash();
                          showToast("Favorite loaded.", { kind: "success" });
                        },
                      },
                      "Load",
                    ),
                    m(
                      "button.button.is-small.is-danger",
                      {
                        type: "button",
                        onclick: () => {
                          favoritesStore.removeFavorite(index);
                          showToast("Favorite deleted.", { kind: "success" });
                        },
                      },
                      "×",
                    ),
                  ]),
                ]),
              ),
            ]),
      ]),
    ]);
  },
};
