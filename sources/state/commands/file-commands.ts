import m from "mithril";
import { downloadAsPNG, downloadFile } from "../../canvas/download.ts";
import {
  exportStateAsJSON,
  importStateFromJSON,
  serializeLayersForJson,
} from "../json.ts";
import { renderState } from "../render-state.ts";
import { state } from "../state.ts";
import { showToast } from "../notifications.ts";
import type { Command } from "../commands.ts";

export function getFileCommands(): Command[] {
  return [
    {
      id: "app.load.clipboard",
      label: "Load Character from Clipboard",
      category: "File",
      tooltip: "Load character from clipboard JSON",
      action: async () => {
        if (!window.canvasRenderer) {
          showToast("Canvas renderer is not ready yet.", { kind: "warning" });
          return;
        }
        try {
          const json = await navigator.clipboard.readText();
          const imported = importStateFromJSON(json);
          Object.assign(state, imported);
          m.redraw();
          showToast("Character loaded from clipboard.", { kind: "success" });
        } catch (err) {
          console.error("Failed to load:", err);
          showToast("Failed to load. Check clipboard content.", {
            kind: "error",
          });
        }
      },
    },
    {
      id: "app.save.clipboard",
      label: "Save Character to Clipboard",
      category: "File",
      tooltip: "Save character to clipboard as JSON",
      shortcut: "Ctrl+S",
      keyCombo: { key: "s", ctrlKey: true },
      action: async () => {
        if (!window.canvasRenderer) {
          showToast("Canvas renderer is not ready yet.", { kind: "warning" });
          return;
        }
        try {
          const json = exportStateAsJSON(
            state,
            serializeLayersForJson(renderState.drawCalls),
          );
          await navigator.clipboard.writeText(json);
          showToast("Character saved to clipboard.", { kind: "success" });
        } catch (err) {
          console.error("Failed to save:", err);
          showToast("Failed to save. Check browser permissions.", {
            kind: "error",
          });
        }
      },
    },
    {
      id: "app.export.png",
      label: "Export PNG Spritesheet",
      category: "File",
      tooltip: "Export full spritesheet as PNG",
      shortcut: "Ctrl+Shift+E",
      keyCombo: { key: "e", ctrlKey: true, shiftKey: true },
      action: () => {
        if (!window.canvasRenderer) {
          showToast("Canvas renderer is not ready yet.", { kind: "warning" });
          return;
        }
        downloadAsPNG("character-spritesheet.png");
        showToast("PNG spritesheet exported.", { kind: "success" });
      },
    },
    {
      id: "app.export.credits",
      label: "Export Credits CSV",
      category: "File",
      tooltip: "Download asset credits as CSV",
      shortcut: "Ctrl+Shift+C",
      keyCombo: { key: "c", ctrlKey: true, shiftKey: true },
      action: () => {
        state.showCreditsPreview = true;
      },
    },
    {
      id: "app.export.json",
      label: "Export Character JSON",
      category: "File",
      tooltip: "Download character selections as JSON file",
      shortcut: "Ctrl+Shift+J",
      keyCombo: { key: "j", ctrlKey: true, shiftKey: true },
      action: () => {
        const json = exportStateAsJSON(
          state,
          serializeLayersForJson(renderState.drawCalls),
        );
        downloadFile(json, "character.json", "application/json");
        showToast("Character JSON exported.", { kind: "success" });
      },
    },
    {
      id: "app.export.referenceSheet",
      label: "Export Reference Sheet PNG",
      category: "File",
      tooltip: "Export character reference sheet with scales, directions, and credits",
      shortcut: "Ctrl+Shift+R",
      keyCombo: { key: "r", ctrlKey: true, shiftKey: true },
      action: async () => {
        const { exportReferenceSheet } = await import("../../canvas/reference-sheet.ts");
        try {
          await exportReferenceSheet("character", state.bodyType);
          showToast("Reference sheet exported.", { kind: "success" });
        } catch (err) {
          console.error(err);
          showToast("Failed to export reference sheet.", { kind: "error" });
        }
      },
    },
  ];
}
