import m from "mithril";
import { state } from "../../state/state.ts";
import { getCommands } from "../../state/commands.ts";

function renderShortcut(shortcut: string): m.Children {
  return shortcut.split(" / ").map((combo, comboIndex) => [
    comboIndex > 0 ? m("span.shortcut-combo-separator", "or") : null,
    m(
      "span.shortcut-combo",
      combo
        .split("+")
        .map((key, keyIndex) => [
          keyIndex > 0 ? m("span.shortcut-key-separator", "+") : null,
          m("kbd", key.trim()),
        ]),
    ),
  ]);
}

export const ShortcutHelpModal: m.Component = {
  view() {
    if (!state.showShortcutHelp) return null;

    const commandsWithShortcuts = getCommands().filter((cmd) => cmd.shortcut);
    const categories: Record<string, typeof commandsWithShortcuts> = {};
    for (const cmd of commandsWithShortcuts) {
      if (!categories[cmd.category]) {
        categories[cmd.category] = [];
      }
      categories[cmd.category].push(cmd);
    }

    const handleClose = () => {
      state.showShortcutHelp = false;
      m.redraw();
    };

    return m("div.shortcut-help-overlay", { onclick: handleClose }, [
      m(
        "div.shortcut-help",
        {
          role: "dialog",
          "aria-modal": "true",
          "aria-label": "Keyboard shortcuts",
          onclick: (e: MouseEvent) => e.stopPropagation(),
        },
        [
          m("div.shortcut-help-header", [
            m("h3", [m("span.shortcut-help-icon", "⌘"), "Keyboard Shortcuts"]),
            m(
              "button.shortcut-help-close",
              {
                type: "button",
                title: "Close keyboard shortcuts",
                onclick: handleClose,
              },
              "×",
            ),
          ]),
          m(
            "div.shortcut-help-body",
            Object.entries(categories).map(([cat, cmds]) => {
              return m("div.shortcut-category-block", [
                m("h4.shortcut-category-title", cat),
                m("div.shortcut-list", [
                  cmds.map((cmd) => {
                    return m("div.shortcut-row", [
                      m("span.shortcut-label", cmd.label),
                      m("span.shortcut-keys", renderShortcut(cmd.shortcut!)),
                    ]);
                  }),
                ]),
              ]);
            }),
          ),
          m("div.shortcut-help-footer", "Press Esc or click outside to close"),
        ],
      ),
    ]);
  },
};
