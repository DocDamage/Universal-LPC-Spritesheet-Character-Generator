import { resetAll, state } from "../state.ts";
import { defaultCatalog } from "../catalog.ts";
import { randomizeAll } from "../../components/desktop/slot-config.ts";
import { requestConfirmation, showToast } from "../notifications.ts";
import type { Command } from "../commands.ts";

export function getAppCommands(): Command[] {
  return [
    {
      id: "app.commandPalette.toggle",
      label: "Open Command Palette",
      category: "General",
      shortcut: "Ctrl+K",
      keyCombo: { key: "k", ctrlKey: true },
      action: () => {
        state.showCommandPalette = !state.showCommandPalette;
        if (state.showCommandPalette) {
          state.showShortcutHelp = false;
        }
      },
    },
    {
      id: "app.shortcuts.toggle",
      label: "Show Keyboard Shortcuts",
      category: "General",
      shortcut: "Ctrl+/",
      keyCombo: { key: ["/", "?"], ctrlKey: true },
      action: () => {
        state.showShortcutHelp = !state.showShortcutHelp;
        if (state.showShortcutHelp) {
          state.showCommandPalette = false;
        }
      },
    },
    {
      id: "app.about.toggle",
      label: "About This App",
      category: "General",
      action: () => {
        state.showAbout = !state.showAbout;
        if (state.showAbout) {
          state.showCommandPalette = false;
        }
      },
    },
    {
      id: "app.reset",
      label: "Reset All Selections",
      category: "Actions",
      shortcut: "Ctrl+Alt+R",
      keyCombo: { key: "r", ctrlKey: true, altKey: true },
      action: async () => {
        const confirmed = await requestConfirmation({
          title: "Reset selections",
          message: "Reset all selections to defaults?",
          confirmLabel: "Reset",
          danger: true,
        });
        if (!confirmed) return;

        await resetAll();
        showToast("Selections reset.", { kind: "success" });
      },
    },
    {
      id: "app.randomize",
      label: "Randomize All Slots",
      category: "Actions",
      shortcut: "Ctrl+Alt+Shift+R",
      keyCombo: { key: "r", ctrlKey: true, altKey: true, shiftKey: true },
      action: async () => {
        const confirmed = await requestConfirmation({
          title: "Randomize character",
          message: "Randomly select items for all slots?",
          confirmLabel: "Randomize",
        });
        if (!confirmed) return;

        randomizeAll(defaultCatalog);
        showToast("Character randomized.", { kind: "success" });
      },
    },
    {
      id: "app.tab.body",
      label: "Switch to Body Tab",
      category: "General",
      shortcut: "Ctrl+1",
      keyCombo: { key: "1", ctrlKey: true },
      action: () => {
        state.activeTab = "character";
      },
    },
    {
      id: "app.tab.gear",
      label: "Switch to Gear Tab",
      category: "General",
      shortcut: "Ctrl+2",
      keyCombo: { key: "2", ctrlKey: true },
      action: () => {
        state.activeTab = "accessories";
      },
    },
  ];
}
