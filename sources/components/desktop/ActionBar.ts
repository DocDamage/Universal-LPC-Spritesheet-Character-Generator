// Desktop-style action bar (bottom buttons and toggles)
import m from "mithril";
import { state, resetAll } from "../../state/state.ts";
import { downloadAsPNG } from "../../canvas/download.ts";
import {
  exportStateAsJSON,
  importStateFromJSON,
  serializeLayersForJson,
} from "../../state/json.ts";
import { drawCalls } from "../../canvas/renderer.ts";
import { getAllCredits, creditsToCsv } from "../../utils/credits.ts";
import { downloadFile } from "../../canvas/download.ts";
import { randomizeAll } from "./slot-config.ts";
import type { CatalogReader } from "../../state/catalog.ts";

type ActionBarAttrs = {
  catalog: CatalogReader;
};

export const ActionBar: m.Component<ActionBarAttrs> = {
  view(vnode) {
    const { catalog } = vnode.attrs;

    const saveToClipboard = async () => {
      if (!window.canvasRenderer) return;
      try {
        const json = exportStateAsJSON(
          state,
          serializeLayersForJson(drawCalls),
        );
        await navigator.clipboard.writeText(json);
        alert("✅ Character saved to clipboard!");
      } catch (err) {
        console.error("Failed to save:", err);
        alert("❌ Failed to save. Check browser permissions.");
      }
    };

    const loadFromClipboard = async () => {
      if (!window.canvasRenderer) return;
      try {
        const json = await navigator.clipboard.readText();
        const imported = importStateFromJSON(json);
        Object.assign(state, imported);
        m.redraw();
        alert("✅ Character loaded from clipboard!");
      } catch (err) {
        console.error("Failed to load:", err);
        alert("❌ Failed to load. Check clipboard content.");
      }
    };

    const exportPNG = () => {
      if (!window.canvasRenderer) return;
      downloadAsPNG("character-spritesheet.png");
    };

    return m("div.desktop-action-bar", [
      // Toggles row
      m("div.desktop-toggles", [
        m("label.desktop-toggle", [
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
        ]),
        m("label.desktop-toggle", [
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
        ]),
      ]),
      // Buttons row
      m("div.desktop-buttons", [
        m(
          "button.desktop-btn",
          {
            onclick: loadFromClipboard,
            title: "Load character from clipboard JSON",
          },
          "📋 Load",
        ),
        m(
          "button.desktop-btn",
          {
            onclick: saveToClipboard,
            title: "Save character to clipboard as JSON",
          },
          "💾 Save",
        ),
        m(
          "button.desktop-btn",
          { onclick: exportPNG, title: "Export full spritesheet as PNG" },
          "📤 Export PNG",
        ),
        m(
          "button.desktop-btn",
          {
            onclick: () => {
              const allCredits = getAllCredits(
                state.selections,
                state.bodyType,
              );
              const csvContent = creditsToCsv(allCredits);
              downloadFile(csvContent, "credits.csv", "text/csv");
            },
            title: "Download asset credits as CSV",
          },
          "📜 Credits",
        ),
        m(
          "button.desktop-btn.desktop-btn-random",
          {
            onclick: () => {
              if (confirm("🎲 Randomize all character slots?")) {
                randomizeAll(catalog);
              }
            },
            title: "Randomly select items for all slots",
          },
          "🎲 Randomize",
        ),
        m(
          "button.desktop-btn.desktop-btn-danger",
          {
            onclick: () => {
              if (confirm("Reset all selections to defaults?")) {
                void resetAll();
              }
            },
            title: "Reset all character selections back to defaults",
          },
          "↺ Reset All",
        ),
      ]),
    ]);
  },
};
