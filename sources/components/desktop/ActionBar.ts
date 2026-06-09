// Desktop-style action bar (bottom buttons and toggles)
import m from "mithril";
import { state } from "../../state/state.ts";
import { executeCommand, getCommandTitle } from "../../state/commands.ts";
import type { CatalogReader } from "../../state/catalog.ts";

type ActionBarAttrs = {
  catalog: CatalogReader;
};

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
              checked: state.applyTransparencyMask,
              onchange: (e: Event) => {
                state.applyTransparencyMask = (
                  e.target as HTMLInputElement
                ).checked;
                m.redraw();
              },
            }),
            " Cast Shadow",
          ],
        ),
      ]),
      // Buttons row
      m("div.desktop-buttons", [
        m(
          "button.desktop-btn",
          {
            onclick: () => {
              executeCommand("app.load.clipboard");
            },
            title: getCommandTitle(
              "app.load.clipboard",
              "Load character from clipboard JSON",
            ),
          },
          "📋 Load",
        ),
        m(
          "button.desktop-btn",
          {
            onclick: () => {
              executeCommand("app.save.clipboard");
            },
            title: getCommandTitle(
              "app.save.clipboard",
              "Save character to clipboard as JSON",
            ),
          },
          "💾 Save",
        ),
        m(
          "button.desktop-btn",
          {
            onclick: () => {
              executeCommand("app.export.png");
            },
            title: getCommandTitle(
              "app.export.png",
              "Export full spritesheet as PNG",
            ),
          },
          "📤 Export PNG",
        ),
        m(
          "button.desktop-btn",
          {
            onclick: () => {
              executeCommand("app.export.credits");
            },
            title: getCommandTitle(
              "app.export.credits",
              "Download asset credits as CSV",
            ),
          },
          "📜 Credits",
        ),
        m(
          "button.desktop-btn.desktop-btn-random",
          {
            onclick: () => {
              executeCommand("app.randomize");
            },
            title: getCommandTitle(
              "app.randomize",
              "Randomly select items for all slots",
            ),
          },
          "🎲 Randomize",
        ),
        m(
          "button.desktop-btn.desktop-btn-danger",
          {
            onclick: () => {
              executeCommand("app.reset");
            },
            title: getCommandTitle(
              "app.reset",
              "Reset all character selections back to defaults",
            ),
          },
          "↺ Reset All",
        ),
      ]),
    ]);
  },
};
