// Desktop-style action bar (bottom buttons and toggles)
import m from "mithril";
import { selectItem, state } from "../../state/state.ts";
import { executeCommand, getCommandTitle } from "../../state/commands.ts";
import type { CatalogReader } from "../../state/catalog.ts";
import { showToast } from "../../state/notifications.ts";

const SHADOW_ITEM_ID = "shadow";
const SHADOW_VARIANT = "shadow";

function isShadowSelected(): boolean {
  return state.selections["shadow"]?.itemId === SHADOW_ITEM_ID;
}

function setShadowSelected(checked: boolean): void {
  const selected = isShadowSelected();
  if (checked !== selected) {
    selectItem(SHADOW_ITEM_ID, SHADOW_VARIANT, selected);
    showToast(checked ? "Cast shadow enabled." : "Cast shadow disabled.", {
      kind: "success",
    });
  }
}

type ActionBarAttrs = {
  catalog: CatalogReader;
};

function commandButton(
  className: string,
  iconClass: string,
  label: string,
  commandId: string,
  fallbackTitle: string,
): m.Children {
  return m(
    `button.desktop-btn.${className}`,
    {
      onclick: () => {
        executeCommand(commandId);
      },
      title: getCommandTitle(commandId, fallbackTitle),
      "aria-label": label,
    },
    [
      m(`span.rpg-command-icon.${iconClass}`, { "aria-hidden": "true" }),
      m("span.rpg-command-label", label),
    ],
  );
}

export const ActionBar: m.Component<ActionBarAttrs> = {
  view() {
    return m("div.desktop-action-bar", [
      // Toggles row
      m("div.desktop-toggles", [
        m(
          "label.desktop-toggle",
          { title: getCommandTitle("app.grid.toggle", "Transparency Grid") },
          [
            m("input[type=checkbox]", {
              checked: state.showTransparencyGrid,
              onchange: (e: Event) => {
                state.showTransparencyGrid = (
                  e.target as HTMLInputElement
                ).checked;
                showToast(
                  state.showTransparencyGrid
                    ? "Transparency grid enabled."
                    : "Transparency grid disabled.",
                  { kind: "success" },
                );
                m.redraw();
              },
            }),
            " Transparency Grid",
          ],
        ),
        m(
          "label.desktop-toggle",
          { title: getCommandTitle("app.shadows.toggle", "Cast Shadow") },
          [
            m("input[type=checkbox]", {
              checked: isShadowSelected(),
              onchange: (e: Event) => {
                setShadowSelected((e.target as HTMLInputElement).checked);
                m.redraw();
              },
            }),
            " Cast Shadow",
          ],
        ),
        m(
          "label.desktop-toggle",
          { title: "Toggle Multi-Scale Preview Strip" },
          [
            m("input[type=checkbox]", {
              checked: state.showScaleStrip,
              onchange: (e: Event) => {
                state.showScaleStrip = (e.target as HTMLInputElement).checked;
                m.redraw();
              },
            }),
            " Multi-Scale Strip",
          ],
        ),
      ]),
      // Buttons row
      m("div.desktop-buttons", [
        commandButton(
          "desktop-btn-load",
          "rpg-icon-load",
          "Load",
          "app.load.clipboard",
          "Load character from clipboard JSON",
        ),
        commandButton(
          "desktop-btn-save",
          "rpg-icon-save",
          "Save",
          "app.save.clipboard",
          "Save character to clipboard as JSON",
        ),
        commandButton(
          "desktop-btn-share",
          "rpg-icon-share",
          "Share",
          "app.share.url",
          "Copy character URL to clipboard",
        ),
        commandButton(
          "desktop-btn-json",
          "rpg-icon-json",
          "JSON",
          "app.export.json",
          "Download character configuration as a JSON file",
        ),
        commandButton(
          "desktop-btn-png",
          "rpg-icon-png",
          "PNG",
          "app.export.png",
          "Export full spritesheet as PNG",
        ),
        commandButton(
          "desktop-btn-credits",
          "rpg-icon-credits",
          "Credits",
          "app.export.credits",
          "Download asset credits as CSV",
        ),
        commandButton(
          "desktop-btn-random",
          "rpg-icon-random",
          "Random",
          "app.randomize",
          "Randomly select items for all slots",
        ),
        commandButton(
          "desktop-btn-danger",
          "rpg-icon-reset",
          "Reset",
          "app.reset",
          "Reset all character selections back to defaults",
        ),
      ]),
    ]);
  },
};
